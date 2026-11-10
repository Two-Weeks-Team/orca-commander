import ExpoModulesCore
import UIKit

public class DeckFeedbackModule: Module {
  private let sound = DeckClickSound()

  public func definition() -> ModuleDefinition {
    Name("DeckFeedback")
    OnCreate {
      DispatchQueue.main.async {
        self.sound.setForeground(UIApplication.shared.applicationState == .active)
      }
    }
    Function("prepare") { self.sound.prepare() }
    Function("configure") { (enabled: Bool, captureActive: Bool) in
      self.sound.configure(enabled: enabled, captureActive: captureActive)
    }
    Function("getStatus") { self.sound.getStatus() }
    Function("playClick") { self.sound.playClick() }
    Function("dispose") { self.sound.dispose() }
    OnAppBecomesActive { self.sound.setForeground(true) }
    OnAppEntersBackground { self.sound.setForeground(false) }
    OnDestroy { self.sound.dispose() }
  }
}
