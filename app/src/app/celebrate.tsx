import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../components/Button3D';
import { Piyo } from '../components/Piyo';
import { Card, WeekDots } from '../components/ui';
import { useApp } from '../store';
import { useTheme } from '../theme';

/** 全員起床でストリーク+1。 */
export default function Celebrate() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { streak, week, members } = useApp();

  useEffect(() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }, []);

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}><Text style={[styles.kicker, { color: t.subtext }]}>TODAY · EVERYONE IS UP</Text><Text style={[styles.title, { color: t.text }]}>みんな起きたね！</Text></View>
      <View style={styles.mascot}><Piyo pose="celebrate" size={184} /></View>
      <Card style={styles.summary}>
        <Text style={[styles.label, { color: t.subtext }]}>みんなで続けた記録</Text>
        <View style={styles.numberRow}><Text style={[styles.number, { color: t.text }]}>{streak}</Text><Text style={[styles.unit, { color: t.subtext }]}>日連続</Text></View>
        <Text style={[styles.body, { color: t.subtext }]}>{members.length}人全員が起床しました。今日もいい朝！</Text>
        <View style={[styles.rule, { backgroundColor: t.bg }]} />
        <WeekDots week={week} />
      </Card>
      <View style={{ flex: 1 }} />
      <Button3D title="ホームへ戻る" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, gap: 14 },
  top: { gap: 5 }, kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, title: { fontSize: 27, lineHeight: 34, fontWeight: '900', letterSpacing: -0.7 },
  mascot: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  summary: { padding: 19, gap: 11 }, label: { fontSize: 13, fontWeight: '700' }, numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, number: { fontSize: 62, lineHeight: 68, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -2 }, unit: { fontSize: 18, fontWeight: '800' }, body: { fontSize: 14, lineHeight: 21, fontWeight: '600' }, rule: { height: 1, marginVertical: 3 },
});
