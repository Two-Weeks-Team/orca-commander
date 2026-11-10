package expo.modules.deckfeedback

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeckFeedbackModule : Module() {
  @Volatile private var sound: DeckClickSound? = null
  private val foregroundLock = Any()
  private var activityPaused = false

  // SDK 55 exposes reactContext as Context, not ReactContext. Use only public
  // Activity focus and Expo's onHostResume/onHostPause-backed lifecycle hooks.
  private fun refreshForegroundLocked() {
    val activity = appContext.currentActivity
    sound?.setForeground(!activityPaused && activity?.isFinishing == false &&
      !activity.isDestroyed && activity.hasWindowFocus())
  }

  private fun refreshForeground() = synchronized(foregroundLock) { refreshForegroundLocked() }

  private fun setActivityPaused(paused: Boolean) = synchronized(foregroundLock) {
    activityPaused = paused
    refreshForegroundLocked()
  }

  private fun statusUnavailable(): Map<String, Boolean> = mapOf(
    "supported" to false, "ready" to false, "loading" to false, "enabled" to false,
    "captureActive" to true, "foreground" to false, "loadFailed" to true
  )

  override fun definition() = ModuleDefinition {
    Name("DeckFeedback")
    OnCreate {
      appContext.reactContext?.let { context ->
        sound = DeckClickSound(context.applicationContext, R.raw.deck_click)
        refreshForeground()
      }
    }
    Function("prepare") { refreshForeground(); sound?.prepare() ?: statusUnavailable() }
    Function("configure") { enabled: Boolean, captureActive: Boolean ->
      refreshForeground()
      sound?.configure(enabled, captureActive) ?: statusUnavailable()
    }
    Function("getStatus") { refreshForeground(); sound?.getStatus() ?: statusUnavailable() }
    Function("playClick") { refreshForeground(); sound?.playClick() ?: "unavailable" }
    Function("dispose") { sound?.dispose() }
    OnActivityEntersForeground { setActivityPaused(false) }
    OnActivityEntersBackground { setActivityPaused(true) }
    OnDestroy {
      setActivityPaused(true)
      sound?.dispose()
      sound = null
    }
  }
}
