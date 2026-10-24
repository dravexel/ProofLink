import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { config } from "../src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const amoyChain: Chain = {
  id: 80002,
  name: "Polygon Amoy",
  nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
  rpcUrls: {
    default: { http: [config.amoyRpc] },
  },
};

function readArtifact(contractName: string) {
  const artifactPath = path.resolve(
    __dirname,
    `../../contracts/out/${contractName}.sol/${contractName}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found at ${artifactPath}. Run 'forge build' in /contracts first.`);
  }
  const data = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return {
    abi: data.abi,
    bytecode: data.bytecode.object as `0x${string}`,
  };
}

async function deployContract(
  wallet: any,
  publicClient: any,
  contractName: string,
  args: any[] = []
): Promise<`0x${string}`> {
  const { abi, bytecode } = readArtifact(contractName);
  console.log(`Deploying ${contractName}...`);
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    args,
  });
  console.log(`> Tx submitted: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(`Failed to deploy ${contractName}: no contractAddress in receipt`);
  }
  console.log(`> ${contractName} deployed at: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

export async function deploy() {
  const isMock = process.argv.includes("--mock") || process.argv.includes("--dry-run");

  if (!config.deployerKey) {
    if (isMock) {
      console.log("Generating mock deployments.json for local demo testing...");
      const mockDeployments = {
        sepolia: {
          chainId: 11155111,
          emitter: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        },
        amoy: {
          chainId: 80002,
          lightClient: "0x2222222222222222222222222222222222222222" as `0x${string}`,
          gatedNft: "0x3333333333333333333333333333333333333333" as `0x${string}`,
          verifier: "0x4444444444444444444444444444444444444444" as `0x${string}`,
        },
      };

      const outPathRoot = path.resolve(__dirname, "../../deployments.json");
      fs.writeFileSync(outPathRoot, JSON.stringify(mockDeployments, null, 2));
      console.log(`Wrote mock deployments to ${outPathRoot}`);
      return mockDeployments;
    }

    console.error("ERROR: DEPLOYER_KEY is not set in .env.");
    console.error("Please add the following to your .env file:");
    console.error("  SEPOLIA_RPC=<Your Sepolia RPC>");
    console.error("  AMOY_RPC=<Your Polygon Amoy RPC>");
    console.error("  DEPLOYER_KEY=<Your private key with Sepolia ETH and Amoy POL>");
    console.error("  RELAYER_KEY=<Your relayer private key>");
    console.error("Or run with --mock for demo/test mode: npm run deploy -- --mock");
    process.exit(1);
  }

  const account = privateKeyToAccount(config.deployerKey);
  console.log(`Using deployer account: ${account.address}`);

  // Sepolia clients
  const sepoliaPublic = createPublicClient({
    chain: sepolia,
    transport: http(config.sepoliaRpc),
  });
  const sepoliaWallet = createWalletClient({
    account,
    chain: sepolia,
    transport: http(config.sepoliaRpc),
  });

  // Amoy clients
  const amoyPublic = createPublicClient({
    chain: amoyChain,
    transport: http(config.amoyRpc),
  });
  const amoyWallet = createWalletClient({
    account,
    chain: amoyChain,
    transport: http(config.amoyRpc),
  });

  // 1. Deploy Emitter on Sepolia
  const emitterAddress = await deployContract(sepoliaWallet, sepoliaPublic, "Emitter");

  // 2. Deploy CheckpointLightClient on Amoy
  const lightClientAddress = await deployContract(
    amoyWallet,
    amoyPublic,
    "CheckpointLightClient",
    [account.address]
  );

  // 3. Deploy GatedNFT on Amoy
  const gatedNftAddress = await deployContract(
    amoyWallet,
    amoyPublic,
    "GatedNFT",
    [account.address]
  );

  // 4. Deploy Verifier on Amoy
  const verifierAddress = await deployContract(
    amoyWallet,
    amoyPublic,
    "Verifier",
    [lightClientAddress, emitterAddress, gatedNftAddress]
  );

  // 5. Set Verifier on GatedNFT
  console.log("Configuring GatedNFT verifier address...");
  const { abi: nftAbi } = readArtifact("GatedNFT");
  const setVerifierHash = await amoyWallet.writeContract({
    address: gatedNftAddress,
    abi: nftAbi,
    functionName: "setVerifier",
    args: [verifierAddress],
  });
  await amoyPublic.waitForTransactionReceipt({ hash: setVerifierHash });
  console.log("> GatedNFT verifier updated successfully");

  const deployments = {
    sepolia: {
      chainId: 11155111,
      emitter: emitterAddress,
    },
    amoy: {
      chainId: 80002,
      lightClient: lightClientAddress,
      gatedNft: gatedNftAddress,
      verifier: verifierAddress,
    },
  };

  const outPathRoot = path.resolve(__dirname, "../../deployments.json");
  fs.writeFileSync(outPathRoot, JSON.stringify(deployments, null, 2));
  console.log(`\nDeployments written to: ${outPathRoot}`);
  console.log(JSON.stringify(deployments, null, 2));

  return deployments;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  deploy().catch((err) => {
    console.error("Deploy failed:", err);
    process.exit(1);
  });
}
