package expo.modules.deckfeedback

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.provider.Settings

/** SoundPool effects only: no focus requests, audio mode, routing, or recording changes. */
internal class DeckClickSound(private val context: Context, private val resourceId: Int) {
  private val lock = Any()
  private var pool: SoundPool? = null
  private var sampleId = 0
  private var streamId = 0
  private var ready = false
  private var loading = false
  private var failed = false
  private var enabled = false
  private var captureActive = true
  private var foreground = false

  private fun statusLocked(): Map<String, Boolean> = mapOf(
    "supported" to true, "ready" to ready, "loading" to loading, "enabled" to enabled,
    "captureActive" to captureActive, "foreground" to foreground, "loadFailed" to failed
  )

  fun getStatus(): Map<String, Boolean> = synchronized(lock) { statusLocked() }

  fun configure(enabled: Boolean, captureActive: Boolean): Map<String, Boolean> = synchronized(lock) {
    this.enabled = enabled
    this.captureActive = captureActive
    if (!enabled || captureActive) stopLocked()
    statusLocked()
  }

  fun setForeground(value: Boolean) = synchronized(lock) {
    foreground = value
    if (!value) stopLocked()
  }

  fun prepare(): Map<String, Boolean> = synchronized(lock) {
    if (pool != null) return@synchronized statusLocked()
    try {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
      val created = SoundPool.Builder().setMaxStreams(1).setAudioAttributes(attributes).build()
      pool = created
      loading = true
      failed = false
      created.setOnLoadCompleteListener { loadedPool, loadedId, status ->
        synchronized(lock) {
          if (pool === loadedPool && sampleId == loadedId) {
            loading = false
            ready = status == 0
            failed = status != 0
            // Load completion only changes readiness. It never schedules playback.
          }
        }
      }
      sampleId = created.load(context, resourceId, 1)
      if (sampleId == 0) {
        loading = false
        failed = true
      }
    } catch (_: Exception) {
      pool?.release()
      pool = null
      sampleId = 0
      loading = false
      ready = false
      failed = true
    }
    statusLocked()
  }

  fun playClick(): String = synchronized(lock) {
    if (!enabled) return@synchronized "disabled"
    if (captureActive) return@synchronized "capture_active"
    if (!foreground) return@synchronized "background"
    val currentPool = pool
    if (!ready || currentPool == null) return@synchronized "not_ready"
    try {
      if (Settings.System.getInt(context.contentResolver, Settings.System.SOUND_EFFECTS_ENABLED, 0) != 1) {
        return@synchronized "system_disabled"
      }
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        ?: return@synchronized "unavailable"
      if (manager.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
          manager.isStreamMute(AudioManager.STREAM_SYSTEM) ||
          manager.getStreamVolume(AudioManager.STREAM_SYSTEM) == 0) return@synchronized "silent"
      streamId = currentPool.play(sampleId, 1f, 1f, 1, 0, 1f)
      if (streamId == 0) "playback_failed" else "scheduled"
    } catch (_: Exception) {
      "unavailable"
    }
  }

  private fun stopLocked() {
    if (streamId != 0) pool?.stop(streamId)
    streamId = 0
  }

  fun dispose() = synchronized(lock) {
    stopLocked()
    pool?.release()
    pool = null
    sampleId = 0
    ready = false
    loading = false
    failed = false
    enabled = false
    captureActive = true
  }
}
