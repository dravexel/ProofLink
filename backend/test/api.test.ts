// Explicitly enable simulation mode for standard test suite
process.env.SIMULATE = "1";

import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import { computeStorageSlot, tamperProofNodes } from "../src/proof.js";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { relayerService } from "../src/relayer.js";
import { validateRealModeConfig } from "../src/config.js";

test("GET / returns status ok and mode", async () => {
  const res = await app.request("/");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(data.mode, "simulated");
});

test("CORS headers present for frontend origin", async () => {
  const res = await app.request("/", {
    headers: {
      Origin: "http://localhost:3000",
    },
  });
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

test("Storage slot calculation matches expected mapping layout", () => {
  const sender = "0x1111111111111111111111111111111111111111";
  const payloadHash = keccak256(Buffer.from("test-payload"));

  const calculated = computeStorageSlot(sender, payloadHash);

  const expectedOuter = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256"), [sender, 0n])
  );
  const expectedSlot = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [payloadHash, expectedOuter])
  );

  assert.equal(calculated, expectedSlot);
});

test("Tamper proof flips bytes", () => {
  const original = ["0x123456" as `0x${string}`];
  const tampered = tamperProofNodes(original);
  assert.notEqual(tampered[0], original[0]);
  assert.equal(tampered[0].length, original[0].length);
});

test("Full Request Flow: create, query, verify tampered, verify valid", async () => {
  // 1. POST /api/requests
  const mockTxHash = "0x" + "aa".repeat(32);
  const postRes = await app.request("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      txHash: mockTxHash,
      sourceChainId: 11155111,
    }),
  });

  assert.equal(postRes.status, 200);
  const postData = await postRes.json();
  assert.ok(postData.id, "Expected id in response");
  const id = postData.id;

  // 2. GET /api/requests/:id
  const getRes = await app.request(`/api/requests/${id}`);
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.id, id);
  assert.equal(getData.steps.length, 4);

  const keys = getData.steps.map((s: any) => s.key);
  assert.deepEqual(keys, ["sent", "root_synced", "proof_built", "verified"]);

  assert.equal(getData.steps[0].label, "Sent on Sepolia");
  assert.equal(getData.steps[1].label, "Chain state root arrives on Amoy");
  assert.equal(getData.steps[2].label, "Merkle proof built");
  assert.equal(getData.steps[3].label, "Checked by the Amoy verifier contract");

  // Wait for proof building to complete
  await relayerService.waitForProofBuilt(id);

  // 3. POST /api/requests/:id/verify with tamper = true
  const tamperRes = await app.request(`/api/requests/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tamper: true }),
  });
  assert.equal(tamperRes.status, 200);

  const postTamperRes = await app.request(`/api/requests/${id}`);
  const postTamperData = await postTamperRes.json();
  const verifiedStepBad = postTamperData.steps.find((s: any) => s.key === "verified");
  assert.equal(verifiedStepBad.state, "failed");
  assert.ok(verifiedStepBad.detail.includes("InvalidProof()"));

  // 4. POST /api/requests/:id/verify with tamper = false
  const validRes = await app.request(`/api/requests/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tamper: false }),
  });
  assert.equal(validRes.status, 200);

  const postValidRes = await app.request(`/api/requests/${id}`);
  const postValidData = await postValidRes.json();
  const verifiedStepOk = postValidData.steps.find((s: any) => s.key === "verified");
  assert.equal(verifiedStepOk.state, "done");
  assert.ok(verifiedStepOk.txHash);
});

test("POST /api/requests/:id/verify is blocked before proof_built is done", async () => {
  const mockTxHash = ("0x" + "bb".repeat(32)) as `0x${string}`;
  const id = relayerService.createRequest(mockTxHash, 11155111);
  const rec = relayerService.getRequest(id)!;
  // Artificially reset proof_built to pending
  const pb = rec.steps.find((s) => s.key === "proof_built")!;
  pb.state = "pending";

  const res = await app.request(`/api/requests/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tamper: false }),
  });

  assert.equal(res.status, 500);
  const data = await res.json();
  assert.ok(data.error.includes("Proof not built yet"));
});

test("Without SIMULATE=1, a txHash starting with 0xaa is NOT treated as simulated", async () => {
  // Temporarily disable SIMULATE
  delete process.env.SIMULATE;

  try {
    const txHashStartingWith0xaa = ("0xaa" + "34".repeat(31)) as `0x${string}`;
    const id = relayerService.createRequest(txHashStartingWith0xaa, 11155111);

    // Wait for real pipeline to attempt querying Sepolia RPC
    await relayerService.waitForProofBuilt(id);

    const rec = relayerService.getRequest(id)!;
    const sentStep = rec.steps.find((s) => s.key === "sent")!;

    // Because SIMULATE is not 1, it attempted real Sepolia RPC call for 0xaa...
    // The transaction does not exist on Sepolia, so sentStep FAILED (not marked done!)
    assert.equal(sentStep.state, "failed");
    assert.ok(
      sentStep.detail?.includes("Could not retrieve Sepolia transaction receipt") ||
        sentStep.detail?.includes("timeout") ||
        sentStep.detail?.includes("not found")
    );

    // Subsequent steps were not simulated
    const proofStep = rec.steps.find((s) => s.key === "proof_built")!;
    assert.equal(proofStep.state, "pending");
    assert.equal(rec.proof, undefined);
  } finally {
    process.env.SIMULATE = "1";
  }
});

test("Real mode startup validation fails with clear error if values are missing or placeholders", () => {
  assert.throws(() => {
    validateRealModeConfig();
  }, /Real mode configuration error: Missing or placeholder values found for:/);
});

test.after(() => {
  setTimeout(() => process.exit(0), 50);
});
