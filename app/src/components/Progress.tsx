import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

export function Progress({ step }: { step: 1 | 2 }) {
  const t = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: t.mutedBg }]}>
      <View style={[styles.fill, { backgroundColor: t.accent, width: step === 1 ? '50%' : '100%' }]}>
        <View style={styles.shine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  fill: { height: 5, borderRadius: 3 },
  shine: { display: 'none' },
});
