import ActivityKit
import SwiftUI
import WidgetKit

// Birden fazla maç tek kartta: kilit ekranında alt alta satırlar; Dynamic Island'da solda ilk maç, sağda ikinci maç.
struct MultiMatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MultiMatchAttributes.self) { context in
      MultiLockScreenView(attributes: context.attributes, state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.0001)) // zemin saydam; renk MatchBackground'dan (%70)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: "tribun://match/\(context.attributes.matches.first?.id ?? 0)"))
    } dynamicIsland: { context in
      let a = context.attributes
      let s = context.state
      let first = a.matches.first
      let second = a.matches.dropFirst().first
      return DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 6) {
            ForEach(a.matches, id: \.id) { m in
              MultiRow(match: m, slot: slot(s, m.id), compact: true)
            }
          }
          .padding(.horizontal, 6)
        }
      } compactLeading: {
        if let m = first {
          HStack(spacing: 4) {
            TeamLogo(id: m.home.id, abbr: m.home.abbr, color: m.home.color, size: 20)
            Text(score(slot(s, m.id))).font(.system(size: 14, weight: .bold)).monospacedDigit()
          }
        }
      } compactTrailing: {
        if let m = second {
          HStack(spacing: 4) {
            Text(score(slot(s, m.id))).font(.system(size: 14, weight: .bold)).monospacedDigit()
            TeamLogo(id: m.home.id, abbr: m.home.abbr, color: m.home.color, size: 20)
          }
        }
      } minimal: {
        Text("\(a.matches.count)").font(.system(size: 13, weight: .heavy))
      }
      .keylineTint(tribunLive)
    }
  }
}

func slot(_ s: MultiMatchAttributes.ContentState, _ id: Int) -> MultiMatchAttributes.Slot? { s.slots.first { $0.id == id } }
func score(_ x: MultiMatchAttributes.Slot?) -> String { x.map { "\($0.home)-\($0.away)" } ?? "–" }

struct MultiMinute: View {
  let slot: MultiMatchAttributes.Slot?
  var body: some View {
    if let x = slot, x.status == "live", let clock = x.clock {
      Text(timerInterval: Date(timeIntervalSince1970: clock)...Date(timeIntervalSince1970: clock + 3 * 3600), countsDown: false, showsHours: false)
        .font(.caption.weight(.bold)).foregroundStyle(tribunLive).monospacedDigit()
        .multilineTextAlignment(.trailing).frame(width: 52, alignment: .trailing)
    } else {
      Text(slot?.minute ?? "").font(.caption.weight(.bold)).foregroundStyle(slot?.status == "live" ? tribunLive : Color.white.opacity(0.75))
        .lineLimit(1).minimumScaleFactor(0.7).frame(width: 52, alignment: .trailing)
    }
  }
}

struct MultiRow: View {
  let match: MultiMatchAttributes.Match
  let slot: MultiMatchAttributes.Slot?
  var compact = false
  var body: some View {
    let size: CGFloat = compact ? 26 : 30
    HStack(spacing: 8) {
      TeamLogo(id: match.home.id, abbr: match.home.abbr, color: match.home.color, size: size)
      Text(match.home.abbr).font(.system(size: 14, weight: .bold)).lineLimit(1).frame(width: 40, alignment: .leading)
      Text(score(slot).replacingOccurrences(of: "-", with: " – ")).font(.system(size: compact ? 20 : 24, weight: .bold)).monospacedDigit()
        .frame(maxWidth: .infinity)
      Text(match.away.abbr).font(.system(size: 14, weight: .bold)).lineLimit(1).frame(width: 40, alignment: .trailing)
      TeamLogo(id: match.away.id, abbr: match.away.abbr, color: match.away.color, size: size)
      MultiMinute(slot: slot)
    }
  }
}

struct MultiLockScreenView: View {
  let attributes: MultiMatchAttributes
  let state: MultiMatchAttributes.ContentState
  var body: some View {
    let live = state.slots.filter { $0.status == "live" || $0.status == "ht" }.count
    let note = state.slots.compactMap { $0.note }.last
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("Takımlarım · \(live > 0 ? "\(live) canlı maç" : "\(attributes.matches.count) maç")").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
        Spacer()
        Text("Tribün").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.5))
      }
      ForEach(Array(attributes.matches.enumerated()), id: \.element.id) { i, m in
        if i > 0 { Rectangle().fill(Color.white.opacity(0.12)).frame(height: 1) }
        MultiRow(match: m, slot: slot(state, m.id))
      }
      if let note { Text(note).font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.85)).lineLimit(1) }
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 16)
    .padding(.vertical, 13)
    .background(MatchBackground(homeColor: attributes.matches.first?.home.color ?? "#1B2A5A", awayColor: attributes.matches.last?.away.color ?? "#1B2A5A"))
  }
}
