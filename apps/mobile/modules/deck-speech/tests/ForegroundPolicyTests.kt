package expo.modules.deckspeech

private var checks=0
private fun verify(value:Boolean,message:String){check(value){message};checks++}
private data class ActivityFixture(val focused:Boolean,val finishing:Boolean=false,val destroyed:Boolean=false)
private fun allows(activity:ActivityFixture?,resumed:Boolean=true,paused:Boolean=false,moduleDestroyed:Boolean=false)=
  isSpeechForegroundAllowed(paused,moduleDestroyed,activity?.finishing,activity?.destroyed,resumed)
fun main(){
  val dialogOwner=ActivityFixture(focused=false)
  verify(!dialogOwner.focused&&allows(dialogOwner),"resumed Dialog owner permits speech without Activity window focus")
  verify(allows(ActivityFixture(focused=true)),"focused resumed Activity permits speech")
  verify(!allows(dialogOwner,paused=true),"background/pause latch overrides resumed lifecycle")
  verify(!allows(dialogOwner,resumed=false),"non-resumed or unknown React lifecycle refuses speech")
  verify(!allows(dialogOwner,moduleDestroyed=true),"destroyed Expo module refuses speech")
  verify(!allows(ActivityFixture(focused=false,finishing=true)),"finishing Activity refuses speech")
  verify(!allows(ActivityFixture(focused=false,destroyed=true)),"destroyed Activity refuses speech")
  verify(!allows(null),"missing Activity refuses speech")
  verify(!isSpeechForegroundAllowed(false,false,null,false,true),"unknown finishing status fails closed")
  verify(!isSpeechForegroundAllowed(false,false,false,null,true),"unknown destroyed status fails closed")
  println("DeckSpeech foreground policy: $checks assertions PASS")
}
