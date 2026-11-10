import ActivityKit
import Foundation

// Maç Live Activity'sinin verisi. Aynı tanım uygulamadaki TribunLive modülünde de var (modules/tribun-live/ios);
// ActivityKit ikisini adından eşleştirir, alanlar birebir aynı kalmalı. Sunucu "content-state"i bu alan adlarıyla gönderir.
struct MatchActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var home: Int
    var away: Int
    var minute: String   // "67'", "DA" (devre arası), "MS" (maç sonu) ya da başlama saati "20:45"
    var status: String   // ns | live | ht | ft
    var note: String?    // son olay, ör. "GOL! Galatasaray"
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
