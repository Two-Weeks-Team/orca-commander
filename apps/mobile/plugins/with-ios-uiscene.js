'use strict';

/**
 * Expo config plugin: adopt the UIScene lifecycle on iOS and guard the Podfile.
 *
 * Why: an app linked with the iOS 27 SDK that does not adopt UIScene is trapped by UIKit at launch
 * (EXC_BREAKPOINT in ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo 55 and
 * React Native 0.83 generate a window-in-AppDelegate template with no scene manifest. This plugin moves
 * the window and React Native startup into a SceneDelegate and adds the manifest.
 *
 * It also stops `pod install` under Ruby older than 2.7. Those Rubies lack Array#filter_map, so Expo's
 * precompiled config step failed silently (exit 0) and optional pods such as expo-camera's barcode
 * provider were dropped.
 *
 * It raises the iOS deployment target to 16.0 for the app and every pod: Xcode 27 rejects pods whose
 * minimum is below its supported range, and expo-router 55.0.18 uses UIAction.subtitle (iOS 16).
 *
 * A template that no longer matches throws instead of doing nothing: a silent no-op would ship an app
 * that crashes on iOS 27.
 */

const APP_DELEGATE_START = /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\s*\n#endif\n?/;

const SCENE_DELEGATE = `
// Added by with-ios-uiscene.js: UIScene lifecycle, required by iOS 27 for apps built with the iOS 27 SDK.
#if os(iOS)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)

    for context in connectionOptions.urlContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
#endif
`;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

function transformAppDelegate(contents) {
  if (contents.includes('class SceneDelegate')) return contents;
  if (!APP_DELEGATE_START.test(contents)) {
    throw new Error(
      'with-ios-uiscene: the generated AppDelegate template changed and no longer matches. ' +
        'Update the plugin before building, or the app will crash on iOS 27.',
    );
  }
  const replaced = contents.replace(
    APP_DELEGATE_START,
    '    // The window and React Native startup live in SceneDelegate (UIScene lifecycle).\n',
  );
  return replaced.replace(/\s*$/, '\n') + SCENE_DELEGATE;
}

const PODFILE_MARKER = '# orca-deck: pod install needs Ruby';
const PODFILE_GUARD =
  `${PODFILE_MARKER}pod install needs Ruby 2.7+; older Rubies lack Array#filter_map and CocoaPods silently drops Expo precompiled pods.\n` +
  `abort("Orca Deck needs Ruby 2.7 or newer for pod install (found #{RUBY_VERSION}); older Rubies silently drop Expo precompiled pods such as the camera barcode provider.") if Gem::Version.new(RUBY_VERSION) < Gem::Version.new('2.7.0')\n`;

function transformPodfile(contents) {
  // Other plugins (expo-router) add lines above ours, so look anywhere rather than at the start.
  return contents.includes(PODFILE_MARKER) ? contents : PODFILE_GUARD + contents;
}

const IOS_DEPLOYMENT_TARGET = '16.0';
const POST_INSTALL_MARKER = '# orca-deck: raise pod deployment targets';
const POST_INSTALL_OPEN = /^([ \t]*)post_install do \|installer\|[ \t]*\n/m;

function transformPodfilePostInstall(contents) {
  if (contents.includes(POST_INSTALL_MARKER)) return contents;
  if (!POST_INSTALL_OPEN.test(contents)) {
    throw new Error('with-ios-uiscene: the Podfile has no post_install block to extend; update the plugin before building.');
  }
  return contents.replace(POST_INSTALL_OPEN, (line, indent) =>
    `${line}${indent}  ${POST_INSTALL_MARKER}\n` +
    `${indent}  installer.pods_project.targets.each do |target|\n` +
    `${indent}    target.build_configurations.each do |build_config|\n` +
    `${indent}      if build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${IOS_DEPLOYMENT_TARGET}\n` +
    `${indent}        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${IOS_DEPLOYMENT_TARGET}'\n` +
    `${indent}      end\n` +
    `${indent}    end\n` +
    `${indent}  end\n`);
}

/** Raise every build configuration below the target; returns how many were changed. */
function raiseProjectDeploymentTarget(project) {
  const configurations = project.pbxXCBuildConfigurationSection();
  let changed = 0;
  for (const key of Object.keys(configurations)) {
    const entry = configurations[key];
    if (typeof entry === 'string' || !entry.buildSettings) continue; // *_comment entries are strings
    const current = entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET;
    if (current === undefined) continue;
    if (parseFloat(String(current).replace(/"/g, '')) < parseFloat(IOS_DEPLOYMENT_TARGET)) {
      entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
      changed++;
    }
  }
  return changed;
}

function withIosUiScene(config) {
  const { withAppDelegate, withInfoPlist, withPodfile, withPodfileProperties, withXcodeProject } = require('expo/config-plugins');

  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('with-ios-uiscene: a Swift AppDelegate is required.');
    }
    mod.modResults.contents = transformAppDelegate(mod.modResults.contents);
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return mod;
  });
  config = withPodfile(config, (mod) => {
    mod.modResults.contents = transformPodfilePostInstall(transformPodfile(mod.modResults.contents));
    return mod;
  });
  config = withXcodeProject(config, (mod) => {
    raiseProjectDeploymentTarget(mod.modResults);
    return mod;
  });
  config = withPodfileProperties(config, (mod) => {
    mod.modResults['ios.deploymentTarget'] = IOS_DEPLOYMENT_TARGET;
    return mod;
  });
  return config;
}

module.exports = withIosUiScene;
module.exports.transformAppDelegate = transformAppDelegate;
module.exports.transformPodfile = transformPodfile;
module.exports.transformPodfilePostInstall = transformPodfilePostInstall;
module.exports.IOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
module.exports.raiseProjectDeploymentTarget = raiseProjectDeploymentTarget;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
