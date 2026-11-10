import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the real `expo prebuild` for iOS on a temporary copy of the Deck app (no Pods, no build)
// and checks what a native build would compile: UIScene adoption and the Podfile Ruby guard.
const app = fileURLToPath(new URL('../apps/mobile/', import.meta.url));
if (!existsSync(join(app, 'node_modules', 'expo'))) throw new Error('Install first: (cd apps/mobile && npm install --ignore-scripts)');
const temp = mkdtempSync(join(tmpdir(), 'deck-prebuild-'));
try {
  cpSync(app, temp, { recursive: true, filter: source => !/(^|[\\/])(node_modules|\.test-build|ios|android)$/.test(source) });
  symlinkSync(join(app, 'node_modules'), join(temp, 'node_modules'));
  execFileSync('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install'], {
    cwd: temp, stdio: 'pipe', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  });
  const projects = readdirSync(join(temp, 'ios')).filter(name => existsSync(join(temp, 'ios', name, 'AppDelegate.swift')));
  assert.equal(projects.length, 1, 'exactly one generated iOS app target');
  const dir = join(temp, 'ios', projects[0]);

  const delegate = readFileSync(join(dir, 'AppDelegate.swift'), 'utf8');
  assert.ok(delegate.includes('class SceneDelegate: UIResponder, UIWindowSceneDelegate'), 'a SceneDelegate is generated');
  assert.ok(!delegate.includes('UIWindow(frame: UIScreen.main.bounds)'), 'the application delegate does not build its own window');
  assert.ok(/factory\.startReactNative\(withModuleName: "main", in: window, launchOptions: nil\)/.test(delegate), 'React Native starts in the scene window');

  const plist = readFileSync(join(dir, 'Info.plist'), 'utf8');
  const orientations = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
  for (const orientation of ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']) {
    assert.ok(orientations.includes(`<string>${orientation}</string>`), `native iOS phone supports ${orientation} for responsive deck faces`);
  }
  assert.ok(plist.includes('<key>UIApplicationSceneManifest</key>'), 'Info.plist declares a scene manifest');
  assert.ok(plist.includes('$(PRODUCT_MODULE_NAME).SceneDelegate'), 'the manifest names the SceneDelegate');

  // The direct connection to the desktop is a plain ws:// socket on the local network (or a VPN address): iOS must be
  // told why the app uses the local network, and ATS may allow local networking but never arbitrary loads.
  assert.ok(plist.includes('<key>NSLocalNetworkUsageDescription</key>'), 'Info.plist explains the local network use');
  assert.ok(/<key>NSLocalNetworkUsageDescription<\/key>\s*<string>[^<]{10,}<\/string>/.test(plist), 'the local network explanation is not empty');
  // The whole ATS dictionary, not only its first key: nothing but local networking may be allowed.
  const ats = /<key>NSAppTransportSecurity<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(plist);
  assert.ok(ats, 'Info.plist has an ATS dictionary');
  assert.deepEqual([...ats[1].matchAll(/<key>([^<]+)<\/key>/g)].map(match => match[1]), ['NSAllowsLocalNetworking'], 'ATS allows local networking and nothing else');
  assert.ok(/<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/.test(ats[1]), 'local networking is allowed');
  assert.ok(!plist.includes('NSAllowsArbitraryLoads') && !plist.includes('NSExceptionDomains'), 'ATS is not opened to arbitrary loads or exception domains');
  // The camera is used for one thing, reading the pairing QR: it needs a reason, and voice capture needs its own separate explanation.
  const appConfig = JSON.parse(readFileSync(join(app, 'app.json'), 'utf8')).expo;
  const cameraPlugin = appConfig.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-camera')?.[1];
  assert.ok(cameraPlugin?.cameraPermission?.length >= 10, 'app.json gives expo-camera its own camera explanation');
  const cameraText = /<key>NSCameraUsageDescription<\/key>\s*<string>([^<]*)<\/string>/.exec(plist)?.[1];
  assert.equal(cameraText, cameraPlugin.cameraPermission, "Info.plist carries Deck's camera explanation, not Expo's default");
  // Every usage-description key, so a new permission cannot appear unnoticed.
  assert.deepEqual([...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map(match => match[1]).sort(), ['NSCameraUsageDescription', 'NSLocalNetworkUsageDescription', 'NSMicrophoneUsageDescription'], 'only camera, local network and voice capture are explained');
  assert.ok(/<key>NSMicrophoneUsageDescription<\/key>\s*<string>[^<]{10,}<\/string>/.test(plist), 'voice capture has a microphone explanation');
  assert.ok(!plist.includes('NSPhotoLibraryUsageDescription'), 'the photo library is not requested');
  const localeArray = /<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist);
  assert.deepEqual([...(localeArray?.[1] ?? '').matchAll(/<string>([^<]+)<\/string>/g)].map(match => match[1]), ['en', 'ko'], 'the native app advertises its two built-in languages');
  assert.ok(/<key>CFBundleAllowMixedLocalizations<\/key>\s*<true\/>/.test(plist), 'localized permission resources are enabled');
  assert.ok(!/\p{Script=Hangul}/u.test(cameraText), 'the default camera prompt is English for unsupported OS locales');
  for (const match of plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)) {
    assert.ok(!/\p{Script=Hangul}/u.test(match[2]), `${match[1]} defaults to English outside the localized resources`);
  }
  for (const language of ['en', 'ko']) {
    const localized = readFileSync(join(dir, 'Supporting', `${language}.lproj`, 'InfoPlist.strings'), 'utf8');
    const expected = JSON.parse(readFileSync(join(app, 'locales', `${language}.json`), 'utf8')).ios;
    assert.deepEqual(Object.keys(expected).sort(), ['NSCameraUsageDescription', 'NSLocalNetworkUsageDescription', 'NSMicrophoneUsageDescription'], 'locale files cover precisely the three existing permissions');
    for (const [key, value] of Object.entries(expected)) assert.ok(localized.includes(`${key} = "${value}";`), `${language} ${key} is compiled into the native locale resource`);
    assert.equal(/\p{Script=Hangul}/u.test(localized), language === 'ko', 'Korean copy belongs only in the Korean native resource');
  }
  // The QR scanner needs the barcode companion pod; it is only dropped by an explicit property, which must not be set.
  const iosProperties = JSON.parse(readFileSync(join(temp, 'ios', 'Podfile.properties.json'), 'utf8'));
  assert.notEqual(iosProperties['expo.camera.barcode-scanner-enabled'], 'false', 'the camera barcode scanner is not switched off');
  // Export compliance is a release decision (G6): the app does its own E2EE, so no claim is made here.
  assert.ok(!plist.includes('ITSAppUsesNonExemptEncryption'), 'no export-compliance claim is declared yet');

  const podfile = readFileSync(join(temp, 'ios', 'Podfile'), 'utf8');
  // Other plugins (expo-router) add lines of their own at the top; the guard only has to run before autolinking.
  const guard = podfile.indexOf('# orca-deck: pod install needs Ruby');
  const autolinking = podfile.indexOf('require File.join');
  assert.ok(guard >= 0 && autolinking > guard, 'the Ruby guard comes before the autolinking require');
  assert.equal(podfile.split('# orca-deck: pod install needs Ruby').length, 2, 'the guard is present exactly once');
  assert.ok(/^abort\(.*RUBY_VERSION.*\) if Gem::Version/m.test(podfile), 'the Podfile aborts on Ruby older than 2.7');

  assert.equal(podfile.split('# orca-deck: raise pod deployment targets').length, 2, 'pods are raised to the deployment target exactly once');
  const properties = JSON.parse(readFileSync(join(temp, 'ios', 'Podfile.properties.json'), 'utf8'));
  assert.equal(properties['ios.deploymentTarget'], '16.0', 'the app deployment target is 16.0');
  const project = readFileSync(join(temp, 'ios', `${projects[0]}.xcodeproj`, 'project.pbxproj'), 'utf8');
  assert.ok(/IPHONEOS_DEPLOYMENT_TARGET = 16\.0;/.test(project) && !/IPHONEOS_DEPLOYMENT_TARGET = 15\./.test(project), 'the Xcode project targets iOS 16.0');
  try {
    execFileSync(process.env.RUBY_BIN ?? 'ruby', ['-c'], { input: podfile, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    throw new Error(`the generated Podfile is not valid Ruby: ${String(error.stderr ?? error)}`);
  }

  // Voice capture asks for audio separately from camera scanning.
  execFileSync('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: temp, stdio: 'pipe', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  });
  const manifest = readFileSync(join(temp, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.ok(manifest.includes('android.permission.CAMERA'), 'Android asks for the camera');
  assert.ok(/<uses-permission android:name="android\.permission\.RECORD_AUDIO"(?![^>]*tools:node="remove")/.test(manifest), 'Android permits explicit voice capture');
  assert.ok(manifest.includes('android:localeConfig="@xml/locales_config"'), 'Android registers app-language selection');
  const localeXml = readFileSync(join(temp, 'android', 'app', 'src', 'main', 'res', 'xml', 'locales_config.xml'), 'utf8');
  assert.deepEqual([...localeXml.matchAll(/<locale android:name="([^"]+)"/g)].map(match => match[1]), ['en', 'ko'], 'Android exposes precisely the two built-in OS locales');
  const activity = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/.exec(manifest)?.[0] ?? '';
  assert.ok(activity.includes('android:screenOrientation="unspecified"'), 'native Android follows device rotation instead of retaining portrait lock');
  assert.ok(activity.includes('locale') && activity.includes('layoutDirection'), 'Android handles locale and layout-direction configuration changes');
  const nativeStore = readFileSync(join(temp, 'node_modules', 'expo-secure-store', 'android', 'src', 'main', 'java', 'expo', 'modules', 'securestore', 'SecureStoreModule.kt'), 'utf8');
  assert.ok(nativeStore.includes('Constant("deckPersistentCommitV1") { true }') && /if \(!saveEncryptedItem\([^\n]+\)\) \{\n\s+throw WriteException/.test(nativeStore), 'Android prebuild checks the real encrypted commit result and exports its native capability');

  console.log('PASS: Expo prebuild emits en/ko native locales, English default permissions, iOS scene/Podfile/target guards, Android voice permissions and the native persistent-commit guard');
  console.log('LIMIT: generator output only; no Pods, native build, launch or device is involved.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
