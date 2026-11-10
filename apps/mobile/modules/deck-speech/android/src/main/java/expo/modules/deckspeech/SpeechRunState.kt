package expo.modules.deckspeech

// Main-thread confined. Never retains utterance text.
internal class SpeechRunState {
  data class Run(val id: String, val token: String, var started: Boolean = false,
    var cancellation: String? = null)
  var current: Run? = null
    private set
  private val usedIDs = HashSet<String>()
  val exhausted get() = usedIDs.size >= 8192

  fun begin(id: String, token: String): Boolean {
    if (current != null || exhausted || !usedIDs.add(id)) return false
    current = Run(id, token)
    return true
  }
  fun requestCancel(reason: String): String? {
    val run = current ?: return null
    if (run.cancellation == null) run.cancellation = reason
    return run.token
  }
  fun start(token: String): Boolean {
    val run = current ?: return false
    if (run.token != token || run.cancellation != null || run.started) return false
    run.started = true
    return true
  }
  fun finish(token: String, reason: String): Pair<String, String>? {
    val run = current ?: return null
    if (run.token != token) return null
    current = null
    return run.id to (run.cancellation ?: reason)
  }
}
