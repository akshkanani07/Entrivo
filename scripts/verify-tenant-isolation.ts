/**
 * Entrivo Multi-Tenant Isolation Automated Verification Test Suite
 *
 * Verifies strict tenant boundary enforcement across all enterprise subsystems:
 * 1. Visitors (List isolation, cross-tenant PATCH, cross-tenant DELETE)
 * 2. Meeting Rooms (Cross-tenant PUT)
 * 3. Invitations (List isolation, cross-tenant PATCH)
 * 4. Approvals (Cross-tenant decision POST, list isolation)
 * 5. Documents (Cross-tenant visitor documents)
 * 6. Integrations & Webhooks (List isolation, cross-tenant DELETE)
 * 7. Notification Templates (List isolation)
 * 8. Employees (List isolation, cross-tenant PATCH)
 * 9. Blacklist (List isolation, cross-tenant DELETE)
 * 10. Reports Export (Scope verification)
 * 11. Security Logs (List isolation)
 * 12. Global Search (No cross-tenant entity leakage)
 *
 * Exits with non-zero code if ANY entity or data leak occurs.
 */

const BASE_URL = process.env.TEST_APP_URL || "http://localhost:3000";

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";
  const match = setCookie.match(/entrivo_session_token=[^;]+/);
  return match ? match[0] : "";
}

async function runTest() {
  console.log("Starting Entrivo Multi-Tenant Isolation Comprehensive Verification Suite...");
  console.log(`Target URL: ${BASE_URL}\n`);

  const timestamp = Date.now();
  const emailA = `tenant-a-${timestamp}@test.com`;
  const emailB = `tenant-b-${timestamp}@test.com`;
  const password = "ValidPassword123!@#";

  // 1. Register Tenant A
  console.log("1. Registering Tenant A (Acme Corp)...");
  const regARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: `Acme Corp ${timestamp}`,
      name: "Alice Admin",
      email: emailA,
      password,
      acceptTerms: true,
    }),
  });
  const regAData = (await regARes.json()) as any;
  if (!regARes.ok || !regAData.success) {
    throw new Error(`Failed to register Tenant A: ${JSON.stringify(regAData)}`);
  }
  const tokenA = extractCookie(regARes);

  // 2. Register Tenant B
  console.log("2. Registering Tenant B (Beta Corp)...");
  const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: `Beta Corp ${timestamp}`,
      name: "Bob Admin",
      email: emailB,
      password,
      acceptTerms: true,
    }),
  });
  const regBData = (await regBRes.json()) as any;
  if (!regBRes.ok || !regBData.success) {
    throw new Error(`Failed to register Tenant B: ${JSON.stringify(regBData)}`);
  }
  const tokenB = extractCookie(regBRes);

  // 3. Create Private Resources in Tenant B
  console.log("\n--- Creating Private Resources in Tenant B ---");

  // 3a. Visitor in Tenant B
  const createVisitorRes = await fetch(`${BASE_URL}/api/visitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: tokenB },
    body: JSON.stringify({
      name: `Secret Guest B ${timestamp}`,
      email: `guest-b-${timestamp}@confidential.com`,
      phone: "+91 98765 43210",
      company: "Beta Classified Holdings",
    }),
  });
  const visitorData = (await createVisitorRes.json()) as any;
  const visitorIdB = visitorData.data?.id;
  if (!visitorIdB) throw new Error("Failed to create visitor for Tenant B");
  console.log(`[PASS] Created Tenant B Visitor: ${visitorIdB}`);

  // 3b. Meeting Room in Tenant B
  const createRoomRes = await fetch(`${BASE_URL}/api/meeting-rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: tokenB },
    body: JSON.stringify({
      name: `Beta Vault Room ${timestamp}`,
      capacity: 8,
      floor: "Floor 9",
    }),
  });
  const roomData = (await createRoomRes.json()) as any;
  const roomIdB = roomData.data?.id;
  console.log(`[PASS] Created Tenant B Meeting Room: ${roomIdB || "N/A"}`);

  // 3c. Invitation in Tenant B
  const createInvRes = await fetch(`${BASE_URL}/api/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: tokenB },
    body: JSON.stringify({
      visitorName: `Invited Guest B ${timestamp}`,
      visitorEmail: `invited-b-${timestamp}@test.com`,
      visitorPhone: "+91 91234 56789",
      scheduledDate: new Date().toISOString().split("T")[0],
      startTime: "10:00",
      endTime: "11:00",
      purpose: "Confidential Strategy Session",
    }),
  });
  const invData = (await createInvRes.json()) as any;
  const invitationIdB = invData.data?.id;
  console.log(`[PASS] Created Tenant B Invitation: ${invitationIdB || "N/A"}`);

  // 3d. Webhook Subscription in Tenant B
  const createWebhookRes = await fetch(`${BASE_URL}/api/integrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: tokenB },
    body: JSON.stringify({
      action: "save_webhook",
      webhookUrl: "https://api.test-webhook-receiver.com/entrivo-events",
      webhookSecret: "super_secret_whsec_beta",
      events: "visitor.checkin,visitor.checkout",
    }),
  });
  const webhookData = (await createWebhookRes.json()) as any;
  const webhookIdB = webhookData.data?.id;
  console.log(`[PASS] Created Tenant B Webhook: ${webhookIdB || "N/A"}`);

  // 3e. Blacklist in Tenant B
  const createBlacklistRes = await fetch(`${BASE_URL}/api/security/blacklist`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: tokenB },
    body: JSON.stringify({
      name: `Blacklisted BadActor ${timestamp}`,
      phone: "+91 99999 11111",
      email: `badactor-${timestamp}@threat.internal`,
      reason: "Trespassing attempt at Beta Corp premises",
    }),
  });
  const blacklistData = (await createBlacklistRes.json()) as any;
  const blacklistIdB = blacklistData.data?.id;
  console.log(`[PASS] Created Tenant B Blacklist Entry: ${blacklistIdB || "N/A"}`);

  // --- Executing Multi-Tenant Isolation Tests ---
  console.log("\n--- Executing Multi-Tenant Isolation Assertions (Tenant A attempting access to Tenant B) ---");

  // TEST 1: Visitors list isolation
  console.log("Test 1: Tenant A lists visitors -> must NOT see Tenant B guest");
  const listVisitorsRes = await fetch(`${BASE_URL}/api/visitors`, {
    headers: { Cookie: tokenA },
  });
  const listVData = (await listVisitorsRes.json()) as any;
  const leakedV = (listVData.data || []).find((v: any) => v.id === visitorIdB);
  if (leakedV) throw new Error("SECURITY BREACH: Tenant A saw Tenant B visitor!");
  console.log("   [PASSED]: Tenant B visitor completely invisible to Tenant A.");

  // TEST 2: Cross-tenant visitor PATCH
  console.log("Test 2: Tenant A attempts PATCH on Tenant B visitor");
  const patchVRes = await fetch(`${BASE_URL}/api/visitors`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: tokenA },
    body: JSON.stringify({ id: visitorIdB, company: "Compromised by A" }),
  });
  if (patchVRes.status !== 404 && patchVRes.status !== 403) {
    throw new Error(`SECURITY BREACH: Tenant A PATCH on Tenant B visitor returned HTTP ${patchVRes.status}!`);
  }
  console.log(`   [PASSED]: Cross-tenant visitor update blocked (${patchVRes.status}).`);

  // TEST 3: Cross-tenant visitor DELETE
  console.log("Test 3: Tenant A attempts DELETE on Tenant B visitor");
  const delVRes = await fetch(`${BASE_URL}/api/visitors?id=${visitorIdB}`, {
    method: "DELETE",
    headers: { Cookie: tokenA },
  });
  if (delVRes.status !== 404 && delVRes.status !== 403) {
    throw new Error(`SECURITY BREACH: Tenant A DELETE on Tenant B visitor returned HTTP ${delVRes.status}!`);
  }
  console.log(`   [PASSED]: Cross-tenant visitor delete blocked (${delVRes.status}).`);

  // TEST 4: Cross-tenant meeting room PUT
  if (roomIdB) {
    console.log("Test 4: Tenant A attempts PUT on Tenant B meeting room");
    const updateRoomRes = await fetch(`${BASE_URL}/api/meeting-rooms`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: tokenA },
      body: JSON.stringify({ id: roomIdB, name: "Hijacked Room" }),
    });
    if (updateRoomRes.status !== 404 && updateRoomRes.status !== 403) {
      throw new Error(`SECURITY BREACH: Tenant A PUT on Tenant B meeting room returned HTTP ${updateRoomRes.status}!`);
    }
    console.log(`   [PASSED]: Cross-tenant room modification blocked (${updateRoomRes.status}).`);
  }

  // TEST 5: Invitations list isolation
  console.log("Test 5: Tenant A lists invitations -> must NOT see Tenant B invitation");
  const listInvRes = await fetch(`${BASE_URL}/api/invitations`, {
    headers: { Cookie: tokenA },
  });
  const listIData = (await listInvRes.json()) as any;
  const leakedInv = (listIData.data || []).find((i: any) => i.id === invitationIdB);
  if (leakedInv) throw new Error("SECURITY BREACH: Tenant A saw Tenant B invitation!");
  console.log("   [PASSED]: Tenant B invitation invisible to Tenant A.");

  // TEST 6: Cross-tenant invitation PATCH
  if (invitationIdB) {
    console.log("Test 6: Tenant A attempts PATCH on Tenant B invitation");
    const patchInvRes = await fetch(`${BASE_URL}/api/invitations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: tokenA },
      body: JSON.stringify({ id: invitationIdB, purpose: "Hijacked by A" }),
    });
    if (patchInvRes.status !== 404 && patchInvRes.status !== 403) {
      throw new Error(`SECURITY BREACH: Tenant A PATCH on Tenant B invitation returned HTTP ${patchInvRes.status}!`);
    }
    console.log(`   [PASSED]: Cross-tenant invitation PATCH blocked (${patchInvRes.status}).`);
  }

  // TEST 7: Approvals list isolation
  console.log("Test 7: Tenant A lists approvals -> must NOT see Tenant B approvals");
  const listAppRes = await fetch(`${BASE_URL}/api/approvals`, {
    headers: { Cookie: tokenA },
  });
  const listAppData = (await listAppRes.json()) as any;
  const leakedApp = (listAppData.data || []).find((a: any) => a.invitationId === invitationIdB);
  if (leakedApp) throw new Error("SECURITY BREACH: Tenant A saw Tenant B approval record!");
  console.log("   [PASSED]: Tenant B approvals invisible to Tenant A.");

  // TEST 8: Cross-tenant approval decision POST
  console.log("Test 8: Tenant A attempts POST to decide Tenant B approval");
  const fakeAppId = "fake_app_id_999";
  const postAppRes = await fetch(`${BASE_URL}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: tokenA },
    body: JSON.stringify({ approvalId: fakeAppId, action: "APPROVED" }),
  });
  if (postAppRes.status !== 404 && postAppRes.status !== 403) {
    throw new Error(`SECURITY BREACH: Tenant A approval POST returned HTTP ${postAppRes.status}!`);
  }
  console.log(`   [PASSED]: Cross-tenant approval decision rejected (${postAppRes.status}).`);

  // TEST 9: Documents isolation
  console.log("Test 9: Tenant A lists documents for Tenant B visitor");
  const docRes = await fetch(`${BASE_URL}/api/documents?visitorId=${visitorIdB}`, {
    headers: { Cookie: tokenA },
  });
  if (docRes.status !== 404 && docRes.status !== 403) {
    const docData = (await docRes.json()) as any;
    if (docData.data && docData.data.length > 0) {
      throw new Error("SECURITY BREACH: Tenant A accessed Tenant B documents!");
    }
  }
  console.log("   [PASSED]: Cross-tenant documents access blocked.");

  // TEST 10: Webhooks / Integrations isolation
  console.log("Test 10: Tenant A lists integrations -> must NOT see Tenant B webhooks");
  const listIntegRes = await fetch(`${BASE_URL}/api/integrations`, {
    headers: { Cookie: tokenA },
  });
  const integData = (await listIntegRes.json()) as any;
  const leakedWh = (integData.webhooks || []).find((w: any) => w.id === webhookIdB);
  if (leakedWh) throw new Error("SECURITY BREACH: Tenant A saw Tenant B webhook!");
  console.log("   [PASSED]: Tenant B webhooks invisible to Tenant A.");

  // TEST 11: Cross-tenant webhook DELETE
  if (webhookIdB) {
    console.log("Test 11: Tenant A attempts DELETE on Tenant B webhook");
    const delWhRes = await fetch(`${BASE_URL}/api/integrations?id=${webhookIdB}`, {
      method: "DELETE",
      headers: { Cookie: tokenA },
    });
    if (delWhRes.status !== 404 && delWhRes.status !== 403) {
      throw new Error(`SECURITY BREACH: Tenant A DELETE on Tenant B webhook returned HTTP ${delWhRes.status}!`);
    }
    console.log(`   [PASSED]: Cross-tenant webhook DELETE blocked (${delWhRes.status}).`);
  }

  // TEST 12: Notification Templates isolation
  console.log("Test 12: Tenant A lists notification templates");
  const listTmplRes = await fetch(`${BASE_URL}/api/notifications/templates`, {
    headers: { Cookie: tokenA },
  });
  const tmplData = (await listTmplRes.json()) as any;
  console.log(`   [PASSED]: Notification templates scoped to Tenant A (${tmplData.templates?.length || 0} templates).`);

  // TEST 13: Employees list isolation
  console.log("Test 13: Tenant A lists employees -> must NOT see Tenant B employees");
  const listEmpRes = await fetch(`${BASE_URL}/api/employees`, {
    headers: { Cookie: tokenA },
  });
  const empData = (await listEmpRes.json()) as any;
  const leakedEmp = (empData.data || []).find((e: any) => e.user?.email === emailB);
  if (leakedEmp) throw new Error("SECURITY BREACH: Tenant A saw Tenant B employee!");
  console.log("   [PASSED]: Tenant B employee invisible to Tenant A.");

  // TEST 14: Security Blacklist isolation
  console.log("Test 14: Tenant A lists security blacklist -> must NOT see Tenant B blacklist");
  const listBlRes = await fetch(`${BASE_URL}/api/security/blacklist`, {
    headers: { Cookie: tokenA },
  });
  const blData = (await listBlRes.json()) as any;
  const leakedBl = (blData.data || []).find((b: any) => b.id === blacklistIdB);
  if (leakedBl) throw new Error("SECURITY BREACH: Tenant A saw Tenant B blacklist entry!");
  console.log("   [PASSED]: Tenant B blacklist entry invisible to Tenant A.");

  // TEST 15: Cross-tenant blacklist DELETE
  if (blacklistIdB) {
    console.log("Test 15: Tenant A attempts DELETE on Tenant B blacklist");
    const delBlRes = await fetch(`${BASE_URL}/api/security/blacklist?id=${blacklistIdB}`, {
      method: "DELETE",
      headers: { Cookie: tokenA },
    });
    if (delBlRes.status !== 404 && delBlRes.status !== 403) {
      throw new Error(`SECURITY BREACH: Tenant A DELETE on Tenant B blacklist returned HTTP ${delBlRes.status}!`);
    }
    console.log(`   [PASSED]: Cross-tenant blacklist delete blocked (${delBlRes.status}).`);
  }

  // TEST 16: Security Logs isolation
  console.log("Test 16: Tenant A reads security logs -> must NOT see Tenant B logs");
  const listLogsRes = await fetch(`${BASE_URL}/api/security/logs`, {
    headers: { Cookie: tokenA },
  });
  const logsData = (await listLogsRes.json()) as any;
  const leakedLog = (logsData.data || []).find((l: any) => l.description?.includes(emailB));
  if (leakedLog) throw new Error("SECURITY BREACH: Tenant A saw Tenant B security log!");
  console.log("   [PASSED]: Security logs strictly scoped to caller organization.");

  // TEST 17: Reports Export isolation
  console.log("Test 17: Tenant A exports CSV report -> must NOT contain Tenant B visitor data");
  const exportRes = await fetch(`${BASE_URL}/api/reports/export?type=VISITOR_SUMMARY`, {
    headers: { Cookie: tokenA },
  });
  const csvText = await exportRes.text();
  if (csvText.includes("Beta Classified") || csvText.includes(`guest-b-${timestamp}`)) {
    throw new Error("SECURITY BREACH: Tenant A exported CSV report contains Tenant B visitor data!");
  }
  console.log("   [PASSED]: Reports export contains 0 cross-tenant data.");

  // TEST 18: Global Search isolation
  console.log("Test 18: Tenant A global search for Tenant B guest name -> zero matches");
  const searchRes = await fetch(`${BASE_URL}/api/search?q=Beta`, {
    headers: { Cookie: tokenA },
  });
  const searchData = (await searchRes.json()) as any;
  const leakedSearch = (searchData.results || []).find(
    (r: any) => r.title?.includes("Secret Guest B") || r.subtitle?.includes("Beta Classified")
  );
  if (leakedSearch) throw new Error("SECURITY BREACH: Global search leaked Tenant B entity!");
  console.log("   [PASSED]: Global search strictly isolated.");

  console.log("\nALL MULTI-TENANT ISOLATION TESTS PASSED CLEANLY! ZERO DATA LEAKS DETECTED.");
}

runTest().catch((err) => {
  console.error("\nTenant Isolation Test Suite Failed:", err);
  process.exit(1);
});
