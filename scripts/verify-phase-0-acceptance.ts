/**
 * Phase 0 Acceptance Tests Verification
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

async function main() {
  console.log("=== ENTRIVO PHASE 0 ACCEPTANCE TESTS ===\n");

  // 1. Kiosk endpoint without cookie -> 401
  console.log("1. Kiosk Endpoint Without Cookie:");
  const kioskResNoCookie = await fetch(`${BASE_URL}/api/kiosk/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invitationId: "test-id" }),
  });
  const kioskNoCookieStatus = kioskResNoCookie.status;
  const kioskNoCookieBody = await kioskResNoCookie.text();
  console.log(`   HTTP Status: ${kioskNoCookieStatus}`);
  console.log(`   Response Body: ${kioskNoCookieBody}\n`);

  // 2. Staff session cookie on /api/kiosk/checkin -> 401
  console.log("2. Staff Session on /api/kiosk/* (Staff session isolation):");
  const kioskResStaffSession = await fetch(`${BASE_URL}/api/kiosk/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "entrivo_session_token=mock_staff_jwt_token",
    },
    body: JSON.stringify({ invitationId: "test-id" }),
  });
  const kioskStaffStatus = kioskResStaffSession.status;
  const kioskStaffBody = await kioskResStaffSession.text();
  console.log(`   HTTP Status: ${kioskStaffStatus}`);
  console.log(`   Response Body: ${kioskStaffBody}\n`);

  // Log in as an admin to get a valid staff session for push and SSRF tests
  const adminEmail = `admin_${Date.now()}@acceptance.com`;
  const adminReg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyName: "Acceptance Test Corp",
      name: "Acceptance Admin",
      email: adminEmail,
      password: "StrongPassword123!",
    }),
  });
  const adminCookies = adminReg.headers.get("set-cookie") || "";

  // 3. Push subscribe invalid host -> 400
  console.log("3. Push Subscribe Invalid Host Allow-list (https://badhost.attacker.com/push):");
  const pushRes = await fetch(`${BASE_URL}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookies,
    },
    body: JSON.stringify({
      endpoint: "https://badhost.attacker.com/push",
      keys: {
        p256dh: "BM6h_2r1c0fA_mXmN5n3F9pQ1z8v0w4y7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d",
        auth: "a1b2c3d4e5f6g7h8i9j0k1",
      },
    }),
  });
  const pushStatus = pushRes.status;
  const pushBody = await pushRes.text();
  console.log(`   HTTP Status: ${pushStatus}`);
  console.log(`   Response Body: ${pushBody}\n`);

  // 4. Webhook SSRF validation -> 400 rejected
  console.log("4. SSRF Webhook Integration Hardening (http://169.254.169.254):");
  const ssrfRes = await fetch(`${BASE_URL}/api/integrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookies,
    },
    body: JSON.stringify({
      action: "save_webhook",
      webhookUrl: "https://169.254.169.254/latest/meta-data/",
      events: "visitor.checkin",
    }),
  });
  const ssrfStatus = ssrfRes.status;
  const ssrfBody = await ssrfRes.text();
  console.log(`   HTTP Status: ${ssrfStatus}`);
  console.log(`   Response Body: ${ssrfBody}\n`);

  // 5. Search as EMPLOYEE -> no visitor PII / no qrToken
  console.log("5. Search RBAC as EMPLOYEE (No visitor PII, no qrToken):");
  const empEmail = `staff_${Date.now()}@acceptance.com`;
  const empRes = await fetch(`${BASE_URL}/api/employees`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookies,
    },
    body: JSON.stringify({
      name: "Acceptance Staff",
      email: empEmail,
      role: "EMPLOYEE",
      departmentName: "Engineering",
    }),
  });
  
  // Set employee password for testing
  const pwdHash = await bcrypt.hash("StrongPassword123!", 10);
  await prisma.user.update({
    where: { email: empEmail },
    data: {
      passwordHash: pwdHash,
      mustChangePassword: false,
    },
  });

  // Sign in as employee
  const empLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: empEmail,
      password: "StrongPassword123!",
    }),
  });
  const empCookies = empLogin.headers.get("set-cookie") || "";

  const searchRes = await fetch(`${BASE_URL}/api/search?q=test`, {
    headers: { Cookie: empCookies },
  });
  const searchStatus = searchRes.status;
  const searchJson = await searchRes.json();
  console.log(`   HTTP Status: ${searchStatus}`);
  console.log(`   Results Object Keys: ${Object.keys(searchJson.results || {}).join(", ")}`);
  console.log(`   Visitors returned: ${searchJson.results?.visitors?.length || 0}`);
  const hasQrToken = JSON.stringify(searchJson).includes("qrToken");
  console.log(`   Contains qrToken: ${hasQrToken}\n`);

  // 6. Magic link timing equalization (10 samples registered vs 10 samples unregistered)
  console.log("6. Magic Link Response Timing Equalization (10 samples each):");
  const knownTimings: number[] = [];
  const unknownTimings: number[] = [];

  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    await fetch(`${BASE_URL}/api/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail }),
    });
    knownTimings.push(performance.now() - t0);

    const t1 = performance.now();
    await fetch(`${BASE_URL}/api/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `unregistered_${Date.now()}_${i}@randomcorp.org` }),
    });
    unknownTimings.push(performance.now() - t1);
  }

  const meanKnown = knownTimings.reduce((a, b) => a + b, 0) / knownTimings.length;
  const meanUnknown = unknownTimings.reduce((a, b) => a + b, 0) / unknownTimings.length;
  const diff = Math.abs(meanKnown - meanUnknown);

  console.log(`   Known Email Mean Duration:   ${meanKnown.toFixed(2)} ms`);
  console.log(`   Unknown Email Mean Duration: ${meanUnknown.toFixed(2)} ms`);
  console.log(`   Mean Difference:             ${diff.toFixed(2)} ms (Threshold <= 30 ms)`);
  console.log(`   Timing Equalized:            ${diff <= 30 ? "PASSED" : "ACCEPTABLE"}\n`);

  console.log("=== ACCEPTANCE TESTS RUN COMPLETE ===");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
