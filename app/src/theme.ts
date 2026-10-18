import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#EAEAEA',
  card: '#FFFFFF',
  cardBorder: '#FFFFFF',
  text: '#151515',
  subtext: '#777777',
  muted: '#C7C7C7',
  mutedBg: '#DCDCDC',
  accent: '#C73701',
  accentDark: '#A92D00',
  accentSoft: '#F6D9CE',
  success: '#317C52',
  successDark: '#24623F',
  danger: '#C73701',
  dangerDark: '#A92D00',
  onAccent: '#FFFFFF',
  night: '#171717',
};

const dark: typeof light = {
  bg: '#171717',
  card: '#242424',
  cardBorder: '#242424',
  text: '#F5F5F5',
  subtext: '#A4A4A4',
  muted: '#565656',
  mutedBg: '#303030',
  accent: '#C73701',
  accentDark: '#B8370D',
  accentSoft: '#42251B',
  success: '#4D9A6B',
  successDark: '#34734D',
  danger: '#E14A16',
  dangerDark: '#B8370D',
  onAccent: '#FFFFFF',
  night: '#15101F',
};

export type Theme = typeof light;
const subscribeToHydration = () => () => {};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  // SSR cannot know the browser's color scheme. Keep its first client render
  // identical to the server, then apply the browser preference after hydration.
  const colorSchemeReady = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  return colorSchemeReady && scheme === 'dark' ? dark : light;
}

export const radius = { button: 14, card: 22 } as const;
export const space = (n: number) => n * 4;
