import { Platform } from 'react-native';
import WakeFollowupActivity from '../widgets/wakeFollowupActivity';

export function canStartWakeFollowupActivity(): boolean {
  return Platform.OS === 'ios';
}

export function startWakeFollowupActivity(wakeId: string, checkedAt: number): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    WakeFollowupActivity.start({ wakeId, checkedAt }, 'okiyo:///today');
    return true;
  } catch {
    return false;
  }
}

export async function endWakeFollowupActivities(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await Promise.all(WakeFollowupActivity.getInstances().map((activity) => activity.end('immediate').catch(() => {})));
}
