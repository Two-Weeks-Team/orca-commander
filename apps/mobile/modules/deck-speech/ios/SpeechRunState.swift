// Main-thread confined, text-free identity and terminal-event gate.
final class SpeechRunState {
  struct Run {
    let id: String
    let token: String
    var started = false
    var cancellation: String?
  }
  private(set) var current: Run?
  private var usedIDs = Set<String>()
  var exhausted: Bool { usedIDs.count >= 8192 }

  func begin(id: String, token: String) -> Bool {
    guard current == nil, !exhausted, !usedIDs.contains(id) else { return false }
    usedIDs.insert(id)
    current = Run(id: id, token: token)
    return true
  }

  func requestCancel(_ reason: String) -> String? {
    guard current != nil else { return nil }
    if current?.cancellation == nil { current?.cancellation = reason }
    return current?.token
  }

  func start(token: String) -> Bool {
    guard current?.token == token, current?.cancellation == nil,
          current?.started == false else { return false }
    current?.started = true
    return true
  }

  func finish(token: String, reason: String) -> (id: String, reason: String)? {
    guard let run = current, run.token == token else { return nil }
    current = nil
    return (run.id, run.cancellation ?? reason)
  }
}
