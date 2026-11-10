import Foundation
var assertions = 0
func check(_ value: @autoclosure () -> Bool) { precondition(value()); assertions += 1 }
@main struct Tests {
 static func main() {
  let s = SpeechRunState()
  check(s.begin(id: "A", token: "native-A"))
  check(!s.begin(id: "B", token: "native-B"))
  check(s.requestCancel("stopped") == "native-A")
  check(s.requestCancel("interrupted") == "native-A")
  check(!s.start(token: "native-A"))
  check(s.finish(token: "old", reason: "finished") == nil)
  check(s.current?.id == "A")
  check(s.finish(token: "native-A", reason: "finished")?.reason == "stopped")
  check(s.finish(token: "native-A", reason: "stopped") == nil)
  check(!s.begin(id: "A", token: "reused"))
  check(s.begin(id: "B", token: "native-B"))
  check(s.finish(token: "native-A", reason: "error") == nil)
  check(s.current?.id == "B")
  check(s.start(token: "native-B"))
  check(!s.start(token: "native-B"))
  check(s.finish(token: "native-B", reason: "finished")?.reason == "finished")
  check(s.requestCancel("stopped") == nil)
  check(s.begin(id: "C", token: "native-C"))
  check(s.requestCancel("interrupted") == "native-C")
  check(s.finish(token: "native-C", reason: "error")?.reason == "interrupted")
  print("SpeechRunState Swift: \(assertions) assertions PASS")
 }
}
