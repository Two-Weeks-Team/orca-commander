package android.media
import android.os.Handler
class AudioAttributes {
 companion object { const val USAGE_ASSISTANCE_ACCESSIBILITY = 11; const val CONTENT_TYPE_SPEECH = 1 }
 class Builder {
  fun setUsage(value: Int) = this
  fun setContentType(value: Int) = this
  fun build() = AudioAttributes()
 }
}
class AudioFocusRequest(val listener: AudioManager.OnAudioFocusChangeListener) {
 class Builder(gain: Int) {
  private lateinit var listener: AudioManager.OnAudioFocusChangeListener
  fun setAudioAttributes(a: AudioAttributes) = this
  fun setOnAudioFocusChangeListener(l: AudioManager.OnAudioFocusChangeListener, h: Handler) = apply { listener = l }
  fun setWillPauseWhenDucked(value: Boolean) = this
  fun setAcceptsDelayedFocusGain(value: Boolean) = this
  fun build() = AudioFocusRequest(listener)
 }
}
class AudioManager {
 companion object {
  const val AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK = 3
  const val AUDIOFOCUS_GAIN = 1
  const val AUDIOFOCUS_REQUEST_GRANTED = 1
  const val STREAM_MUSIC = 3
 }
 fun interface OnAudioFocusChangeListener { fun onAudioFocusChange(change: Int) }
 var status = 1
 var listener: OnAudioFocusChangeListener? = null
 var abandoned = 0
 fun requestAudioFocus(request: AudioFocusRequest): Int { listener = request.listener; return status }
 fun requestAudioFocus(l: OnAudioFocusChangeListener, stream: Int, gain: Int): Int { listener = l; return status }
 fun abandonAudioFocusRequest(request: AudioFocusRequest): Int { abandoned++; return 1 }
 fun abandonAudioFocus(l: OnAudioFocusChangeListener): Int { abandoned++; return 1 }
}
