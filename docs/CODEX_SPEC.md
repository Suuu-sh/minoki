# Codex 実装仕様（非UI）— Okiyo v1

UIはすでに実装済み（Claude担当）。**画面・スタイル・アニメーションのファイルは変更しないこと。**
作業ディレクトリ: `/Users/yota/Projects/Products/Okiyo/app`（Expo SDK 58、expo-router、zustand）
設計の前提: `docs/DESIGN.md`

## 触ってよいファイル
- `src/store.ts`（モックの置き換え。公開している型 `Member`, `MemberStatus` と `useApp` のフィールド名・アクション名は維持する）
- 新規: `src/lib/**`, `src/api/**`, `__tests__/**`, `jest.config.*`, `../server/**`
- `package.json`（依存の追加は `npx expo install` で行う）

## 触ってはいけないファイル
- `src/app/**`, `src/components/**`, `src/theme.ts`

## タスク

### T1. 判定ロジックの純粋関数化（最優先）
`src/lib/streak.ts`
- `isWithinWindow(wakeTime: "HH:mm", checkedAt: Date, tz: string, windowMin = 30): boolean`
- `judgeDay(members: {status, wakeTime, checkedAt?}[], now: Date, tz): { result: 'kept' | 'broken' | 'pending', late: string[] }`
  - 全員の「起床時刻＋30分」を過ぎる前は `pending` を返す
  - 1人でもウィンドウ内にチェックインしていなければ `broken`
- `applyResult(streak, best, week, result)` → 新しい `{ streak, bestStreak, week }`
- `store.ts` の `closeDay` から上の関数を使う形にリファクタする（挙動は今と同じにする）
- **テスト**: jest（`jest-expo` プリセット）で境界値を確認する。±30分ちょうど、日付をまたぐ起床時刻（例: 23:50）、タイムゾーンの違い、メンバー1人の場合

### T2. Cloudflare Workers + D1 バックエンド（`server/`）
Supabase は使わない。`server/` は app/ と同じ階層に置く独立した Worker プロジェクト。
- `server/migrations/0001_init.sql`（D1 / SQLite）
  - `users(id text pk, token_hash text unique, name, color, wake_time text 'HH:mm', tz text, push_token text, created_at)`
  - `groups(id text pk, name, invite_code text unique, streak int, best_streak int, created_at)`
  - `group_members(group_id, user_id, joined_at, pk(group_id,user_id))`。ユーザーは1グループのみ（user_id unique）
  - `checkins(group_id, user_id, local_date text 'YYYY-MM-DD', checked_at text ISO, pk(group_id,user_id,local_date))`
  - `day_results(group_id, local_date, result, late_user_ids text JSON, pk(group_id,local_date))`
- 認証: `POST /v1/users` で匿名ユーザーを作成し、`{ userId, token }` を返す。DB には SHA-256(token) だけ保存する。以後は `Authorization: Bearer <token>`
- RLS は無いので、全エンドポイントで「自分の所属グループか」を Worker が検証する
- API（Hono）:
  - `POST /v1/users`, `PATCH /v1/me`（name/wakeTime/tz/pushToken）
  - `POST /v1/groups {name}` → 招待コード `PIYO-####` を発行（衝突したら作り直す）し、作成者を参加させる
  - `POST /v1/groups/join {code}`（上限6人。超えたら 409）
  - `GET /v1/groups/me` → グループ、メンバー、今日の状態、streak/best/直近7日
  - `POST /v1/checkins` → サーバー時刻で記録する（クライアントの時刻は信用しない）
- Cron Trigger（`*/5 * * * *`）: `scheduled()` で各グループに judgeDay を適用し、day_results の insert と groups.streak の更新を `db.batch` でまとめて行う。冪等にする（day_results が既にあればスキップ）
- 判定ロジックは `server/src/streak.ts`（T1 の `app/src/lib/streak.ts` と同じ内容）
- テスト: vitest + `@cloudflare/vitest-pool-workers`（miniflare 上の実 D1）。API の認可（他グループは読めない）、7人目の参加で 409、cron の kept/broken/pending、2回実行しても冪等であること

### T3. クライアントAPI層
`app/src/api/*.ts`。fetch で T2 の API を呼ぶ
- 初回起動時に `POST /v1/users` を呼び、token を `expo-secure-store` に保存する
- `createGroup`, `joinGroup`, `checkIn`, `fetchGroup`。v1 は realtime の代わりに、フォアグラウンドの間30秒ごとにポーリングする
- `store.ts` のアクションをAPI呼び出しに差し替える。楽観的に更新し、失敗したら元に戻す
- デモ用アクション（`wakeAllDemo`, `resetDemo`）は `__DEV__` のときだけ残す
- 環境変数は `EXPO_PUBLIC_API_URL`。Cloudflare の秘密情報は `/Users/yota/Projects/Secrets/Okiyo/` に保存し、repo には入れない

### T4. 通知
`expo-notifications`
- 起床時刻にローカル通知（「ピヨがおこしてるよ」）を送り、タップしたら `/checkin` を開く
- 仲間が起床したら、Worker から Expo Push API でプッシュ通知を送る
- 判定の15分前になってもまだ寝ているメンバーがいたら、全員に「◯◯がまだ寝てる！」と送る（cron で行う。連帯責任の圧力をかける要の機能）

## 完了条件
- `npx tsc --noEmit` と `npx expo lint` が通る
- `npx jest` で T1 のテストがすべて通る
- 既存のUIフロー（オンボーディング → チェックイン → 判定）がモックでもバックエンドありでも動く
- 破壊的な git 操作（push、reset、履歴の書き換え）はしない
