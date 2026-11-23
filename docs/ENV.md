# Entrivo Environment Variables Reference Guide (`docs/ENV.md`)

This document provides a comprehensive specification of every environment variable configured in [`.env.example`](file:///c:/Entrivo/.env.example). Every variable listed here exists in `.env.example`, and vice-versa.

---

## 1. Database Configuration

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `DATABASE_URL` | String | **Yes** | `postgresql://postgres:password@localhost:5432/entrivo` | PostgreSQL 16+ connection URI with username, password, host, port, database name, and optional SSL modes. |

---

## 2. Authentication & Cryptographic Security

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `JWT_SECRET` | String | **Yes** | None (Min 32 chars) | HMAC-SHA256 secret key used for signing session tokens and stateless authentication cookies. |
| `QR_SIGNING_SECRET` | String | **Yes** | None (Min 32 chars) | Dedicated cryptographic secret used by `src/lib/qr.ts` for signing and validating QR visitor passes (`ENTQ1.*`). |
| `CRON_SECRET` | String | **Yes** | None (Min 32 chars) | Bearer secret required in the `Authorization: Bearer <CRON_SECRET>` header for scheduled automation and maintenance endpoints. |
| `STORAGE_SIGNING_SECRET` | String | **Yes** | None (Min 32 chars) | Dedicated cryptographic secret used for signing and verifying temporary upload and download URLs for stored documents and assets. |
| `SEED_ADMIN_PASSWORD` | String | Optional | Auto-generated | Password assigned to default seed users during `pnpm prisma:seed`. When omitted, a cryptographically random password is generated and printed. |
| `APP_ENCRYPTION_KEY` | String | **Yes** | 64-hex char key | AES-256-GCM master 64-character hexadecimal key (32 bytes) used to encrypt OAuth tokens, TOTP secrets, and integration credentials at rest. |
| `PREREG_TOKEN_TTL_HOURS` | Integer | Optional | `24` | Default number of hours after the scheduled visit end that pre-registration links remain valid; accepted range is 1–720 hours. Organization settings may override this value. |

## 12. Visitor Feedback and Analytics (P10-G)

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `FEEDBACK_REQUEST_DELAY_MINUTES` | Integer | Optional | `30` | Delay before a checkout feedback request is queued, from 0–1440 minutes. |
| `FEEDBACK_TOKEN_TTL_HOURS` | Integer | Optional | `168` | Feedback-link lifetime from 1–720 hours. |
| `FEEDBACK_DETRACTOR_THRESHOLD` | Integer | Optional | `6` | Maximum NPS score treated as a detractor; accepted range is 0–10. |
| `FEEDBACK_RETENTION_DAYS` | Integer | Optional | `365` | Retention period for feedback comments and response records, from 30–3650 days. |
| `FEEDBACK_COMMENT_MAX_LENGTH` | Integer | Optional | `1000` | Maximum submitted comment length, from 100–5000 characters. |
| `FEEDBACK_HOST_LOAD_THRESHOLD` | Integer | Optional | `5` | Concurrent/periodic host load threshold used by analytics warnings, from 1–1000. |
| `FEEDBACK_ANALYTICS_CACHE_SECONDS` | Integer | Optional | `300` | Short analytics aggregate cache TTL, from 10–3600 seconds. |

---

## 3. Google OAuth & Single Sign-On (SSO)

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `GOOGLE_CLIENT_ID` | String | Optional | `""` | Google Cloud OAuth 2.0 Web Client ID for Google Workspace sign-in and Google Calendar OAuth. |
| `GOOGLE_CLIENT_SECRET` | String | Optional | `""` | Google Cloud OAuth 2.0 Client Secret. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | String | Optional | `""` | Public client ID exposed to the browser for the Google Identity Services "Sign In With Google" button. |

### Google Sign-In setup

1. In Google Cloud Console, select or create a project, configure the OAuth consent screen, and add the `openid`, `email`, and `profile` scopes.
2. Create an OAuth client ID with application type **Web application**.
3. Add each Entrivo origin (for example `http://localhost:3000` and your production `NEXT_PUBLIC_APP_URL` origin) to **Authorized JavaScript origins**. This flow verifies a Google Identity Services ID token on the server; it does not use a redirect URI.
4. Set `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the same web client ID. Keep `GOOGLE_CLIENT_SECRET` private; it is used separately for Google Calendar OAuth and is not required by Google Sign-In.
5. In production, use HTTPS and configure the public OAuth consent screen and authorized domain for your deployed hostname. Google sign-in requires a verified Google email; new accounts complete the Entrivo onboarding form and accept the current Terms and Privacy Policy.

---

## 4. Mailjet Email Platform

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `MAILJET_API_KEY` | String | **Yes** | `mock_mailjet_api_key_entrivo` | Mailjet v3.1 API key. When starting with `mock_`, emails simulate delivery and log to console. |
| `MAILJET_SECRET_KEY` | String | **Yes** | `mock_mailjet_secret_key_entrivo` | Mailjet v3.1 Secret key. |
| `EMAIL_FROM` | String | **Yes** | `no-reply@entrivo.com` | Verified sender address for transactional invitations, reminders, and verification emails. |
| `EMAIL_FROM_NAME` | String | **Yes** | `Entrivo Workplace Concierge` | Sender display name appearing in visitor inboxes. |
| `MAILJET_WEBHOOK_SECRET` | String | **When enabled** | — | Secret token configured in Mailjet to authenticate delivery-event callbacks at `/api/webhooks/mailjet`. |

---

## 5. Web Push Notifications (VAPID)

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `VAPID_PUBLIC_KEY` | String | **Yes** | None | Base64url-encoded VAPID public key for browser push subscription negotiation. |
| `VAPID_PRIVATE_KEY` | String | **Yes** | None | VAPID private key used by `web-push` to sign push payload headers. |
| `VAPID_SUBJECT` | String | **Yes** | `mailto:support@entrivo.com` | Administrative contact URI (`mailto:` or `https:`) sent in VAPID headers to push services. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | String | **Yes** | None | Client-exposed VAPID public key used by the service worker to subscribe to PushManager. |

---

## 6. Cloudinary File Storage

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `CLOUDINARY_CLOUD_NAME` | String | Optional | `entrivo-cloud` | Cloudinary cloud namespace for visitor photos and document storage. |
| `CLOUDINARY_API_KEY` | String | Optional | `mock_cloudinary_key` | Cloudinary API Key. Falls back to local storage if credentials start with `mock_`. |
| `CLOUDINARY_API_SECRET` | String | Optional | `mock_cloudinary_secret` | Cloudinary API Secret. |

---

## 7. Redis Cache & BullMQ Background Queues

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `REDIS_URL` | String | **Yes** | `redis://localhost:6379` | Redis 7+ connection string for distributed rate limiting, idempotency locks, and BullMQ job queues. |

---

## 8. Application Metadata & Compliance

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | String | **Yes** | `Entrivo` | Enterprise platform name rendered in document headers, emails, and title tags. |
| `NEXT_PUBLIC_APP_TAGLINE` | String | Optional | `Modern Workplace Visitor Management Platform` | Tagline displayed on login, onboarding, and kiosk welcome screens. |
| `NEXT_PUBLIC_APP_URL` | String | **Yes** | `http://localhost:3000` | Canonical public URL used for absolute links in emails, QR pass URLs, and OAuth callbacks. |
| `CONTACT_EMAIL` | String | **Yes** | `support@entrivo.com` | Official support contact displayed in compliance notices and footer legal links. |
| `GRIEVANCE_EMAIL` | String | **Yes** | `grievance@entrivo.com` | Designated Data Protection Officer / Grievance Officer contact for GDPR & DPDP compliance. |
| `TRUST_PROXY` | Boolean | Optional | `false` | When `true`, trusts `X-Forwarded-For` headers from upstream reverse proxies (AWS ALB, Cloudflare). |

---

## 9. Microsoft Graph & Outlook Calendar OAuth

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `OUTLOOK_CLIENT_ID` | String | Optional | `""` | Microsoft Entra ID (Azure AD) Application (client) ID for Outlook calendar synchronization. |
| `OUTLOOK_CLIENT_SECRET` | String | Optional | `""` | Microsoft Entra ID Client Secret. |

---

## 10. Observability & Error Tracking

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `SENTRY_DSN` | String | Optional | `""` | Sentry DSN endpoint for automated exception reporting and performance transaction traces. |
| `LOG_LEVEL` | String | Optional | `info` | Pino logging threshold (`trace`, `debug`, `info`, `warn`, `error`). Defaults to `info` in production. |

---

## 11. Optional S3 Storage Driver

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `STORAGE_DRIVER` | String | Optional | `local` | Primary document driver (`local`, `cloudinary`, `s3`). |
| `AWS_ACCESS_KEY_ID` | String | Optional | `""` | AWS IAM Access Key ID with `s3:PutObject` and `s3:GetObject` permissions. |
| `AWS_SECRET_ACCESS_KEY` | String | Optional | `""` | AWS IAM Secret Access Key. |
| `AWS_REGION` | String | Optional | `us-east-1` | Target AWS S3 Region. |
| `AWS_S3_BUCKET` | String | Optional | `""` | Target S3 bucket name for encrypted visitor documents. |

## 12. Recurring and Bulk Invitation Limits

P10-D does not introduce new environment variables. These tenant-configurable limits are validated and enforced through the organization settings registry:

| Organization setting | Default | Allowed range | Purpose |
| :--- | :--- | :--- | :--- |
| `maxGroupInvitationSize` | `50` | 1–200 visitors | Maximum members in one group invitation or recurring group. |
| `bulkImportMaxRows` | `1000` | 1–10,000 rows | Maximum CSV data rows per preview/import. |
| `bulkImportMaxSizeMb` | `5` | 1–25 MB | Maximum CSV upload size. |
| `invitationSeriesHorizonDays` | `30` | 1–90 days | Rolling window materialized by the recurring invitation worker. |
| `preApproveRecurringSeries` | `false` | Boolean | Whether new occurrences in a series bypass per-occurrence approval; the approving user is stored on the series. |

Use the organization settings interface to change these values; do not put tenant-specific limits in `.env`.

## 13. Parking & Vehicle Policies (P10-E)

P10-E does not add environment variables. These organization settings control parking enforcement:

| Organization setting | Default | Allowed range | Purpose |
| :--- | :--- | :--- | :--- |
| `parkingOverstayGraceMinutes` | `30` | 0–1440 minutes | Delay before an occupied assignment is flagged as an overstay. |
| `parkingNoShowGraceMinutes` | `30` | 1–1440 minutes | Delay after a reservation starts before an unarrived slot is released. |
| `parkingBlacklistEnforcement` | `BLOCK` | `BLOCK` or `WARN` | Whether a vehicle plate blacklist hit blocks entry/assignment or allows it with a security alert. |

Vehicle plate numbers are PII. They are masked to the final two characters in security and audit messages, and are scrubbed with visitor vehicle records on retention anonymization or erasure.

## 14. P10-F1 Delivery Operations

No additional environment variables are required for delivery management. `deliveryPersonEntryPolicy` is an organization setting with `ENABLED` (default) or `OFF`. `CRON_SECRET` protects the `/api/cron/delivery-reminders` 24h/72h/unclaimed reminder job.

## 15. P10-F2 Contractor Compliance

No additional environment variables are required. `contractorComplianceEnforcement` is an organization setting: `BLOCK` (default), `WARN`, or `OFF`. Sensitive contractor document storage continues to use the configured storage adapter and existing signed-URL settings.

