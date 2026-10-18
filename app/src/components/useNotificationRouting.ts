import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { urlFromNotification } from '../lib/notifications';
import { handleWakeFollowupResponse, isWakeFollowupAction } from '../lib/wakeFollowup';
import { useApp } from '../store';

// 通知から開いてよい画面だけを許可する（data.url を信用しすぎない）
const ALLOWED = new Set(['/checkin', '/today']);
// 同じ通知で二度遷移しない（再マウントや getLastNotificationResponseAsync の再取得対策）
const handled = new Set<string>();

// アプリを開いている間に届いた通知もバナーで見せる
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 通知タップで該当画面へ。ready（読み込み済みかつ参加済み）になってから遷移する */
export function useNotificationRouting(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.identifier;
      if (!id || handled.has(id)) return;
      handled.add(id);
      if (isWakeFollowupAction(response)) {
        void handleWakeFollowupResponse(response).finally(() => useApp.getState().refreshWakeFollowup());
        return;
      }
      const url = urlFromNotification(response);
      if (!url || !ALLOWED.has(url)) return;
      // もう起床報告済みなら、チェックインではなくホームを開く
      const awake = useApp.getState().members.find((m) => m.isMe)?.status === 'awake';
      // ホームは既存のタブへ戻る（push だと重なる）。チェックインはモーダルで開く
      if (url === '/today' || awake) router.navigate('/today');
      else router.push('/checkin');
    };
    // アプリが終了していた状態から通知で起動した場合
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [ready]);
}
