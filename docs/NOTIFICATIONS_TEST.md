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

### Step 5: Standalone Worker Daemon (BullMQ)
When running in production with Redis:
```powershell
pnpm worker
```
Expected output:
```
[Worker] Starting Entrivo background notification worker daemon...
[Worker] Connected to Redis queue. Listening for jobs...
```
When Redis is stopped, notifications continue seamlessly via the in-process fallback runner with retry intervals at 5s, 30s, and 120s.
