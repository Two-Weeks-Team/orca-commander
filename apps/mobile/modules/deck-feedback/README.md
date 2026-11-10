# Deck feedback local Expo module

A single original 40ms mono PCM click for optional deck UI feedback. The default
native state is `enabled=false`, `captureActive=true`. This module never changes
an audio session/category, audio mode, audio focus, routing, system volume, or a
recording engine. It does not use the frozen two-way-audio module.

Verified source contracts: Expo 55.0.32, React Native 0.83.10,
expo-modules-core 55.0.27, expo-modules-autolinking 55.0.28. The module uses the
installed SDK 55 Swift/Kotlin module APIs. Autolinking discovers this directory
under the app's default `modules` path; adding native code requires a native app
rebuild, not only a JS bundle update. No new runtime audio package is required.

## JavaScript API

Import from this module's `index.ts` using a relative app import. These functions
are synchronous; Android resource loading finishes asynchronously in SoundPool.

- `prepareDeckFeedback()` loads the fixed bundled asset and returns status. It
  never enables feedback, queues a click, or plays anything on load completion.
- `configureDeckFeedback({ enabled, captureActive })` updates both native gates.
- `getDeckFeedbackStatus()` returns `supported`, `ready`, `loading`, `enabled`,
  `captureActive`, `foreground`, and `loadFailed` booleans.
- `playDeckClick()` returns a reason: `scheduled`, `disabled`, `capture_active`,
  `background`, `not_ready`, `system_disabled`, `silent`, `busy`, `unavailable`,
  or `playback_failed`. Requests are never queued or replayed. `scheduled` only
  means submitted to the OS, never audible output.
- `disposeDeckFeedback()` releases the native sound resources and resets the
  gates to disabled/capture-blocked. After disposal, explicitly prepare and
  configure again. A failed Android load also requires explicit dispose/prepare
  before retrying; there is no automatic retry.

Missing native modules return `supported=false` and do not fall back to another
player. Prepare during ordinary UI setup; the first click while loading is
intentionally dropped. The caller may read status again, but does not need to
queue a request waiting for readiness.

## Capture and UI integration contract

The app must set `captureActive=true` before microphone initialization starts
and keep it true until the actual owning microphone teardown completes,
including canceled asynchronous initialization. Merely seeing an idle UI or
calling microphone `close()` does not prove teardown finished. This module's
capture gate is a caller-supplied boundary; it does not inspect or control the
recording module. Do not await effect completion or delay PTT capture for a click.
Skip clicks on PTT start and while capture is starting/active/stopping.

Native lifecycle hooks suppress new playback while the app is backgrounded.
Android also stops its current stream when disabled, capture-blocked or
backgrounded. iOS System Sound Services does not expose a documented immediate
per-sound stop operation: a click already submitted just before PTT can have an
acoustic tail of up to the asset's 40ms. This module does not claim zero capture
contamination or stop the recorder to hide that boundary.

Disable React Native's default Android click (`android_disableSound` on
Pressable, `touchSoundDisabled` on Touchable controls) where custom feedback is
used, to avoid playing both effects. Trigger one custom click per intended
control action; do not attach duplicate press-in/press callbacks.

## Native behavior and resources

- iOS uses public AudioToolbox `AudioServicesCreateSystemSoundID` and
  `AudioServicesPlaySystemSoundWithCompletion`, retaining the default UI-sound
  policy (`IsUISound=1`). It never calls AVAudioSession. Completion runs for
  unsuccessful attempts too. The CocoaPods resource bundle is
  `DeckFeedbackResources.bundle/deck_click.wav`.
- Android uses `SoundPool.Builder`, maximum one stream, explicit
  `USAGE_ASSISTANCE_SONIFICATION` and `CONTENT_TYPE_SONIFICATION`. Every play
  reads `Settings.System.SOUND_EFFECTS_ENABLED` and requires value 1, requires
  `RINGER_MODE_NORMAL`, and checks system-stream mute/zero volume. Setting read
  or playback exceptions skip the click. No settings or audio-manager state is
  written. The raw resource is `R.raw.deck_click`.

The two resource copies are byte-identical. `click-manifest.json` records format,
length and SHA-256. Generate/check them without playback:

```sh
python3 -I scripts/deck-assets/build-click.py
python3 -I scripts/deck-assets/build-click.py --check
python3 -B apps/mobile/modules/deck-feedback/tests/test_click_assets.py
```

The generator uses only integer arithmetic, fixed-seed noise and Python's
standard-library PCM WAV encoder. No third-party sampled audio was used.

## Verification limits

Artifact checks and source compilation do not establish native registration in
a shipped app, resource installation, audible sound, silent-switch behavior,
OEM/DND/Bluetooth behavior, or microphone coexistence. Both physical platforms
still need those checks after the root app integrates and rebuilds the module.

Official API references:

- https://docs.expo.dev/modules/autolinking/
- https://docs.expo.dev/modules/module-config/
- https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/MultimediaPG/UsingAudio/UsingAudio.html
- https://developer.apple.com/documentation/audiotoolbox/audioservicesplaysystemsoundwithcompletion(_:_:)
- https://developer.android.com/reference/android/media/SoundPool
- https://developer.android.com/reference/android/media/AudioAttributes#USAGE_ASSISTANCE_SONIFICATION
- https://developer.android.com/reference/android/provider/Settings.System#SOUND_EFFECTS_ENABLED
