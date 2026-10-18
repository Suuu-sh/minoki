import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Keyboard, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enableWakeAlarmSystem, loadWakeAlarms, makeWakeAlarm, saveWakeAlarms, syncWakeAlarms } from '../lib/wakeAlarms';
import { ALL_WEEKDAYS, GROUP_ALARM_ID, MAX_WAKE_ALARMS, type AlarmDelivery, type WakeAlarm, type WakeAlarmsSync } from '../lib/alarmTypes';
import { useApp } from '../store';
import { useTheme } from '../theme';
import { Button3D } from './Button3D';
import { Card } from './ui';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const initialSync: WakeAlarmsSync = { authorization: 'notDetermined', deliveries: {} };

export function WakeAlarmCard() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const wakeTime = useApp((s) => s.wakeTime);
  const setWakeTime = useApp((s) => s.setWakeTime);
  const [alarms, setAlarms] = useState<WakeAlarm[]>([]);
  const [sync, setSync] = useState(initialSync);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WakeAlarm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadWakeAlarms(wakeTime);
      setAlarms(loaded);
      setSync(await syncWakeAlarms(loaded));
      setError(null);
    } catch {
      setError('アラームを読み込めませんでした。もう一度お試しください。');
    }
  }, [wakeTime]);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const persistAndSync = async (next: WakeAlarm[]) => {
    setSaving(true);
    try {
      const saved = await saveWakeAlarms(next);
      setAlarms(saved);
      setSync(await syncWakeAlarms(saved));
      setError(null);
      return true;
    } catch {
      Alert.alert('保存できませんでした', '設定を保存できませんでした。空き容量を確認して、もう一度お試しください。');
      return false;
    } finally { setSaving(false); }
  };

  const openNew = () => {
    if (alarms.length >= MAX_WAKE_ALARMS) {
      Alert.alert('アラームは8個まで', '不要なアラームを削除してから追加してください。');
      return;
    }
    const next = makeWakeAlarm(wakeTime, alarms.length + 1);
    setEditingId(next.id);
    setDraft(next);
  };

  const openEdit = (alarm: WakeAlarm) => {
    setEditingId(alarm.id);
    setDraft({ ...alarm, weekdays: [...alarm.weekdays] });
  };

  const closeEditor = () => { setDraft(null); setEditingId(null); };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.label.trim()) {
      Alert.alert('名前を入力してください');
      return;
    }
    if (!draft.weekdays.length) {
      Alert.alert('曜日を選んでください', '少なくとも1曜日を選択してください。');
      return;
    }
    const exists = alarms.some((alarm) => alarm.id === draft.id);
    const next = exists ? alarms.map((alarm) => alarm.id === draft.id ? draft : alarm) : [...alarms, draft];
    setSaving(true);
    try {
      const saved = await saveWakeAlarms(next);
      setAlarms(saved);
      if (draft.groupLinked) setWakeTime(draft.time);
      setSync(await syncWakeAlarms(saved));
      setError(null);
      closeEditor();
    } catch {
      Alert.alert('保存できませんでした', 'アラームを保存できませんでした。もう一度お試しください。');
    } finally { setSaving(false); }
  };

  const toggleAlarm = async (alarm: WakeAlarm, enabled: boolean) => {
    const next = alarms.map((item) => item.id === alarm.id ? { ...item, enabled } : item);
    await persistAndSync(next);
  };

  const deleteAlarm = (alarm: WakeAlarm) => {
    if (alarm.groupLinked) return;
    Alert.alert('アラームを削除しますか？', `「${alarm.label}」を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => { void persistAndSync(alarms.filter((item) => item.id !== alarm.id)).then((saved) => { if (saved) closeEditor(); }); } },
    ]);
  };

  const enableSystem = async () => {
    setSaving(true);
    try { setSync(await enableWakeAlarmSystem(alarms)); setError(null); }
    catch { Alert.alert('設定できませんでした', 'AlarmKitまたは通知の設定を確認して、もう一度お試しください。'); }
    finally { setSaving(false); }
  };

  const alarmSystemOn = sync.authorization === 'scheduled' || sync.authorization === 'authorized';
  const canEnable = sync.authorization !== 'unsupported' && !alarmSystemOn;
  const statusCopy = (alarm: WakeAlarm) => deliveryCopy(sync.deliveries[alarm.id] ?? (alarm.enabled ? 'notDetermined' : 'disabled'));

  return (
    <View style={styles.root}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>目覚まし</Text>
          <Text style={[styles.sectionSub, { color: t.subtext }]}>{alarms.length}/{MAX_WAKE_ALARMS}個 · 曜日ごとに設定できます</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="アラームを追加" onPress={openNew} style={[styles.addButton, { backgroundColor: t.accent }]}>
          <SymbolView name="plus" tintColor={t.onAccent} size={17} weight="bold" />
        </Pressable>
      </View>

      {!!error && <Text accessibilityRole="alert" style={[styles.errorText, { color: t.danger }]}>{error}</Text>}
      {alarms.map((alarm) => {
        const delivery = sync.deliveries[alarm.id] ?? (alarm.enabled ? 'notDetermined' : 'disabled');
        return (
          <Card key={alarm.id} style={[styles.alarmCard, !alarm.enabled && { opacity: 0.68 }]}>
            <Pressable accessibilityRole="button" onPress={() => openEdit(alarm)} style={styles.alarmMain}>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.titleLine}>
                  <Text numberOfLines={1} style={[styles.alarmLabel, { color: t.text }]}>{alarm.label}</Text>
                  {alarm.groupLinked && <View style={[styles.linkBadge, { backgroundColor: t.accentSoft }]}><Text style={[styles.linkBadgeText, { color: t.accent }]}>グループ連動</Text></View>}
                </View>
                <Text style={[styles.alarmTime, { color: t.text }]}>{alarm.time}</Text>
                <Text style={[styles.alarmMeta, { color: t.subtext }]}>{formatWeekdays(alarm.weekdays)} · {statusCopy(alarm)}</Text>
                {alarm.groupLinked && <Text style={[styles.alarmHint, { color: t.subtext }]}>起床報告で、なかまへの記録と5分後の確認が始まります</Text>}
                {!alarm.groupLinked && <Text style={[styles.alarmHint, { color: t.subtext }]}>停止しても、なかまへの起床報告は行いません</Text>}
              </View>
              <SymbolView name="pencil" tintColor={t.muted} size={17} />
            </Pressable>
            <View style={[styles.cardRule, { backgroundColor: t.mutedBg }]} />
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: t.subtext }]}>{alarm.enabled ? 'オン' : 'オフ'}</Text>
              <Switch accessibilityLabel={`${alarm.label}を${alarm.enabled ? 'オフ' : 'オン'}にする`} value={alarm.enabled} onValueChange={(value) => { void toggleAlarm(alarm, value); }} disabled={saving} trackColor={{ false: t.mutedBg, true: t.accent }} />
            </View>
            {delivery === 'error' && <Text style={[styles.errorText, { color: t.danger }]}>設定できませんでした。AlarmKitまたは通知の許可を確認してください。</Text>}
          </Card>
        );
      })}

      {canEnable && <Button3D title={sync.authorization === 'denied' ? '設定を開く' : 'AlarmKitを有効にする'} onPress={() => sync.authorization === 'denied' ? void Linking.openSettings() : void enableSystem()} disabled={saving} />}
      <Text style={[styles.footer, { color: t.subtext }]}>{sync.authorization === 'unsupported' ? 'AlarmKitはiOS 26以降で利用できます。利用できない場合は通知でお知らせします。' : 'AlarmKitが使えない場合は、許可済みの通知でお知らせします。'}</Text>

      <Modal visible={!!draft && editingId !== null} transparent animationType="slide" onRequestClose={closeEditor}>
        {draft && <View style={[styles.modalRoot, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="編集を閉じる" onPress={closeEditor} style={StyleSheet.absoluteFill} />
          <View style={[styles.editor, { backgroundColor: t.card }]}>
            <View style={styles.editorHead}>
              <View style={{ flex: 1 }}><Text style={[styles.editorTitle, { color: t.text }]}>{draft.groupLinked ? 'グループ起床アラーム' : alarms.some((alarm) => alarm.id === draft.id) ? 'アラームを編集' : 'アラームを追加'}</Text>{draft.groupLinked && <Text style={[styles.editorSubtitle, { color: t.subtext }]}>時刻はあなたのグループ起床目標にも反映されます</Text>}</View>
              <Pressable accessibilityRole="button" accessibilityLabel="編集を閉じる" onPress={closeEditor} hitSlop={10}><SymbolView name="xmark" tintColor={t.subtext} size={18} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorScroll}>
              <View style={{ gap: 7 }}>
                <Text style={[styles.fieldLabel, { color: t.subtext }]}>アラーム名</Text>
                <TextInput value={draft.label} onChangeText={(label) => setDraft({ ...draft, label })} maxLength={32} placeholder="例：朝の支度" placeholderTextColor={t.muted} style={[styles.nameInput, { color: t.text, backgroundColor: t.bg }]} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
              </View>
              <View style={{ gap: 4 }}>
                <Text style={[styles.fieldLabel, { color: t.subtext }]}>時刻</Text>
                <DateTimePicker value={toDate(draft.time)} mode="time" display="spinner" onValueChange={(_, value) => { if (value) setDraft({ ...draft, time: toHHmm(value) }); }} textColor={t.text} locale="ja-JP" />
              </View>
              <View style={{ gap: 9 }}>
                <Text style={[styles.fieldLabel, { color: t.subtext }]}>曜日</Text>
                <View style={styles.days}>
                  {WEEKDAYS.map((day, index) => {
                    const selected = draft.weekdays.includes(index);
                    return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${day}曜日`} onPress={() => setDraft({ ...draft, weekdays: selected ? draft.weekdays.filter((value) => value !== index) : [...draft.weekdays, index].sort() })} style={[styles.day, { backgroundColor: selected ? t.text : t.bg }]}><Text style={[styles.dayText, { color: selected ? t.card : t.subtext }]}>{day}</Text></Pressable>;
                  })}
                </View>
                <View style={styles.presetRow}>
                  <Pressable onPress={() => setDraft({ ...draft, weekdays: [...ALL_WEEKDAYS] })}><Text style={[styles.preset, { color: t.accent }]}>毎日</Text></Pressable>
                  <Pressable onPress={() => setDraft({ ...draft, weekdays: [1, 2, 3, 4, 5] })}><Text style={[styles.preset, { color: t.accent }]}>平日</Text></Pressable>
                  <Pressable onPress={() => setDraft({ ...draft, weekdays: [0, 6] })}><Text style={[styles.preset, { color: t.accent }]}>土日</Text></Pressable>
                </View>
              </View>
              {!draft.groupLinked && <Pressable accessibilityRole="button" accessibilityLabel="このアラームを削除" onPress={() => deleteAlarm(draft)} style={styles.deleteButton}><SymbolView name="trash" tintColor={t.danger} size={16} /><Text style={[styles.deleteText, { color: t.danger }]}>このアラームを削除</Text></Pressable>}
            </ScrollView>
            <View style={styles.actions}>
              <Button3D title="キャンセル" variant="secondary" onPress={closeEditor} style={{ flex: 1 }} />
              <Button3D title={saving ? '保存中…' : '保存する'} disabled={saving} onPress={() => void saveDraft()} style={{ flex: 1 }} />
            </View>
          </View>
        </View>}
      </Modal>
    </View>
  );
}

function deliveryCopy(delivery: AlarmDelivery): string {
  if (delivery === 'scheduled') return 'AlarmKitで鳴ります';
  if (delivery === 'notification') return '通知でお知らせ';
  if (delivery === 'disabled') return 'オフ';
  if (delivery === 'denied') return 'AlarmKitの許可が必要';
  if (delivery === 'unsupported') return 'この端末ではAlarmKit非対応';
  if (delivery === 'authorized') return '設定を確認中';
  if (delivery === 'error') return '設定を確認してください';
  return '許可を確認中';
}

function formatWeekdays(days: number[]) {
  return days.length === 7 ? '毎日' : days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day)) ? '平日' : days.length === 2 && days.includes(0) && days.includes(6) ? '土日' : days.map((day) => WEEKDAYS[day]).join('・');
}

const toDate = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const toHHmm = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const styles = StyleSheet.create({
  root: { gap: 12 }, sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2 }, sectionTitle: { fontSize: 20, fontWeight: '900' }, sectionSub: { fontSize: 12, fontWeight: '600', marginTop: 2 }, addButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  alarmCard: { padding: 15, gap: 11 }, alarmMain: { flexDirection: 'row', alignItems: 'center', gap: 12 }, titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 }, alarmLabel: { flexShrink: 1, fontSize: 15, fontWeight: '900' }, linkBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }, linkBadgeText: { fontSize: 10, fontWeight: '800' }, alarmTime: { fontSize: 38, lineHeight: 43, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 }, alarmMeta: { fontSize: 12, fontWeight: '700' }, alarmHint: { fontSize: 11, lineHeight: 16, fontWeight: '600' }, cardRule: { height: StyleSheet.hairlineWidth }, switchRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, switchLabel: { fontSize: 12, fontWeight: '700' }, errorText: { fontSize: 12, fontWeight: '700' }, footer: { fontSize: 11, lineHeight: 16, paddingHorizontal: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.34)' }, editor: { height: '90%', maxHeight: '90%', flexShrink: 1, borderRadius: 24, padding: 17, gap: 12 }, editorHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, editorTitle: { fontSize: 19, fontWeight: '900' }, editorSubtitle: { fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 3 }, editorScroll: { flex: 1, gap: 14, paddingBottom: 4 }, fieldLabel: { fontSize: 12, fontWeight: '800' }, nameInput: { minHeight: 46, borderRadius: 13, paddingHorizontal: 12, fontSize: 16, fontWeight: '700' }, days: { flexDirection: 'row', gap: 7, justifyContent: 'space-between' }, day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, dayText: { fontSize: 13, fontWeight: '900' }, presetRow: { flexDirection: 'row', gap: 18 }, preset: { fontSize: 12, fontWeight: '800' }, deleteButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, deleteText: { fontSize: 13, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 10 },
});
