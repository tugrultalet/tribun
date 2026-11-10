import SwiftUI
import WidgetKit

@main
struct TribunWidgetBundle: WidgetBundle {
  var body: some Widget {
    NextMatchWidget()
    MatchLiveActivity()
  }
}
