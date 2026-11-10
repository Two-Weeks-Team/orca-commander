package android.os
class Looper { companion object {
 private val main = Looper()
 fun getMainLooper() = main
 fun myLooper() = main
} }
object Build { object VERSION { var SDK_INT = 36 } }
class Bundle { fun putString(key: String, value: String) {} }
class Handler(looper: Looper) {
 companion object {
  private val queued = ArrayDeque<Runnable>()
  private val delayed = ArrayDeque<Runnable>()
  fun flush() { while (queued.isNotEmpty()) queued.removeFirst().run() }
  fun timeout() { while (delayed.isNotEmpty()) delayed.removeFirst().run(); flush() }
 }
 fun post(action: Runnable): Boolean { queued.addLast(action); return true }
 fun postDelayed(action: Runnable, delay: Long): Boolean { delayed.addLast(action); return true }
}
