package expo.modules.deckspeech
import android.content.Context
import android.os.Build
import android.os.Handler
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import java.util.Locale
private var assertions = 0
private fun verify(value: Boolean) { check(value); assertions++ }
fun main() {
 val context = Context()
 var foreground = true
 val events = mutableListOf<Pair<String, Map<String, String>>>()
 val e = DeckSpeechEngine(context, { foreground }) { name, data -> events.add(name to data) }
 verify(e.prepare("en-US")["reason"] == "loading")
 val t = TextToSpeech.last
 verify(t.speakCalls == 0)
 t.init(0); Handler.flush()
 verify(e.prepare("en-US")["ready"] == true)
 t.voices = setOf(Voice("network", Locale.US, true), Voice("missing", Locale.US, false, setOf("notInstalled")))
 verify(e.prepare("en-US")["reason"] == "unavailable")
 verify(t.speakCalls == 0)
 t.voices = setOf(Voice("local", Locale.US))
 t.setVoiceStatus = -1
 verify(e.prepare("en-US")["reason"] == "unavailable")
 t.setVoiceStatus = 0
 context.audio.status = 0
 verify(e.speak("denied", "synthetic", "en-US", 1.0)["reason"] == "focus_denied")
 verify(t.speakCalls == 0)
 context.audio.status = 1
 verify(e.speak("A", "synthetic", "en-US", 1.0)["accepted"] == true)
 val a = t.lastToken
 verify(e.speak("B", "synthetic", "en-US", 1.0)["reason"] == "busy")
 var stopped: Boolean? = null
 e.stop { stopped = it }
 verify(stopped == null && t.stopCalls == 1)
 t.listener!!.onStart(a); Handler.flush()
 verify(events.isEmpty() && t.stopCalls == 2)
 Handler.timeout()
 verify(stopped == false)
 verify(e.speak("B", "synthetic", "en-US", 1.0)["reason"] == "busy")
 t.listener!!.onStop(a, false); Handler.flush()
 verify(events.size == 1 && events.last().second == mapOf("id" to "A", "reason" to "stopped"))
 verify(e.speak("A", "synthetic", "en-US", 1.0)["accepted"] == false)
 verify(e.speak("B", "synthetic", "en-US", 1.0)["accepted"] == true)
 val b = t.lastToken
 t.listener!!.onDone(a); Handler.flush()
 verify(events.size == 1)
 verify(e.prepare("en-US")["reason"] == "busy")
 t.listener!!.onStart(b); t.listener!!.onStart(b); Handler.flush()
 verify(events.count { it.first == "onSpeechStarted" } == 1)
 context.audio.listener!!.onAudioFocusChange(-3); Handler.flush()
 verify(t.stopCalls == 3)
 t.listener!!.onStop(b, true); t.listener!!.onError(b); Handler.flush()
 verify(events.count { it.first == "onSpeechFinished" } == 2)
 verify(events.last().second["reason"] == "interrupted")
 foreground = false
 verify(e.prepare("en-US")["reason"] == "background")
 verify(e.speak("C", "synthetic", "en-US", 1.0)["reason"] == "background")
 foreground = true
 Build.VERSION.SDK_INT = 24
 verify(e.speak("C", "synthetic", "en-US", 1.0)["accepted"] == true)
 val c = t.lastToken
 var disposed: Boolean? = null
 e.dispose { disposed = it }
 verify(disposed == null && t.shutdownCalls == 0)
 t.listener!!.onStop(c, false); Handler.flush()
 verify(disposed == true && t.shutdownCalls == 1)
 verify(e.speak("D", "synthetic", "en-US", 1.0)["accepted"] == false)
 verify(events.last().second == mapOf("id" to "C", "reason" to "stopped"))
 e.stop { verify(it) }
 val e2 = DeckSpeechEngine(context, { true }) { name, data -> events.add(name to data) }
 e2.prepare("en-US"); val t2 = TextToSpeech.last; t2.init(0); Handler.flush()
 t2.speakThrows = true
 verify(e2.speak("uncertain", "synthetic", "en-US", 1.0)["accepted"] == false)
 verify(e2.speak("next", "synthetic", "en-US", 1.0)["reason"] == "busy")
 var uncertain: Boolean? = null
 e2.stop { uncertain = it }; Handler.timeout()
 verify(uncertain == false)
 t2.listener!!.onStop(t2.lastToken, false); Handler.flush()
 verify(events.last().second == mapOf("id" to "uncertain", "reason" to "error"))
 val e3 = DeckSpeechEngine(context, { foreground }) { name, data -> events.add(name to data) }
 e3.prepare("en-US"); val t3 = TextToSpeech.last; t3.init(0); Handler.flush()
 verify(e3.speak("background-before-start", "synthetic", "en-US", 1.0)["accepted"] == true)
 foreground = false
 val startsBefore = events.count { it.first == "onSpeechStarted" }
 t3.listener!!.onStart(t3.lastToken); Handler.flush()
 verify(t3.stopCalls == 1 && events.count { it.first == "onSpeechStarted" } == startsBefore)
 t3.listener!!.onStop(t3.lastToken, false); Handler.flush()
 verify(events.last().second == mapOf("id" to "background-before-start", "reason" to "interrupted"))
 e3.dispose { verify(it) }
 val detached = DeckSpeechEngine(context, { true }) { _, _ -> throw IllegalStateException() }
 detached.prepare("en-US"); val t4 = TextToSpeech.last; t4.init(0); Handler.flush()
 verify(detached.speak("detached", "synthetic", "en-US", 1.0)["accepted"] == true)
 var detachedStopped: Boolean? = null
 detached.dispose { detachedStopped = it }
 t4.listener!!.onStop(t4.lastToken, false); Handler.flush()
 verify(detachedStopped == true && t4.shutdownCalls == 1)
 val errors = mutableListOf<Map<String, String>>()
 val e5 = DeckSpeechEngine(context, { true }) { name, data -> if (name == "onSpeechFinished") errors.add(data) }
 e5.prepare("en-US"); val t5 = TextToSpeech.last; t5.init(0); Handler.flush()
 verify(e5.speak("processing-error", "synthetic", "en-US", 1.0)["accepted"] == true)
 t5.listener!!.onError(t5.lastToken, -1); Handler.flush()
 verify(errors.isEmpty() && t5.stopCalls == 1)
 verify(e5.prepare("en-US")["reason"] == "busy")
 var errorStopped: Boolean? = null
 e5.stop { errorStopped = it }
 verify(errorStopped == null)
 t5.listener!!.onStop(t5.lastToken, true); Handler.flush()
 verify(errorStopped == true && errors.single()["reason"] == "error")
 val logs = android.util.Log.entries
 verify(logs.any { it == "engine init status=0" })
 verify(logs.any { it == "voice language=en-US installedOffline=0" })
 verify(logs.any { it == "focus request status=0" })
 verify(logs.any { it == "focus request status=1" })
 verify(logs.any { it == "utterance start" })
 verify(logs.any { it == "utterance stop interrupted=true" })
 verify(logs.any { it == "utterance error code=-1" })
 verify(logs.none { it.contains("synthetic") || it.contains("processing-error") || it.contains(t5.lastToken) })
 println("DeckSpeech actual Kotlin engine / fake OS: $assertions assertions PASS")
}
