package expo.modules.deckspeech

// A Dialog may own window focus while the React Activity remains resumed.
// This is lifecycle eligibility, not proof of top-resumed position or audio focus.
internal fun isSpeechForegroundAllowed(
  paused: Boolean,
  moduleDestroyed: Boolean,
  activityFinishing: Boolean?,
  activityDestroyed: Boolean?,
  reactResumed: Boolean
): Boolean = !paused && !moduleDestroyed && activityFinishing == false &&
  activityDestroyed == false && reactResumed
