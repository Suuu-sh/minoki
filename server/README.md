# Okiyo Worker（T2）

Hono + Cloudflare Workers + D1 の独立バックエンドです。`src/streak.ts` は app の純粋関数と同一です。Expo Push API による仲間の起床通知と、締切15分前からの未起床通知（T4）を含みます。

## ローカル開発

```sh
cd server
npx wrangler d1 migrations apply okiyo --local
npm run dev
npx tsc --noEmit
npx vitest run
```

テストはインストール済みの `@cloudflare/vitest-plugin`（旧 pool-workers の後継）の `cloudflareTest` と D1 migration helpers を使用します。SQLite のモックではなく Workers runtime 上の D1 で確認します。

## 本番作成・デプロイ

```sh
npx wrangler login
npx wrangler d1 create okiyo
# 出力された database_id で wrangler.jsonc のプレースホルダーを置換
npx wrangler d1 migrations apply okiyo --remote
npx wrangler deploy
```

Cloudflare の資格情報・秘密情報は `/Users/yota/Projects/Secrets/Okiyo/` に置き、リポジトリには保存しないでください。必要な Worker secret は `wrangler secret put NAME` で登録します。現時点の API は追加の Worker secret 不要です。ユーザー token は初回作成時だけ返し、DB には SHA-256 のみ保存します。

## API

`POST /v1/users` に JSON（任意の `name`, `wakeTime`, `tz`）を送り `{userId,token}` を取得します。他の API は `Authorization: Bearer <token>` が必要です。

- `PATCH /v1/me`: `name`, `wakeTime`, `tz`, `pushToken`
- `POST /v1/groups`: `{name}` → `{id,name,inviteCode}`
- `POST /v1/groups/join`: `{code}`。1人1グループ、最大6人（DB trigger で競合時も制限）
- `GET /v1/groups/me`: 自分のグループ、メンバーの今日の状態、streak、bestStreak、直近7確定日の week/days
- `POST /v1/checkins`: body の時刻・ID は無視。サーバー時刻と本人の tz で記録。同日の再送は最初の記録を維持

5分ごとの Cron は各メンバーの tz で判定し、最初の参加者の tz による起床日の `day_results` を記録します。日跨ぎは共有関数の「最も近い起床時刻」に合わせます。メンバー参加日より前は確定しません。確定レコード INSERT と `changes()` による streak 更新を同一 `DB.batch` に入れ、並行・再実行でも二重加算しません。停止期間の過去日バックフィルは対象外です。

## 通知のマイグレーション

既存環境にも `0002_notifications.sql` を含む migrations apply をデプロイ前に実行してください。未起床通知は group / 起床日 / nudge / 寝ているユーザー単位で一度だけ送信します。配信前にログを確保するため、Expo 障害時の自動再送はありません。pushToken 未登録のユーザーは配信対象から除外し、配信失敗はチェックイン・判定を妨げません。
