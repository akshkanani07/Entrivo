const BASE_URL = "http://localhost:3000";

async function measure(email) {
  const start = performance.now();
  await fetch(`${BASE_URL}/api/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return performance.now() - start;
}

async function run() {
  console.log("Measuring response timings for /api/auth/magic-link (20 iterations each)...\n");

  const existingEmail = "admin@entrivo.com";
  const nonExistingEmail = "unregistered-user-99999@randomdomain.test";

  // Warm up
  await measure(existingEmail);
  await measure(nonExistingEmail);

  const existingTimes = [];
  const nonExistingTimes = [];

  for (let i = 0; i < 20; i++) {
    // Interleave requests
    const tExist = await measure(existingEmail);
    existingTimes.push(tExist);

    const tNonExist = await measure(nonExistingEmail);
    nonExistingTimes.push(tNonExist);
  }

  const avgExist = existingTimes.reduce((a, b) => a + b, 0) / existingTimes.length;
  const avgNonExist = nonExistingTimes.reduce((a, b) => a + b, 0) / nonExistingTimes.length;
  const diff = Math.abs(avgExist - avgNonExist);

  console.log(`Existing Email (${existingEmail}):`);
  console.log(`  Average: ${avgExist.toFixed(2)} ms`);
  console.log(`  Min: ${Math.min(...existingTimes).toFixed(2)} ms, Max: ${Math.max(...existingTimes).toFixed(2)} ms`);

  console.log(`\nNon-Existing Email (${nonExistingEmail}):`);
  console.log(`  Average: ${avgNonExist.toFixed(2)} ms`);
  console.log(`  Min: ${Math.min(...nonExistingTimes).toFixed(2)} ms, Max: ${Math.max(...nonExistingTimes).toFixed(2)} ms`);

  console.log(`\nAbsolute Mean Difference: ${diff.toFixed(2)} ms`);
  console.log(`Timing Equalization Requirement (<= 30 ms): ${diff <= 30 ? "PASSED [YES]" : "FAILED [NO]"}`);
}

run();

