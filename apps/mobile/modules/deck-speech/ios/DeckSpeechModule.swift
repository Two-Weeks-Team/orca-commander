import ExpoModulesCore
import Foundation

public final class DeckSpeechModule: Module {
  private var engine: DeckSpeechEngine?
  private var destroyed = false

  private func getEngine() -> DeckSpeechEngine? {
    guard !destroyed else { return nil }
    if engine == nil {
      engine = DeckSpeechEngine { [weak self] name, payload in self?.sendEvent(name, payload) }
    }
    return engine
  }

  public func definition() -> ModuleDefinition {
    Name("DeckSpeech")
    Events("onSpeechStarted", "onSpeechFinished")
    AsyncFunction("prepare") { (language: String, promise: Promise) in
      DispatchQueue.main.async { [self] in
        promise.resolve(getEngine()?.prepare(language) ?? ["ready": false, "reason": "unavailable"])
      }
    }
    AsyncFunction("speak") { (id: String, text: String, language: String, rate: Double, promise: Promise) in
      DispatchQueue.main.async { [self] in
        promise.resolve(getEngine()?.speak(id: id, text: text, language: language, rate: rate)
          ?? ["accepted": false, "reason": "unavailable"])
      }
    }
    AsyncFunction("stop") { (promise: Promise) in
      DispatchQueue.main.async { [self] in
        if let engine = engine { engine.stop { promise.resolve($0) } } else { promise.resolve(true) }
      }
    }
    AsyncFunction("dispose") { (promise: Promise) in
      DispatchQueue.main.async { [self] in
        destroyed = true
        if let engine = engine { engine.dispose { promise.resolve($0) } } else { promise.resolve(true) }
      }
    }
    OnAppEntersBackground { [weak self] in
      DispatchQueue.main.async { [weak self] in self?.engine?.interrupt() }
    }
    OnDestroy {
      DispatchQueue.main.async { [self] in
        destroyed = true
        engine?.dispose { _ in }
        // Keep the exact engine reachable by any already-dispatched stop call.
      }
    }
  }
}
