import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { app } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runE2E() {
  console.log("=========================================");
  console.log("   PROOFLink END-TO-END VERIFICATION     ");
  console.log("=========================================\n");

  // PART 1: Smart contract verification (Foundry)
  console.log("[1/2] Verifying on-chain Solidity contracts via Foundry...");
  const contractsDir = path.resolve(__dirname, "../../contracts");

  try {
    const forgeOutput = execSync(
      "forge test --match-contract ProofLinkTest --match-test 'test_Verifier' -vv",
      {
        cwd: contractsDir,
        encoding: "utf-8",
        stdio: "pipe",
      }
    );
    console.log(forgeOutput);
    console.log("✅ On-chain tests PASSED: Valid proof passes, tampered proof reverts!\n");
  } catch (err: any) {
    console.error("❌ On-chain tests failed:", err.stdout || err.message);
    process.exit(1);
  }

  // PART 2: Backend API and Relayer pipeline verification
  console.log("[2/2] Verifying Backend API and Proof pipeline...");
  const mockTx = ("0x" + "aa".repeat(32)) as `0x${string}`;

  // 1. Submit transaction to /api/requests
  console.log("-> Submitting transaction to POST /api/requests...");
  const createRes = await app.request("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      txHash: mockTx,
      sourceChainId: 11155111,
    }),
  });
  if (createRes.status !== 200) {
    throw new Error(`POST /api/requests returned ${createRes.status}`);
  }
  const { id } = await createRes.json();
  console.log(`> Created request id: ${id}`);

  // 2. Fetch steps and wait for proof_built to complete
  console.log("-> Waiting for proof pipeline: proof_built -> done...");
  const { relayerService } = await import("../src/relayer.js");
  await relayerService.waitForProofBuilt(id);

  const statusRes = await app.request(`/api/requests/${id}`);
  const statusData = await statusRes.json();
  console.log("> Current steps:");
  for (const s of statusData.steps) {
    console.log(`   - [${s.state}] ${s.label} (${s.key})`);
  }

  // 3. Test tampered proof verification
  console.log("\n-> Submitting TAMPERED proof to POST /api/requests/:id/verify { tamper: true }...");
  const tamperVerifyRes = await app.request(`/api/requests/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tamper: true }),
  });
  if (tamperVerifyRes.status !== 200) {
    throw new Error(`POST /api/requests/:id/verify returned ${tamperVerifyRes.status}`);
  }

  const postTamperRes = await app.request(`/api/requests/${id}`);
  const postTamperData = await postTamperRes.json();
  const tamperedStep = postTamperData.steps.find((s: any) => s.key === "verified");

  if (tamperedStep.state !== "failed" || !tamperedStep.detail?.includes("InvalidProof()")) {
    throw new Error(
      `Tampered proof did not revert as expected. Step: ${JSON.stringify(tamperedStep)}`
    );
  }
  console.log(`✅ Tampered proof correctly REVERTED: "${tamperedStep.detail}"`);

  // 4. Test valid proof verification
  console.log("\n-> Submitting VALID proof to POST /api/requests/:id/verify { tamper: false }...");
  const validVerifyRes = await app.request(`/api/requests/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tamper: false }),
  });
  if (validVerifyRes.status !== 200) {
    throw new Error(`POST /api/requests/:id/verify returned ${validVerifyRes.status}`);
  }

  const postValidRes = await app.request(`/api/requests/${id}`);
  const postValidData = await postValidRes.json();
  const validStep = postValidData.steps.find((s: any) => s.key === "verified");

  if (validStep.state !== "done" || !validStep.txHash) {
    throw new Error(`Valid proof did not succeed. Step: ${JSON.stringify(validStep)}`);
  }
  console.log(`✅ Valid proof correctly PASSED: txHash = ${validStep.txHash}`);

  console.log("\n=========================================");
  console.log("   🎉 ALL END-TO-END CHECKS PASSED!      ");
  console.log("=========================================\n");
  process.exit(0);
}

runE2E().catch((err) => {
  console.error("E2E script failed:", err);
  process.exit(1);
});
