import AVFAudio
import UIKit

// All state and AVSpeechSynthesizer calls are serialized on the main queue.
final class DeckSpeechEngine: NSObject, AVSpeechSynthesizerDelegate {
  private let state = SpeechRunState()
  private let event: (String, [String: String]) -> Void
  private var synthesizer: AVSpeechSynthesizer?
  private var utterance: AVSpeechUtterance?
  private var observers: [NSObjectProtocol] = []
  private var waiters: [UUID: (Bool) -> Void] = [:]
  private var disposed = false
  // A teardown must not drop delegates before a delayed native cancellation.
  private var shutdownRetainer: DeckSpeechEngine?

  init(event: @escaping (String, [String: String]) -> Void) {
    self.event = event
    super.init()
    for name in [UIApplication.willResignActiveNotification, UIApplication.didEnterBackgroundNotification] {
      observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
        [weak self] _ in self?.interrupt()
      })
    }
    observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification,
      object: nil, queue: .main) { [weak self] notification in
        if let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
           type == AVAudioSession.InterruptionType.began.rawValue { self?.interrupt() }
      })
  }

  private var foreground: Bool { UIApplication.shared.applicationState == .active }

  private func voice(_ language: String) -> AVSpeechSynthesisVoice? {
    guard language == "ko-KR" || language == "en-US" else { return nil }
    // No language/default constructor: require an available, installed system voice.
    // The system identifier allowlist also excludes third-party synthesis providers.
    return AVSpeechSynthesisVoice.speechVoices().filter { voice in
      guard voice.language == language,
        voice.identifier.hasPrefix("com.apple.voice.") || voice.identifier.hasPrefix("com.apple.ttsbundle.")
        else { return false }
      if #available(iOS 17.0, *), voice.voiceTraits.contains(.isPersonalVoice) { return false }
      return AVSpeechSynthesisVoice(identifier: voice.identifier) != nil
    }.sorted { $0.identifier < $1.identifier }.first
  }

  func prepare(_ language: String) -> [String: Any] {
    precondition(Thread.isMainThread)
    if disposed || state.exhausted { return ["ready": false, "reason": "unavailable"] }
    if !foreground { return ["ready": false, "reason": "background"] }
    if state.current != nil { return ["ready": false, "reason": "busy"] }
    guard voice(language) != nil else { return ["ready": false, "reason": "unavailable"] }
    return ["ready": true]
  }

  func speak(id: String, text: String, language: String, rate: Double) -> [String: Any] {
    precondition(Thread.isMainThread)
    guard !disposed, !state.exhausted, !id.isEmpty, id.utf16.count <= 128,
      !text.isEmpty, text.utf16.count <= 4000, rate.isFinite, (0.5...2.0).contains(rate)
      else { return ["accepted": false, "reason": "unavailable"] }
    guard foreground else { return ["accepted": false, "reason": "background"] }
    guard state.current == nil else { return ["accepted": false, "reason": "busy"] }
    guard let selectedVoice = voice(language) else { return ["accepted": false, "reason": "unavailable"] }
    let token = UUID().uuidString
    guard state.begin(id: id, token: token) else { return ["accepted": false, "reason": "unavailable"] }
    let synth = AVSpeechSynthesizer()
    synth.usesApplicationAudioSession = false
    synth.delegate = self
    let request = AVSpeechUtterance(string: text)
    request.voice = selectedVoice
    request.rate = min(AVSpeechUtteranceMaximumSpeechRate,
      max(AVSpeechUtteranceMinimumSpeechRate, Float(rate) * AVSpeechUtteranceDefaultSpeechRate))
    synthesizer = synth
    utterance = request
    synth.speak(request)
    return ["accepted": true]
  }

  func interrupt() {
    precondition(Thread.isMainThread)
    requestStop(reason: "interrupted")
  }

  private func requestStop(reason: String) {
    guard state.requestCancel(reason) != nil else { return }
    // Always flush, including the interval before didStart/isSpeaking becomes true.
    _ = synthesizer?.stopSpeaking(at: .immediate)
  }

  func stop(_ complete: @escaping (Bool) -> Void) {
    precondition(Thread.isMainThread)
    guard state.current != nil else { complete(true); return }
    let key = UUID()
    waiters[key] = complete
    requestStop(reason: "stopped")
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
      // Timeout is uncertainty, never a synthetic native terminal event.
      self?.waiters.removeValue(forKey: key)?(false)
    }
  }

  func dispose(_ complete: @escaping (Bool) -> Void) {
    precondition(Thread.isMainThread)
    disposed = true
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
    if state.current != nil { shutdownRetainer = self }
    stop(complete)
  }

  private func perform(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() } else { DispatchQueue.main.async(execute: action) }
  }

  private func finish(_ synth: AVSpeechSynthesizer, _ request: AVSpeechUtterance, reason: String) {
    guard synthesizer === synth, utterance === request, let token = state.current?.token,
      let terminal = state.finish(token: token, reason: reason) else { return }
    synthesizer = nil
    utterance = nil
    let completions = Array(waiters.values)
    waiters.removeAll()
    event("onSpeechFinished", ["id": terminal.id, "reason": terminal.reason])
    completions.forEach { $0(true) }
    shutdownRetainer = nil
  }

  func speechSynthesizer(_ synth: AVSpeechSynthesizer, didStart request: AVSpeechUtterance) {
    perform { [self] in
      guard synthesizer === synth, utterance === request, let run = state.current else {
        _ = synth.stopSpeaking(at: .immediate); return
      }
      if !foreground { requestStop(reason: "interrupted"); return }
      guard state.start(token: run.token) else {
        if state.current?.cancellation != nil { _ = synth.stopSpeaking(at: .immediate) }
        return
      }
      event("onSpeechStarted", ["id": run.id])
    }
  }

  func speechSynthesizer(_ synth: AVSpeechSynthesizer, didFinish request: AVSpeechUtterance) {
    perform { [self] in finish(synth, request, reason: "finished") }
  }

  func speechSynthesizer(_ synth: AVSpeechSynthesizer, didCancel request: AVSpeechUtterance) {
    perform { [self] in finish(synth, request, reason: "stopped") }
  }
}
