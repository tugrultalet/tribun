import SwiftUI
import UIKit

// Ortak görünüm yardımcıları (widget ve Live Activity).
extension Color {
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
