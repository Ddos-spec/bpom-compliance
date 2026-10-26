# Tera Public Paid V4 — Mega Patch for `master`

**Latest verified upstream branch:** `master` @ `32f52cda9a0c6abcef87e937321c0dff14c26eb9`, 26 Oct 2026 Jakarta. `main` is outdated (22 Oct 2026).

This patch **extends installed V3**; it does not revert the Awwwards-inspired landing page or private paid dashboard. Tera is an independent *preliminary label text* checking service for food entrepreneurs, not official BPOM or Disperindag software. Payment buys a service only: never a guaranteed license.

## Improvements
- Preserved V3 editorial landing, mobile customer dashboard and Midtrans backend.
- Private optional JPG/PNG/WebP packaging photo ≤2 MB, with signature/MIME validation and token-protected retrieval; user still enters label text (no OCR yet).
- Email recovery via Resend (optional/disabled by default): 15-minute, one-use link proves control of account email, retrieves all product orders linked to that email and invalidates earlier access URLs.
- `/staff.html` premium responsive operations UI: auth by `TERA_ADMIN_KEY`, list/search/filter orders, review product label/foto, update paid order status and notes. Secret stays in JS memory and isn't saved in browser storage.
- Online SQLite backup + private image copies + SHA-256 manifest; Node24 non-root Dockerfile and HTTPS Caddy Compose; unsafe Vercel proxy neutralized.
- Regression tests from V3 plus new upload/access control/recovery cases and 320/390/1440px isolated Staff UI tests.

## Local run
```bash
cp .env.example .env
npm start
npm test
python tests/ui_isolated.py
python tests/ui_v4_isolated.py
```
The public site works with payments disabled unless `MIDTRANS_SERVER_KEY` is provided. Do NOT test live payments using local mock codes. Staff API is disabled unless `TERA_ADMIN_KEY` is a sufficiently long random key. Email recovery is disabled until HTTPS URL + verified sender are configured.

See **`PROGRESS_V3_TO_V4.md`** for before/after and **`DEPLOYMENT_RUNBOOK.md`** for VPS deployment and remaining steps.

## Important limitations
- OCR, photo-to-text, official BPOM NIE verification, full product-specific legal compliance and expert review **are NOT implemented**.
- Payment/live webhook, Resend delivery, real DNS/TLS VPS and privacy/legal/pentest signoff **are not validated externally** in this artifact.
- Example fee Rp25,000 is not an official BPOM fee.
- No remote GitHub commit has been made. Apply this package to your `master` branch after taking backups.
