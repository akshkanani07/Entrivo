# P11 Gap Audit — Remaining Work

Audit date: 2026-11-24. This is a static code audit; no browser/E2E run was performed. No `.env` file was read or changed. The only code change for this audit was removing three unused message keys from the English, Gujarati, and Hindi catalogs.

## Status and estimate rules

- **DONE** means the relevant route/component/API or test is present and the code path was inspected. It does not claim a browser acceptance run unless stated.
- **PARTIAL** means some support exists, but the stated user-facing workflow or coverage is incomplete.
- **MISSING** means the requested route, component, test, or behavior was not found.
- **NOT STARTED** applies to the future U7b–U8 groups.
- Estimates are remaining agent work: **S** under 1 hour, **M** a few hours, **L** a day or more. Done rows have no estimate.

## U4 — Muster UI

| Item | Status | Code evidence and exact gap | Estimate |
|---|---|---|---:|
| Live roster grouped by floor/zone with location filters | DONE | `src/app/(dashboard)/muster/page.tsx` loads tenant locations; `src/components/muster/MusterLiveClient.tsx` filters by office/floor/zone, groups rows, and refreshes the roster. `/api/muster` validates filters and scopes rows to the organization. Static code verified; no browser run. | — |
| Emergency start, two-step confirmation, DRILL labeling | DONE | `MusterLiveClient.tsx` has form and confirmation steps and requires typing `START`; DRILL is called out in the dialog. `/api/muster/events` starts the event and queues broadcast work. `tests/unit/muster-core.test.ts` checks drill copy. Static code verified. | — |
| Per-channel delivery progress and retry | DONE | `MusterLiveClient.tsx` displays channel counts/progress and offers retry. `/api/muster/events/[id]/deliveries` exposes status and retry; `tests/unit/muster-notifications.test.ts` covers delivery preparation and duplicate claims. Static code verified. | — |
| Event detail roll-call UI: SAFE/MISSING/HOSPITAL, pinned unaccounted, ALL CLEAR | DONE | `/muster/events/[id]` and `MusterRollCallClient.tsx` provide live roll-call controls, counts, unaccounted grouping, two-step ALL CLEAR confirmation, action timeline, and closed-event unaccounted reporting. Static code verified; unit tests passed; no browser run. | — |
| Event-specific printable PDF and CSV | DONE | `/api/muster/events/[id]/export` enforces `reports.export`, tenant scope, a 10-per-minute user limit, a 5,000-entry cap, CSV BOM/injection protection, audit logging, and PDF page breaks. The PDF warns in Latin text to open CSV for non-Latin names; no Gujarati/Devanagari PDF fonts were added. Static code and helper tests verified; no browser run. | — |
| Offline roll-call snapshot, queued marks/clientEventId sync, banner | MISSING | The entry API requires `Idempotency-Key`, but `MusterLiveClient.tsx` has no IndexedDB snapshot, queued marks, retry/sync flow, or offline state. Generic PWA offline UI does not provide a muster queue. | L |
| Muster-point manager | DONE | `/muster/points` lists tenant-scoped points for muster viewers and supports create, edit (including office), activate, and soft-deactivate for `muster.manage`. Deactivation retains historical references. Static code verified; no browser run. | — |
| Event history and post-incident report/export | DONE | `/muster/history` filters status, type, and inclusive date range with cursor pagination ordered by `(startedAt desc, id desc)`. Event reports include action timeline, final counts, unaccounted-at-close list, and permission-gated exports. Static code and cursor/timeline unit tests verified; no browser run. | — |
| Global emergency banner in shell | DONE | `DashboardShell.tsx` polls one tenant-scoped active-event endpoint for every dashboard role, pauses while hidden, shows DRILL distinctly, and links to the event without visitor details. Static code verified; no browser run. | — |
| Sidebar and mobile bottom-tab access | DONE | Muster is linked from the live Muster page and included in the default admin/ORG_ADMIN mobile bottom tabs. Static code verified; no browser run. | — |
| Runbook, acceptance script/package command, Playwright drill test | MISSING | `docs/MUSTER_RUNBOOK.md`, `scripts/verify-p10-b-acceptance.ts`, package script `test:p10b`, and a muster drill spec under `tests/e2e` were not found. Existing muster coverage is unit-level only. | M |

## U5 — Internationalization

| Item | Status | Code evidence and exact gap | Estimate |
|---|---|---|---:|
| Cookie-based next-intl wiring without locale URL prefixes | DONE | `next.config.ts` installs `src/i18n/request.ts`; request locale resolution reads `NEXT_LOCALE`, user/org preference, and Accept-Language. `src/middleware.ts` does not add locale path prefixes. | — |
| en/gu/hi message parity and CI check | DONE | `scripts/check-i18n.ts` compares key parity/placeholders; `.github/workflows/i18n-check.yml` runs `pnpm i18n:check`. The check now passes with 3 locales and 638 keys. | — |
| Header language control | PARTIAL | `src/components/layout/Header.tsx` renders a “Language” button, but its handler only closes the menu; it has no picker or locale persistence. | S |
| Language selector on login/register, kiosk, and pass | MISSING | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/kiosk/KioskClientView.tsx`, and `src/app/pass/[token]/page.tsx` use translated messages or locale rendering but contain no functional language selector. | M |
| Language selector on pre-registration and self-check-in | DONE | `src/app/preregister/[token]/PreRegistrationWizard.tsx` begins with a language step and persists locale. `src/app/self-checkin/SelfCheckinClient.tsx` has a locale selector that persists the choice. Static code verified. | — |
| Share of user-facing strings still hard-coded | PARTIAL | Reproducible TypeScript AST lexical scan over 312 `.ts/.tsx` files in `src/app` and `src/components`: 1,867 literal JSX display sites vs 481 `t()`/`formatMessage()` calls under JSX, or **79.5% hard-coded** by this heuristic. It counts visible JSX text, literal child expressions, and literal placeholder/title/aria-label/aria-description/alt attributes; dynamic strings and wrapper translation helpers are not fully represented. Top 15 files are listed in Cross-check. Broad migration remains. | L |
| Gujarati/Hindi fonts in web UI | DONE | `src/app/layout.tsx` loads Noto Sans Gujarati and Noto Sans Devanagari; `src/app/globals.css` includes their font variables. | — |
| Gujarati/Hindi fonts in PDFs (NDA, reports, privacy export, muster) | PARTIAL | `src/services/documents/nda.service.ts`, `src/app/api/reports/export/route.ts`, and `src/app/api/privacy/export/route.ts` use PDFKit built-in Helvetica variants; no Gujarati/Devanagari font registration was found. Muster PDF export is absent (see U4). | M |
| Localized Zod error map | MISSING | No `z.setErrorMap`, `z.config`, or equivalent locale-aware Zod error map was found. `src/lib/zod-helpers.ts` accepts English message strings; most route schemas supply English literals. | M |
| Email/push use of the visitor’s or user’s locale | PARTIAL | `src/services/notifications/template-engine.ts` supports locale-specific templates and English fallback; email passes `payload.locale`. However, invitation producers include hard-coded `"en"` in `src/app/api/invitations/route.ts`, group/v1 routes, and series/bulk services. `src/services/jobs/notification.job.ts` renders in-app/web-push/Slack/Teams without a locale argument, so those render in the default English locale. | M |
| NDA content per locale and legal-review flag | MISSING | `NdaTemplate` in `prisma/schema.prisma` has no locale or legal-review field; `src/services/documents/nda.service.ts` seeds/uses one organization template. No “needs legal review” flag or locale-specific template UI was found. | M |
| i18n guide, P10-C acceptance script/package command, language-switch Playwright test | MISSING | `docs/I18N.md`, `scripts/verify-p10-c-acceptance.ts`, package script `test:p10c`, and a language-switch Playwright test were not found. | M |

## U6 — Pages and onboarding

| Item | Status | Code evidence and exact gap | Estimate |
|---|---|---|---:|
| Visitor profile tabs/sections | DONE | `src/app/(dashboard)/visitors/[id]/page.tsx` and `VisitorProfileClient.tsx` include overview, visits, invitations, documents, vehicles, feedback, notes, and audit; code also contains merge/blacklist/erase actions. Static code verified; no browser run. | — |
| Invitation detail sections | DONE | `src/app/(dashboard)/invitations/[id]/page.tsx` and `InvitationDetailClient.tsx` include lifecycle, overview/pass QR/link, pre-registration, approvals, group, reminders, activity, and edit/cancel flows. Static code verified; no browser run. | — |
| `/account` profile, language, theme, password, 2FA, sessions, notifications | PARTIAL | `/account` and `src/app/(dashboard)/account/page.tsx` are absent. Related pieces are scattered: theme in `Header.tsx`, sessions/security settings in `SettingsClientView.tsx`, and authentication APIs under `src/app/api/auth`; the header language control is nonfunctional and there is no consolidated account page. | M |
| `/employees/[id]` detail page | MISSING | `src/app/(dashboard)/employees/[id]/page.tsx` is absent; the dashboard has only `employees/page.tsx`. The app API is collection-based at `src/app/api/employees/route.ts`; the dynamic employee endpoint is under the external `/api/v1` API, not an employee-detail UI. | M |
| `/contractors/[id]` detail page | MISSING | `src/app/(dashboard)/contractors/[id]/page.tsx` is absent. List and worker/status APIs exist at `src/app/api/contractors` and `src/app/api/contractors/[id]`. | M |
| `/deliveries/[id]` detail page | MISSING | `src/app/(dashboard)/deliveries/[id]/page.tsx` is absent. The list UI and a PATCH endpoint exist at `src/app/(dashboard)/deliveries/page.tsx` and `src/app/api/deliveries/[id]/route.ts`. | M |
| Parking slot drawer | PARTIAL | `src/app/(dashboard)/parking/ParkingManagementClient.tsx` provides inline slot lists, activation toggles, bulk slot creation, and assignment forms, but no slot detail drawer/dialog was found. | M |
| Admin dashboard setup checklist | DONE | `src/lib/setup-checklist.ts` is built by `src/app/api/dashboard/overview/route.ts` and rendered by `src/components/dashboard/DashboardClient.tsx` for setup/empty-organization states. Static code verified. | — |
| `/help` page and per-module help drawer | MISSING | `src/app/(dashboard)/help/page.tsx` and a shared/module help drawer component were not found; no help route/link appears in current dashboard navigation. | M |
| Route-based Settings tabs and unsaved-changes bar | PARTIAL | `src/app/(dashboard)/settings/SettingsClientView.tsx` has nine local-state tabs on the single `/settings` route. No route-synced tab URLs, dirty-state tracking, `beforeunload`, or unsaved-changes bar was found. | M |
| Loading/error boundaries for dashboard routes | PARTIAL | Only five dashboard page folders have both local files (`/checkin`, `/security`, `/visitors`, `/visitors/[id]`, `/invitations/[id]`). The other 29 routes are listed in Cross-check; no group-level dashboard `loading.tsx` or `error.tsx` was found. | M |

## U7b–U8 — Not started

| Phase | Status | Original scope retained for future work | Estimate |
|---|---|---|---:|
| U7b | NOT STARTED | Invitations list/new/series/group/bulk wizard; pre-registration review; unified approvals; mobile/desktop responsive states, i18n, accessibility, API gaps, tests, docs, and Playwright acceptance. | L |
| U7c | NOT STARTED | Kiosk, self-check-in, and pass redesign: language-first touch flow, progress, idle reset, success/next steps, offline state, 360px/tablet checks, and Playwright acceptance. | L |
| U7d | NOT STARTED | Parking, deliveries, contractors, documents, and meeting-room workflow/layout redesign. | L |
| U7e | NOT STARTED | Analytics, reports, feedback inbox, and audit trail filters/exports/summary/viewer redesign. | L |
| U7f | NOT STARTED | Employees, organization, integrations, notifications/templates/logs, and settings route/tab redesign. | L |
| U8 | NOT STARTED | Triage the existing ESLint warning baseline: 391 warnings were recorded in `docs/PROGRESS.md`; this audit did not fix warnings. | M |

Remaining estimate count across the rows above: **25 items — 1 S, 17 M, 7 L**. Done items are excluded.

## Cross-check

### Dashboard route boundary inventory

The following 29 dashboard routes have neither a colocated `loading.tsx` nor `error.tsx`; they have no inherited dashboard-group boundary either:

`/`, `/analytics`, `/approvals`, `/audit-logs`, `/badge/[id]`, `/contractors`, `/deliveries`, `/desk/self-checkins`, `/documents`, `/employees`, `/feedback`, `/integrations`, `/invitations`, `/invitations/bulk`, `/invitations/group`, `/invitations/new`, `/invitations/series`, `/invitations/[id]/group`, `/meeting-rooms`, `/muster`, `/notifications`, `/notifications/email-preview`, `/organization`, `/parking`, `/preregistrations`, `/reports`, `/self-checkin/points`, `/settings`, `/visitors/new`.

The five routes with both boundaries are `/checkin`, `/security`, `/visitors`, `/visitors/[id]`, and `/invitations/[id]`. Dashboard navigation in `src/components/layout/navigation.ts` includes the primary module routes, including Muster. Deep/detail and utility pages are reached by in-page links/actions rather than individual sidebar items. Mobile tabs in `src/components/layout/DashboardShell.tsx` are role-specific; only the SECURITY_GUARD tab set includes Muster.

### Largest files still using native buttons/inputs

This lexical inventory ranks `.tsx` files under `src/app` and `src/components` that contain native `<button>` and/or `<input|select|textarea>` tags, excluding the `src/components/ui` implementation directory. “UI import” only means the file imports something from `@/components/ui`; the native tag counts show it still mixes native controls with the kit.

| File | Bytes | Native buttons | Native form controls | UI import |
|---|---:|---:|---:|---|
| `src/app/(dashboard)/settings/SettingsClientView.tsx` | 91,880 | 17 | 51 | Yes |
| `src/components/integrations/IntegrationsManager.tsx` | 68,190 | 33 | 10 | Yes |
| `src/components/dashboard/DashboardClient.tsx` | 55,314 | 5 | 4 | No |
| `src/components/employees/EmployeesManager.tsx` | 39,478 | 13 | 18 | Yes |
| `src/components/muster/MusterLiveClient.tsx` | 36,450 | 8 | 14 | No |
| `src/app/(dashboard)/checkin/CheckinTerminalClient.tsx` | 34,071 | 10 | 5 | Yes |
| `src/app/(dashboard)/invitations/[id]/InvitationDetailClient.tsx` | 32,863 | 14 | 6 | No |
| `src/app/kiosk/KioskClientView.tsx` | 32,709 | 11 | 6 | No |
| `src/app/(dashboard)/visitors/[id]/VisitorProfileClient.tsx` | 32,541 | 8 | 3 | Yes |
| `src/components/reports/ReportsClient.tsx` | 31,012 | 11 | 11 | No |
| `src/app/(dashboard)/visitors/VisitorsClientList.tsx` | 30,762 | 12 | 1 | Yes |
| `src/components/documents/DocumentsClient.tsx` | 30,328 | 11 | 8 | Yes |
| `src/components/notifications/TemplatesManager.tsx` | 29,440 | 14 | 9 | Yes |
| `src/components/meeting-rooms/MeetingRoomsManager.tsx` | 29,019 | 13 | 11 | Yes |
| `src/app/(dashboard)/parking/ParkingManagementClient.tsx` | 25,688 | 9 | 19 | No |

### API-backed workflows without a matching full UI screen

- **Muster (P10-B):** `/api/muster` supports live roster, event detail/entries/all-clear/delivery, history pagination/export, and points CRUD. Live roll-call, history/report, exports, and point management are present; the IndexedDB offline queue remains absent (U4-3).
- **Account:** auth session/2FA/password and notification preference APIs exist, but there is no `/account` page consolidating them.
- **Contractors and deliveries:** collection/list screens exist, but dynamic company/worker and delivery detail pages are absent even though related mutation APIs exist.
- The P10-A, P10-D, P10-E, P10-F, P10-G, and P10-H areas have corresponding public/review/list/dashboard pages in the route inventory. Their missing subflows are captured above; this is not a claim that every end-to-end journey was browser-tested.
- No original “23-module” checklist was found in the repository documentation or local session-history search. The route/API comparison here is therefore based on the checked-in App Router tree, navigation configuration, API routes, and the explicit P10-A–H scope, not an invented reconstruction of that list.

## Recommended order

1. Finish U4 with offline persistence/idempotent sync and the runbook, acceptance script, Playwright drill, and remaining focused tests.
2. U5 recipient locale routing for emergency/visitor notifications, functional language controls, localized Zod messages, and PDF/NDA localization/legal review; then migrate the remaining hard-coded UI strings.
3. U6 account/detail/help surfaces, parking drawer, route-based settings with dirty-state handling, then add route-local loading/error boundaries.
4. Execute U7b, U7c, U7d, U7e, and U7f one group per authorization, with their own acceptance runs.
5. Address the documented ESLint warning baseline in U8 after the feature groups.
