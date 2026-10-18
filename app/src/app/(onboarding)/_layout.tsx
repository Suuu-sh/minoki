import { Stack } from 'expo-router';

import { useTheme } from '../../theme';

export const unstable_settings = { anchor: 'welcome' };

export default function OnboardingLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: t.subtext,
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
    </Stack>
  );
}
