import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../components/Button3D';
import { Piyo } from '../components/Piyo';
import { Avatar, Card } from '../components/ui';
import { useApp } from '../store';
import { useTheme } from '../theme';

/** 誰かが寝坊 → グループのストリークが0に戻る。 */
export default function Broken() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { prev } = useLocalSearchParams<{ prev?: string }>();
  const members = useApp((s) => s.members);
  const resetDemo = useApp((s) => s.resetDemo);
  const late = members.filter((m) => m.status === 'late');

  useEffect(() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }, []);

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}><Text style={[styles.kicker, { color: t.subtext }]}>TODAY · A RESET MORNING</Text><Text style={[styles.title, { color: t.text }]}>今日はここまで</Text></View>
      <Card style={styles.summary}>
        <View style={styles.streakRow}><View><Text style={[styles.label, { color: t.subtext }]}>これまでの連続記録</Text><View style={styles.numberLine}><Text style={[styles.prev, { color: t.muted }]}>{prev ?? '0'}</Text><Text style={[styles.arrow, { color: t.muted }]}>→</Text><Text style={[styles.num, { color: t.text }]}>0</Text><Text style={[styles.unit, { color: t.subtext }]}>日</Text></View></View><Piyo pose="broken" size={92} /></View>
        <Text style={[styles.body, { color: t.subtext }]}>休む日もあります。グループの記録はリセットされましたが、また明日の朝から一緒に始められます。</Text>
      </Card>
      {late.length > 0 && <Card style={styles.lateCard}>
        <Text style={[styles.label, { color: t.subtext }]}>今朝のステータス</Text>
        {late.map((m) => <View key={m.id} style={styles.member}><Avatar member={m} size={42} /><View style={{ flex: 1 }}><Text style={[styles.memberName, { color: t.text }]}>{m.name}{m.isMe ? '（自分）' : ''}</Text><Text style={[styles.label, { color: t.subtext }]}>起床目標 {m.wakeTime}</Text></View><Text style={[styles.late, { color: t.accent }]}>未起床</Text></View>)}
      </Card>}
      <View style={{ flex: 1 }} />
      <Button3D title="あしたから またはじめる" onPress={() => { resetDemo(); router.back(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, gap: 14 }, top: { gap: 5 }, kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 }, title: { fontSize: 27, lineHeight: 34, fontWeight: '900', letterSpacing: -0.7 },
  summary: { padding: 18, gap: 12 }, streakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, label: { fontSize: 13, lineHeight: 19, fontWeight: '600' }, numberLine: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 5 }, prev: { fontSize: 26, fontWeight: '800', textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] }, arrow: { fontSize: 20, fontWeight: '700' }, num: { fontSize: 50, lineHeight: 58, fontWeight: '900', fontVariant: ['tabular-nums'] }, unit: { fontSize: 15, fontWeight: '700' }, body: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
  lateCard: { padding: 17, gap: 11 }, member: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 11 }, memberName: { fontSize: 15, fontWeight: '800' }, late: { fontSize: 12, fontWeight: '800' },
});
