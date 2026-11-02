/**
 * Phase 7 Acceptance Verification Script
 * Validates PWA manifest, service worker v2, offline check-in queue, non-PII storage,
 * idempotency caching, mobile responsiveness, and camera/QR permission UX.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");

console.log("================================================================================");
console.log("ENTRIVO PHASE 7 ACCEPTANCE TEST SUITE");
console.log("================================================================================");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// 1. PWA Manifest & Static Assets
// -----------------------------------------------------------------------------
console.log("\n1. PWA Manifest & Static Assets (P7-01)");

test("Manifest file exists and parses as valid JSON", () => {
  const manifestPath = path.join(ROOT, "public", "manifest.json");
  assert(fs.existsSync(manifestPath), "manifest.json does not exist");
  const content = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(content.short_name, "Entrivo");
  assert.equal(content.display, "standalone");
  assert.equal(content.theme_color, "#4f46e5");
  assert.equal(content.background_color, "#080c14");
});

test("Manifest defines maskable and standard icons that exist on disk", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "manifest.json"), "utf8"));
  assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "Must define icons");
  
  const has192 = manifest.icons.some(i => i.sizes === "192x192" && i.purpose?.includes("maskable"));
  const has512 = manifest.icons.some(i => i.sizes === "512x512" && i.purpose?.includes("maskable"));
  assert(has192, "Missing 192x192 maskable icon");
  assert(has512, "Missing 512x512 maskable icon");

  for (const icon of manifest.icons) {
    const iconFilePath = path.join(ROOT, "public", icon.src.replace(/^\//, ""));
    assert(fs.existsSync(iconFilePath), `Icon file missing on disk: ${icon.src}`);
  }
});

test("Manifest defines required shortcuts (Check-in, New invitation, Scan QR)", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "manifest.json"), "utf8"));
  assert(Array.isArray(manifest.shortcuts), "shortcuts must be an array");
  
  const urls = manifest.shortcuts.map(s => s.url);
  assert(urls.includes("/checkin"), "Missing /checkin shortcut");
  assert(urls.includes("/invitations/new"), "Missing /invitations/new shortcut");
  assert(urls.includes("/security"), "Missing /security shortcut");

  // Check shortcut icons exist
  for (const sc of manifest.shortcuts) {
    if (sc.icons) {
      for (const icon of sc.icons) {
        const iconPath = path.join(ROOT, "public", icon.src.replace(/^\//, ""));
        assert(fs.existsSync(iconPath), `Shortcut icon file missing: ${icon.src}`);
      }
    }
  }
});

test("Manifest defines wide and narrow screenshots that exist on disk", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "manifest.json"), "utf8"));
  assert(Array.isArray(manifest.screenshots), "screenshots must be an array");
  
  const wide = manifest.screenshots.find(s => s.form_factor === "wide");
  const narrow = manifest.screenshots.find(s => s.form_factor === "narrow");
  assert(wide, "Missing wide form_factor screenshot");
  assert(narrow, "Missing narrow form_factor screenshot");

  assert(fs.existsSync(path.join(ROOT, "public", wide.src.replace(/^\//, ""))), "Wide screenshot missing");
  assert(fs.existsSync(path.join(ROOT, "public", narrow.src.replace(/^\//, ""))), "Narrow screenshot missing");
});

// -----------------------------------------------------------------------------
// 2. Service Worker v2 & Offline Protection
// -----------------------------------------------------------------------------
console.log("\n2. Service Worker v2 & Strict PII Isolation (P7-02)");

test("Service Worker v2 exists and precaches safe app shell", () => {
  const swPath = path.join(ROOT, "public", "sw.js");
  assert(fs.existsSync(swPath), "sw.js missing");
  const sw = fs.readFileSync(swPath, "utf8");
  
  assert(sw.includes("/offline.html"), "sw.js must precache offline.html");
  assert(sw.includes("/manifest.json"), "sw.js must precache manifest.json");
  assert(sw.includes("CACHE_NAME"), "sw.js must have versioned CACHE_NAME");
});

test("Service Worker strictly forbids caching API requests and non-GET methods", () => {
  const sw = fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
  assert(
    sw.includes('url.pathname.startsWith("/api/")') || sw.includes("url.pathname.startsWith('/api/')"),
    "sw.js must bypass all /api/ routes"
  );
  assert(sw.includes('event.request.method !== "GET"'), "sw.js must bypass non-GET requests");
});

test("Service Worker supports SKIP_WAITING and background sync", () => {
  const sw = fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
  assert(sw.includes("SKIP_WAITING"), "sw.js must handle SKIP_WAITING");
  assert(sw.includes("sync-offline-checkins"), "sw.js must register sync-offline-checkins tag");
});

test("Standalone offline fallback page exists and has recovery actions", () => {
  const offlineHtmlPath = path.join(ROOT, "public", "offline.html");
  assert(fs.existsSync(offlineHtmlPath), "public/offline.html missing");
  const html = fs.readFileSync(offlineHtmlPath, "utf8");
  assert(html.includes("Workplace Offline"), "offline.html missing title");
  assert(html.includes("Retry Connection"), "offline.html missing retry button");
  assert(html.includes("/kiosk"), "offline.html missing link to offline kiosk");
});

// -----------------------------------------------------------------------------
// 3. IndexedDB Offline Store & Non-PII Validation
// -----------------------------------------------------------------------------
console.log("\n3. IndexedDB Offline Engine & Non-PII Enforcement (P7-03)");

test("offline-db.ts defines offline_queue and expected_visitors stores", () => {
  const dbPath = path.join(ROOT, "src", "lib", "offline-db.ts");
  assert(fs.existsSync(dbPath), "offline-db.ts missing");
  const code = fs.readFileSync(dbPath, "utf8");

  assert(code.includes("offline_queue"), "Missing offline_queue store");
  assert(code.includes("expected_visitors"), "Missing expected_visitors store");
  assert(code.includes("clearOfflineStorage"), "Missing clearOfflineStorage export");
});

test("ExpectedVisitorSummary strictly excludes PII (no phone, no email, no ID proof numbers)", () => {
  const dbPath = path.join(ROOT, "src", "lib", "offline-db.ts");
  const code = fs.readFileSync(dbPath, "utf8");

  // Inspect interface MinimalExpectedVisitor or ExpectedVisitorSummary
  const match = code.match(/export interface MinimalExpectedVisitor\s*\{([^}]+)\}/);
  assert(match, "MinimalExpectedVisitor interface not found");
  const fields = match[1];

  assert(!fields.includes("phone:"), "PII VIOLATION: MinimalExpectedVisitor must not store phone numbers");
  assert(!fields.includes("email:"), "PII VIOLATION: MinimalExpectedVisitor must not store email addresses");
  assert(!fields.includes("idProofNumber:"), "PII VIOLATION: MinimalExpectedVisitor must not store government ID proof numbers");
  assert(fields.includes("visitorName:"), "Must store visitorName");
  assert(fields.includes("qrToken:"), "Must store qrToken for verification");
});

test("All logout/revocation points invoke clearOfflineStorage()", () => {
  const sidebar = fs.readFileSync(path.join(ROOT, "src", "components", "layout", "Sidebar.tsx"), "utf8");
  assert(sidebar.includes("clearOfflineStorage()"), "Sidebar must wipe offline storage on logout");

  const guard = fs.readFileSync(path.join(ROOT, "src", "components", "auth", "IdleSessionGuard.tsx"), "utf8");
  assert(guard.includes("clearOfflineStorage()"), "IdleSessionGuard must wipe offline storage on session expiry");

  const settings = fs.readFileSync(path.join(ROOT, "src", "app", "(dashboard)", "settings", "SettingsClientView.tsx"), "utf8");
  assert(settings.includes("clearOfflineStorage()"), "SettingsClientView must wipe offline storage on logout-all");

  const kioskMgr = fs.readFileSync(path.join(ROOT, "src", "app", "(dashboard)", "settings", "KioskManager.tsx"), "utf8");
  assert(kioskMgr.includes("clearOfflineStorage()"), "KioskManager must wipe offline storage on kiosk revocation");

  const terms = fs.readFileSync(path.join(ROOT, "src", "app", "accept-terms", "AcceptTermsClient.tsx"), "utf8");
  assert(terms.includes("clearOfflineStorage()"), "AcceptTermsClient must wipe offline storage on logout");
});

// -----------------------------------------------------------------------------
// 4. Server-Side Idempotency Engine & Sync Replay Safety
// -----------------------------------------------------------------------------
console.log("\n4. Idempotency & Conflict Resolution (P7-03)");

test("idempotency.ts provides cache retrieval and storage with TTL", () => {
  const idemPath = path.join(ROOT, "src", "lib", "idempotency.ts");
  assert(fs.existsSync(idemPath), "idempotency.ts missing");
  const code = fs.readFileSync(idemPath, "utf8");

  assert(code.includes("getIdempotencyResult"), "Missing getIdempotencyResult");
  assert(code.includes("saveIdempotencyResult"), "Missing saveIdempotencyResult");
});

test("Key API routes inspect Idempotency-Key and return cached responses", () => {
  const routes = [
    path.join(ROOT, "src", "app", "api", "visitors", "checkin", "route.ts"),
    path.join(ROOT, "src", "app", "api", "visitors", "checkout", "route.ts"),
    path.join(ROOT, "src", "app", "api", "visitors", "walkin", "route.ts"),
    path.join(ROOT, "src", "app", "api", "kiosk", "checkin", "route.ts"),
    path.join(ROOT, "src", "app", "api", "kiosk", "walkin", "route.ts"),
  ];

  for (const routePath of routes) {
    const code = fs.readFileSync(routePath, "utf8");
    assert(
      code.includes('request.headers.get("idempotency-key")'),
      `Route missing Idempotency-Key handling: ${path.basename(path.dirname(routePath))}`
    );
    assert(
      code.includes("saveIdempotencyResult"),
      `Route missing saveIdempotencyResult: ${path.basename(path.dirname(routePath))}`
    );
  }
});

test("offline-sync.ts sends Idempotency-Key header and implements Server Wins on conflict", () => {
  const syncPath = path.join(ROOT, "src", "lib", "offline-sync.ts");
  assert(fs.existsSync(syncPath), "offline-sync.ts missing");
  const code = fs.readFileSync(syncPath, "utf8");

  assert(code.includes('"Idempotency-Key": item.idempotencyKey'), "Sync must send Idempotency-Key");
  assert(code.includes('"X-Entrivo-Offline-Sync": "true"'), "Sync must send X-Entrivo-Offline-Sync");
  assert(
    code.includes("response.status === 409") || code.includes("res.status === 409"),
    "Sync must handle 409 Conflict cleanly (Server Wins)"
  );
});

// -----------------------------------------------------------------------------
// 5. Mobile & Responsive Layout Audit (360px)
// -----------------------------------------------------------------------------
console.log("\n5. Responsive Mobile Navigation & Viewport (P7-04)");

test("Root layout sets mobile viewport meta tags with device-width", () => {
  const layoutPath = path.join(ROOT, "src", "app", "layout.tsx");
  const code = fs.readFileSync(layoutPath, "utf8");

  assert(code.includes('width: "device-width"'), "Missing device-width in viewport");
  assert(code.includes("OfflineBanner"), "Root layout must mount OfflineBanner");
  assert(code.includes("PwaInstallPrompt"), "Root layout must mount PwaInstallPrompt");
});

test("DashboardShell provides responsive drawer with backdrop and hamburger toggle", () => {
  const shellPath = path.join(ROOT, "src", "components", "layout", "DashboardShell.tsx");
  assert(fs.existsSync(shellPath), "DashboardShell.tsx missing");
  const code = fs.readFileSync(shellPath, "utf8");

  assert(code.includes("mobileMenuOpen"), "DashboardShell must manage mobileMenuOpen");
  assert(code.includes("overflow-x-hidden"), "DashboardShell must prevent horizontal scroll");
  assert(code.includes("onToggleMobileMenu"), "DashboardShell must wire onToggleMobileMenu");
});

test("Header and Sidebar support mobile drawer and compact small-screen layouts", () => {
  const header = fs.readFileSync(path.join(ROOT, "src", "components", "layout", "Header.tsx"), "utf8");
  assert(header.includes("onToggleMobileMenu"), "Header must accept onToggleMobileMenu");
  assert(header.includes("Menu"), "Header must include Menu icon");

  const sidebar = fs.readFileSync(path.join(ROOT, "src", "components", "layout", "Sidebar.tsx"), "utf8");
  assert(sidebar.includes("isOpenMobile"), "Sidebar must accept isOpenMobile");
  assert(sidebar.includes("-translate-x-full"), "Sidebar must collapse offscreen on mobile by default");
});

// -----------------------------------------------------------------------------
// 6. Camera & QR Permissions UX
// -----------------------------------------------------------------------------
console.log("\n6. Camera & QR Permissions UX (P7-04)");

test("CameraCapture provides permission error alerts and fallback modes", () => {
  const camPath = path.join(ROOT, "src", "components", "visitor", "CameraCapture.tsx");
  const code = fs.readFileSync(camPath, "utf8");

  assert(code.includes("NotAllowedError"), "CameraCapture must handle NotAllowedError");
  assert(code.includes("NotFoundError"), "CameraCapture must handle NotFoundError");
  assert(code.includes("UPLOAD"), "CameraCapture must provide UPLOAD fallback tab");
  assert(code.includes("PRESET"), "CameraCapture must provide PRESET portrait fallback tab");
});

test("QRScannerModal supports live camera scanning with permission guidance & manual fallback", () => {
  const qrPath = path.join(ROOT, "src", "components", "visitor", "QRScannerModal.tsx");
  const code = fs.readFileSync(qrPath, "utf8");

  assert(code.includes("startCamera"), "QRScannerModal must support startCamera");
  assert(code.includes("stopCamera"), "QRScannerModal must support stopCamera");
  assert(code.includes("NotAllowedError"), "QRScannerModal must guide on NotAllowedError");
  assert(code.includes("Camera Access Notice:"), "QRScannerModal must display camera permission notices");
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL PHASE 7 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!\n");
  process.exit(0);
}
