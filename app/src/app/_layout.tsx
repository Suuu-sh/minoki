import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useNotificationRouting } from '../components/useNotificationRouting';
import { startPolling, useApp } from '../store';
import { useTheme } from '../theme';
import { consumeWakeAlarmStopIntent } from '../lib/wakeAlarm';
import { syncStoredWakeAlarms } from '../lib/wakeAlarms';

// サーバーの状態が分かるまでスプラッシュを保持する（参加済みの人にオンボーディングを一瞬見せないため）
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const onboarded = useApp((s) => s.onboarded);
  const hydrated = useApp((s) => s.hydrated);
  const wakeTime = useApp((s) => s.wakeTime);
  const t = useTheme();
  useNotificationRouting(hydrated && onboarded);

  useEffect(() => {
    useApp.getState().refresh().catch(() => {}).finally(() => useApp.getState().refreshWakeFollowup().catch(() => {}));
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') useApp.getState().refreshWakeFollowup().catch(() => {});
    });
    const stop = startPolling();
    // 通信が返らなくても、スプラッシュで固まらないようにする
    const fallback = setTimeout(() => useApp.setState({ hydrated: true }), 6000);
    return () => {
      stop();
      foreground.remove();
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !onboarded) return;
    // Hydration only reconciles already-authorized AlarmKit; it never prompts.
    void syncStoredWakeAlarms(wakeTime).catch(() => {});
    const openCheckInIfRequested = () => {
      if (consumeWakeAlarmStopIntent()) router.push('/checkin');
    };
    openCheckInIfRequested();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') openCheckInIfRequested();
    });
    return () => sub.remove();
  }, [hydrated, onboarded, wakeTime]);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="checkin" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="celebrate" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="broken" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </GestureHandlerRootView>
  );
}
