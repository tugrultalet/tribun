import ActivityKit
import ExpoModulesCore
import Foundation
import UIKit

@available(iOS 18.0, *)
extension TribunLiveModule {
  func observeToken(_ activity: Activity<MultiMatchAttributes>) {
    let ids = activity.attributes.matches.map { $0.id }
    Task { [weak self] in
      for await data in activity.pushTokenUpdates {
        let token = data.map { String(format: "%02x", $0) }.joined()
        self?.sendEvent("onLiveToken", ["token": token, "matches": ids])
      }
    }
  }
}

// Kapalı uygulamada kilit ekranını açabilmek için (push-to-start): sunucu bu anahtarla maçı 1 saat kala başlatır.
@available(iOS 18.0, *)
extension TribunLiveModule {
  func observeStartToken() {
    Task { [weak self] in
      for await data in Activity<MatchActivityAttributes>.pushToStartTokenUpdates {
        let token = data.map { String(format: "%02x", $0) }.joined()
        TribunLiveModule.startToken = token
        self?.sendEvent("onStartToken", ["token": token])
      }
    }
  }
}

final class LiveUnsupportedException: Exception {
  override var reason: String { "Canlı skor kilit ekranında yalnızca iOS 18 ve üzerinde, Live Activity izni açıkken gösterilir." }
}

// Maç Live Activity'si: uygulama başlatır (APNs yayın kanalına bağlı), güncellemeleri sunucu gönderir.
public class TribunLiveModule: Module {
  static var startToken: String?

  public func definition() -> ModuleDefinition {
    Name("TribunLive")

    // Çoklu maç kartının cihaza özel güncelleme anahtarı: { token, matches } (sunucuya kaydedilir).
    // onStartToken: uygulama kapalıyken maçı başlatma anahtarı (push-to-start).
    Events("onLiveToken", "onStartToken")

    OnCreate {
      // Uygulama yeniden açıldığında açık çoklu kartların anahtarları tekrar dinlenir.
      if #available(iOS 18.0, *) {
        for activity in Activity<MultiMatchAttributes>.activities { self.observeToken(activity) }
        self.observeStartToken()
      }
    }

    // Son bilinen başlatma anahtarı (olay JS dinleyicisinden önce geldiyse buradan okunur).
    Function("startToken") { () -> String? in
      if #available(iOS 18.0, *) {
        if let data = Activity<MatchActivityAttributes>.pushToStartToken {
          return data.map { String(format: "%02x", $0) }.joined()
        }
      }
      return TribunLiveModule.startToken
    }

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

    // Takım logolarını indirip küçültür ve App Group'a kaydeder ({ takımNo: adres }). Widget ve Live Activity buradan okur.
    // 30 günden yeni dosya yeniden indirilmez. Kaydedilen dosya sayısını döner.
    AsyncFunction("saveLogos") { (logos: [String: String]) async -> Int in
      guard let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.sportvisor.tribun") else { return 0 }
      let dir = group.appendingPathComponent("logos", isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      var saved = 0
      for (id, address) in logos {
        guard Int(id) != nil, let url = URL(string: address), url.scheme == "https" else { continue }
        let file = dir.appendingPathComponent("\(id).png")
        if let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
           let date = attrs[.modificationDate] as? Date, Date().timeIntervalSince(date) < 30 * 86400 { saved += 1; continue }
        guard let (data, _) = try? await URLSession.shared.data(from: url), let image = UIImage(data: data) else { continue }
        // En uzun kenar 150 px (kilit ekranında 48 pt @3x); dosya küçük kalır.
        let scale = min(1, 150 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        if let png = small.pngData(), (try? png.write(to: file, options: .atomic)) != nil { saved += 1 }
      }
      return saved
    }

    Function("activeMulti") { () -> [[Int]] in
      if #available(iOS 18.0, *) {
        return Activity<MultiMatchAttributes>.activities.map { $0.attributes.matches.map { $0.id } }
      }
      return []
    }

    // Çoklu maç kartı: aynı anda birden fazla maç. Sunucu cihaza özel anahtarla günceller (yayın kanalı tek maç taşır).
    AsyncFunction("startMulti") { (attributesJson: String, stateJson: String) throws -> String in
      guard #available(iOS 18.0, *) else { throw LiveUnsupportedException() }
      let decoder = JSONDecoder()
      let attributes = try decoder.decode(MultiMatchAttributes.self, from: Data(attributesJson.utf8))
      let state = try decoder.decode(MultiMatchAttributes.ContentState.self, from: Data(stateJson.utf8))
      let ids = attributes.matches.map { $0.id }
      if let existing = Activity<MultiMatchAttributes>.activities.first(where: { $0.attributes.matches.map { $0.id } == ids }) {
        return existing.id
      }
      let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(4 * 3600))
      let activity = try Activity.request(attributes: attributes, content: content, pushType: .token)
      self.observeToken(activity)
      return activity.id
    }

    AsyncFunction("updateMulti") { (stateJson: String) async throws in
      guard #available(iOS 18.0, *) else { return }
      let state = try JSONDecoder().decode(MultiMatchAttributes.ContentState.self, from: Data(stateJson.utf8))
      for activity in Activity<MultiMatchAttributes>.activities {
        await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(4 * 3600)))
      }
    }

    AsyncFunction("endMulti") { () async in
      guard #available(iOS 18.0, *) else { return }
      for activity in Activity<MultiMatchAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
    }

    AsyncFunction("end") { (matchId: Int) async in
      guard #available(iOS 18.0, *) else { return }
      for activity in Activity<MatchActivityAttributes>.activities where activity.attributes.matchId == matchId {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
