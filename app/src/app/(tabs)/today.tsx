import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiConfigured } from '../../api/client';
import { Button3D } from '../../components/Button3D';
import { NotifyCard } from '../../components/NotifyCard';
import { WakeAlarmCard } from '../../components/WakeAlarmCard';
import { Piyo } from '../../components/Piyo';
import { Card, WeekDots } from '../../components/ui';
import { useApp } from '../../store';
import { useTheme } from '../../theme';

const SHOW_DEMO = __DEV__ && !isApiConfigured();

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { streak, bestStreak, week, members, groupName, closeDay, wakeAllDemo } = useApp();
  const me = members.find((m) => m.isMe);
  if (!me) return null;
  const awake = members.filter((m) => m.status === 'awake').length;
  const allAwake = awake === members.length;
  const date = new Date();
  const weekday = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'][date.getDay()];

  return (
    <>
    <View pointerEvents="none" style={[styles.safeAreaCover, { height: insets.top, backgroundColor: t.bg }]} />
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]} contentInsetAdjustmentBehavior="never">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: t.subtext }]}>おはよう</Text>
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>{groupName}</Text>
        </View>
        <View style={[styles.streak, { backgroundColor: t.card }]}>
          <SymbolView name="flame.fill" tintColor={t.accent} size={17} />
          <Text style={[styles.streakNum, { color: t.text }]}>{streak}</Text>
        </View>
      </View>

      <Card style={styles.weekCard}>
        <View style={styles.cardHead}><Text style={[styles.cardTitle, { color: t.text }]}>今週の記録</Text><Text style={[styles.small, { color: t.subtext }]}>最高 {bestStreak}日</Text></View>
        <WeekDots week={week} todayDone={allAwake} compact />
      </Card>

      <View style={styles.sectionHead}><Text style={[styles.section, { color: t.text }]}>{me.status === 'awake' ? '今朝の記録' : '次の起床'}</Text><Text style={[styles.small, { color: t.subtext }]}>{weekday}</Text></View>
      <Card style={styles.wakeCard}>
        <View style={styles.wakeTop}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={[styles.small, { color: t.subtext }]}>あなたの起床時刻</Text>
            <Text style={[styles.time, { color: t.text }]}>{me.wakeTime}</Text>
            <Text style={[styles.caption, { color: t.subtext }]}>{awake}/{members.length}人が起きています</Text>
          </View>
          <Piyo pose="home" size={72} />
        </View>
        <View style={[styles.rule, { backgroundColor: t.bg }]} />
        <View style={styles.weekLine}><Text style={[styles.small, { color: t.subtext }]}>連続記録</Text><Text style={[styles.smallStrong, { color: t.text }]}>{streak} 日</Text></View>
      </Card>

      <Button3D title={me.status === 'awake' ? '起床を報告しました' : '起床を報告する'} variant={me.status === 'awake' ? 'success' : 'primary'} disabled={me.status === 'awake'} onPress={() => router.push('/checkin')} />
      <WakeAlarmCard />
      <NotifyCard />

      {SHOW_DEMO && <>
        <Pressable onPress={wakeAllDemo} style={styles.demo}><Text style={{ color: t.subtext }}>デモ: 全員を起床にする</Text></Pressable>
        <Pressable onPress={() => { const prev = streak; router.push(closeDay() === 'kept' ? '/celebrate' : { pathname: '/broken', params: { prev } }); }} style={styles.demo}><Text style={{ color: t.subtext }}>デモ: 今日の判定をする</Text></Pressable>
      </>}
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 34, gap: 15 },
  safeAreaCover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  eyebrow: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 25, fontWeight: '900', letterSpacing: -0.6 },
  streak: { minWidth: 60, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  streakNum: { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  weekCard: { padding: 17, gap: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  small: { fontSize: 13, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 3 },
  section: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  wakeCard: { padding: 20, gap: 15 },
  wakeTop: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 57, lineHeight: 64, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 13, fontWeight: '600' },
  rule: { height: 1 },
  weekLine: { flexDirection: 'row', justifyContent: 'space-between' },
  smallStrong: { fontSize: 14, fontWeight: '800' },
  demo: { alignSelf: 'center', paddingVertical: 5 },
});
