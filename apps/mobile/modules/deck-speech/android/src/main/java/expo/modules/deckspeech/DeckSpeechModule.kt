package expo.modules.deckspeech

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactContext
import com.facebook.react.common.LifecycleState
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeckSpeechModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var engine: DeckSpeechEngine? = null
  private var paused = false
  private var destroyed = false

  private fun onMain(action: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) action() else main.post(action)
  }

  private fun foreground(): Boolean {
    val activity = appContext.currentActivity
    // Expo exposes Context?, so unknown/non-React contexts fail closed.
    val resumed = (appContext.reactContext as? ReactContext)?.lifecycleState == LifecycleState.RESUMED
    return isSpeechForegroundAllowed(paused, destroyed, activity?.isFinishing, activity?.isDestroyed, resumed)
  }
  private fun getEngine(): DeckSpeechEngine? {
    if (destroyed) return null
    if (engine == null) appContext.reactContext?.applicationContext?.let { context ->
      engine = DeckSpeechEngine(context, ::foreground) { name, payload -> sendEvent(name, payload) }
    }
    return engine
  }
  override fun definition() = ModuleDefinition {
    Name("DeckSpeech")
    Events("onSpeechStarted", "onSpeechFinished")
    AsyncFunction("prepare") { language: String, promise: Promise -> main.post {
      promise.resolve(getEngine()?.prepare(language) ?: mapOf("ready" to false, "reason" to "unavailable"))
    }; Unit }
    AsyncFunction("speak") { id: String, text: String, language: String, rate: Double, promise: Promise -> main.post {
      promise.resolve(getEngine()?.speak(id, text, language, rate)
        ?: mapOf("accepted" to false, "reason" to "unavailable"))
    }; Unit }
    AsyncFunction("stop") { promise: Promise -> main.post {
      engine?.stop { promise.resolve(it) } ?: promise.resolve(true)
    }; Unit }
    AsyncFunction("dispose") { promise: Promise -> main.post {
      destroyed = true
      engine?.dispose { promise.resolve(it) } ?: promise.resolve(true)
    }; Unit }
    OnActivityEntersForeground { onMain { paused = false } }
    OnActivityEntersBackground { onMain { paused = true; engine?.interrupt() } }
    OnDestroy { onMain {
      destroyed = true
      paused = true
      // TTS callbacks retain the engine until a delayed stop is confirmed.
      engine?.dispose { }
      // An already-dispatched stop must still inspect this exact engine.
    } }
  }
}
