import ActivityKit
import ExpoModulesCore
import Foundation

final class LiveUnsupportedException: Exception {
  override var reason: String { "Canlı skor kilit ekranında yalnızca iOS 18 ve üzerinde, Live Activity izni açıkken gösterilir." }
}

// Maç Live Activity'si: uygulama başlatır (APNs yayın kanalına bağlı), güncellemeleri sunucu gönderir.
public class TribunLiveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TribunLive")

    Function("isSupported") { () -> Bool in
      if #available(iOS 18.0, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    Function("activeMatches") { () -> [Int] in
      if #available(iOS 18.0, *) {
        return Activity<MatchActivityAttributes>.activities.map { $0.attributes.matchId }
      }
      return []
    }

    // attributes ve state JSON metni olarak gelir (alan adları MatchActivityAttributes ile aynı).
    AsyncFunction("start") { (attributesJson: String, stateJson: String, channelId: String?) throws -> String in
      guard #available(iOS 18.0, *) else { throw LiveUnsupportedException() }
      let decoder = JSONDecoder()
      let attributes = try decoder.decode(MatchActivityAttributes.self, from: Data(attributesJson.utf8))
      let state = try decoder.decode(MatchActivityAttributes.ContentState.self, from: Data(stateJson.utf8))
      if let existing = Activity<MatchActivityAttributes>.activities.first(where: { $0.attributes.matchId == attributes.matchId }) {
        return existing.id
      }
      let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(4 * 3600))
      let push: PushType? = channelId.map { PushType.channel($0) }
      let activity = try Activity.request(attributes: attributes, content: content, pushType: push)
      return activity.id
    }

    AsyncFunction("update") { (matchId: Int, stateJson: String) async throws in
      guard #available(iOS 18.0, *) else { return }
      let state = try JSONDecoder().decode(MatchActivityAttributes.ContentState.self, from: Data(stateJson.utf8))
      for activity in Activity<MatchActivityAttributes>.activities where activity.attributes.matchId == matchId {
        await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(4 * 3600)))
      }
    }

    AsyncFunction("end") { (matchId: Int) async in
      guard #available(iOS 18.0, *) else { return }
      for activity in Activity<MatchActivityAttributes>.activities where activity.attributes.matchId == matchId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
