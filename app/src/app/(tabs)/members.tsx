import { SymbolView } from 'expo-symbols';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../../components/Button3D';
import { Piyo } from '../../components/Piyo';
import { Avatar, Card } from '../../components/ui';
import { useApp } from '../../store';
import { useTheme } from '../../theme';

export default function Members() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { members, inviteCode, groupName, streak, bestStreak, wakeFollowup } = useApp();
  const awake = members.filter((member) => member.status === 'awake').length;
  return (
    <>
    <View pointerEvents="none" style={[styles.safeAreaCover, { height: insets.top, backgroundColor: t.bg }]} />
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}><Text style={[styles.eyebrow, { color: t.subtext }]}>OUR MORNING CREW</Text><Text style={[styles.title, { color: t.text }]}>なかま</Text><Text style={[styles.subtitle, { color: t.subtext }]}>{groupName}</Text></View>
      <View style={styles.stats}>
        <Card style={styles.stat}><Text style={[styles.statLabel, { color: t.subtext }]}>いまの連続</Text><View style={styles.statRow}><SymbolView name="flame.fill" tintColor={t.accent} size={18} /><Text style={[styles.statNum, { color: t.text }]}>{streak}<Text style={styles.unit}> 日</Text></Text></View></Card>
        <Card style={styles.stat}><Text style={[styles.statLabel, { color: t.subtext }]}>さいこう記録</Text><View style={styles.statRow}><SymbolView name="trophy.fill" tintColor={t.accent} size={18} /><Text style={[styles.statNum, { color: t.text }]}>{bestStreak}<Text style={styles.unit}> 日</Text></Text></View></Card>
      </View>
      <View style={styles.sectionHead}><Text style={[styles.section, { color: t.text }]}>今朝のようす</Text><Text style={[styles.small, { color: awake === members.length ? t.success : t.subtext }]}>{awake}/{members.length}人 · {members.length} / 6</Text></View>
      <Card style={styles.list}>
        {members.map((m, i) => <View key={m.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.mutedBg }]}>
          <Avatar member={m} size={46} plain />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.name, { color: t.text }]}>{m.name}{m.isMe ? <Text style={[styles.small, { color: t.subtext }]}>  自分</Text> : null}</Text>
            <Text style={[styles.small, { color: t.subtext }]}>目標 {m.wakeTime}{m.status === 'awake' && m.checkedAt ? ` · ${m.checkedAt}` : ''}</Text>
            {m.isMe && wakeFollowup && <Text style={[styles.followup, { color: wakeFollowup.status === 'confirmed' ? t.success : t.subtext }]}>{wakeFollowup.status === 'confirmed' ? '二度寝確認済み' : wakeFollowup.status === 'unconfirmed' ? '二度寝確認なし' : wakeFollowup.status === 'skipped' ? '確認通知なし' : '二度寝確認中'}</Text>}
          </View>
          <View style={[styles.status, { backgroundColor: m.status === 'awake' ? t.accentSoft : t.mutedBg }]}>
            <Text style={[styles.statusText, { color: m.status === 'awake' ? t.accent : t.subtext }]}>{m.status === 'awake' ? (m.checkedAt ?? '起きた') : m.status === 'late' ? '寝坊' : 'ねてる'}</Text>
          </View>
        </View>)}
      </Card>
      <Card style={styles.invite}>
        <View style={styles.inviteHead}><View style={{ flex: 1, gap: 3 }}><Text style={[styles.inviteTitle, { color: t.text }]}>いっしょに起きよう</Text><Text style={[styles.inviteBody, { color: t.subtext }]}>あと{Math.max(0, 6 - members.length)}人まで参加できます</Text></View><Piyo pose="members" size={76} /></View>
        <Text style={[styles.codeLabel, { color: t.subtext }]}>招待コード</Text>
        <View style={styles.codeRow}>{inviteCode.split('').map((char, index) => <View key={`${char}-${index}`} style={[styles.codeTile, { backgroundColor: t.bg }]}><Text selectable style={[styles.codeChar, { color: t.text }]}>{char}</Text></View>)}</View>
      </Card>
      <Button3D title="招待コードをシェア" onPress={() => Share.share({ message: `「${groupName}」で一緒に早起きしよう！ Okiyo の招待コード: ${inviteCode}` })} />
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 34, gap: 16 },
  safeAreaCover: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  header: { gap: 3, marginBottom: 2 }, eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '800' }, title: { fontSize: 29, fontWeight: '900', letterSpacing: -0.6 }, subtitle: { fontSize: 14, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 12 }, stat: { flex: 1, padding: 16, gap: 7 }, statLabel: { fontSize: 12, fontWeight: '700' }, statRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, statNum: { fontSize: 25, fontWeight: '900', fontVariant: ['tabular-nums'] }, unit: { fontSize: 14, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 2, marginTop: 1 }, section: { fontSize: 20, fontWeight: '900' }, small: { fontSize: 13, fontWeight: '600' }, followup: { fontSize: 12, fontWeight: '700' }, list: { paddingHorizontal: 16, paddingVertical: 4, gap: 0 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 10 }, name: { fontSize: 16, fontWeight: '800' }, status: { minHeight: 28, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center' }, statusText: { fontSize: 12, fontWeight: '800' },
  invite: { padding: 18, gap: 12 }, inviteHead: { flexDirection: 'row', alignItems: 'center' }, inviteTitle: { fontSize: 19, fontWeight: '900' }, inviteBody: { fontSize: 13, fontWeight: '600' }, codeLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }, codeRow: { flexDirection: 'row', gap: 7 }, codeTile: { flex: 1, minWidth: 0, height: 53, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, codeChar: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});
