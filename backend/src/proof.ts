import {
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  toHex,
} from "viem";

export interface MptProofResult {
  accountProof: `0x${string}`[];
  storageProof: `0x${string}`[];
  storageHash: `0x${string}`;
  slot: `0x${string}`;
  value: bigint;
}

/**
 * Computes storage slot for Emitter.records[sender][payloadHash]
 * Slot layout: keccak256(payloadHash . keccak256(sender . 0))
 */
export function computeStorageSlot(
  sender: `0x${string}`,
  payloadHash: `0x${string}`
): `0x${string}` {
  const outerSlot = keccak256(
    encodeAbiParameters(parseAbiParameters("address, uint256"), [sender, 0n])
  );
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [payloadHash, outerSlot])
  );
}

/**
 * Fetches EIP-1186 MPT account and storage proof for Emitter contract
 */
export async function fetchProof(
  rpcUrl: string,
  emitterAddress: `0x${string}`,
  sender: `0x${string}`,
  payloadHash: `0x${string}`,
  blockNumber: bigint
): Promise<MptProofResult> {
  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  const slot = computeStorageSlot(sender, payloadHash);

  // Call eth_getProof
  const rawProof = (await client.request({
    method: "eth_getProof" as any,
    params: [emitterAddress, [slot], toHex(blockNumber)] as any,
  })) as {
    accountProof: string[];
    storageHash: string;
    storageProof: Array<{
      key: string;
      value: string;
      proof: string[];
    }>;
  };

  const accountProof = rawProof.accountProof.map((p) => p as `0x${string}`);
  const storageEntry = rawProof.storageProof[0];
  const storageProof = (storageEntry?.proof || []).map((p) => p as `0x${string}`);
  const value = storageEntry?.value ? BigInt(storageEntry.value) : 0n;

  return {
    accountProof,
    storageProof,
    storageHash: rawProof.storageHash as `0x${string}`,
    slot,
    value,
  };
}

/**
 * Tampers an MPT proof array by flipping the last byte of the leaf node
 */
export function tamperProofNodes(proof: `0x${string}`[]): `0x${string}`[] {
  if (proof.length === 0) return ["0x00"];
  const copy = [...proof];
  const lastIndex = copy.length - 1;
  const target = copy[lastIndex].slice(2);
  if (target.length < 2) {
    copy[lastIndex] = "0xdeadbeef" as `0x${string}`;
    return copy;
  }
  const lastByte = parseInt(target.slice(-2), 16);
  const flipped = (lastByte ^ 0xff).toString(16).padStart(2, "0");
  copy[lastIndex] = ("0x" + target.slice(0, -2) + flipped) as `0x${string}`;
  return copy;
}
