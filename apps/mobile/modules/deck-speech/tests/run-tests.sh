#!/bin/sh
set -eu
MODULE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DECK_SPEECH_OUT=${DECK_SPEECH_TEST_OUT:-$(mktemp -d /tmp/deck-speech-tests.XXXXXX)}
mkdir -p "$DECK_SPEECH_OUT"
swiftc "$MODULE_DIR/ios/SpeechRunState.swift" "$MODULE_DIR/tests/RunStateTests.swift" -o "$DECK_SPEECH_OUT/state-tests"
"$DECK_SPEECH_OUT/state-tests"
kotlinc "$MODULE_DIR"/tests/fakes/*.kt \
  "$MODULE_DIR/android/src/main/java/expo/modules/deckspeech/SpeechRunState.kt" \
  "$MODULE_DIR/android/src/main/java/expo/modules/deckspeech/DeckSpeechEngine.kt" \
  "$MODULE_DIR/tests/EngineTests.kt" -nowarn -include-runtime -d "$DECK_SPEECH_OUT/engine-tests.jar"
java -jar "$DECK_SPEECH_OUT/engine-tests.jar"
kotlinc "$MODULE_DIR/android/src/main/java/expo/modules/deckspeech/SpeechForegroundPolicy.kt" \
  "$MODULE_DIR/tests/ForegroundPolicyTests.kt" -include-runtime -d "$DECK_SPEECH_OUT/foreground-tests.jar"
java -jar "$DECK_SPEECH_OUT/foreground-tests.jar"
printf 'Artifacts: %s\n' "$DECK_SPEECH_OUT"
