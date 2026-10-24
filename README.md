# ProofLink

**Trustless cross-chain transaction verification.**
Prove a transaction happened on one blockchain and use it on another, with no bridge operator, multisig or trusted relayer.

## The problem

Smart contracts on one blockchain cannot natively see another chain's transactions. Existing solutions rely on centralized bridges, multisig wallets or relayer networks. These add cost and latency and create single points of failure. In 2022, the Horizon bridge lost about $100M after compromised keys on a small multisig.

## Our approach

ProofLink replaces trust in people with verification of math:

1. A user sends a transaction on the source chain (Ethereum Sepolia).
2. A trusted state root of the source chain is made available on the destination chain (Polygon Amoy) through a pluggable `ILightClient` interface.
3. A Merkle-Patricia proof (EIP-1186) shows that the user's record exists under that root.
4. The destination `Verifier` contract checks the proof on-chain and unlocks the application action. Fake or tampered proofs revert.

Relaying is permissionless: a relayer can deliver data but cannot forge it. Neither chain's protocol is modified.

## Architecture

| Layer | Technology |
|---|---|
| Smart contracts | Solidity, Foundry |
| Proof builder and relayer | TypeScript, Node.js, Hono, viem |
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Light client | Checkpoint mode (testnet); zk light client (SP1) as the planned upgrade |

## Features

- On-chain Merkle-Patricia proof verification
- Live proof pipeline UI: sent, state root synced, proof built, verified
- Tamper test: submit a corrupted proof and watch the contract reject it
- Replay protection on verified messages
- Pluggable light client interface, so zk verification can replace the checkpoint mode without changing the verifier

## Security note

The current testnet build runs in **checkpoint mode**: the destination chain's state root is posted by an authorized account. Proof verification itself is fully on-chain. Production trust-minimization comes from replacing the checkpoint with a zk-verified Ethereum light client.

## Getting started

    npm install
    npm run dev

Set `NEXT_PUBLIC_MOCK=1` in `.env.local` to run the UI without a backend or wallet. See `SPEC.md` for the contract and API specification.

## Roadmap

- zk light client integration (SP1)
- Support for additional EVM chains, then non-EVM adapters (Solana, Avalanche)
- Generalized SDK for verifying any event or storage value cross-chain

## References

Inspired by zkBridge, Horizon, Succinct Telepathy, IBC and Rainbow Bridge.
