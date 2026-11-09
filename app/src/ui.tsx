import React from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { ApiError, Fixture, Standings, Zone } from './api';
import { dayLabel, seasonLabel } from './dates';
import { shortName } from './names';
import { useStore } from './store';
import { useTheme, ZONE_NAMES } from './theme';

/* ---------- İkonlar ---------- */
type IconProps = { size?: number; color: string };
const stroke = (color: string, width = 2) => ({ fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
export const Icon = {
  back: ({ size = 22, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M15 5l-7 7 7 7" {...stroke(color, 2.4)} /></Svg>,
  chevron: ({ size = 16, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24" opacity={0.5}><Path d="M9 5l7 7-7 7" {...stroke(color, 2.4)} /></Svg>,
  star: ({ size = 20, color, filled }: IconProps & { filled?: boolean }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" {...stroke(color)} fill={filled ? color : 'none'} /></Svg>
  ),
  ball: ({ size = 16, color }: IconProps) => (
    <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={9} {...stroke(color, 1.8)} /><Path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z" fill={color} /></Svg>
  ),
  card: ({ color }: { color: string }) => <Svg width={12} height={16} viewBox="0 0 12 16"><Rect x={1} y={1} width={10} height={14} rx={2} fill={color} /></Svg>,
  sub: () => (
    <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M7 4v14M3 14l4 4 4-4" {...stroke('#16924B', 2.4)} /><Path d="M17 20V6M13 10l4-4 4 4" {...stroke('#D33A3A', 2.4)} /></Svg>
  ),
  search: ({ size = 18, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx={11} cy={11} r={7} {...stroke(color, 2.2)} /><Path d="M20 20l-3.5-3.5" {...stroke(color, 2.2)} /></Svg>,
  plus: ({ size = 24, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" {...stroke(color, 2.4)} /></Svg>,
  check: ({ size = 12, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke(color, 4)} /></Svg>,
  tabHome: ({ size = 24, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x={3.5} y={5} width={17} height={15} rx={3} {...stroke(color)} /><Path d="M3.5 10h17M8 3v4M16 3v4" {...stroke(color)} /></Svg>,
  tabLeagues: ({ size = 24, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M7 4h10v5a5 5 0 01-10 0z" {...stroke(color)} /><Path d="M7 6H4v1.5A3.5 3.5 0 007.5 11M17 6h3v1.5a3.5 3.5 0 01-3.5 3.5M12 14v3M8.5 20.5h7l-.8-3.5H9.3z" {...stroke(color)} /></Svg>,
  tabGroups: ({ size = 24, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx={9} cy={8.5} r={3.2} {...stroke(color)} /><Path d="M2.8 19.5c.5-3.3 3-5.2 6.2-5.2s5.7 1.9 6.2 5.2M16 5.6a3.2 3.2 0 010 5.8M17.6 14.6c2 .6 3.3 2.2 3.6 4.9" {...stroke(color)} /></Svg>,
  tabTeams: ({ size = 24, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M8.5 3.5L4 6l-1.5 5 3 1.2V20.5h13V12.2l3-1.2L20 6l-4.5-2.5c-.6 1.6-2 2.5-3.5 2.5s-2.9-.9-3.5-2.5z" {...stroke(color)} /></Svg>,
  tabSettings: ({ size = 24, color }: IconProps) => <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={3} {...stroke(color)} /><Path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" {...stroke(color)} /></Svg>,
};

/* ---------- Temel parçalar ---------- */
export function Crest({ uri, size = 28 }: { uri: string; size?: number }) {
  return <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}
// `logo`: katalogda olmayan yarışmalar için maçın kendi verdiği logo.
export function LeagueBadge({ id, size = 22, logo }: { id: number; size?: number; logo?: string | null }) {
  const league = useStore().league(id);
  const uri = league?.logo ?? logo;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width: size * 0.68, height: size * 0.68 }} resizeMode="contain" /> : null}
    </View>
  );
}
const GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  // iOS 26'da gerçek Liquid Glass panel; diğer yerlerde yarı saydam yüzey.
  if (GLASS) return <GlassView glassEffectStyle="regular" style={[{ borderRadius: 28, borderCurve: 'continuous', overflow: 'hidden' }, style]}>{children}</GlassView>;
  return <View style={[{ backgroundColor: t.surface, borderRadius: 28, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: t.line, overflow: 'hidden' }, style]}>{children}</View>;
}
// Ortalanmış başlıklı büyük panel (ör. "Fikstür", "Tablo").
export function Panel({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Card style={[{ marginTop: 16, paddingBottom: 6 }, style]}>
      {title ? <Text style={{ textAlign: 'center', fontSize: 15, fontWeight: '600', color: t.fg, paddingTop: 14, paddingBottom: 6 }}>{title}</Text> : null}
      {children}
    </Card>
  );
}
export const HAIR = StyleSheet.hairlineWidth;
export function Section({ title, eyebrow, left, right, children }: { title?: string; eyebrow?: string; left?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 20, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, minHeight: 22 }}>
        {left}
        {eyebrow ? <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: t.muted }}>{eyebrow.toLocaleUpperCase('tr')}</Text> : <Text style={{ flex: 1, fontWeight: '700', fontSize: 14, color: t.fg }}>{title}</Text>}
        {right}
      </View>
      {children}
    </View>
  );
}
export function Seg<T extends string>({ options, value, onChange, style }: { options: [T, string][]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: 12, padding: 3, gap: 2 }, style]}>
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 9, alignItems: 'center', backgroundColor: on ? t.surface : 'transparent' }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: on ? t.fg : t.muted }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function Tabs<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: HAIR, borderColor: t.line }}>
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, paddingVertical: 14, alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: on ? t.fg : t.muted }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ paddingVertical: 32, paddingHorizontal: 20, textAlign: 'center', color: t.muted, fontSize: 14, lineHeight: 21 }}>{children}</Text>;
}
export function Note({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.accentSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 }}>
      <Text style={{ color: t.fg, fontSize: 12.5, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}
// Veri gelene kadar yükleniyor, hata varsa mesaj ve yeniden dene; veri varsa çocukları çizer.
export function Loader<T>({ state, children }: { state: { data?: T; error: ApiError | null; reload: () => void }; children: (data: T) => React.ReactNode }) {
  const t = useTheme();
  if (state.data !== undefined) return <>{children(state.data)}</>;
  if (state.error) {
    return (
      <View style={{ paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', gap: 12 }}>
        <Text style={{ textAlign: 'center', color: t.muted, fontSize: 14, lineHeight: 21 }}>{errorText(state.error)}</Text>
        <Pressable onPress={state.reload} style={{ paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: t.surface2 }}>
          <Text style={{ fontWeight: '700', color: t.fg }}>Yeniden dene</Text>
        </Pressable>
      </View>
    );
  }
  return <ActivityIndicator style={{ marginTop: 40 }} color={t.muted} />;
}
export function errorText(e: ApiError): string {
  if (e.kind === 'config') return 'Sunucuda veri kaynağı anahtarı eksik ya da geçersiz.';
  if (e.kind === 'quota') return 'Günlük API isteği limiti doldu. Veriler yarın yenilenecek.';
  return e.message;
}
export function Button({ label, onPress, kind = 'pri', disabled }: { label: string; onPress: () => void; kind?: 'pri' | 'sec'; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={{ height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: kind === 'pri' ? t.accent : t.surface2, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontWeight: '700', fontSize: 16, color: kind === 'pri' ? t.accentInk : t.fg }}>{label}</Text>
    </Pressable>
  );
}
export function StarButton({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon.star color={on ? t.accent : t.muted} filled={on} />
    </Pressable>
  );
}
export function LiveDot({ size = 7 }: { size?: number }) {
  const t = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.live }} />;
}

/* ---------- Maç ---------- */
export function statusText(f: Fixture): string {
  if (f.st === 'live') return f.short === 'HT' ? 'DA' : f.short === 'P' ? 'Pen' : `${f.min ?? ''}${f.extra ? `+${f.extra}` : ''}'`;
  if (f.st === 'ft') return f.short === 'PEN' ? 'Pen' : f.short === 'AET' ? 'UZ' : 'MS';
  if (f.st === 'off') return f.short === 'PST' ? 'Ert.' : 'İptal';
  return f.time;
}
// Maç satırı, tek satır: solda saat (ve takip edilen takım için EV / DEP), ortada "ev sahibi  skor  deplasman" yan yana.
// Ev sahibi solda (ad, sonra arma), deplasman sağda (arma, sonra ad); skor arada. Adlar kısaltılmış halleriyle tek satırdadır.
export function MatchRow({ f, onPress, showLeague }: { f: Fixture; onPress: () => void; showLeague?: boolean }) {
  const t = useTheme();
  const { followsTeam } = useStore();
  const done = f.st === 'ft';
  const live = f.st === 'live';
  const homeMine = followsTeam(f.h.id), awayMine = followsTeam(f.a.id);
  // Takip edilen tek bir takım varsa onun iç sahada mı deplasmanda mı oynadığı yazılır; derbide (ikisi de takipte) yazılmaz.
  const venue = homeMine !== awayMine ? (homeMine ? 'EV' : 'DEP') : null;
  const nameStyle = (i: 0 | 1, mine: boolean) => {
    const won = done && f.s && f.s[i] > f.s[1 - i], lost = done && f.s && f.s[i] < f.s[1 - i];
    return { fontSize: 13.5, fontWeight: (won || (mine && !done) ? '700' : '500') as '700' | '500', color: lost ? t.muted : t.fg, flexShrink: 1, minWidth: 0 };
  };
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${f.h.name} ${f.a.name}${venue ? (venue === 'EV' ? ', iç saha' : ', deplasman') : ''}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <View style={{ width: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: live ? t.live : done ? t.muted : t.fg }}>{statusText(f)}</Text>
        {venue ? <Text style={{ fontSize: 9.5, lineHeight: 11, fontWeight: '800', letterSpacing: 0.6, color: t.accent }}>{venue}</Text> : null}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
          <Text numberOfLines={1} style={[nameStyle(0, homeMine), { textAlign: 'right' }]}>{shortName(f.h.name)}</Text>
          <Crest uri={f.h.logo} size={22} />
        </View>
        <Text style={{ minWidth: f.s ? 28 : 14, textAlign: 'center', fontWeight: '700', fontSize: 16, color: live ? t.live : t.fg, fontVariant: ['tabular-nums'] }}>{f.s ? `${f.s[0]}–${f.s[1]}` : '–'}</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <Crest uri={f.a.logo} size={22} />
          <Text numberOfLines={1} style={nameStyle(1, awayMine)}>{shortName(f.a.name)}</Text>
        </View>
      </View>
      {showLeague && <LeagueBadge id={f.lg} size={20} logo={f.lgLogo} />}
    </Pressable>
  );
}
// `today` verilirse maçlar günlere ayrılır ve her günün başlığı bir kez yazılır (satırlarda tarih tekrarlanmaz).
export function MatchList({ fixtures, onMatch, showLeague, today, title }: { fixtures: Fixture[]; onMatch: (f: Fixture) => void; showLeague?: boolean; today?: string; title?: string }) {
  const t = useTheme();
  return (
    <Panel title={title} style={title ? undefined : { marginTop: 0, paddingVertical: 6 }}>
      {fixtures.map((f, i) => (
        <React.Fragment key={f.id}>
          {today && (i === 0 || fixtures[i - 1].date !== f.date) ? (
            <Text style={{ fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4, color: t.muted, paddingHorizontal: 16, paddingTop: i === 0 ? 4 : 12, paddingBottom: 2 }}>{dayLabel(f.date, today).toLocaleUpperCase('tr')}</Text>
          ) : null}
          <MatchRow f={f} showLeague={showLeague} onPress={() => onMatch(f)} />
        </React.Fragment>
      ))}
    </Panel>
  );
}

/* ---------- Puan durumu ---------- */
export function StandingsTable({ data, highlight, onTeam }: { data: Standings; highlight: number[]; onTeam?: (row: Standings['groups'][0]['rows'][0]) => void }) {
  const t = useTheme();
  const cols: [string, number][] = [['OM', 28], ['G', 22], ['B', 22], ['M', 22], ['AV', 36], ['P', 30]];
  const head = { fontSize: 13, color: t.muted, textAlign: 'center' as const };
  const cell = { fontSize: 15, color: t.fg, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };
  const zones = [...new Set(data.groups.flatMap((g) => g.rows.map((r) => r.zone)).filter(Boolean))] as Zone[];
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <>
      {!data.current && <Note>Gösterilen: {seasonLabel(data.season)} sezonu.</Note>}
      {data.groups.map((g, gi) => (
        <Panel key={gi} title={data.groups.length > 1 ? g.name : undefined} style={data.groups.length > 1 ? undefined : { paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text style={[head, { width: 26 }]} />
            <Text style={[head, { flex: 1, textAlign: 'left', paddingLeft: 34 }]}>Takım</Text>
            {cols.map(([label, w]) => <Text key={label} style={[head, { width: w }]}>{label}</Text>)}
          </View>
          {g.rows.map((r) => {
            const me = highlight.includes(r.team.id);
            return (
              <Pressable key={r.team.id} disabled={!onTeam} onPress={() => onTeam?.(r)} accessibilityRole={onTeam ? 'button' : undefined} accessibilityLabel={r.team.name}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, backgroundColor: me ? t.accentSoft : 'transparent' }}>
                <Text style={[cell, { width: 26, color: r.zone ? t.zone[r.zone] : t.fg }]}>{r.rank}</Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6 }}>
                  <Crest uri={r.team.logo} size={24} />
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: me ? '700' : '400', color: t.fg }}>{r.team.name}</Text>
                </View>
                {[r.p, r.w, r.d, r.l, signed(r.gd)].map((v, i) => <Text key={i} style={[cell, { width: cols[i][1] }]}>{v}</Text>)}
                <Text style={[cell, { width: 30, fontWeight: '700' }]}>{r.pts}</Text>
              </Pressable>
            );
          })}
        </Panel>
      ))}
      {zones.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 8, paddingVertical: 12, paddingHorizontal: 6 }}>
          {zones.map((z) => (
            <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.zone[z] }} />
              <Text style={{ fontSize: 12, color: t.muted }}>{ZONE_NAMES[z]}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

/* ---------- Ekran iskeleti ---------- */
export function ScreenTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8, minHeight: 44 }}>
      <Text style={{ fontWeight: '700', fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: t.fg }}>{title}</Text>
      {right}
    </View>
  );
}
export function BackBar({ title, onBack, color, background }: { title?: string; onBack: () => void; color?: string; background?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 8, backgroundColor: background }}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Geri" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Icon.back color={color || t.fg} />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', marginRight: 36, fontWeight: '700', fontSize: 15, color: color || t.fg }}>{title}</Text>
    </View>
  );
}
