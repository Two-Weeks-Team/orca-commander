package expo.modules.deckspeech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale
import java.util.UUID

// The main looper serializes commands, lifecycle, focus and TTS callbacks.
internal class DeckSpeechEngine(
  private val context: Context,
  private val foreground: () -> Boolean,
  private val event: (String, Map<String, String>) -> Unit
) {
  private companion object {
    // Explicitly retain teardown cancellation even after the Expo module/listeners disappear.
    val stopping = HashSet<DeckSpeechEngine>()
  }
  private val main = Handler(Looper.getMainLooper())
  private val state = SpeechRunState()
  private var tts: TextToSpeech? = null
  private var loading = false
  private var ready = false
  private var failed = false
  private var disposed = false
  private var focusRequest: AudioFocusRequest? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val waiters = HashMap<String, (Boolean) -> Unit>()
  private val attributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

  private fun requireMain() = check(Looper.myLooper() == Looper.getMainLooper())
  // Fixed stages, status codes and counts only. Never log text, request IDs or voice names.
  private fun diagnostic(message: String) { Log.i("DeckSpeech", message) }

  private fun initialize() {
    if (tts != null || loading || failed || disposed) return
    loading = true
    diagnostic("engine init requested")
    try {
      // Always post: even an immediate constructor callback runs after assignment.
      tts = TextToSpeech(context) { status -> main.post {
        loading = false
        diagnostic("engine init status=$status")
        if (disposed) { shutdownIfIdle(); return@post }
        val instance = tts
        if (status != TextToSpeech.SUCCESS || instance == null) { failed = true; return@post }
        ready = try {
          instance.setAudioAttributes(attributes) == TextToSpeech.SUCCESS &&
            instance.setOnUtteranceProgressListener(progress) == TextToSpeech.SUCCESS
        } catch (_: Exception) { false }
        failed = !ready
        diagnostic("engine ready=$ready")
      } }
    } catch (_: Exception) { loading = false; failed = true; diagnostic("engine init exception") }
  }

  private fun selectVoice(language: String): Boolean {
    if (language != "ko-KR" && language != "en-US") return false
    val instance = tts ?: return false
    return try {
      val locale = Locale.forLanguageTag(language)
      val matching = instance.voices.orEmpty().filter {
        it.locale.language == locale.language && it.locale.country == locale.country &&
          !it.isNetworkConnectionRequired &&
          !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
      }
      diagnostic("voice language=$language installedOffline=${matching.size}")
      val selected = matching.sortedBy { it.name }.firstOrNull() ?: return false
      val status = instance.setVoice(selected)
      val accepted = status == TextToSpeech.SUCCESS && instance.voice?.name == selected.name
      diagnostic("voice selection status=$status accepted=$accepted")
      accepted
    } catch (_: Exception) { diagnostic("voice selection exception"); false }
  }

  fun prepare(language: String): Map<String, Any> {
    requireMain()
    if (disposed || failed || state.exhausted || (language != "ko-KR" && language != "en-US"))
      return mapOf("ready" to false, "reason" to "unavailable")
    if (!foreground()) { diagnostic("prepare background"); return mapOf("ready" to false, "reason" to "background") }
    if (state.current != null) { diagnostic("prepare busy"); return mapOf("ready" to false, "reason" to "busy") }
    initialize()
    if (!ready) return mapOf("ready" to false, "reason" to if (failed) "unavailable" else "loading")
    return if (selectVoice(language)) mapOf("ready" to true)
      else mapOf("ready" to false, "reason" to "unavailable")
  }

  fun speak(id: String, text: String, language: String, rate: Double): Map<String, Any> {
    requireMain()
    if (disposed || failed || state.exhausted || id.isEmpty() || id.length > 128 ||
      text.isEmpty() || text.length > minOf(4000, TextToSpeech.getMaxSpeechInputLength()) ||
      !rate.isFinite() || rate !in 0.5..2.0 || (language != "ko-KR" && language != "en-US"))
      return rejected("unavailable")
    if (!foreground()) return rejected("background")
    if (state.current != null) return rejected("busy")
    initialize()
    if (!ready) return rejected(if (failed) "unavailable" else "loading")
    val instance = tts ?: return rejected("unavailable")
    if (!selectVoice(language)) return rejected("unavailable")
    val token = UUID.randomUUID().toString()
    if (!acquireFocus(token)) return rejected("focus_denied")
    if (!state.begin(id, token)) { abandonFocus(); return rejected("unavailable") }
    try {
      if (instance.setSpeechRate(rate.toFloat()) != TextToSpeech.SUCCESS) {
        finish(token, "error"); return rejected("unavailable")
      }
      // Explicit installed voice above; no setLanguage/default/network fallback.
      val params = Bundle()
      if (instance.speak(text, TextToSpeech.QUEUE_FLUSH, params, token) != TextToSpeech.SUCCESS) {
        finish(token, "error"); return rejected("unavailable")
      }
      return mapOf("accepted" to true)
    } catch (_: Exception) {
      // A throwing binder call leaves submission uncertain. Keep the run quarantined.
      requestStop("error")
      return rejected("unavailable")
    }
  }

  private fun rejected(reason: String): Map<String, Any> {
    diagnostic("submission refused reason=$reason")
    return mapOf("accepted" to false, "reason" to reason)
  }

  private fun emit(name: String, payload: Map<String, String>) {
    // A detached JS listener must not prevent native cleanup/stop confirmation.
    try { event(name, payload) } catch (_: Exception) { }
  }

  @Suppress("DEPRECATION")
  private fun acquireFocus(token: String): Boolean {
    val listener = AudioManager.OnAudioFocusChangeListener { change -> main.post {
      diagnostic("focus change=$change current=${state.current?.token == token}")
      if (change != AudioManager.AUDIOFOCUS_GAIN && state.current?.token == token) interrupt()
    } }
    focusListener = listener
    return try {
      val status = if (Build.VERSION.SDK_INT >= 26) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(attributes).setOnAudioFocusChangeListener(listener, main)
          .setWillPauseWhenDucked(true).setAcceptsDelayedFocusGain(false).build()
        focusRequest = request
        audio.requestAudioFocus(request)
      } else {
        audio.requestAudioFocus(listener, AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      }
      diagnostic("focus request status=$status")
      if (status == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) true else { abandonFocus(); false }
    } catch (_: Exception) { diagnostic("focus request exception"); abandonFocus(); false }
  }

  @Suppress("DEPRECATION")
  private fun abandonFocus() {
    try {
      if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      else focusListener?.let { audio.abandonAudioFocus(it) }
    } catch (_: Exception) { /* Playback is already terminal; never retry speech. */ }
    focusRequest = null
    focusListener = null
  }

  private fun requestStop(reason: String) {
    if (state.requestCancel(reason) == null) return
    try { tts?.stop() } catch (_: Exception) { /* No confirmation: wait/timeout false. */ }
  }

  fun interrupt() { requireMain(); requestStop("interrupted") }

  fun stop(complete: (Boolean) -> Unit) {
    requireMain()
    if (state.current == null) { abandonFocus(); complete(true); return }
    val waiter = UUID.randomUUID().toString()
    waiters[waiter] = complete
    requestStop("stopped")
    main.postDelayed({ waiters.remove(waiter)?.invoke(false) }, 1000)
  }

  fun dispose(complete: (Boolean) -> Unit) {
    requireMain()
    disposed = true
    if (state.current != null) stopping.add(this)
    stop { confirmed -> shutdownIfIdle(); complete(confirmed) }
  }

  private fun shutdownIfIdle() {
    if (!disposed || state.current != null) return
    try { tts?.shutdown() } catch (_: Exception) { }
    tts = null
    ready = false
    abandonFocus()
    stopping.remove(this)
  }

  private fun finish(token: String, reason: String) {
    val terminal = state.finish(token, reason) ?: return
    abandonFocus()
    val completions = waiters.values.toList()
    waiters.clear()
    emit("onSpeechFinished", mapOf("id" to terminal.first, "reason" to terminal.second))
    completions.forEach { it(true) }
    shutdownIfIdle()
  }

  private fun fail(token: String) {
    if (state.current?.token != token) return
    // A processing error alone is not proof that buffered playback was flushed.
    // Confirm cancellation through onStop/onDone, or retain uncertainty.
    requestStop("error")
  }

  private val progress = object : UtteranceProgressListener() {
    override fun onStart(id: String) { main.post {
      val run = state.current
      if (run?.token != id) return@post
      diagnostic("utterance start")
      if (!foreground()) { interrupt(); return@post }
      if (run.cancellation != null) { requestStop(run.cancellation!!); return@post }
      if (state.start(id)) emit("onSpeechStarted", mapOf("id" to run.id))
    } }
    override fun onDone(id: String) { main.post { if (state.current?.token == id) diagnostic("utterance done"); finish(id, "finished") } }
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onError(id: String) { main.post { if (state.current?.token == id) diagnostic("utterance error"); fail(id) } }
    override fun onError(id: String, errorCode: Int) { main.post { if (state.current?.token == id) diagnostic("utterance error code=$errorCode"); fail(id) } }
    override fun onStop(id: String, interrupted: Boolean) { main.post { if (state.current?.token == id) diagnostic("utterance stop interrupted=$interrupted"); finish(id, "stopped") } }
  }
}
