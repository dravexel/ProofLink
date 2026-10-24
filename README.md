<p align="center"> <img src="assets/logo.svg" alt="ProofLink logo" width="560"/> </p> <p align="center"> <b>Prove a transaction on one blockchain. Use it on another. No bridge operator to trust.</b> </p> <p align="center"> <img alt="Ethereum" src="https://img.shields.io/badge/Source-Ethereum_Sepolia-3C3C3D?style=for-the-badge&logo=ethereum&logoColor=white"/> <img alt="Polygon" src="https://img.shields.io/badge/Destination-Polygon_Amoy-7B3FE4?style=for-the-badge&logo=polygon&logoColor=white"/> <img alt="Solidity" src="https://img.shields.io/badge/Solidity-363636?style=for-the-badge&logo=solidity&logoColor=white"/> <img alt="Next.js" src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white"/> <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/> <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white"/> <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/> <img alt="Vercel" src="https://img.shields.io/badge/Deployed_on-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white"/> </p> <p align="center"> <a href="#-the-problem">Problem</a> · <a href="#-how-it-works">How it works</a> · <a href="#-architecture">Architecture</a> · <a href="#-tech-stack">Tech stack</a> · <a href="#-getting-started">Getting started</a> · <a href="#-security-model">Security</a> · <a href="#-roadmap">Roadmap</a> </p>
🚨 The problem

Blockchains such as Ethereum, Polygon, Solana and Avalanche each keep their own state, consensus and execution environment. A smart contract on one chain cannot natively check what happened on another.

Existing solutions rely on centralized bridges, relayers and multisig wallets. Those add cost and delay, and every one of them is a single point of failure. In June 2022 the Horizon bridge lost about $100M after compromised keys on a small multisig.

Goal: let a user start a transaction on one chain and have another chain verify it directly, with no trusted intermediary and no changes to either blockchain's protocol.

✅ Our solution

ProofLink replaces trust in people with verification of math.

Traditional bridge	ProofLink
Trust a multisig or relayer committee	Trust only cryptographic proofs
Relayer can steal or censor	Relayer can only deliver data, not forge it
Keys are a single point of failure	No privileged keys in the proof path
Needs chain-specific trust assumptions	Pluggable light client interface
⚙️ How it works
Send. The user calls Emitter.send(payloadHash) on the source chain. The contract stores a record and emits an event.
Sync trusted root. A state root of the source chain is made available on the destination chain through the ILightClient interface (checkpoint mode today, zk light client next).
Build proof. A prover calls eth_getProof (EIP-1186) and gets a Merkle-Patricia proof that the user's record exists under that root.
Verify on-chain. The destination Verifier contract checks the account proof and the storage proof against the trusted root. If it passes, the app action runs (here, minting an NFT). If anything was changed, the call reverts with InvalidProof().

Anyone can act as the relayer. A fake or tampered proof fails the math, so relaying needs no trust.

🗺️ Architecture

🔍 Zoom: GitHub renders the diagrams below with built-in pan and zoom controls. Hover a diagram and use the + / − / arrow buttons, or open the file in mermaid.live for a full-screen view.

System overview
Destination chain: Polygon Amoy
Off-chain (permissionless)
Source chain: Ethereum Sepolia
1. send tx
2. root of block N
3. post root
4. storage + account proof
5. submit proof
status + actions
User wallet
Emitter contractsend(payloadHash)
Contract storagerecords[sender][hash]
State root of block N
Proof buildereth_getProof (EIP-1186)
Relayer APINode.js + Hono
ILightClientcheckpoint mode / zk lightclient
Verifier contractMPT proof check
GatedNFTapp action unlocked
Next.js frontendlive proof pipeline
Request lifecycle
Amoy (Verifier)
Amoy (Light client)
Sepolia (Emitter)
Backend (Hono)
Next.js UI
Amoy (Verifier)
Amoy (Light client)
Sepolia (Emitter)
Backend (Hono)
Next.js UI
alt
[proof is valid]
[proof was tampered with]
User
send(payloadHash)
1
tx hash, block N
2
POST /api/requests {txHash}
3
read state root of block N
4
setStateRoot(N, root)
5
eth_getProof(Emitter, storage slot)
6
account proof + storage proof
7
steps: sent, root_synced, proof_built
8
Verify on Amoy
9
POST /api/requests/:id/verify
10
verify(proofs, N, sender, payloadHash)
11
stateRoot(N)
12
root
13
success, NFT minted
14
verified: done
15
revert InvalidProof()
16
verified: failed + reason
17
User
Verification logic inside the Verifier
yes
no
no
yes
no
yes
no
yes
verify(accountProof,storageProof,block N, sender,payloadHash)
Already used?(replay check)
revert: replay
Read trusted state rootfrom ILightClient for blockN
Root available?
revert: unknown block
Verify account proof→ storage root of Emitter
Account proof valid?
revert: InvalidProof()
Compute storage slot =keccak(hash, keccak(sender,0))
Verify storage proofagainst storage root
Proof valid andvalue non-zero?
Mark as used
Run app actionmint GatedNFT
Verified ✅
Request states (as shown in the UI)
state root posted on Amoy
Merkle proof generated
Verifier accepts proof
tampered or invalid proof
Sent
RootSynced
ProofBuilt
Verified
Failed
🧰 Tech stack
Layer	Technology	Purpose
Smart contracts	Solidity, Foundry	Emitter, Verifier, light client, demo NFT, tests
Proof builder and relayer	TypeScript, Node.js, Hono, viem	Builds EIP-1186 proofs, posts roots, submits proofs
Light client	Checkpoint mode now; SP1 zk light client planned	Supplies the trusted source-chain state root
Frontend	Next.js, TypeScript, Tailwind CSS, viem	Wallet connect and live proof pipeline
Infrastructure	Alchemy or Infura RPC, Vercel	Chain access and hosting
📁 Project structure
text
ProofLink/
├─ assets/              logo and README images
├─ app/                 Next.js app (UI)
├─ lib/                 API client with mock mode
├─ contracts/           Foundry project: Emitter, LightClient, Verifier, GatedNFT
├─ backend/             Hono API, proof builder, relayer, deploy scripts
├─ SPEC.md              contract and REST API specification
└─ README.md
🚀 Getting started
Prerequisites
Node.js 18.17 or newer
Foundry for the contracts
A wallet with Sepolia and Amoy test funds, plus RPC URLs
1. Run the UI in demo mode (no backend or wallet)
bash
git clone https://github.com/<your-username>/ProofLink.git
cd ProofLink
npm install

Create .env.local:

env
NEXT_PUBLIC_MOCK=1
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_EMITTER_ADDRESS=0x0000000000000000000000000000000000000000
bash
npm run dev

Open http://localhost:3000.

2. Run the full stack on testnets
Copy .env.example to .env in contracts/ and backend/, and fill in SEPOLIA_RPC, AMOY_RPC, DEPLOYER_KEY and RELAYER_KEY. Never commit these.
Deploy and start:
bash
cd contracts && forge test && cd ..
cd backend && npm install && npm run deploy && npm run dev
In .env.local, set NEXT_PUBLIC_MOCK=0, the deployed NEXT_PUBLIC_EMITTER_ADDRESS, and NEXT_PUBLIC_API_URL.
Restart npm run dev.
🎬 Demo flow
Connect a wallet and send a message on Sepolia.
Watch the proof pipeline fill in: sent, state root synced, proof built.
Click Verify on Amoy and see the NFT unlock.
Click Try a tampered proof and see the contract reject it.
🔐 Security model
What is trustless: the proof check. The Verifier validates account and storage proofs on-chain, so a relayer cannot fabricate a transaction.
Current limitation: the testnet build runs in checkpoint mode. The source-chain state root is posted by an authorized account, so correctness of the root is trusted in this mode.
Production path: replace the checkpoint with a zk-verified Ethereum light client (sync committee proof) behind the same ILightClient interface. The Verifier does not change.
Replay protection: each (sender, payloadHash) pair can be verified once.
Not audited. This is a hackathon prototype. Do not use it with real funds.
📊 Comparison with existing approaches
Approach	Trust assumption	Weakness
Multisig bridge	Majority of signers is honest	Key compromise (Horizon, Ronin)
Relayer / oracle network	Operators are honest	Extra intermediary, added cost
Optimistic bridge	A watcher will challenge fraud	Long waiting period
On-chain light client	Source consensus only	High gas cost
ProofLink (zk light client + Merkle proof)	Source consensus and math	Proof generation takes minutes
🛣️ Roadmap
 Merkle-Patricia verifier and demo app (EVM to EVM)
 Live proof pipeline UI with tamper test
 zk light client integration (SP1)
 More EVM chains
 Non-EVM adapters (Solana, Avalanche)
 SDK to verify any event or storage value cross-chain
🙏 Acknowledgements and references

Inspired by and built with ideas from zkBridge, Horizon, Succinct Telepathy, proveth, IBC and Rainbow Bridge.

👥 Team
Name	Role
Your name	Frontend, integration
Teammate	Contracts
📄 License

MIT
