# Paste into your coding AI — TERA V6 staging deployment

You are the implementation engineer for repository `Ddos-spec/bpom-compliance`, branch `master`. The owner has delegated infrastructure **point 1** to you. Start by reading `README_V6.md`, `release/AI_DEVOPS_HANDOFF.md`, `release/QA_REPORT_V6.md` and the current Git state. Do not rely on old README versions or assume the latest GitHub commit is still `5a8620e`; verify it.

**Goal:** implement and validate Tera V6 on a persistent backend + HTTPS using the owner's existing hosting environment, with Midtrans as the **only** payment gateway. Resend is strictly email delivery, not a payment provider. Keep V6 customer/staff dashboards and all customer data. Do not reinstate bypass demo login or seed fake-paid records.

## Your work orders

1. Inspect actual hosting inventory, DNS, domains, runtime, reverse-proxy, storage, firewall and existing backups. Do not change production before establishing a verified rollback plan. Do not ask the owner to paste secrets in chat; have them set protected environment secrets directly.
2. Implement production-suitable persistent storage for SQLite WAL and private label files. Avoid Vercel `/tmp` for any paid/PII state. If keeping Vercel frontend, segregate Node API behind HTTPS with verified origin/cookie settings; choose architecture based on evidence, not guesswork.
3. Configure and test Midtrans in **sandbox first** via backend server key and signed notification endpoint. Confirm status code, fraud status and settlement/capture; test failed/expired/refund/replay. Never mark an application paid based on browser redirect or fake webhook. Do not enable production payments before review.
4. Configure verified sender email, magic link once, account isolation, multi-product history and staff workflow. Ensure owner cannot see any other account's data; test revision accept/reject, receipt and refund.
5. Add backup automation + real restore drill, security headers, structured logs and alerts, and backup database migrations prior to upgrading. Set error monitoring/limits appropriate to client traffic.
6. Run every test documented in `README_V6.md` and write **actual** staging HTTP/browser test outcomes (not just local mocks). Update documentation and produce an acceptance report with domains, timestamps, test cases and any remaining critical gaps.
7. Present proposed production release changes for owner approval. Do not silently activate production key, move real money, modify DNS without approval, or destroy database contents.

## Required completion report

- Git SHA actually deployed and the deployment environment.
- HTTPS URL plus verified `GET /api/public/config` showing the correct gateway and active/inactive state.
- Midtrans sandbox proof: successful paid, failed, refund, replay and lost-notification reconciliation; no secrets in output.
- Email login proof: sender domain verified, cross-account denial and one-time expiry.
- Persistence proof after restart and backup restore.
- Date/time, QA command output and remaining risks.
- A clear `READY FOR OWNER UAT` or `BLOCKED` verdict; never claim a production-ready system based only on a green Vercel build.

## Official reference set

https://docs.midtrans.com/docs/https-notification-webhooks
https://docs.midtrans.com/docs/payment-settings
https://docs.midtrans.com/reference/backend-integration
https://jdih.pom.go.id/view/slide/1560/6/2024/312351bff07989769097660a56395065
https://jdih.pom.go.id/view/slide/1758/10/2026/61123c2bc92cc2338473e0a567eadc33
