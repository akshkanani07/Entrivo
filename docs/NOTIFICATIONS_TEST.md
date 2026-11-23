# Entrivo Multi-Channel Notification Platform — Verification & Testing Guide

This document describes the architecture, delivery mechanics, and step-by-step verification procedures for Entrivo's multi-channel notification platform (Email, In-App, Web Push, Slack, Microsoft Teams).

---

## 1. Architectural Overview

```
                      ┌───────────────────────────┐
                      │    Lifecycle Triggers     │
                      │  - Visitor Invited        │
                      │  - Visitor Arrived        │
                      │  - Visitor Checked Out    │
                      │  - Approval Requested     │
                      │  - Approval Decided       │
                      │  - Security Alert         │
                      └─────────────┬─────────────┘
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │  notify(event, payload)   │
                      │   (dispatcher.ts)         │
                      └──────┬─────────────┬──────┘
                             │             │
           ┌─────────────────┘             └──────────────────┐
           ▼                                                  ▼
┌──────────────────────────┐                      ┌─────────────────────────┐
│ In-Memory Deduplication  │                      │ User Notification Prefs │
│ (1 hr per event + entity)│                      │ (enabled channel filter)│
└──────────────────────────┘                      └─────────────────────────┘
           │                                                  │
           └─────────────────┬────────────────────────────────┘
                             │
                             ▼
         ┌──────────────────────────────────────────────┐
         │          Queue Dispatch Layer                │
         │  BullMQ (Redis) or In-Process Fallback Runner │
         │  (automatic exponential retry: 5s, 30s, 2m)   │
         └───────┬─────────┬─────────┬─────────┬────────┘
                 │         │         │         │
                 ▼         ▼         ▼         ▼
             ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
             │ Email │ │In-App │ │WebPush│ │Slack/ │
             │Mailjet│ │Center │ │ VAPID │ │ Teams │
             └───────┘ └───────┘ └───────┘ └───────┘
```

### Security & Privacy Protections
1. **Zero Secret Leakage**: Webhook URLs (`SLACK_WEBHOOK`, `TEAMS_WEBHOOK`) and push keys (`VAPID_PRIVATE_KEY`, `APP_ENCRYPTION_KEY`) are encrypted at rest with AES-256-GCM. GET `/api/integrations` never returns raw secrets to the client.
2. **SSRF Guarding**: Webhooks are strictly checked to target verified endpoints:
   - Slack webhooks must originate from `https://hooks.slack.com/services/...`.
   - Microsoft Teams webhooks must originate from `*.office.com` or `*.webhook.office.com`.
3. **Dead Endpoint Pruning**: If web push delivery returns HTTP 404 or 410 (Gone / Unregistered), the invalid `PushSubscription` record is immediately pruned from the PostgreSQL database.
4. **Resilient Offline Fallback**: If Redis is offline or unavailable, the in-process queue runner transparently picks up queued jobs and executes them with automatic retries.

---

## 2. Environment Configuration

Ensure the following variables are defined in `.env` (refer to `.env.example`):

```bash
# Encryption
APP_ENCRYPTION_KEY="<32-byte hex string (64 characters)>"

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<base64url public key>"
VAPID_PRIVATE_KEY="<base64url private key>"
VAPID_SUBJECT="mailto:security@entrivo.com"

# Mailjet Email (falls back to console mock if absent)
MAILJET_API_KEY=""
MAILJET_SECRET_KEY=""
MAILJET_FROM_EMAIL="notifications@entrivo.com"
MAILJET_FROM_NAME="Entrivo Notifications"

# Redis (optional, in-process fallback triggers automatically if absent)
REDIS_URL="redis://localhost:6379"
```

To generate a valid 32-byte encryption key:
```powershell
pnpm gen:key
```

To generate fresh VAPID keys:
```powershell
pnpm vapid
```

---

## 3. Manual Verification Steps

### Step 1: Web Push & Service Worker Verification
1. Open the application in Google Chrome: `http://localhost:3000`.
2. Open DevTools (`F12`) → **Application** tab → **Service Workers**.
3. Confirm that `/sw.js` is registered, active, and controlling the page.
4. Navigate to `/notifications` in the dashboard.
5. In the **Web Push Notifications** card:
   - Click **Enable Push Notifications**.
   - Chrome will display the browser permission prompt: click **Allow**.
   - Verify that the UI switches to green: `"Web Push is active on this device"`.
6. Click **Send Test Push Notification**:
   - A native desktop notification will pop up with Entrivo's logo, sound, and action:
     - **Title**: `Entrivo Test Notification`
     - **Body**: `Web Push notifications are properly configured and operational!`
   - Clicking the notification focuses or opens the Entrivo `/notifications` page.

### Step 2: In-App Notification Center Verification
1. Look at the top navigation bar header:
   - Verify the `NotificationBell` icon with unread badge counter.
2. Trigger an event (e.g. create an invitation or record a walk-in).
3. The bell unread badge increments.
4. Click the bell:
   - The dropdown menu reveals the latest notifications with icons, timestamps, and read status indicators.
5. Click **"Mark all read"**:
   - Badge counter clears to 0.
   - `POST /api/notifications/read` updates the database records.

### Step 3: Slack & Microsoft Teams Webhook Delivery
1. Navigate to **Integrations** (`/integrations`).
2. Add a Slack Webhook (`https://hooks.slack.com/services/...`).
3. Add a Microsoft Teams Webhook (`https://*.office.com/...`).
4. Save the integration. Inspect database records: `Setting.value` contains AES-256-GCM ciphertext (`iv:tag:ciphertext`).
5. When a visitor arrives or checks in:
   - Slack channel receives a rich Block Kit notification with:
     - Header: `🏢 Visitor Arrived`
     - Card section: Visitor Name, Company, Host, Badge Number, Arrival Time.
     - Context divider: Entrivo Workplace Management.
   - Teams channel receives a native Adaptive Card with structured Facts.

### Step 4: Multi-Channel Template Customization
1. Navigate to `/notifications` → **Notification Templates** section.
2. View existing templates for `EMAIL`, `IN_APP`, and `WEB_PUSH`.
3. Add or update a template:
   - Event: `VISITOR_INVITED`
   - Channel: `EMAIL`
   - Subject: `Custom Subject for {{visitor_name}}`
   - Body: `Custom message for {{visitor_name}} visiting {{host_name}} on {{date}}.`
4. Dispatched notifications substitute variables dynamically from the event payload.

---

## 4. Phase 4 Event Trigger Registry

Every event in the system is mapped to concrete code paths:

| Event | Trigger Location | Multi-Recipient Resolution |
| :--- | :--- | :--- |
| `VISITOR_INVITED` | `src/app/api/invitations/route.ts:301` | Visitor (Email) |
| `INVITATION_RESCHEDULED` | `src/app/api/invitations/route.ts:404` | Visitor + Host (ICS attachment) |
| `INVITATION_CANCELLED` | `src/app/api/invitations/route.ts:423,474` | Visitor + Host (Cancellation notice) |
| `VISITOR_WAITING` | `src/services/visitors/checkin.service.ts:367`, `src/services/visitors/walkin.service.ts:318` | Host + Receptionist |
| `VISITOR_ARRIVED` | `src/services/visitors/checkin.service.ts:353`, `src/services/visitors/walkin.service.ts:305` | Host + Backup Approver + Slack/Teams |
| `CHECKIN_CONFIRMATION` | `src/services/visitors/checkin.service.ts:380`, `src/services/visitors/walkin.service.ts:331` | Visitor (Badge # confirmation) |
| `CHECKOUT_THANKS` | `src/app/api/visitors/checkout/route.ts:129` | Visitor (Exit confirmation) |
| `VISITOR_CHECKED_OUT` | `src/app/api/visitors/checkout/route.ts:115` | Host + Security Guard |
| `VISITOR_OVERSTAYED` | `src/lib/queue.ts:133` | Org Admins + Security Guards |
| `VISITOR_REMINDER` | `src/services/notifications/reminders.service.ts:50,85` | Visitor (24h and 1h reminders) |
| `APPROVAL_REQUESTED` | `src/app/api/invitations/route.ts:284` | Host + Backup Approver |
| `APPROVAL_DECIDED` | `src/app/api/approvals/route.ts:200` | Visitor + Host |
| `APPROVAL_ESCALATED` | `src/app/api/approvals/route.ts:181` | Org Admins |
| `DOCUMENT_EXPIRING` | `src/services/documents/document.service.ts:145` | Org Admins |
| `SECURITY_ALERT` | `src/services/security/security.service.ts:88` | Org Admins + Security Guards |
| `DAILY_REPORT` | `src/services/notifications/daily-report.service.ts:175` | Org Admins + Receptionists |

---

## 5. Phase 4 Features Verification

### Step 5: Template Governance Workflow
1. Navigate to `/notifications` → **Templates Manager**.
2. Create or edit a template:
   - Status defaults to `DRAFT`.
   - Submit for approval: status advances to `PENDING_APPROVAL`.
   - As an Org Admin, click **Approve Template**: status updates to `ACTIVE`, version is incremented, and an audit trail entry is created.
   - Switch locales (`English`, `Hindi`, `Gujarati`) and click **Preview** or **Send Test**.

### Step 6: User Quiet Hours & Security Critical Bypass
1. In `/notifications` → **Notification Preferences**:
   - Enable Quiet Hours (e.g., 22:00 to 07:00).
   - Non-critical external notifications (marketing, reminders, non-urgent arrival) will be suppressed during this window.
   - Security-critical alerts (`SECURITY_ALERT`, `PASSWORD_RESET`, `MAGIC_LINK`, `TWO_FACTOR_CHALLENGE`, `EMPLOYEE_INVITED`) bypass quiet hours and user-disabled channels automatically.

### Step 7: Delivery Log & Dead Letter Queue
1. In `/notifications` → **Delivery Log**:
   - Filter by channel, status, event, or date.
   - Inspect error text and retry counts for failed messages.
   - Click **Retry** on a failed message to re-attempt delivery.
   - Messages exceeding max retries (3) transition to `DEAD_LETTER` status.

### Step 8: Daily Summary Digests
- Endpoint `/api/cron/daily-report` computes real database aggregates for check-ins, active visitors, overstays, and pending approvals, and delivers reports to organization administrators.

### Step 9: Enterprise SMS Gateway
- Provider-agnostic adapter interface `SmsProviderAdapter` with no-op implementation.
- UI in `/integrations` marks SMS as "Coming soon" with zero fake/mock sending.


