import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { useTheme } from '../../theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.subtext,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.card, borderTopWidth: 0, elevation: 0, shadowOpacity: 0 },
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11, marginTop: 1 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'きょう',
          tabBarIcon: ({ color }) => <SymbolView name="sun.horizon.fill" tintColor={color} size={26} />,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: 'なかま',
          tabBarIcon: ({ color }) => <SymbolView name="person.3.fill" tintColor={color} size={26} />,
        }}
      />
    </Tabs>
  );
}
