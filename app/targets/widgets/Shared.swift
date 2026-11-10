import SwiftUI
import UIKit

// Ortak görünüm yardımcıları (widget ve Live Activity).
extension Color {
  // Koyulaştırılmış takım rengi (dim 0…1): kart zemininde beyaz yazı her zaman okunsun.
  init(hex: String, dim: Double) {
    var t = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.hasPrefix("#") { t.removeFirst() }
    var v: UInt64 = 0
    Scanner(string: t).scanHexInt64(&v)
    if t.count != 6 { v = 0x1B2A5A }
    let k = 1 - min(max(dim, 0), 0.9)
    self.init(red: Double((v >> 16) & 0xFF) / 255 * k, green: Double((v >> 8) & 0xFF) / 255 * k, blue: Double(v & 0xFF) / 255 * k)
  }

  init(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    var v: UInt64 = 0
    Scanner(string: s).scanHexInt64(&v)
    if s.count != 6 { v = 0x9DB1FF }
    self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
  }
}

let tribunNavy = Color(red: 11 / 255, green: 16 / 255, blue: 48 / 255)
let tribunAccent = Color(red: 157 / 255, green: 177 / 255, blue: 1)
let tribunLive = Color(red: 1, green: 90 / 255, blue: 82 / 255)

// Takım rozeti: renkli daire içinde kısaltma (widget'larda uzaktan logo yüklenemez).
struct TeamBadge: View {
  let abbr: String
  let color: String
  var size: CGFloat = 34
  var body: some View {
    ZStack {
      Circle().fill(Color(hex: color))
      Text(abbr).font(.system(size: size * 0.32, weight: .heavy)).foregroundStyle(.white).minimumScaleFactor(0.6).lineLimit(1).padding(3)
    }
    .frame(width: size, height: size)
  }
}

// Takım logosu: uygulamanın App Group'a kaydettiği küçük PNG (widget'lar ağdan resim yükleyemez). Yoksa renkli rozet.
func teamLogoImage(_ id: Int) -> UIImage? {
  guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.sportvisor.tribun") else { return nil }
  return UIImage(contentsOfFile: dir.appendingPathComponent("logos/\(id).png").path)
}

struct TeamLogo: View {
  let id: Int
  let abbr: String
  let color: String
  var size: CGFloat = 34
  var body: some View {
    if let image = teamLogoImage(id) {
      Image(uiImage: image).resizable().scaledToFit().frame(width: size, height: size)
    } else {
      TeamBadge(abbr: abbr, color: color, size: size)
    }
  }
}

// Kart zemini: ev sahibinin renginden deplasmanın rengine, koyulaştırılmış geçiş.
struct MatchBackground: View {
  let homeColor: String
  let awayColor: String
  var body: some View {
    LinearGradient(colors: [Color(hex: homeColor, dim: 0.3), Color(hex: homeColor, dim: 0.55), Color(hex: awayColor, dim: 0.6), Color(hex: awayColor, dim: 0.4)],
                   startPoint: .leading, endPoint: .trailing)
      .overlay(Color.black.opacity(0.15))
  }
}

// Süre barı (A): kartın içinde, skorun altında yuvarlak bar; ortada devre arası çizgisi, ucunda parlayan nokta.
// Konum maçın 0. dakikası sayılan andan (clock) hesaplanır; görünüm her güncellemede (yaklaşık dakikada bir) yeniden çizilir.
struct MatchProgress: View {
  let state: MatchActivityAttributes.ContentState

  var fraction: Double {
    switch state.status {
    case "ft": return 1
    case "ht": return 0.5
    case "live":
      guard let clock = state.clock else { return 0 }
      return min(max((Date().timeIntervalSince1970 - clock) / (90 * 60), 0), 1)
    default: return 0
    }
  }

  var body: some View {
    GeometryReader { g in
      let w = g.size.width
      let x = w * fraction
      let mid = g.size.height / 2
      ZStack {
        Capsule().fill(Color.white.opacity(0.18)).frame(width: w, height: 6).position(x: w / 2, y: mid)
        if x > 0 {
          Capsule().fill(Color.white).frame(width: max(6, x), height: 6).position(x: max(6, x) / 2, y: mid)
        }
        Rectangle().fill(Color.white.opacity(0.55)).frame(width: 2, height: 12).position(x: w / 2, y: mid)
        if state.status == "live" || state.status == "ht" {
          Circle().fill(Color.white).frame(width: 13, height: 13)
            .overlay(Circle().stroke(tribunLive.opacity(0.6), lineWidth: 3))
            .shadow(color: tribunLive.opacity(0.9), radius: 5)
            .position(x: min(max(x, 6.5), w - 6.5), y: mid)
        }
      }
    }
    .frame(height: 14)
  }
}
