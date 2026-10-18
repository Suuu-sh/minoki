import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { registerPushToken, requestPermission } from '../lib/notifications';
import { syncStoredWakeAlarms } from '../lib/wakeAlarms';
import { useApp } from '../store';
import { useTheme } from '../theme';
import { Button3D } from './Button3D';
import { Piyo } from './Piyo';
import { Card } from './ui';

type Status = 'loading' | 'granted' | 'undetermined' | 'denied';

/**
 * 通知のソフトアスク。システムのダイアログを出す前に「なぜ必要か」をピヨが説明する。
 * 一度拒否されたらダイアログは二度と出せないので、設定アプリへ案内する。
 */
export function NotifyCard() {
  const t = useTheme();
  const wakeTime = useApp((s) => s.wakeTime);
  const [status, setStatus] = useState<Status>('loading');
  const [dismissed, setDismissed] = useState(false);

  const readStatus = useCallback(async (): Promise<Status> => {
    try {
      const p = await Notifications.getPermissionsAsync();
      return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
    } catch {
      return 'granted'; // 判定できない環境ではカードを出さない
    }
  }, []);

  const check = useCallback(() => {
    void readStatus().then(setStatus);
  }, [readStatus]);

  useEffect(() => {
    let active = true;
    void readStatus().then((nextStatus) => {
      if (active) setStatus(nextStatus);
    });
    // 設定アプリから戻ってきたら再確認する
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      active = false;
      sub.remove();
    };
  }, [check, readStatus]);

  if (status === 'loading' || status === 'granted' || dismissed) return null;

  const enable = async () => {
    if (status === 'denied') {
      Linking.openSettings();
      return;
    }
    const ok = await requestPermission().catch(() => false);
    if (ok) {
      registerPushToken().catch(() => {});
      syncStoredWakeAlarms(wakeTime).catch(() => {});
    }
    check();
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={12}
        style={styles.close}
        accessibilityLabel="あとで"
      >
        <SymbolView name="xmark" tintColor={t.subtext} size={14} weight="bold" />
      </Pressable>
      <View style={styles.row}>
        <Piyo pose="notify" size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.eyebrow, { color: t.accent }]}>通知をオンにする</Text>
          <Text style={[styles.title, { color: t.text }]}>朝のようすをお知らせ</Text>
          <Text style={[styles.body, { color: t.subtext }]}>
            AlarmKitが使えないときは通知でおこします。なかまが起きたときや、まだ寝ている人がいるときも知らせます。
          </Text>
        </View>
      </View>
      <Button3D
        title={status === 'denied' ? '設定で通知をオンにする' : '通知をオンにする'}
        onPress={enable}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 13, padding: 17 },
  close: { position: 'absolute', top: 9, right: 9, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingRight: 18 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  title: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  body: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
});
