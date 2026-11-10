'use strict';

/**
 * The paired Orca host listens on a plain `ws://` endpoint on the local network (or a Tailscale address); every frame on it
 * is end-to-end encrypted with the pairing keys. Android release builds refuse cleartext sockets by default, so a paired
 * Android phone stored the pairing but could never connect. Upstream Orca Mobile enables the same Android setting
 * (`android.usesCleartextTraffic` via expo-build-properties); iOS already has NSAllowsLocalNetworking. Android network
 * security config cannot express IP ranges, so the switch is app-wide, matching upstream.
 */
function setCleartext(manifest) {
  const application = manifest?.manifest?.application?.[0];
  if (!application) throw new Error('Deck Android manifest has no <application>.');
  application.$ = { ...application.$, 'android:usesCleartextTraffic': 'true' };
  return manifest;
}

function withAndroidCleartextTransport(config) {
  const { withAndroidManifest } = require('expo/config-plugins');
  return withAndroidManifest(config, mod => {
    mod.modResults = setCleartext(mod.modResults);
    return mod;
  });
}

module.exports = withAndroidCleartextTransport;
module.exports.setCleartext = setCleartext;
