package android.speech.tts
import android.content.Context
import android.media.AudioAttributes
import android.os.Bundle
import java.util.Locale
class Voice(val name: String, val locale: Locale, val isNetworkConnectionRequired: Boolean = false,
 val features: Set<String> = emptySet())
abstract class UtteranceProgressListener {
 abstract fun onStart(id: String)
 abstract fun onDone(id: String)
 abstract fun onError(id: String)
 open fun onError(id: String, errorCode: Int) {}
 open fun onStop(id: String, interrupted: Boolean) {}
}
class TextToSpeech(context: Context, val init: (Int) -> Unit) {
 companion object {
  const val SUCCESS = 0
  const val QUEUE_FLUSH = 0
  lateinit var last: TextToSpeech
  fun getMaxSpeechInputLength() = 4000
 }
 object Engine {
  const val KEY_FEATURE_NOT_INSTALLED = "notInstalled"
  const val KEY_FEATURE_EMBEDDED_SYNTHESIS = "embedded"
 }
 init { last = this }
 var voices: Set<Voice>? = setOf(Voice("local", Locale.US))
 var voice: Voice? = null
 var listener: UtteranceProgressListener? = null
 var selected = 0
 var setVoiceStatus = SUCCESS
 var speakStatus = SUCCESS
 var speakThrows = false
 var stopCalls = 0
 var speakCalls = 0
 var shutdownCalls = 0
 var lastToken = ""
 fun setAudioAttributes(attributes: AudioAttributes) = SUCCESS
 fun setOnUtteranceProgressListener(l: UtteranceProgressListener): Int { listener = l; return SUCCESS }
 fun setVoice(v: Voice): Int { selected++; if (setVoiceStatus == SUCCESS) voice = v; return setVoiceStatus }
 fun setSpeechRate(rate: Float) = SUCCESS
 fun speak(text: String, queue: Int, params: Bundle, id: String): Int {
  speakCalls++; lastToken = id
  if (speakThrows) throw IllegalStateException()
  return speakStatus
 }
 fun stop(): Int { stopCalls++; return SUCCESS }
 fun shutdown() { shutdownCalls++ }
}
