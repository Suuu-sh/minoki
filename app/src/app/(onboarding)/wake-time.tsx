import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../../components/Button3D';
import { Piyo } from '../../components/Piyo';
import { Progress } from '../../components/Progress';
import { useApp } from '../../store';
import { useTheme } from '../../theme';

const toDate = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const toHHmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function WakeTime() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const wakeTime = useApp((s) => s.wakeTime);
  const setWakeTime = useApp((s) => s.setWakeTime);
  const [date, setDate] = useState(() => toDate(wakeTime));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.nav}><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: t.mutedBg }]} accessibilityRole="button" accessibilityLabel="戻る"><SymbolView name="arrow.left" tintColor={t.text} size={17} /></Pressable><View style={styles.progress}><Progress step={1} /></View></View>
      <View style={styles.heading}><Text style={[styles.kicker, { color: t.subtext }]}>01 / 02 · MORNING PLAN</Text><Text style={[styles.headline, { color: t.text }]}>何時に起きる？</Text><Text style={[styles.hint, { color: t.subtext }]}>毎朝の目標時刻を決めましょう</Text></View>
      <View style={styles.hero}><Piyo pose="wake-time" size={144} /></View>
      <View style={styles.picker}>
        <View style={[styles.pickerSurface, { backgroundColor: t.card }]}>
        <DateTimePicker
          value={date}
          mode="time"
          display="spinner"
          minuteInterval={5}
          onValueChange={(_, d) => setDate(d)}
          textColor={t.text}
          locale="ja-JP"
        />
        </View>
        <Text style={[styles.smallHint, { color: t.subtext }]}>前後30分以内の起床報告で記録されます</Text>
      </View>
      <Button3D
        title="つづける"
        onPress={() => {
          setWakeTime(toHHmm(date));
          router.push('/join');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, gap: 18 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 44 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1 },
  heading: { gap: 7, marginTop: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  headline: { fontSize: 30, lineHeight: 38, fontWeight: '900', letterSpacing: -0.9 },
  hint: { fontSize: 15, fontWeight: '600' },
  hero: { height: 132, alignItems: 'center', justifyContent: 'center' },
  picker: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 15 },
  pickerSurface: { width: '100%', borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  smallHint: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
