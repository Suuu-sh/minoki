import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { radius, useTheme } from '../theme';

type Variant = 'primary' | 'secondary' | 'success';
const DEPTH = 0;

/** Okiyo のフラットなラベル＋矢印 CTA。 */
export function Button3D({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const pressed = useSharedValue(0);
  const colors = disabled
    ? { face: t.mutedBg, edge: t.muted, text: t.subtext, border: t.muted }
    : variant === 'primary'
      ? { face: t.accent, edge: t.accent, text: t.onAccent, border: t.accent }
      : variant === 'success'
        ? { face: t.mutedBg, edge: t.mutedBg, text: t.subtext, border: t.mutedBg }
        : { face: t.card, edge: t.cardBorder, text: t.accent, border: t.cardBorder };

  const face = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.get() * DEPTH }] }));

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() => {
        pressed.set(withTiming(1, { duration: 60 }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => pressed.set(withTiming(0, { duration: 120 }))}
      onPress={onPress}
      style={[{ height: 56 + DEPTH, opacity: disabled ? 0.78 : 1 }, style]}
    >
      {DEPTH > 0 && <View style={[styles.edge, { backgroundColor: colors.edge }]} />}
      <Animated.View
        style={[styles.face, { backgroundColor: colors.face, borderColor: colors.border }, face]}
      >
        <Text style={[styles.label, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.arrow, { color: colors.text }]}>→</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: DEPTH,
    height: 56,
    borderRadius: radius.button,
    borderCurve: 'continuous',
  },
  face: {
    height: 56,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    borderWidth: 0,
    flexDirection: 'row',
    paddingHorizontal: 18,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, flex: 1 },
  arrow: { fontSize: 22, fontWeight: '800' },
});
