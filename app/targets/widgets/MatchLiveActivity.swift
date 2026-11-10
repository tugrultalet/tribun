import ActivityKit
import SwiftUI
import WidgetKit

// Kilit ekranı ve Dynamic Island'da canlı maç. Güncellemeler sunucudan (APNs yayın kanalı) gelir.
struct MatchLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MatchActivityAttributes.self) { context in
      LockScreenMatchView(attributes: context.attributes, state: context.state)
        .activityBackgroundTint(tribunNavy.opacity(0.92))
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: "tribun://match/\(context.attributes.matchId)"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(spacing: 4) {
            TeamBadge(abbr: context.attributes.homeAbbr, color: context.attributes.homeColor, size: 38)
            Text(context.attributes.homeName).font(.caption2).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(spacing: 4) {
            TeamBadge(abbr: context.attributes.awayAbbr, color: context.attributes.awayColor, size: 38)
            Text(context.attributes.awayName).font(.caption2).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 2) {
            Text("\(context.state.home) – \(context.state.away)").font(.system(size: 30, weight: .bold)).monospacedDigit()
            StatusLabel(state: context.state)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text(context.state.note ?? context.attributes.league).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            Spacer()
            if let pick = context.attributes.pick {
              Text("Tahminin \(pick)").font(.caption.weight(.semibold)).foregroundStyle(tribunAccent)
            }
          }
        }
      } compactLeading: {
        HStack(spacing: 4) {
          TeamBadge(abbr: context.attributes.homeAbbr, color: context.attributes.homeColor, size: 20)
          Text("\(context.state.home)").font(.system(size: 15, weight: .bold)).monospacedDigit()
        }
      } compactTrailing: {
        HStack(spacing: 4) {
          Text("\(context.state.away)").font(.system(size: 15, weight: .bold)).monospacedDigit()
          TeamBadge(abbr: context.attributes.awayAbbr, color: context.attributes.awayColor, size: 20)
        }
      } minimal: {
        Text("\(context.state.home)-\(context.state.away)").font(.system(size: 12, weight: .bold)).monospacedDigit()
      }
      .widgetURL(URL(string: "tribun://match/\(context.attributes.matchId)"))
      .keylineTint(tribunLive)
    }
  }
}

struct StatusLabel: View {
  let state: MatchActivityAttributes.ContentState
  var body: some View {
    HStack(spacing: 4) {
      if state.status == "live" { Circle().fill(tribunLive).frame(width: 6, height: 6) }
      Text(state.minute).font(.caption.weight(.bold)).foregroundStyle(state.status == "live" ? tribunLive : Color.secondary).monospacedDigit()
    }
  }
}

struct LockScreenMatchView: View {
  let attributes: MatchActivityAttributes
  let state: MatchActivityAttributes.ContentState
  var body: some View {
    VStack(spacing: 8) {
      HStack {
        Text(attributes.league).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
        Spacer()
        StatusLabel(state: state)
      }
      HStack(alignment: .center) {
        HStack(spacing: 8) {
          TeamBadge(abbr: attributes.homeAbbr, color: attributes.homeColor)
          Text(attributes.homeName).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Text("\(state.home) – \(state.away)").font(.system(size: 30, weight: .bold)).monospacedDigit().layoutPriority(1)
        HStack(spacing: 8) {
          Text(attributes.awayName).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
          TeamBadge(abbr: attributes.awayAbbr, color: attributes.awayColor)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      if state.note != nil || attributes.pick != nil {
        HStack {
          if let note = state.note { Text(note).font(.caption.weight(.semibold)) }
          Spacer()
          if let pick = attributes.pick { Text("Tahminin \(pick)").font(.caption).foregroundStyle(tribunAccent) }
        }
      }
    }
    .foregroundStyle(.white)
    .padding(16)
  }
}
