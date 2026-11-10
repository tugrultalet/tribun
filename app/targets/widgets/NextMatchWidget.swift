import SwiftUI
import WidgetKit

// Ana ekran widget'ı: ana takımın sıradaki (ya da canlı) maçı ve grubundaki haftalık sıran.
// Veriyi uygulama App Group'a yazar ("widget" anahtarı, JSON); widget yalnızca okur.
struct WidgetSnapshot: Codable {
  struct MatchInfo: Codable {
    var id: Int
    var home: String
    var away: String
    var homeAbbr: String
    var awayAbbr: String
    var homeColor: String
    var awayColor: String
    var ts: Double
    var status: String
    var homeScore: Int?
    var awayScore: Int?
    var league: String
  }
  struct RankInfo: Codable {
    var group: String
    var rank: Int
    var total: Int
    var points: Int
  }
  var match: MatchInfo?
  var rank: RankInfo?
  var updated: Double
}

struct NextMatchEntry: TimelineEntry {
  let date: Date
  let snap: WidgetSnapshot?
}

struct NextMatchProvider: TimelineProvider {
  static let group = "group.com.sportvisor.tribun"

  func load() -> WidgetSnapshot? {
    guard let text = UserDefaults(suiteName: NextMatchProvider.group)?.string(forKey: "widget") else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: Data(text.utf8))
  }
  func placeholder(in context: Context) -> NextMatchEntry { NextMatchEntry(date: Date(), snap: nil) }
  func getSnapshot(in context: Context, completion: @escaping (NextMatchEntry) -> Void) {
    completion(NextMatchEntry(date: Date(), snap: load()))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NextMatchEntry>) -> Void) {
    let entry = NextMatchEntry(date: Date(), snap: load())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
  }
}

struct NextMatchView: View {
  @Environment(\.widgetFamily) var family
  let entry: NextMatchEntry

  var body: some View {
    if let m = entry.snap?.match {
      VStack(alignment: .leading, spacing: 6) {
        Text(m.league).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
        HStack(spacing: 8) {
          TeamBadge(abbr: m.homeAbbr, color: m.homeColor, size: family == .systemSmall ? 30 : 36)
          if m.status == "ns" {
            Text(Date(timeIntervalSince1970: m.ts), format: .dateTime.weekday(.abbreviated).hour().minute())
              .font(.caption.weight(.bold)).frame(maxWidth: .infinity)
          } else {
            Text("\(m.homeScore ?? 0) – \(m.awayScore ?? 0)").font(.title3.weight(.bold)).monospacedDigit().frame(maxWidth: .infinity)
          }
          TeamBadge(abbr: m.awayAbbr, color: m.awayColor, size: family == .systemSmall ? 30 : 36)
        }
        if family != .systemSmall {
          Text("\(m.home) – \(m.away)").font(.subheadline.weight(.semibold)).lineLimit(1)
        }
        if m.status == "live" {
          Text("Canlı").font(.caption2.weight(.bold)).foregroundStyle(tribunLive)
        }
        Spacer(minLength: 0)
        if let r = entry.snap?.rank {
          Text("\(r.group) grubunda \(r.rank). (\(r.points) puan)").font(.caption2.weight(.semibold)).foregroundStyle(tribunAccent).lineLimit(1)
        }
      }
      .foregroundStyle(.white)
      .widgetURL(URL(string: "tribun://match/\(m.id)"))
    } else {
      VStack(alignment: .leading, spacing: 6) {
        Text("Tribün").font(.headline)
        Text("Takımının sıradaki maçı burada görünecek. Uygulamayı bir kez aç.").font(.caption).foregroundStyle(.white.opacity(0.7))
      }
      .foregroundStyle(.white)
    }
  }
}

struct NextMatchWidget: Widget {
  let kind = "NextMatch"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: NextMatchProvider()) { entry in
      NextMatchView(entry: entry)
        .containerBackground(for: .widget) {
          LinearGradient(colors: [Color(red: 0.42, green: 0.04, blue: 0.16), tribunNavy], startPoint: .top, endPoint: .bottom)
        }
    }
    .configurationDisplayName("Sıradaki maç")
    .description("Takımının sıradaki maçı ve grubundaki sıran.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
