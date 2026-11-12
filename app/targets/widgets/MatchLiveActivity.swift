import ActivityKit
import SwiftUI
import WidgetKit

// Kilit ekranı ve Dynamic Island'da canlı maç. Güncellemeler sunucudan (APNs yayın kanalı) gelir.
struct MatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MatchActivityAttributes.self) { context in
      LockScreenMatchView(attributes: context.attributes, state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.0001)) // zemin saydam; renk MatchBackground'dan (%70)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: "tribun://match/\(context.attributes.matchId)"))
    } dynamicIsland: { context in
      let a = context.attributes
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(spacing: 6) {
            TeamLogo(id: a.homeId, abbr: a.homeAbbr, color: a.homeColor, size: 52)
            Text(a.homeName).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(spacing: 6) {
            TeamLogo(id: a.awayId, abbr: a.awayAbbr, color: a.awayColor, size: 52)
            Text(a.awayName).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
          }
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            // Lig adı en üstte, ortada (kameranın hemen altı).
            Text(a.league).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.8)
            Text("\(s.home) – \(s.away)").font(.system(size: 40, weight: .bold)).monospacedDigit()
              .contentTransition(.numericText(value: Double(s.home * 100 + s.away)))
            StatusLabel(state: s)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          // Köşeler yuvarlak olduğu için içerik kenardan içeride.
          VStack(spacing: 8) {
            if s.status != "ns" { MatchProgress(state: s) }
            NoteRow(attributes: a, state: s)
          }
          .padding(.horizontal, 14)
          .padding(.bottom, 4)
        }
      } compactLeading: {
        // Sıkı tutulur: Dynamic Island kameraya yakın, dar kalır.
        HStack(spacing: 5) {
          TeamLogo(id: a.homeId, abbr: a.homeAbbr, color: a.homeColor, size: 22)
          Text("\(s.home)").font(.system(size: 16, weight: .bold)).monospacedDigit()
        }
      } compactTrailing: {
        HStack(spacing: 5) {
          Text("\(s.away)").font(.system(size: 16, weight: .bold)).monospacedDigit()
          TeamLogo(id: a.awayId, abbr: a.awayAbbr, color: a.awayColor, size: 22)
        }
      } minimal: {
        Text("\(s.home)-\(s.away)").font(.system(size: 12, weight: .bold)).monospacedDigit()
      }
      .widgetURL(URL(string: "tribun://match/\(a.matchId)"))
      .keylineTint(tribunLive)
    }
  }
}

// Dakika: canlıyken iOS'un kendi sayacıyla (uygulama kapalıyken ve sunucu güncellemesi gelmeden de akar), "67:12" biçiminde.
// Sayaç maçın 0. dakikası sayılan andan (clock) başlar. Saat bilgisi yoksa sunucunun yazısı ("67'") gösterilir.
struct StatusLabel: View {
  let state: MatchActivityAttributes.ContentState
  var body: some View {
    HStack(spacing: 5) {
      if state.status == "live" { Circle().fill(tribunLive).frame(width: 7, height: 7) }
      if state.status == "live", let clock = state.clock {
        Text(timerInterval: Date(timeIntervalSince1970: clock)...Date(timeIntervalSince1970: clock + 3 * 3600), countsDown: false, showsHours: false)
          .font(.subheadline.weight(.bold)).foregroundStyle(tribunLive).monospacedDigit()
          .multilineTextAlignment(.trailing).frame(maxWidth: 64, alignment: .trailing)
      } else {
        Text(state.minute).font(.subheadline.weight(.bold)).foregroundStyle(state.status == "live" ? tribunLive : Color.white.opacity(0.85)).monospacedDigit()
      }
    }
  }
}

struct NoteRow: View {
  let attributes: MatchActivityAttributes
  let state: MatchActivityAttributes.ContentState
  var body: some View {
    // Gol satırı golü atan takımın tarafında durur (deplasman golünde sağda); tahmin karşı tarafa geçer.
    let right = state.side == "a"
    HStack {
      if right { pick; Spacer(minLength: 8); note } else { note; Spacer(minLength: 8); pick }
    }
  }

  @ViewBuilder var note: some View {
    if let note = state.note {
      // Gol: satır alttan itilerek girer, top büyüyüp yerine oturur (güncelleme geldiği anda, iOS en çok 2 sn oynatır).
      HStack(spacing: 5) {
        if note.hasPrefix("⚽") {
          Text("⚽").font(.system(size: 17)).transition(.scale(scale: 2.2).combined(with: .opacity))
          Text(note.replacingOccurrences(of: "⚽ ", with: "")).font(.footnote.weight(.heavy)).lineLimit(1)
        } else {
          Text(note).font(.footnote.weight(.semibold)).lineLimit(1)
        }
      }
      .environment(\.layoutDirection, state.side == "a" ? .rightToLeft : .leftToRight)
      .id(note)
      .transition(.push(from: .bottom))
    }
  }

  @ViewBuilder var pick: some View {
    if let pick = attributes.pick { Text("Tahminin \(pick)").font(.footnote.weight(.semibold)).foregroundStyle(tribunAccent) }
  }
}

// Kilit ekranı (seçenek B): takım renklerinde zemin, logolar yanda, kısa adlar, ortada büyük skor; üstte lig ve dakika
// (devre arası / maç sonu yazıyla), skorun altında süre barı, en altta son olay ve tahmin.
struct LockScreenMatchView: View {
  let attributes: MatchActivityAttributes
  let state: MatchActivityAttributes.ContentState
  var body: some View {
    content
      .background(MatchBackground(homeColor: attributes.homeColor, awayColor: attributes.awayColor))
  }

  var content: some View {
    VStack(spacing: 10) {
      HStack {
        Text(attributes.league).font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
        Spacer()
        StatusLabel(state: state)
      }
      HStack(spacing: 10) {
        HStack(spacing: 9) {
          TeamLogo(id: attributes.homeId, abbr: attributes.homeAbbr, color: attributes.homeColor, size: 48)
          Text(attributes.homeAbbr).font(.system(size: 17, weight: .bold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Text("\(state.home) – \(state.away)").font(.system(size: 40, weight: .bold)).monospacedDigit().layoutPriority(1)
          .contentTransition(.numericText(value: Double(state.home * 100 + state.away)))
        HStack(spacing: 9) {
          Text(attributes.awayAbbr).font(.system(size: 17, weight: .bold)).lineLimit(1)
          TeamLogo(id: attributes.awayId, abbr: attributes.awayAbbr, color: attributes.awayColor, size: 48)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      if state.status != "ns" {
        MatchProgress(state: state).padding(.horizontal, 2)
      }
      if state.note != nil || attributes.pick != nil {
        NoteRow(attributes: attributes, state: state)
      }
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
  }
}
