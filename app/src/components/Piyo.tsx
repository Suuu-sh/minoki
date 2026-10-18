import { Image } from 'expo-image';

export type PiyoPose =
  | 'wake-time'
  | 'join'
  | 'home'
  | 'notify'
  | 'members'
  | 'checkin-sleep'
  | 'checkin-awake'
  | 'celebrate'
  | 'broken';

const poseImages: Record<PiyoPose, number> = {
  'wake-time': require('../../assets/images/piyo/wake-time.png'),
  join: require('../../assets/images/piyo/join.png'),
  home: require('../../assets/images/piyo/home.png'),
  notify: require('../../assets/images/piyo/notify.png'),
  members: require('../../assets/images/piyo/members.png'),
  'checkin-sleep': require('../../assets/images/piyo/checkin-sleep.png'),
  'checkin-awake': require('../../assets/images/piyo/checkin-awake.png'),
  celebrate: require('../../assets/images/piyo/celebrate.png'),
  broken: require('../../assets/images/piyo/broken.png'),
};

/** ピヨは静止画を基本とし、動きが必要な状態だけ画面側で制御する。 */
export function Piyo({ pose, size = 160 }: { pose: PiyoPose; size?: number }) {
  return (
    <Image
      source={poseImages[pose]}
      contentFit="contain"
      style={{ width: size, height: size }}
      accessibilityLabel="ピヨ"
    />
  );
}
