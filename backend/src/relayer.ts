import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, isSimulated } from "./config.js";
import { fetchProof, tamperProofNodes, MptProofResult } from "./proof.js";

export type StepState = "pending" | "active" | "done" | "failed";

export interface Step {
  key: "sent" | "root_synced" | "proof_built" | "verified";
  label: string;
  state: StepState;
  detail?: string;
  txHash?: string;
}

export interface RequestRecord {
  id: string;
  txHash: `0x${string}`;
  sourceChainId: number;
  steps: Step[];
  blockNumber?: bigint;
  sender?: `0x${string}`;
  payloadHash?: `0x${string}`;
  stateRoot?: `0x${string}`;
  proof?: MptProofResult;
  error?: string;
}

const STEP_LABELS: Record<Step["key"], string> = {
  sent: "Sent on Sepolia",
  root_synced: "Chain state root arrives on Amoy",
  proof_built: "Merkle proof built",
  verified: "Checked by the Amoy verifier contract",
};

export class RelayerService {
  private requests = new Map<string, RequestRecord>();

  private sepoliaClient = createPublicClient({
    transport: http(config.sepoliaRpc || "https://ethereum-sepolia-rpc.publicnode.com"),
  });

  private amoyClient = createPublicClient({
    transport: http(config.amoyRpc || "https://rpc-amoy.polygon.technology"),
  });

  private getRelayerAccount() {
    if (config.relayerKey) {
      try {
        return privateKeyToAccount(config.relayerKey);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private initSteps(txHash: `0x${string}`): Step[] {
    return [
      { key: "sent", label: STEP_LABELS.sent, state: "active", txHash },
      { key: "root_synced", label: STEP_LABELS.root_synced, state: "pending" },
      { key: "proof_built", label: STEP_LABELS.proof_built, state: "pending" },
      { key: "verified", label: STEP_LABELS.verified, state: "pending" },
    ];
  }

  private processingPromises = new Map<string, Promise<void>>();

  createRequest(txHash: `0x${string}`, sourceChainId: number): string {
    const id = "req_" + Math.random().toString(36).substring(2, 12);
    const record: RequestRecord = {
      id,
      txHash,
      sourceChainId,
      steps: this.initSteps(txHash),
    };

    this.requests.set(id, record);
    // Start background processing and track promise
    const p = this.processRequest(id).catch((err) => {
      console.error(`Error processing request ${id}:`, err);
    });
    this.processingPromises.set(id, p);

    return id;
  }

  async waitForProofBuilt(id: string): Promise<void> {
    const p = this.processingPromises.get(id);
    if (p) await p;
  }

  getRequest(id: string): RequestRecord | undefined {
    return this.requests.get(id);
  }

  private updateStep(
    record: RequestRecord,
    key: Step["key"],
    state: StepState,
    opts?: { detail?: string; txHash?: string }
  ) {
    const step = record.steps.find((s) => s.key === key);
    if (step) {
      step.state = state;
      if (opts?.detail !== undefined) step.detail = opts.detail;
      if (opts?.txHash !== undefined) step.txHash = opts.txHash;
    }
  }

  async processRequest(id: string) {
    const record = this.requests.get(id);
    if (!record) return;

    const sim = isSimulated();

    // 1. SIMULATED MODE: Allowed only when SIMULATE=1
    if (sim) {
      this.updateStep(record, "sent", "done", { txHash: record.txHash });
      record.blockNumber = 1000n;
      record.sender = "0x1111111111111111111111111111111111111111" as `0x${string}`;
      record.payloadHash = keccak256(toHex("unlock-demo-nft"));
      record.stateRoot = keccak256(toHex("state-root-1000"));
      this.updateStep(record, "root_synced", "done");

      record.proof = {
        accountProof: ["0x01" as `0x${string}`],
        storageProof: ["0x01" as `0x${string}`],
        storageHash: keccak256(toHex("storage-root")),
        slot: keccak256(toHex("slot")),
        value: 1000n,
      };
      this.updateStep(record, "proof_built", "done");
      return;
    }

    // 2. REAL MODE: Never invent anything. Fail step with plain-language detail on error.
    try {
      // Step 1: Wait for Sepolia receipt
      this.updateStep(record, "sent", "active");

      let receipt;
      let tx;
      try {
        receipt = await this.sepoliaClient.waitForTransactionReceipt({
          hash: record.txHash,
          timeout: 10_000,
        });
        tx = await this.sepoliaClient.getTransaction({ hash: record.txHash });
      } catch (err: any) {
        this.updateStep(record, "sent", "failed", {
          detail: `Could not retrieve Sepolia transaction receipt: ${err.shortMessage || err.message}`,
        });
        return;
      }

      if (!receipt || !tx) {
        this.updateStep(record, "sent", "failed", {
          detail: "Transaction receipt or transaction data not found on Sepolia.",
        });
        return;
      }

      if (receipt.status === "reverted") {
        this.updateStep(record, "sent", "failed", {
          detail: "Transaction reverted on Sepolia.",
        });
        return;
      }

      record.blockNumber = receipt.blockNumber;
      record.sender = tx.from as `0x${string}`;

      // Extract payloadHash from tx input (send(bytes32))
      if (tx.input && tx.input.length >= 74) {
        record.payloadHash = ("0x" + tx.input.slice(10, 74)) as `0x${string}`;
      } else {
        this.updateStep(record, "sent", "failed", {
          detail: "Transaction input does not match send(bytes32) format.",
        });
        return;
      }

      this.updateStep(record, "sent", "done", { txHash: record.txHash });

      // Step 2: Sync state root to Amoy
      this.updateStep(record, "root_synced", "active");

      let stateRoot: `0x${string}`;
      try {
        const block = await this.sepoliaClient.getBlock({ blockNumber: record.blockNumber });
        if (!block || !block.stateRoot) {
          throw new Error("Block or stateRoot unavailable");
        }
        stateRoot = block.stateRoot as `0x${string}`;
        record.stateRoot = stateRoot;
      } catch (err: any) {
        this.updateStep(record, "root_synced", "failed", {
          detail: `Failed to fetch Sepolia state root for block ${record.blockNumber}: ${err.shortMessage || err.message}`,
        });
        return;
      }

      // Sync root to CheckpointLightClient on Amoy
      const relayerAccount = this.getRelayerAccount();
      if (!relayerAccount) {
        this.updateStep(record, "root_synced", "failed", {
          detail: "RELAYER_KEY is missing or invalid; cannot post state root to Amoy.",
        });
        return;
      }

      try {
        const wallet = createWalletClient({
          account: relayerAccount,
          transport: http(config.amoyRpc),
        });
        const lcAbi = parseAbi(["function setStateRoot(uint256,bytes32)"]);
        const syncTx = await wallet.writeContract({
          address: config.lightClientAddress,
          abi: lcAbi,
          functionName: "setStateRoot",
          args: [record.blockNumber, stateRoot],
        });
        const syncReceipt = await this.amoyClient.waitForTransactionReceipt({ hash: syncTx });
        if (syncReceipt.status === "reverted") {
          throw new Error("setStateRoot transaction reverted on Polygon Amoy");
        }
      } catch (err: any) {
        this.updateStep(record, "root_synced", "failed", {
          detail: `Failed to post state root to Amoy light client: ${err.shortMessage || err.message}`,
        });
        return;
      }

      this.updateStep(record, "root_synced", "done");

      // Step 3: Build Proof (EIP-1186)
      this.updateStep(record, "proof_built", "active");

      let proof: MptProofResult;
      try {
        proof = await fetchProof(
          config.sepoliaRpc,
          config.emitterAddress,
          record.sender!,
          record.payloadHash!,
          record.blockNumber!
        );
      } catch (err: any) {
        this.updateStep(record, "proof_built", "failed", {
          detail: `Failed to build Merkle proof via eth_getProof: ${err.shortMessage || err.message}`,
        });
        return;
      }

      record.proof = proof;
      this.updateStep(record, "proof_built", "done");
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      record.error = err.message;
    }
  }

  async verifyRequest(id: string, tamper: boolean) {
    const record = this.requests.get(id);
    if (!record) throw new Error("Request not found");

    // Block verify until proof_built is done
    const proofBuiltStep = record.steps.find((s) => s.key === "proof_built");
    if (!proofBuiltStep || proofBuiltStep.state !== "done") {
      throw new Error("Proof not built yet. Verification is blocked until proof_built is done.");
    }

    this.updateStep(record, "verified", "active");

    const sim = isSimulated();

    // 1. SIMULATED MODE: Allowed only when SIMULATE=1
    if (sim) {
      if (tamper) {
        this.updateStep(record, "verified", "failed", {
          detail:
            "Verifier reverted with InvalidProof(). The proof does not match the trusted state root.",
        });
        return;
      }
      const mockAmoyTx = ("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")) as `0x${string}`;
      this.updateStep(record, "verified", "done", { txHash: mockAmoyTx });
      return;
    }

    // 2. REAL MODE: Never invent anything
    const relayerAccount = this.getRelayerAccount();
    if (!relayerAccount) {
      this.updateStep(record, "verified", "failed", {
        detail: "RELAYER_KEY is not configured; cannot submit verification on Amoy.",
      });
      return;
    }

    if (!record.proof) {
      this.updateStep(record, "verified", "failed", {
        detail: "Proof is missing; cannot verify on Amoy.",
      });
      return;
    }

    const verifierAbi = parseAbi([
      "function verify(bytes[],bytes[],uint256,address,bytes32)",
    ]);

    try {
      const wallet = createWalletClient({
        account: relayerAccount,
        transport: http(config.amoyRpc),
      });

      const storageProof = tamper
        ? tamperProofNodes(record.proof.storageProof)
        : record.proof.storageProof;

      const tx = await wallet.writeContract({
        address: config.verifierAddress,
        abi: verifierAbi,
        functionName: "verify",
        args: [
          record.proof.accountProof,
          storageProof,
          record.blockNumber!,
          record.sender!,
          record.payloadHash!,
        ],
      });

      const receipt = await this.amoyClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status === "reverted") {
        this.updateStep(record, "verified", "failed", {
          detail: "Verifier reverted with InvalidProof(). The proof does not match the trusted state root.",
        });
        return;
      }

      this.updateStep(record, "verified", "done", { txHash: tx });
    } catch (err: any) {
      console.error("On-chain verify error:", err);
      const reason = err.shortMessage || err.message || "InvalidProof()";
      this.updateStep(record, "verified", "failed", {
        detail: `Verifier reverted with ${reason}. The proof does not match the trusted state root.`,
      });
    }
  }
}

export const relayerService = new RelayerService();
