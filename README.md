# ACe Court — Web app on GitHub + Vercel, pings via GitHub Actions

Bot: **@ACtenniscrewbot** • Players: @darryl_juan, @Keith_yss, @AndreCTA, @davideeuu
Schedule: **Sat 9am + Sun 9am SGT**

## Is this possible? Yes — this is the architecture

```
Telegram group ──webhook──▶ Vercel web app (/api/telegram)
                                │  reads/writes state in Upstash Redis (KV)
                                │  serves dashboard at /  (live availability + slots)
                                ▼
GitHub Actions ──POST──▶ Vercel (/api/cron-saturday, /api/cron-sunday)
  Sat 01:00 UTC              │  Vercel sends the Telegram ping / reminder
  Sun 01:00 UTC              │  and the dashboard updates from the same state
```

- **Vercel** hosts the web app + bot API. No always-on server, no polling.
- **GitHub Actions** is the scheduler. It does *not* send Telegram itself — it calls back to the Vercel app, and the Vercel app sends the message. That is what "pings come back to the web app to update" means, and it works.
- **Upstash Redis (Vercel KV)** is the persistent storage. Vercel functions forget between requests, so availability/slots/players live in Redis, not in a file.

## Files
- `public/index.html` — dashboard: next-week availability, open slots, players. Reads `/api/state`, refreshes every 60s.
- `api/telegram.js` — Telegram webhook: /start /help /avail /week /ask /slots /slot (quick form) /cancel /players + Join/Leave + Yes/Maybe/No buttons.
- `api/cron-saturday.js` — POST, Bearer CRON_SECRET, sends Sat 9am ping tagging all players.
- `api/cron-sunday.js` — POST, Bearer CRON_SECRET, reminds only players who haven't replied.
- `api/state.js` — GET, public dashboard data (no secrets).
- `api/_lib/` — dates (SGT), store (Redis + in-memory fallback), telegram client.
- `.github/workflows/pings.yml` — Sat `0 1 * * 6` + Sun `0 1 * * 0` UTC (= 9am SGT), plus manual Run workflow test.
- `vercel.json`, `package.json`, `.env.example`

## Deploy (Muse does this once GitHub + Vercel are connected)
1. Create GitHub repo `ace-court`, push this code.
2. In Vercel, import the repo. Create Storage > KV (Upstash Redis) and link it — that sets `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` automatically.
3. Vercel env vars: `TELEGRAM_BOT_TOKEN`, `GROUP_CHAT_ID`, `CRON_SECRET` (long random string, same value in GitHub secrets), `WEBHOOK_SECRET` (optional, same value used in setWebhook).
4. Deploy. Set Telegram webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<app>.vercel.app/api/telegram`
5. GitHub repo secrets: `VERCEL_APP_URL` (e.g. https://ace-court.vercel.app), `CRON_SECRET`.
6. Add @ACtenniscrewbot to the Telegram group, make it admin, everyone sends `/start`.
7. Test: Actions tab > Tennis pings > Run workflow > saturday. The group should get the Saturday ping.

## Timing honesty
- GitHub Actions cron is best-effort, not to-the-minute. Expect ~5–15 min drift at peak times, and scheduled workflows can pause after 60 days with no repo activity (a push / manual run wakes them).
- Vercel Hobby cron was avoided on purpose — GitHub Actions does the scheduling instead, so Hobby's once-per-day / within-the-hour limit doesn't apply.
- The dashboard at `/` updates whenever Telegram activity or a cron ping changes state, because both read the same Redis state.

## Local test
`npm test` — runs `test/logic.test.js` (dates, availability, slots, cron auth), no token needed.

Live: https://ace-court-darryl-juan.vercel.app
