package android.util
object Log {
 val entries = mutableListOf<String>()
 fun i(tag: String, message: String): Int { check(tag == "DeckSpeech"); entries.add(message); return 0 }
}
