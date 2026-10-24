# ProofLink shared spec (frontend ⇄ backend ⇄ contracts)
Give this file to Antigravity. The frontend (this folder) already implements the client side.

## Chains
Source: Ethereum Sepolia (11155111). Destination: Polygon Amoy (80002).

## Contracts
- Sepolia `Emitter`: `function send(bytes32 payloadHash)`; stores `records[msg.sender][payloadHash]=block.number` and emits `Sent(address indexed sender, bytes32 payloadHash)`.
- Amoy `LightClient`: `function stateRoot(uint256 sourceBlock) view returns (bytes32)`; root set by checkpoint mode (testnet) or SP1 proof (stretch).
- Amoy `Verifier`: `function verify(bytes[] accountProof, bytes[] storageProof, uint256 sourceBlock, address sender, bytes32 payloadHash)`; reverts `InvalidProof()`.

## REST API (backend, default http://localhost:4000, enable CORS for the frontend origin)
- `POST /api/requests` body `{ "txHash": "0x..", "sourceChainId": 11155111 }` → `{ "id": "string" }`. Starts: wait for Sepolia receipt → sync root to Amoy → build proof.
- `GET /api/requests/:id` → `{ "id": "string", "steps": Step[] }`
- `POST /api/requests/:id/verify` body `{ "tamper": boolean }` → 200. Submits `Verifier.verify` on Amoy. If `tamper` is true, flip a byte in the proof so the call reverts.

`Step = { key: "sent"|"root_synced"|"proof_built"|"verified", label: string, state: "pending"|"active"|"done"|"failed", detail?: string, txHash?: string }`
Always return all four steps in this order. On a revert set `verified.state="failed"` and `detail` to a plain-language reason. On success set `verified.txHash` to the Amoy tx hash.
