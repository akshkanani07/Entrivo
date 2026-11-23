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
| `SEED_ADMIN_PASSWORD` | String | Optional | Auto-generated | Password assigned to default seed users during `pnpm prisma:seed`. When omitted, a cryptographically random password is generated and printed. |
| `APP_ENCRYPTION_KEY` | String | **Yes** | 32-byte Base64 key | AES-256-GCM master key used to encrypt OAuth tokens, TOTP secrets, and integration credentials at rest. |

---

## 3. Google OAuth & Single Sign-On (SSO)

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `GOOGLE_CLIENT_ID` | String | Optional | `""` | Google Cloud OAuth 2.0 Web Client ID for Google Workspace sign-in and Google Calendar OAuth. |
| `GOOGLE_CLIENT_SECRET` | String | Optional | `""` | Google Cloud OAuth 2.0 Client Secret. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | String | Optional | `""` | Public client ID exposed to the browser for the Google Identity Services "Sign In With Google" button. |

---

## 4. Mailjet Email Platform

| Variable | Type | Required | Default | Description |
| :--- | :---: | :---: | :--- | :--- |
| `MAILJET_API_KEY` | String | **Yes** | `mock_mailjet_api_key_entrivo` | Mailjet v3.1 API key. When starting with `mock_`, emails simulate delivery and log to console. |
| `MAILJET_SECRET_KEY` | String | **Yes** | `mock_mailjet_secret_key_entrivo` | Mailjet v3.1 Secret key. |
| `EMAIL_FROM` | String | **Yes** | `no-reply@entrivo.com` | Verified sender address for transactional invitations, reminders, and verification emails. |
| `EMAIL_FROM_NAME` | String | **Yes** | `Entrivo Workplace Concierge` | Sender display name appearing in visitor inboxes. |

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

