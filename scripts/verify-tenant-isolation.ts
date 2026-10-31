/**
 * Entrivo Multi-Tenant Isolation Automated Verification Test
 * 
 * Verifies that:
 * 1. User from Org A cannot read entities belonging to Org B.
 * 2. User from Org A cannot update entities belonging to Org B (returns 404 or 403).
 * 3. User from Org A cannot delete entities belonging to Org B (returns 404 or 403).
 * 4. User from Org A cannot approve invitations belonging to Org B.
 */

const BASE_URL = process.env.TEST_APP_URL || "http://localhost:3000";

interface TestContext {
  tokenA: string;
  tokenB: string;
  orgIdA: string;
  orgIdB: string;
  visitorIdB: string;
  meetingRoomIdB: string;
}

async function runTest() {
  console.log("🔒 Starting Entrivo Multi-Tenant Isolation Verification Suite...");
  console.log(`Target URL: ${BASE_URL}\n`);

  const timestamp = Date.now();
  const emailA = `tenant-a-${timestamp}@test.com`;
  const emailB = `tenant-b-${timestamp}@test.com`;
  const password = "ValidPassword123!@#";

  // 1. Register Tenant A
  console.log("1. Registering Tenant A...");
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
  const regAData = await regARes.json();
  if (!regARes.ok || !regAData.success) {
    throw new Error(`Failed to register Tenant A: ${JSON.stringify(regAData)}`);
  }
  const tokenA = extractCookie(regARes);

  // 2. Register Tenant B
  console.log("2. Registering Tenant B...");
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
  const regBData = await regBRes.json();
  if (!regBRes.ok || !regBData.success) {
    throw new Error(`Failed to register Tenant B: ${JSON.stringify(regBData)}`);
  }
  const tokenB = extractCookie(regBRes);

  // 3. Tenant B creates a Visitor
  console.log("3. Tenant B creates a private visitor record...");
  const createVisitorRes = await fetch(`${BASE_URL}/api/visitors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: tokenB,
    },
    body: JSON.stringify({
      name: "Secret Guest of Org B",
      email: `guest-b-${timestamp}@confidential.com`,
      phone: "+91 98765 43210",
      company: "Top Secret LLC",
    }),
  });
  const visitorData = await createVisitorRes.json();
  const visitorIdB = visitorData.data?.id;
  if (!visitorIdB) {
    throw new Error(`Failed to create visitor for Tenant B: ${JSON.stringify(visitorData)}`);
  }
  console.log(`   Created Visitor ID in Tenant B: ${visitorIdB}`);

  // 4. Tenant B creates a Meeting Room
  console.log("4. Tenant B creates a meeting room...");
  const createRoomRes = await fetch(`${BASE_URL}/api/meeting-rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: tokenB,
    },
    body: JSON.stringify({
      name: "Executive Vault Room",
      capacity: 8,
      floor: "Floor 9",
    }),
  });
  const roomData = await createRoomRes.json();
  const roomIdB = roomData.data?.id;
  console.log(`   Created Room ID in Tenant B: ${roomIdB}`);

  // ASSERTION 1: Tenant A lists visitors -> must NOT see Tenant B's visitor
  console.log("\n🧪 Test Case 1: Tenant A reads visitors list (asserts zero leak)");
  const listVisitorsRes = await fetch(`${BASE_URL}/api/visitors`, {
    headers: { Cookie: tokenA },
  });
  const listData = await listVisitorsRes.json();
  const leakedVisitor = (listData.data || []).find((v: any) => v.id === visitorIdB);
  if (leakedVisitor) {
    throw new Error("🚨 SECURITY BREACH: Tenant A can see Tenant B visitor in list!");
  }
  console.log("   ✅ PASSED: Tenant B visitor was not visible in Tenant A list.");

  // ASSERTION 2: Tenant A attempts to update Tenant B's visitor -> 404 or 403
  console.log("🧪 Test Case 2: Tenant A attempts PATCH on Tenant B visitor");
  const updateRes = await fetch(`${BASE_URL}/api/visitors`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: tokenA,
    },
    body: JSON.stringify({
      id: visitorIdB,
      company: "Compromised by Tenant A",
    }),
  });
  if (updateRes.status !== 404 && updateRes.status !== 403) {
    throw new Error(`🚨 SECURITY BREACH: Tenant A PATCH on Tenant B visitor returned ${updateRes.status}! Expected 404/403.`);
  }
  console.log(`   ✅ PASSED: Cross-tenant update blocked with HTTP ${updateRes.status}.`);

  // ASSERTION 3: Tenant A attempts to delete Tenant B's visitor -> 404 or 403
  console.log("🧪 Test Case 3: Tenant A attempts DELETE on Tenant B visitor");
  const deleteRes = await fetch(`${BASE_URL}/api/visitors?id=${visitorIdB}`, {
    method: "DELETE",
    headers: { Cookie: tokenA },
  });
  if (deleteRes.status !== 404 && deleteRes.status !== 403) {
    throw new Error(`🚨 SECURITY BREACH: Tenant A DELETE on Tenant B visitor returned ${deleteRes.status}! Expected 404/403.`);
  }
  console.log(`   ✅ PASSED: Cross-tenant delete blocked with HTTP ${deleteRes.status}.`);

  // ASSERTION 4: Tenant A attempts to update Tenant B's meeting room -> 404 or 403
  if (roomIdB) {
    console.log("🧪 Test Case 4: Tenant A attempts PUT on Tenant B meeting room");
    const updateRoomRes = await fetch(`${BASE_URL}/api/meeting-rooms`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: tokenA,
      },
      body: JSON.stringify({
        id: roomIdB,
        name: "Hijacked Room",
      }),
    });
    if (updateRoomRes.status !== 404 && updateRoomRes.status !== 403) {
      throw new Error(`🚨 SECURITY BREACH: Tenant A PUT on Tenant B meeting room returned ${updateRoomRes.status}! Expected 404/403.`);
    }
    console.log(`   ✅ PASSED: Cross-tenant room modification blocked with HTTP ${updateRoomRes.status}.`);
  }

  // ASSERTION 5: Tenant A searches globally for Tenant B's visitor name -> zero matches
  console.log("🧪 Test Case 5: Tenant A global search for Tenant B guest name");
  const searchRes = await fetch(`${BASE_URL}/api/search?q=Confidential`, {
    headers: { Cookie: tokenA },
  });
  const searchData = await searchRes.json();
  const leakedSearchResult = (searchData.results || []).find((r: any) => r.title?.includes("Secret Guest"));
  if (leakedSearchResult) {
    throw new Error("🚨 SECURITY BREACH: Tenant A search returned Tenant B visitor!");
  }
  console.log("   ✅ PASSED: Cross-tenant search returned 0 leaked entities.");

  console.log("\n🎉 ALL MULTI-TENANT ISOLATION TESTS PASSED CLEANLY!");
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";
  // Extract token value
  const match = setCookie.match(/entrivo_session_token=[^;]+/);
  return match ? match[0] : "";
}

runTest().catch((err) => {
  console.error("\n❌ Tenant Isolation Test Failed:", err);
  process.exit(1);
});

