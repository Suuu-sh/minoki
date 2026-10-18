import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../components/Button3D';
import { Piyo } from '../components/Piyo';
import { useApp } from '../store';
import { useTheme } from '../theme';

const HOLD_MS = 1400;

/** 起床チェックイン: 長押しでピヨを起こす。寝ぼけた二度寝タップを防ぐための「儀式」。 */
export default function CheckIn() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const checkIn = useApp((s) => s.checkIn);
  const [done, setDone] = useState(false);
  const progress = useSharedValue(0);
  const poseProgress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const complete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    checkIn();
    setDone(true);
  };

  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const sleepyStyle = useAnimatedStyle(() => ({ opacity: 1 - poseProgress.get() }));
  const awakeStyle = useAnimatedStyle(() => ({ opacity: poseProgress.get() }));

  useEffect(() => {
    if (!done) return;
    poseProgress.set(reducedMotion ? 1 : withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
  }, [done, poseProgress, reducedMotion]);

  const bg = t.bg;
  const fg = t.text;

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      {/* 夜の背景では白い文字にする（ライトモードでも） */}
      <StatusBar style="auto" />
      {!done && (
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close} accessibilityLabel="とじる">
          <SymbolView name="xmark" tintColor={t.subtext} size={22} weight="bold" />
        </Pressable>
      )}

      <View style={styles.center}>
        <View style={styles.piyoStack}>
          <Animated.View style={[StyleSheet.absoluteFill, sleepyStyle]}><Piyo pose="checkin-sleep" size={240} /></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, awakeStyle]}><Piyo pose="checkin-awake" size={240} /></Animated.View>
        </View>
        {done ? (
          <Animated.View entering={FadeIn.duration(250)} style={styles.copy}>
            <Text style={[styles.title, { color: fg }]}>おはよう！</Text>
            <Text style={[styles.body, { color: t.subtext }]}>起床を記録したよ。{'\n'}なかまにも おしらせしたよ。</Text>
          </Animated.View>
        ) : (
          <View style={styles.copy}>
            <Text style={[styles.title, { color: fg }]}>ピヨを おこして！</Text>
            <Text style={[styles.body, { color: t.subtext }]}>ボタンを長押しすると起床を報告できます</Text>
          </View>
        )}
      </View>

      {done ? (
        <Button3D title="つづける" onPress={() => router.dismissTo('/today')} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="長押しで起床を報告"
          onPressIn={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            progress.set(
              withTiming(1, { duration: HOLD_MS * (1 - progress.get()), easing: Easing.linear }, (ok) => {
                if (ok) scheduleOnRN(complete);
              }),
            );
          }}
          onPressOut={() => {
            if (progress.get() < 1) {
              cancelAnimation(progress);
              progress.set(withTiming(0, { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
            }
          }}
          style={[styles.hold, { backgroundColor: t.mutedBg, borderColor: t.mutedBg }]}
        >
          <Animated.View style={[styles.holdFill, { backgroundColor: t.accent }, fill]} />
          <SymbolView name="sun.max.fill" tintColor="#fff" size={22} />
          <Text style={[styles.holdText, { color: t.text }]}>長押しで おきる</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  close: { width: 44, height: 44, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  piyoStack: { width: 240, height: 240 },
  copy: { alignItems: 'center', gap: 10 },
  title: { fontSize: 30, fontWeight: '800' },
  body: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 23 },
  hold: {
    height: 64,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 0,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  holdText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
