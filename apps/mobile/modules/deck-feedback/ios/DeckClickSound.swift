import Foundation
import AudioToolbox

/// UI-only system sounds. This class never accesses AVAudioSession or recording APIs.
final class DeckClickSound: NSObject {
  private let lock = NSLock()
  private var soundID: SystemSoundID = 0
  private var enabled = false
  private var captureActive = true
  private var foreground = false
  private var failed = false
  private var busy = false
  private var generation: UInt64 = 0

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  private func statusLocked() -> [String: Any] {
    ["supported": true, "ready": soundID != 0, "loading": false, "enabled": enabled,
     "captureActive": captureActive, "foreground": foreground, "loadFailed": failed]
  }

  func getStatus() -> [String: Any] { locked { statusLocked() } }

  func configure(enabled: Bool, captureActive: Bool) -> [String: Any] {
    locked {
      self.enabled = enabled
      self.captureActive = captureActive
      return statusLocked()
    }
  }

  func setForeground(_ value: Bool) { locked { foreground = value } }

  func prepare() -> [String: Any] {
    locked {
      if soundID != 0 { return statusLocked() }
      let owners = [Bundle(for: DeckClickSound.self), Bundle.main]
      let resource = owners.compactMap { owner -> URL? in
        guard let url = owner.url(forResource: "DeckFeedbackResources", withExtension: "bundle"),
              let bundle = Bundle(url: url) else { return nil }
        return bundle.url(forResource: "deck_click", withExtension: "wav")
      }.first
      guard let resource else {
        failed = true
        return statusLocked()
      }
      var created: SystemSoundID = 0
      guard AudioServicesCreateSystemSoundID(resource as CFURL, &created) == kAudioServicesNoError else {
        failed = true
        return statusLocked()
      }
      // System sounds default to the UI-sound policy (IsUISound=1); never override it.
      soundID = created
      failed = false
      return statusLocked()
    }
  }

  func playClick() -> String {
    locked {
      guard enabled else { return "disabled" }
      guard !captureActive else { return "capture_active" }
      guard foreground else { return "background" }
      guard soundID != 0 else { return "not_ready" }
      guard !busy else { return "busy" }
      busy = true
      let submittedGeneration = generation
      AudioServicesPlaySystemSoundWithCompletion(soundID) { [weak self] in
        guard let self else { return }
        self.locked {
          if self.generation == submittedGeneration { self.busy = false }
        }
      }
      // Completion is called even for unsuccessful attempts; this is never an audibility receipt.
      return "scheduled"
    }
  }

  func dispose() {
    locked {
      generation &+= 1
      if soundID != 0 { AudioServicesDisposeSystemSoundID(soundID) }
      soundID = 0
      busy = false
      failed = false
      enabled = false
      captureActive = true
    }
  }

  deinit { if soundID != 0 { AudioServicesDisposeSystemSoundID(soundID) } }
}
