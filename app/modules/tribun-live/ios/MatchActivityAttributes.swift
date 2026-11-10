import ActivityKit
import Foundation

// Widget hedefindeki tanımla (targets/widgets/MatchActivityAttributes.swift) birebir aynı olmalı.
@available(iOS 16.2, *)
struct MatchActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var home: Int
    var away: Int
    var minute: String
    var status: String
    var note: String?
    var clock: Double?   // maçın 0. dakikası sayılan an (unix sn); süre çubuğu buna göre kendiliğinden ilerler
  }

  var matchId: Int
  var homeId: Int      // logo dosyası: App Group/logos/<id>.png (uygulama kaydeder)
  var awayId: Int
  var homeName: String
  var awayName: String
  var homeAbbr: String
  var awayAbbr: String
  var homeColor: String
  var awayColor: String
  var league: String
  var pick: String?
}
