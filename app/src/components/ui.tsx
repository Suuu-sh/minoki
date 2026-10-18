import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import type { Member } from '../store';
import { radius, useTheme } from '../theme';

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: t.card, borderColor: t.cardBorder }, style]}
      {...rest}
    />
  );
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 直近7日の連帯起床ドット。右端が今日。 */
export function WeekDots({ week, todayDone, compact = false }: { week: boolean[]; todayDone?: boolean; compact?: boolean }) {
  const t = useTheme();
  const today = new Date().getDay();
  return (
    <View style={[styles.weekRow, compact && styles.weekRowCompact]}>
      {week.map((ok, i) => {
        const isToday = i === week.length - 1;
        const done = isToday ? (todayDone ?? ok) : ok;
        const day = DAYS[(today - (week.length - 1 - i) + 7) % 7];
        return (
          <View key={i} style={styles.dayCol}>
            <Text style={[styles.dayLabel, { color: isToday ? t.accent : t.subtext }]}>{day}</Text>
            <View
              style={[
                compact ? styles.dotCompact : styles.dot,
                { backgroundColor: done ? t.accent : t.mutedBg },
                isToday && !done && { borderWidth: 1, borderColor: t.accent, borderStyle: 'dashed' },
              ]}
            >
              {done && <SymbolView name="sun.max.fill" tintColor="#fff" size={compact ? 14 : 18} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function Avatar({ member, size = 48, plain }: { member: Member; size?: number; plain?: boolean }) {
  const t = useTheme();
  const ring = plain ? t.cardBorder : member.status === 'awake' ? t.success : member.status === 'late' ? t.danger : t.muted;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 3,
        borderColor: ring,
        padding: 2,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: size,
          backgroundColor: member.color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: plain || member.status === 'awake' ? 1 : 0.55,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.36 }}>
          {member.name.slice(0, 1)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 0,
    padding: 20,
    gap: 16,
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekRowCompact: { paddingHorizontal: 2 },
  dayCol: { alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 13, fontWeight: '700' },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dotCompact: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
