package android.content
import android.media.AudioManager
open class Context {
 companion object { const val AUDIO_SERVICE = "audio" }
 val audio = AudioManager()
 fun getSystemService(name: String): Any = audio
}
