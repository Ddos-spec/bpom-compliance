# Tera V4 — Release runbook (single VPS / Docker)

## Before applying
- Work against the latest **master** branch, not main. Base checked: `32f52cd`.
- Back up the current code and persistent `tera_public.db` and `private_images` before changing the app.
- DO NOT copy over `.env`, delete the data volume, or delete old databases from prior experiments without a migration plan.
- ZIP is an **overlay source snapshot**. Unzip content of its root into repo root (or use `scripts/APPLY_MEGA_PATCH.ps1` on Windows). Old government demo JS can be retained but is not served by the Node whitelist.

## Configure (never commit secrets)
1. `cp .env.example .env` (or PowerShell equivalent)
2. `MIDTRANS_SERVER_KEY` from sandbox; `MIDTRANS_IS_PRODUCTION=false`.
3. `TERA_ADMIN_KEY`: random high-entropy text at least 24 chars. UI staff lives at `/staff.html`, password never persisted in browser.
4. `TERA_DOMAIN` real domain with A record pointing to your VPS. Caddy obtains HTTPS automatically after DNS/ports 80/443 are configured.
5. Optional email recovery: `TERA_PUBLIC_URL=https://your.domain`, `RESEND_API_KEY`, `TERA_EMAIL_FROM` verified Resend sender/domain. If not provided, recovery is disabled.
6. `SERVICE_FEE_IDR` must be your chosen price; default Rp25,000 is sample only.

## Deploy
```bash
# first time: use persistent named volume, not local temporary container data
docker compose up -d --build
# inspect logs
docker compose logs --tail=100 tera
curl -f https://YOUR_DOMAIN/api/public/config
```
Expected: config responds 200 and accurate `sandbox/paymentEnabled`; public `/staff.html` exists, all staff APIs require a valid key. Never expose app port 4173 to the public: only Caddy container publishes 80/443.

### Vercel warning (IMPORTANT)
Old `vercel.json` proxied all `/api/*` to `http://163.61.44.41:4173/api/*` in cleartext. **V4 replaces that file with `{"version":2}` to remove the insecure proxy.** That intentionally does NOT make Vercel a working full-stack deployment. V4 must run as a persistent Node service behind HTTPS; static-only Vercel will not serve payment APIs without additional secure proxy/backend architecture. Do not re-enable the HTTP rewrite.

## Configure Midtrans
- Set official Midtrans Payment Notification URL to `https://YOUR_DOMAIN/api/payments/midtrans/notification`.
- Use sandbox keys until real sandbox transaction events (not local signatures only) are verified.
- Verify genuine payment, denied/fraud, duplicate webhook, refund and pending reconciliation; domain/callback if provider configuration requires them.
- Do not toggle live credentials before operations and refund policies are ready.

## Backup/restore
- `npm run backup` uses `TERA_DATA_DIR` and `TERA_BACKUP_DIR`. It creates a consistent SQLite backup using Node `sqlite.backup`, copies private images and writes a SHA-256 manifest.
- Never leave unencrypted PII snapshots on the web server indefinitely. Transfer to encrypted offsite storage and manage retention.
- To restore: stop the app, provision an empty data volume, verify checksums, restore `tera_public.db` and `private_images/`, start the app and verify a known application manually. **This restore drill has not been executed against your VPS.**

## Incident checks
- API requests have same-origin guard; Midtrans callbacks use verified signature + amount/id checks; staff key is required for staff routes; image cannot be accessed without private customer token or staff key.
- Per-IP limits are in-memory for single instance only: add Redis/distributed quotas and WAF/bot mitigation before public high-volume marketing.
- Test security/privacy end-to-end, including customer privacy request and order retention procedures.
