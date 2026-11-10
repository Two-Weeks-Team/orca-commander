import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Offline tests of the iOS 27 UIScene config plugin's pure transforms. No Expo prebuild runs here.
const require = createRequire(import.meta.url);
const plugin = require('../plugins/with-ios-uiscene.js');
const template = readFileSync(fileURLToPath(new URL('./fixtures/AppDelegate.expo55.swift', import.meta.url)), 'utf8');
let count = 0;
const check = (value, message) => { count++; assert.ok(value, message); };

// AppDelegate: the window moves into a SceneDelegate, everything else is kept.
const out = plugin.transformAppDelegate(template);
check(!out.includes('UIWindow(frame: UIScreen.main.bounds)'), 'the application delegate no longer builds its own window');
check(!/factory\.startReactNative\([\s\S]{0,80}launchOptions: launchOptions\)/.test(out), 'React Native is no longer started from didFinishLaunching');
check(out.includes('class SceneDelegate: UIResponder, UIWindowSceneDelegate'), 'a scene delegate is added');
check(/UIWindow\(windowScene: windowScene\)/.test(out), 'the scene delegate builds the window from the scene');
check(/factory\.startReactNative\(withModuleName: "main", in: window, launchOptions: nil\)/.test(out), 'React Native starts in the scene window');
check(out.includes('reactNativeFactory = factory') && out.includes('return super.application(application, didFinishLaunchingWithOptions: launchOptions)'), 'the factory is still created and super is still called');
check(out.includes('RCTLinkingManager.application(UIApplication.shared, open: context.url') && out.includes('openURLContexts') && out.includes('continue userActivity'), 'deep links and universal links are forwarded from the scene');
check(out.includes('func application(_ app: UIApplication, open url: URL') || out.includes('open url: URL'), 'the existing linking overrides are untouched');
check(out === plugin.transformAppDelegate(out), 'the transform is idempotent');

// A changed template must fail loudly: a silent no-op would ship an app that crashes on iOS 27.
assert.throws(() => plugin.transformAppDelegate(template.replace('UIWindow(frame: UIScreen.main.bounds)', 'UIWindow()')), /template/i);
count++;
assert.throws(() => plugin.transformAppDelegate('class AppDelegate {}'), /template/i);
count++;

// Info.plist manifest.
const manifest = plugin.SCENE_MANIFEST;
check(manifest.UIApplicationSupportsMultipleScenes === false, 'a single scene is supported');
const config = manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0];
check(config.UISceneConfigurationName === 'Default Configuration' && config.UISceneDelegateClassName === '$(PRODUCT_MODULE_NAME).SceneDelegate', 'the scene delegate is the module-qualified SceneDelegate');

// Podfile guard: CocoaPods under Ruby older than 2.7 silently dropped Expo precompiled config (no Array#filter_map).
const guarded = plugin.transformPodfile("platform :ios, '15.1'\n");
check(guarded.startsWith('# orca-deck: ') && guarded.includes('filter_map') && guarded.includes("platform :ios, '15.1'"), 'the guard comes first and the Podfile is preserved');
check(plugin.transformPodfile(guarded) === guarded, 'the Podfile transform is idempotent');
const onlyPostInstallMarker = "# orca-deck: raise pod deployment targets\nplatform :ios, '16.0'\n";
check(plugin.transformPodfile(onlyPostInstallMarker).includes('abort('), 'a different orca-deck marker does not count as the Ruby guard');
const otherPluginAbove = "# Set by expo-router.\nENV['RNS_GAMMA_ENABLED'] ||= '1'\n" + guarded;
check(plugin.transformPodfile(otherPluginAbove) === otherPluginAbove, 'the guard is recognized when another plugin has added lines above it (re-running prebuild must not duplicate it)');
const ruby = process.env.RUBY_BIN ?? 'ruby';
const guardLines = guarded.split('\n').filter(line => line.startsWith('abort(')).join('\n');
check(guardLines.length > 0, 'the guard is a single abort line');
try {
  execFileSync(ruby, ['-c'], { input: guardLines, stdio: ['pipe', 'pipe', 'pipe'] });
  check(true, 'the guard is valid Ruby');
} catch (error) {
  throw new Error(`the Podfile guard is not valid Ruby: ${String(error.stderr ?? error)}`);
}
if (existsSync('/usr/bin/ruby')) {
  const oldRuby = execFileSync('/usr/bin/ruby', ['-e', 'print RUBY_VERSION']).toString();
  if (Number(oldRuby.split('.')[1]) < 7 && oldRuby.startsWith('2.')) {
    let aborted = false;
    try { execFileSync('/usr/bin/ruby', ['-e', guardLines], { stdio: 'pipe' }); } catch { aborted = true; }
    check(aborted, `the guard aborts under Ruby ${oldRuby}`);
  }
}
try {
  execFileSync(ruby, ['-e', guardLines], { stdio: 'pipe' });
  check(true, 'the guard passes under the current Ruby');
} catch (error) {
  throw new Error(`the guard must pass under a modern Ruby: ${String(error.stderr ?? error)}`);
}

// Deployment target: Xcode 27 rejects pods whose minimum is below its supported range, and expo-router
// 55.0.18 needs iOS 16 (UIAction.subtitle). Raise every pod and the app to 16.0.
check(plugin.IOS_DEPLOYMENT_TARGET === '16.0', 'the iOS deployment target is 16.0');
const podTemplate = "target 'App' do\n  post_install do |installer|\n    react_native_post_install(installer, config[:reactNativePath])\n  end\nend\n";
const raised = plugin.transformPodfilePostInstall(podTemplate);
const at = (needle) => raised.indexOf(needle);
check(at("post_install do |installer|") >= 0 && at('IPHONEOS_DEPLOYMENT_TARGET') > at('post_install do |installer|') && at('IPHONEOS_DEPLOYMENT_TARGET') < at('react_native_post_install'), 'the raise runs inside post_install, before React Native post-install');
check(raised.includes("'16.0'") && raised.includes('pods_project.targets'), 'every pod target is raised to 16.0');
check(plugin.transformPodfilePostInstall(raised) === raised, 'the post_install transform is idempotent');
assert.throws(() => plugin.transformPodfilePostInstall("platform :ios, '15.1'\n"), /post_install/);
count++;
try {
  execFileSync(ruby, ['-c'], { input: raised, stdio: ['pipe', 'pipe', 'pipe'] });
  check(true, 'the transformed Podfile is valid Ruby');
} catch (error) {
  throw new Error(`the post_install snippet is not valid Ruby: ${String(error.stderr ?? error)}`);
}

// The Xcode project's own deployment target must follow, or iOS 15 devices would run iOS 16-only pod code.
const fakeProject = (settingsList) => ({
  pbxXCBuildConfigurationSection: () => Object.fromEntries(settingsList.flatMap((buildSettings, index) => [
    [`CFG${index}`, { buildSettings }], [`CFG${index}_comment`, 'Debug'],
  ])),
});
const lowProject = fakeProject([{ IPHONEOS_DEPLOYMENT_TARGET: '15.1' }, { IPHONEOS_DEPLOYMENT_TARGET: '"17.0"' }, {}, { IPHONEOS_DEPLOYMENT_TARGET: 15.1 }]);
check(plugin.raiseProjectDeploymentTarget(lowProject) === 2, 'only configurations below 16.0 are raised');
const configs = lowProject.pbxXCBuildConfigurationSection();
check(configs.CFG0.buildSettings.IPHONEOS_DEPLOYMENT_TARGET === '16.0' && configs.CFG3.buildSettings.IPHONEOS_DEPLOYMENT_TARGET === '16.0', 'low targets become 16.0');
check(configs.CFG1.buildSettings.IPHONEOS_DEPLOYMENT_TARGET === '"17.0"' && configs.CFG2.buildSettings.IPHONEOS_DEPLOYMENT_TARGET === undefined, 'higher or absent targets are left alone');
check(plugin.raiseProjectDeploymentTarget(lowProject) === 0, 'raising twice changes nothing');

console.log(`PASS: ${count} iOS UIScene plugin assertions (pure transforms; no prebuild)`);
