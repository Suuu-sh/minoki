import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../../components/Button3D';
import { useTheme } from '../../theme';

export default function Welcome() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [awake, setAwake] = useState(false);

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, minHeight: height }]} contentInsetAdjustmentBehavior="never" alwaysBounceVertical={false}>
      <View style={styles.brandRow}><Text style={[styles.brand, { color: t.text }]}>OKIYO</Text><View style={[styles.brandDot, { backgroundColor: t.accent }]} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="ピヨを起こす" onPress={() => setAwake(true)} style={styles.hero}>
        <Image source={require('../../../assets/images/welcome-stretch.png')} style={{ width: Math.min(height * 0.48, 360), height: Math.min(height * 0.48, 360) }} contentFit="contain" accessibilityLabel="大きく伸びをするピヨ" />
        {!awake && <Text style={[styles.tapHint, { color: t.text }]}>タップして ピヨをおこす</Text>}
      </Pressable>
      <View style={styles.bottom}>
        <Text style={[styles.title, { color: t.text }]}>{awake ? 'おはよう、ピヨ！' : '仲間と、朝をはじめよう。'}</Text>
        <Text style={[styles.caption, { color: t.subtext }]}>みんなで起きて、朝の記録をつないでいこう。</Text>
        <Button3D title="早起きをはじめる" onPress={() => router.push('/wake-time')} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/join?mode=join')} style={styles.join}>
          <Text style={[styles.joinText, { color: t.subtext }]}>招待コードで参加する</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 22, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34 },
  brand: { fontSize: 15, fontWeight: '900', letterSpacing: 1.4 },
  brandDot: { width: 7, height: 7, borderRadius: 4 },
  hero: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 14 },
  tapHint: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  bottom: { gap: 12, paddingBottom: 4 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  caption: { fontSize: 14, lineHeight: 21, fontWeight: '600', textAlign: 'center', marginBottom: 5 },
  join: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  joinText: { fontSize: 14, fontWeight: '700' },
});
