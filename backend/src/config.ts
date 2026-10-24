import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from backend or root
const rootEnvPath = path.resolve(__dirname, "../../.env");
const backendEnvPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

export function isSimulated(): boolean {
  return process.env.SIMULATE === "1";
}

export interface Deployments {
  sepolia?: {
    emitter?: `0x${string}`;
  };
  amoy?: {
    lightClient?: `0x${string}`;
    verifier?: `0x${string}`;
    gatedNft?: `0x${string}`;
  };
}

export function loadDeployments(): Deployments {
  const deploymentsPath = path.resolve(__dirname, "../../deployments.json");
  if (fs.existsSync(deploymentsPath)) {
    try {
      return JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

const deployments = loadDeployments();

export function isPlaceholderAddress(addr?: string): boolean {
  if (!addr) return true;
  return /^0x(0{4,}|1{4,}|2{4,}|3{4,}|4{4,})/i.test(addr);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  sepoliaRpc: process.env.SEPOLIA_RPC || "",
  amoyRpc: process.env.AMOY_RPC || "",
  deployerKey: (process.env.DEPLOYER_KEY?.startsWith("0x")
    ? process.env.DEPLOYER_KEY
    : process.env.DEPLOYER_KEY
    ? `0x${process.env.DEPLOYER_KEY}`
    : undefined) as `0x${string}` | undefined,
  relayerKey: (process.env.RELAYER_KEY?.startsWith("0x")
    ? process.env.RELAYER_KEY
    : process.env.RELAYER_KEY
    ? `0x${process.env.RELAYER_KEY}`
    : undefined) as `0x${string}` | undefined,
  emitterAddress: (process.env.EMITTER_ADDRESS ||
    deployments.sepolia?.emitter ||
    "") as `0x${string}`,
  lightClientAddress: (process.env.LIGHT_CLIENT_ADDRESS ||
    deployments.amoy?.lightClient ||
    "") as `0x${string}`,
  verifierAddress: (process.env.VERIFIER_ADDRESS ||
    deployments.amoy?.verifier ||
    "") as `0x${string}`,
  nftAddress: (process.env.NFT_ADDRESS ||
    deployments.amoy?.gatedNft ||
    "") as `0x${string}`,
};

export function validateRealModeConfig(): void {
  const missing: string[] = [];

  if (!config.sepoliaRpc) {
    missing.push("SEPOLIA_RPC");
  }
  if (!config.amoyRpc) {
    missing.push("AMOY_RPC");
  }
  if (!config.relayerKey) {
    missing.push("RELAYER_KEY");
  }
  if (!config.emitterAddress || isPlaceholderAddress(config.emitterAddress)) {
    missing.push(`EMITTER_ADDRESS (current: "${config.emitterAddress || "missing"}")`);
  }
  if (!config.lightClientAddress || isPlaceholderAddress(config.lightClientAddress)) {
    missing.push(`LIGHT_CLIENT_ADDRESS (current: "${config.lightClientAddress || "missing"}")`);
  }
  if (!config.verifierAddress || isPlaceholderAddress(config.verifierAddress)) {
    missing.push(`VERIFIER_ADDRESS (current: "${config.verifierAddress || "missing"}")`);
  }
  if (!config.nftAddress || isPlaceholderAddress(config.nftAddress)) {
    missing.push(`NFT_ADDRESS (current: "${config.nftAddress || "missing"}")`);
  }

  if (missing.length > 0) {
    throw new Error(
      `Real mode configuration error: Missing or placeholder values found for: ${missing.join(
        ", "
      )}. Please provide valid values in .env / deployments.json, or set SIMULATE=1.`
    );
  }
}
