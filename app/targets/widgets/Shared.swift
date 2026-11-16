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

// Kart zemini: ev sahibinin renginden deplasmanın rengine, koyulaştırılmış geçiş. %30 saydam: arkadaki duvar kağıdı
// hafifçe görünür (sistem zemini saydam bırakılır, bkz. activityBackgroundTint).
let matchBackgroundOpacity = 0.7
struct MatchBackground: View {
  let homeColor: String
  let awayColor: String
  var body: some View {
    LinearGradient(colors: [Color(hex: homeColor, dim: 0.3), Color(hex: homeColor, dim: 0.55), Color(hex: awayColor, dim: 0.6), Color(hex: awayColor, dim: 0.4)],
                   startPoint: .leading, endPoint: .trailing)
      .overlay(Color.black.opacity(0.15))
      .opacity(matchBackgroundOpacity)
  }
}

// Topla oynama barı: skorun altında, yüzdeler iki uçta, ortada "Topla oynama". Renkler nötr (takım rengi yok): ev sahibi
// parlak beyaz, deplasman soluk beyaz. Oran henüz yoksa (maçın ilk dakikaları) iki eşit soluk parça ve "–".
struct PossessionBar: View {
  let poss: [Int]?
  var body: some View {
    let ok = (poss?.count ?? 0) == 2 && (poss![0] + poss![1]) > 0
    let h = ok ? Double(poss![0]) : 50, a = ok ? Double(poss![1]) : 50
    VStack(spacing: 5) {
      HStack {
        Text(ok ? "%\(Int(h))" : "–").font(.caption.weight(.bold)).monospacedDigit()
        Spacer()
        Text("Topla oynama").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.65))
        Spacer()
        Text(ok ? "%\(Int(a))" : "–").font(.caption.weight(.bold)).monospacedDigit()
      }
      GeometryReader { g in
        let w = max(g.size.width - 2, 0)
        HStack(spacing: 2) {
          Capsule().fill(Color.white.opacity(ok ? 0.92 : 0.32)).frame(width: w * h / (h + a))
          Capsule().fill(Color.white.opacity(0.32)).frame(width: w * a / (h + a))
        }
      }
      .frame(height: 6)
    }
  }
}
