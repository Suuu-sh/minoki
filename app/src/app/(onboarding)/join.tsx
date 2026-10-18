import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button3D } from '../../components/Button3D';
import { Piyo } from '../../components/Piyo';
import { useApp } from '../../store';
import { radius, useTheme } from '../../theme';
import { Progress } from '../../components/Progress';

export default function Join() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'create' | 'join'>(params.mode === 'join' ? 'join' : 'create');
  const [hasText, setHasText] = useState(false);
  const value = useRef('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createGroup = useApp((s) => s.createGroup);
  const joinGroup = useApp((s) => s.joinGroup);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = value.current.trim();
      await (mode === 'create' ? createGroup(v) : joinGroup(v.toUpperCase()));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : 'うまくいきませんでした。もう一度ためしてね');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.nav}><Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: t.mutedBg }]} accessibilityRole="button" accessibilityLabel="戻る"><SymbolView name="arrow.left" tintColor={t.text} size={17} /></Pressable><View style={styles.progress}><Progress step={2} /></View></View>
        <View style={styles.heading}><Text style={[styles.kicker, { color: t.subtext }]}>02 / 02 · YOUR CREW</Text><Text style={[styles.headline, { color: t.text }]}>{error ? 'もう一度ためしてね' : 'なかまと朝をはじめよう'}</Text><Text style={[styles.headingBody, { color: t.subtext }]}>グループを作るか、招待コードで参加できます</Text></View>
        <View style={styles.hero}><Piyo pose="join" size={132} /></View>

        <View style={[styles.segment, { backgroundColor: t.mutedBg }]}>
          {(['create', 'join'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                setError(null);
                // 入力欄は key で作り直されるので、保持している値も捨てる
                value.current = '';
                setHasText(false);
              }}
              style={[styles.segItem, mode === m && { backgroundColor: t.accentSoft }]}
            >
              <Text style={[styles.segText, { color: mode === m ? t.accent : t.subtext }]}>
                {m === 'create' ? 'グループを作る' : '参加する'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          key={mode}
          placeholder={mode === 'create' ? 'グループ名（例: 朝活なかま）' : '招待コード（例: PIYO-4821）'}
          placeholderTextColor={t.subtext}
          autoCapitalize={mode === 'join' ? 'characters' : 'none'}
          // 招待コードは英数字だけ。日本語入力で「ぴよ」に変換されないようにする
          keyboardType={mode === 'join' ? 'ascii-capable' : 'default'}
          autoCorrect={mode === 'create'}
          maxLength={mode === 'join' ? 9 : 24}
          onChangeText={(v) => {
            value.current = v;
            setHasText(v.trim().length > 0);
            if (error) setError(null);
          }}
          editable={!busy}
          style={[
            styles.input,
            { backgroundColor: t.card, borderColor: error ? t.danger : t.cardBorder, color: t.text },
          ]}
        />
        {error && (
          <View style={styles.errorRow} accessibilityLiveRegion="polite">
            <SymbolView name="exclamationmark.circle.fill" tintColor={t.danger} size={16} />
            <Text style={[styles.errorText, { color: t.danger }]}>{error}</Text>
          </View>
        )}
        <Text style={[styles.note, { color: t.subtext }]}>
          2〜6人で参加できます。誰か1人でも寝坊すると、グループのストリークが0に戻ります。
        </Text>

        <View style={{ flex: 1 }} />
        <Button3D
          title={busy ? 'つないでいます…' : mode === 'create' ? 'グループを作る' : '参加する'}
          disabled={!hasText || busy}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 22, gap: 15 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 44 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1 },
  heading: { gap: 6, marginTop: 8 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  headline: { fontSize: 27, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  headingBody: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  hero: { height: 120, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.button, borderCurve: 'continuous' },
  segItem: { flex: 1, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '800' },
  input: {
    height: 56,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    borderWidth: 2,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '700',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8 },
  errorText: { fontSize: 14, fontWeight: '700', flex: 1 },
  note: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
});
