import ActivityKit
import Foundation

// Aynı anda birden fazla takip edilen maç: tek Live Activity'de alt alta. Uygulamadaki (modules/tribun-live/ios) ve
// widget hedefindeki (targets/widgets) tanımlar birebir aynı olmalı. Sunucu "content-state"i bu alan adlarıyla gönderir.
@available(iOS 16.2, *)
struct MultiMatchAttributes: ActivityAttributes {
  public struct Slot: Codable, Hashable {
    var id: Int
    var home: Int
    var away: Int
    var minute: String
    var status: String
    var clock: Double?
    var note: String?
  }
  public struct ContentState: Codable, Hashable {
    var slots: [Slot]
  }
  public struct Team: Codable, Hashable {
    var id: Int
    var abbr: String
    var color: String
  }
  public struct Match: Codable, Hashable {
    var id: Int
    var home: Team
    var away: Team
  }

  var matches: [Match]
}
