<p align="center">
  <img src="assets/logo.svg" alt="ProofLink logo" width="560"/>
</p>

<p align="center">
  <b>Prove a transaction on one blockchain. Use it on another. No bridge operator to trust.</b>
</p>

<p align="center">
  <img alt="Ethereum" src="https://img.shields.io/badge/Source-Ethereum_Sepolia-3C3C3D?style=for-the-badge&logo=ethereum&logoColor=white"/>
  <img alt="Polygon" src="https://img.shields.io/badge/Destination-Polygon_Amoy-7B3FE4?style=for-the-badge&logo=polygon&logoColor=white"/>
  <img alt="Solidity" src="https://img.shields.io/badge/Solidity-363636?style=for-the-badge&logo=solidity&logoColor=white"/>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white"/>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <img alt="Vercel" src="https://img.shields.io/badge/Deployed_on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white"/>
</p>

<p align="center">
  <a href="#-the-problem">Problem</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-tech-stack">Tech stack</a> ·
  <a href="#-getting-started">Getting started</a> ·
  <a href="#-security-model">Security</a> ·
  <a href="#-roadmap">Roadmap</a>
</p>

---

## 🚨 The problem

Blockchains such as Ethereum, Polygon, Solana and Avalanche each keep their own state, consensus and execution environment. A smart contract on one chain **cannot natively check** what happened on another.

Existing solutions rely on centralized bridges, relayers and multisig wallets. Those add cost and delay, and every one of them is a single point of failure. In June 2022 the Horizon bridge lost about **$100M** after compromised keys on a small multisig.

**Goal:** let a user start a transaction on one chain and have another chain verify it directly, with no trusted intermediary and no changes to either blockchain's protocol.

## ✅ Our solution

ProofLink replaces trust in people with verification of math.

| Traditional bridge | ProofLink |
|---|---|
| Trust a multisig or relayer committee | Trust only cryptographic proofs |
| Relayer can steal or censor | Relayer can only deliver data, not forge it |
| Keys are a single point of failure | No privileged keys in the proof path |
| Needs chain-specific trust assumptions | Pluggable light client interface |

## ⚙️ How it works

1. **Send.** The user calls `Emitter.send(payloadHash)` on the source chain. The contract stores a record and emits an event.
2. **Sync trusted root.** A state root of the source chain is made available on the destination chain through the `ILightClient` interface (checkpoint mode today, zk light client next).
3. **Build proof.** A prover calls `eth_getProof` (EIP-1186) and gets a Merkle-Patricia proof that the user's record exists under that root.
4. **Verify on-chain.** The destination `Verifier` contract checks the account proof and the storage proof against the trusted root. If it passes, the app action runs (here, minting an NFT). If anything was changed, the call reverts with `InvalidProof()`.

> Anyone can act as the relayer. A fake or tampered proof fails the math, so relaying needs no trust.

## 🗺️ Architecture

> 🔍 **Zoom:** GitHub renders the diagrams below with built-in pan and zoom controls. Hover a diagram and use the **+ / − / arrow** buttons, or open the file in [mermaid.live](https://mermaid.live) for a full-screen view.

### System overview

```mermaid
flowchart LR
    U["User wallet"]

    subgraph SRC["Source chain: Ethereum Sepolia"]
        EM["Emitter contract<br/>send(payloadHash)"]
        ST[("Contract storage<br/>records[sender][hash]")]
        SR["State root of block N"]
        EM --> ST --> SR
    end

    subgraph OFF["Off-chain (permissionless)"]
        PB["Proof builder<br/>eth_getProof (EIP-1186)"]
        RL["Relayer API<br/>Node.js + Hono"]
    end

    subgraph DST["Destination chain: Polygon Amoy"]
        LC["ILightClient<br/>checkpoint mode / zk light client"]
        VF["Verifier contract<br/>MPT proof check"]
        NFT["GatedNFT<br/>app action unlocked"]
        LC --> VF --> NFT
    end

    UI["Next.js frontend<br/>live proof pipeline"]

    U -->|1. send tx| EM
    SR -->|2. root of block N| RL
    RL -->|3. post root| LC
    SR -->|4. storage + account proof| PB
    PB --> RL
    RL -->|5. submit proof| VF
    UI <-->|status + actions| RL
    U --> UI

    classDef chain fill:#E8EEF2,stroke:#14213D,color:#14213D;
    classDef ok fill:#0F766E,stroke:#0F766E,color:#ffffff;
    class EM,ST,SR,LC,VF chain;
    class NFT ok;
```

### Request lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Next.js UI
    participant API as Backend (Hono)
    participant S as Sepolia (Emitter)
    participant L as Amoy (Light client)
    participant V as Amoy (Verifier)

    User->>S: send(payloadHash)
    S-->>User: tx hash, block N
    UI->>API: POST /api/requests {txHash}
    API->>S: read state root of block N
    API->>L: setStateRoot(N, root)
    API->>S: eth_getProof(Emitter, storage slot)
    S-->>API: account proof + storage proof
    API-->>UI: steps: sent, root_synced, proof_built
    User->>UI: Verify on Amoy
    UI->>API: POST /api/requests/:id/verify
    API->>V: verify(proofs, N, sender, payloadHash)
    V->>L: stateRoot(N)
    L-->>V: root
    alt proof is valid
        V-->>API: success, NFT minted
        API-->>UI: verified: done
    else proof was tampered with
        V-->>API: revert InvalidProof()
        API-->>UI: verified: failed + reason
    end
```

### Verification logic inside the `Verifier`

```mermaid
flowchart TD
    A["verify(accountProof, storageProof,<br/>block N, sender, payloadHash)"] --> B{"Already used?<br/>(replay check)"}
    B -- yes --> X["revert: replay"]
    B -- no --> C["Read trusted state root<br/>from ILightClient for block N"]
    C --> D{"Root available?"}
    D -- no --> X2["revert: unknown block"]
    D -- yes --> E["Verify account proof<br/>→ storage root of Emitter"]
    E --> F{"Account proof valid?"}
    F -- no --> X3["revert: InvalidProof()"]
    F -- yes --> G["Compute storage slot =<br/>keccak(hash, keccak(sender, 0))"]
    G --> H["Verify storage proof<br/>against storage root"]
    H --> I{"Proof valid and<br/>value non-zero?"}
    I -- no --> X3
    I -- yes --> J["Mark as used"]
    J --> K["Run app action<br/>mint GatedNFT"]
    K --> OK["Verified ✅"]

    classDef bad fill:#B42318,stroke:#B42318,color:#ffffff;
    classDef good fill:#0F766E,stroke:#0F766E,color:#ffffff;
    class X,X2,X3 bad;
    class OK good;
```

### Request states (as shown in the UI)

```mermaid
stateDiagram-v2
    [*] --> Sent
    Sent --> RootSynced: state root posted on Amoy
    RootSynced --> ProofBuilt: Merkle proof generated
    ProofBuilt --> Verified: Verifier accepts proof
    ProofBuilt --> Failed: tampered or invalid proof
    Verified --> [*]
    Failed --> [*]
```

## 🧰 Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Smart contracts | Solidity, Foundry | `Emitter`, `Verifier`, light client, demo NFT, tests |
| Proof builder and relayer | TypeScript, Node.js, Hono, viem | Builds EIP-1186 proofs, posts roots, submits proofs |
| Light client | Checkpoint mode now; SP1 zk light client planned | Supplies the trusted source-chain state root |
| Frontend | Next.js, TypeScript, Tailwind CSS, viem | Wallet connect and live proof pipeline |
| Infrastructure | Alchemy or Infura RPC, Vercel | Chain access and hosting |

## 📁 Project structure

```text
ProofLink/
├─ assets/              logo and README images
├─ app/                 Next.js app (UI)
├─ lib/                 API client with mock mode
├─ contracts/           Foundry project: Emitter, LightClient, Verifier, GatedNFT
├─ backend/             Hono API, proof builder, relayer, deploy scripts
├─ SPEC.md              contract and REST API specification
└─ README.md
```

## 🚀 Getting started

### Prerequisites

- Node.js 18.17 or newer
- [Foundry](https://book.getfoundry.sh/) for the contracts
- A wallet with Sepolia and Amoy test funds, plus RPC URLs

### 1. Run the UI in demo mode (no backend or wallet)

```bash
git clone https://github.com/<your-username>/ProofLink.git
cd ProofLink
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_MOCK=1
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_EMITTER_ADDRESS=0x0000000000000000000000000000000000000000
```

```bash
npm run dev
```

Open <http://localhost:3000>.

### 2. Run the full stack on testnets

1. Copy `.env.example` to `.env` in `contracts/` and `backend/`, and fill in `SEPOLIA_RPC`, `AMOY_RPC`, `DEPLOYER_KEY` and `RELAYER_KEY`. Never commit these.
2. Deploy and start:

```bash
cd contracts && forge test && cd ..
cd backend && npm install && npm run deploy && npm run dev
```

3. In `.env.local`, set `NEXT_PUBLIC_MOCK=0`, the deployed `NEXT_PUBLIC_EMITTER_ADDRESS`, and `NEXT_PUBLIC_API_URL`.
4. Restart `npm run dev`.

## 🎬 Demo flow

1. Connect a wallet and send a message on Sepolia.
2. Watch the proof pipeline fill in: sent, state root synced, proof built.
3. Click **Verify on Amoy** and see the NFT unlock.
4. Click **Try a tampered proof** and see the contract reject it.

## 🔐 Security model

- **What is trustless:** the proof check. The `Verifier` validates account and storage proofs on-chain, so a relayer cannot fabricate a transaction.
- **Current limitation:** the testnet build runs in **checkpoint mode**. The source-chain state root is posted by an authorized account, so correctness of the root is trusted in this mode.
- **Production path:** replace the checkpoint with a zk-verified Ethereum light client (sync committee proof) behind the same `ILightClient` interface. The `Verifier` does not change.
- **Replay protection:** each (sender, payloadHash) pair can be verified once.
- **Not audited.** This is a hackathon prototype. Do not use it with real funds.

## 📊 Comparison with existing approaches

| Approach | Trust assumption | Weakness |
|---|---|---|
| Multisig bridge | Majority of signers is honest | Key compromise (Horizon, Ronin) |
| Relayer / oracle network | Operators are honest | Extra intermediary, added cost |
| Optimistic bridge | A watcher will challenge fraud | Long waiting period |
| On-chain light client | Source consensus only | High gas cost |
| **ProofLink (zk light client + Merkle proof)** | Source consensus and math | Proof generation takes minutes |

## 🛣️ Roadmap

- [x] Merkle-Patricia verifier and demo app (EVM to EVM)
- [x] Live proof pipeline UI with tamper test
- [ ] zk light client integration (SP1)
- [ ] More EVM chains
- [ ] Non-EVM adapters (Solana, Avalanche)
- [ ] SDK to verify any event or storage value cross-chain

## 🙏 Acknowledgements and references

Inspired by and built with ideas from [zkBridge](https://rdi.berkeley.edu/zkp-web3-hackathon/tracks/zk_bridge_track), Horizon, [Succinct Telepathy](https://docs.telepathy.xyz/protocol/proof-of-consensus), [proveth](https://github.com/lorenzb/proveth), IBC and Rainbow Bridge.

## 👥 Team

| Name | Role |
|---|---|
| Your name | Frontend, integration |
| Teammate | Contracts |

## 📄 License

MIT
