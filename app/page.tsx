"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  keccak256,
  toHex,
  parseAbi,
} from "viem";
import { sepolia } from "viem/chains";
import { MOCK, Req, Step, createRequest, getRequest, verify } from "@/lib/api";

import BlurText from "@/components/BlurText";
import ShinyText from "@/components/ShinyText";
import SpotlightCard from "@/components/SpotlightCard";
import StarBorder from "@/components/StarBorder";
import CountUp from "@/components/CountUp";

// Dynamic imports with ssr: false for components using canvas
const Squares = dynamic(() => import("@/components/Squares"), { ssr: false });
const ClickSpark = dynamic(() => import("@/components/ClickSpark"), {
  ssr: false,
});

const EMITTER = (process.env.NEXT_PUBLIC_EMITTER_ADDRESS ??
  "0x0") as `0x${string}`;
const abi = parseAbi(["function send(bytes32 payloadHash)"]);
const short = (h?: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");

function Track({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.state === "done").length;
  const failed = steps.some((s) => s.state === "failed");

  return (
    <ol className="relative ml-4 border-l-2 border-rule/50 pl-6 sm:pl-8 space-y-6">
      {/* Vertical animated progress fill */}
      <span
        aria-hidden
        className={`absolute -left-[2px] top-0 w-[2px] transition-all duration-700 ease-out ${
          failed ? "bg-bad" : "bg-ok"
        }`}
        style={{ height: `${(done / steps.length) * 100}%` }}
      />

      {steps.map((s, idx) => {
        const dotColor =
          s.state === "done"
            ? "bg-ok border-ok shadow-[0_0_8px_rgba(15,118,110,0.5)]"
            : s.state === "failed"
            ? "bg-bad border-bad shadow-[0_0_8px_rgba(180,35,24,0.5)]"
            : s.state === "active"
            ? "border-ink animate-pulse bg-mist ring-4 ring-ok/20"
            : "border-rule bg-mist";

        const badgeLabel =
          s.state === "done"
            ? "Verified"
            : s.state === "failed"
            ? "Reverted"
            : s.state === "active"
            ? "Processing"
            : "Pending";

        const badgeStyle =
          s.state === "done"
            ? "bg-ok/10 text-ok border-ok/30"
            : s.state === "failed"
            ? "bg-bad/10 text-bad border-bad/30"
            : s.state === "active"
            ? "bg-ink/10 text-ink border-ink/30 animate-pulse"
            : "bg-rule/15 text-ink/40 border-rule/30";

        return (
          <li key={s.key} className="relative">
            {/* Step node dot on progress line */}
            <span
              className={`absolute -left-[33px] sm:-left-[41px] top-5 h-4 w-4 rounded-full border-2 transition-colors duration-300 ${dotColor}`}
            />

            {/* SpotlightCard wrapping each pipeline step */}
            <SpotlightCard
              spotlightColor="rgba(15, 118, 110, 0.15)"
              className="p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-ink/60">
                  Step {idx + 1} of 4
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyle}`}
                >
                  {badgeLabel}
                </span>
              </div>

              <p
                className={`mt-2 text-base sm:text-lg font-bold leading-snug ${
                  s.state === "pending" ? "text-ink/45" : "text-ink"
                }`}
              >
                {s.label}
              </p>

              {s.detail && (
                <div
                  role="alert"
                  className="mt-2.5 rounded-md border border-bad/30 bg-bad/5 p-3 text-sm text-bad"
                >
                  <p className="font-medium">{s.detail}</p>
                </div>
              )}

              {s.txHash && (
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink/50 uppercase">
                    Tx:
                  </span>
                  <span className="font-mono text-xs text-ink/80 bg-rule/20 px-2 py-0.5 rounded select-all break-all">
                    {short(s.txHash)}
                  </span>
                </div>
              )}
            </SpotlightCard>
          </li>
        );
      })}
    </ol>
  );
}

export default function Page() {
  const [acct, setAcct] = useState<string>();
  const [msg, setMsg] = useState("unlock-demo-nft");
  const [id, setId] = useState<string>();
  const [req, setReq] = useState<Req>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!id) return;
    const tick = async () => setReq(await getRequest(id));
    tick();
    timer.current = setInterval(tick, 1500);
    return () => clearInterval(timer.current);
  }, [id]);

  async function connect() {
    try {
      const eth = (window as any).ethereum;
      if (!eth)
        throw new Error(
          "No wallet found. Install MetaMask, or set NEXT_PUBLIC_MOCK=1."
        );
      const [a] = await eth.request({ method: "eth_requestAccounts" });
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
      setAcct(a);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function send() {
    setErr(undefined);
    setBusy(true);
    setReq(undefined);
    setId(undefined);
    try {
      let tx: string;
      if (MOCK) tx = "0x" + "ab12".repeat(16);
      else {
        const w = createWalletClient({
          chain: sepolia,
          transport: custom((window as any).ethereum),
        });
        tx = await w.sendTransaction({
          account: acct as `0x${string}`,
          to: EMITTER,
          data: encodeFunctionData({
            abi,
            functionName: "send",
            args: [keccak256(toHex(msg))],
          }),
        });
      }
      setId(await createRequest(tx));
    } catch (e: any) {
      setErr(e.shortMessage ?? e.message);
    }
    setBusy(false);
  }

  const ready =
    req?.steps.find((s) => s.key === "proof_built")?.state === "done" &&
    req.steps.find((s) => s.key === "verified")?.state !== "done";
  const canSend = (MOCK || acct) && msg.trim() && !busy;

  const verifiedStep = req?.steps.find((s) => s.key === "verified");
  const isVerifiedSuccess = verifiedStep?.state === "done";

  return (
    <div className="relative min-h-screen bg-mist text-ink selection:bg-ok/20 selection:text-ink font-display overflow-x-hidden">
      {/* 1. Page Background: reactbits Squares in low-contrast ink-on-mist */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      >
        <Squares
          direction="diagonal"
          speed={0.4}
          squareSize={44}
          borderColor="rgba(20, 33, 61, 0.05)"
          hoverFillColor="rgba(15, 118, 110, 0.04)"
        />
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Console Navigation Bar */}
        <header className="border-b border-rule/40 bg-mist/80 backdrop-blur-md sticky top-0 z-40">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-mist font-mono font-bold text-base shadow-sm">
                P
              </span>
              <div>
                <span className="font-extrabold text-xl tracking-tight text-ink">
                  ProofLink
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs font-mono uppercase tracking-wider text-ink/50 border-l border-rule/60 pl-2">
                  Cryptographic Verification Console
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* HONESTY: Visible but tasteful badge whenever MOCK mode is active */}
              {MOCK && (
                <div
                  title="Simulated mock mode is active"
                  className="inline-flex items-center gap-2 rounded-full border border-rule/60 bg-white/70 px-3 py-1 text-xs font-semibold text-ink/80 shadow-xs backdrop-blur-sm"
                >
                  <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
                  <span>Demo mode: simulated chains</span>
                </div>
              )}

              <a
                href="https://github.com/dravexel/TeamGenesis_RohanTarke"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-rule/60 bg-white/60 px-3 py-1.5 text-xs font-mono font-medium text-ink/80 hover:bg-white hover:text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ok"
              >
                <span>GitHub</span>
                <span aria-hidden>↗</span>
              </a>
            </div>
          </div>
        </header>

        {/* Hero & Interactive Demo Section */}
        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14 w-full flex-1">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] items-start">
            {/* Left Column: Hero & Controls */}
            <section className="space-y-8">
              <div>
                {/* 2. Hero Heading with BlurText and ShinyText */}
                <h1 className="text-3xl sm:text-5xl font-extrabold leading-[1.1] tracking-tight">
                  <BlurText
                    text="Prove it happened on"
                    delay={80}
                    animateBy="words"
                    direction="top"
                    className="mr-2"
                  />
                  <ShinyText
                    text="Sepolia"
                    speed={3.5}
                    className="text-ok font-extrabold"
                  />
                  .<br />
                  <BlurText
                    text="Use it on"
                    delay={80}
                    animateBy="words"
                    direction="top"
                    className="mr-2 mt-1 sm:mt-2"
                  />
                  <ShinyText
                    text="Amoy"
                    speed={3.5}
                    className="text-ink font-extrabold underline decoration-ok/40 underline-offset-4"
                  />
                  .
                </h1>

                <p className="mt-5 max-w-lg text-base sm:text-lg text-ink/80 leading-relaxed">
                  No bridge operator, no multisig. Amoy checks a cryptographic
                  Merkle-Patricia proof against Ethereum's own state root.
                </p>
              </div>

              {/* Action Controls Card */}
              <div className="rounded-2xl border border-rule/70 bg-white/70 p-6 sm:p-7 shadow-sm backdrop-blur-md space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-rule/40">
                  <span className="font-mono text-xs uppercase tracking-wider text-ink/60 font-medium">
                    1. Initiate Proof Request
                  </span>
                  {acct && (
                    <span className="font-mono text-xs font-medium text-ok bg-ok/10 border border-ok/20 px-2 py-0.5 rounded">
                      {short(acct)}
                    </span>
                  )}
                </div>

                {!MOCK && !acct && (
                  <button
                    onClick={connect}
                    className="w-full rounded-lg bg-ink px-5 py-3 font-semibold text-mist hover:bg-ink/90 active:scale-[0.99] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok shadow-sm"
                  >
                    Connect wallet
                  </button>
                )}

                <label className="block text-sm font-bold text-ink">
                  Message to prove
                  <div className="mt-1.5 relative">
                    <input
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      placeholder="e.g. unlock-demo-nft"
                      className="w-full rounded-lg border-2 border-rule/70 bg-white/80 px-3.5 py-2.5 font-mono text-sm text-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ok shadow-inner"
                    />
                    <span className="absolute right-3 top-2.5 font-mono text-[11px] text-ink/40 pointer-events-none">
                      payload
                    </span>
                  </div>
                </label>

                {/* 4. Main Send Button wrapped in StarBorder */}
                <StarBorder
                  as="button"
                  disabled={!canSend}
                  onClick={send}
                  color="#0F766E"
                  speed="4s"
                  className="w-full shadow-sm"
                >
                  <span className="w-full rounded-[6px] bg-ok px-5 py-3 font-semibold text-white transition-colors hover:bg-ok/95">
                    {busy ? "Sending…" : "Send on Sepolia"}
                  </span>
                </StarBorder>

                {err && (
                  <div
                    role="alert"
                    className="rounded-lg border border-bad/30 bg-bad/5 p-3 text-sm text-bad font-medium"
                  >
                    {err}
                  </div>
                )}

                {MOCK && (
                  <div className="flex items-center gap-2 pt-2 text-xs text-ink/60 border-t border-rule/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                    <span>
                      Simulated test pipeline active: no wallet or backend
                      required.
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* Right Column: 4-Step Pipeline Verification Track */}
            <section
              aria-live="polite"
              className="rounded-2xl border border-rule/70 bg-white/50 p-6 sm:p-8 backdrop-blur-md shadow-sm"
            >
              <div className="flex items-center justify-between pb-4 border-b border-rule/40 mb-6">
                <div>
                  <h2 className="font-bold text-lg text-ink">
                    Verification Pipeline
                  </h2>
                  <p className="text-xs text-ink/60 font-mono">
                    Ethereum Sepolia ➔ Polygon Amoy
                  </p>
                </div>
                {req && (
                  <span className="font-mono text-xs text-ink/50 bg-rule/20 px-2 py-1 rounded">
                    ID: {req.id}
                  </span>
                )}
              </div>

              {!req ? (
                <div className="py-16 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rule/20 text-ink/40 font-mono text-lg mb-3">
                    04
                  </div>
                  <p className="text-ink/60 max-w-xs mx-auto text-sm leading-relaxed">
                    Send a message to watch each cryptographic step of the
                    Merkle-Patricia proof resolve in real-time.
                  </p>
                </div>
              ) : (
                <>
                  {/* 3. Pipeline Steps wrapped in SpotlightCard */}
                  <Track steps={req.steps} />

                  {/* 4. Action Buttons with StarBorder and 6. ClickSpark */}
                  <div className="mt-8 ml-4 pl-6 sm:pl-8 flex flex-wrap items-center gap-3.5 pt-4 border-t border-rule/40">
                    <ClickSpark
                      trigger={isVerifiedSuccess}
                      sparkColor={["#0F766E", "#14213D", "#9FB3C8"]}
                      sparkCount={14}
                      sparkRadius={32}
                    >
                      <StarBorder
                        as="button"
                        disabled={!ready}
                        onClick={() => verify(req.id, false)}
                        color="#0F766E"
                        speed="3.5s"
                        className={`shadow-sm ${
                          isVerifiedSuccess ? "ring-2 ring-ok ring-offset-2" : ""
                        }`}
                      >
                        <span className="w-full rounded-[6px] bg-ink px-4 py-2.5 font-semibold text-mist hover:bg-ink/90 transition-colors">
                          Verify on Amoy
                        </span>
                      </StarBorder>
                    </ClickSpark>

                    <button
                      disabled={!ready}
                      onClick={() => verify(req.id, true)}
                      className="rounded-lg border-2 border-bad px-4 py-2 font-semibold text-bad hover:bg-bad/5 active:scale-[0.99] transition-all disabled:opacity-30 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
                    >
                      Try a tampered proof
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>

          {/* 5. Stats Strip below hero using CountUp */}
          <section className="mt-16 sm:mt-20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {/* Stat 1 */}
              <div className="rounded-xl border border-rule/60 bg-white/70 p-5 sm:p-6 backdrop-blur-md shadow-xs">
                <div className="flex items-baseline gap-2">
                  <CountUp
                    from={3}
                    to={0}
                    duration={1.2}
                    className="font-mono text-4xl sm:text-5xl font-extrabold text-ink tracking-tight"
                  />
                  <span className="font-mono text-xs uppercase text-ink/50 font-medium">
                    Entity Trust
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-ink">
                  Trusted relayers or multisigs
                </h3>
                <p className="mt-1 text-xs text-ink/70 leading-relaxed">
                  Zero trusted intermediaries. Security reduces strictly to EVM
                  state cryptography.
                </p>
              </div>

              {/* Stat 2 */}
              <div className="rounded-xl border border-rule/60 bg-white/70 p-5 sm:p-6 backdrop-blur-md shadow-xs">
                <div className="flex items-baseline gap-2">
                  <CountUp
                    from={0}
                    to={10}
                    duration={1.5}
                    className="font-mono text-4xl sm:text-5xl font-extrabold text-ok tracking-tight"
                  />
                  <span className="font-mono text-xs uppercase text-ok/80 font-medium">
                    Passing
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-ink">
                  Contract tests passing
                </h3>
                <p className="mt-1 text-xs text-ink/70 leading-relaxed">
                  Rigorous Foundry test suite verifying root sync, proof
                  encoding, and tamper rejection.
                </p>
              </div>

              {/* Stat 3 */}
              <div className="rounded-xl border border-rule/60 bg-white/70 p-5 sm:p-6 backdrop-blur-md shadow-xs">
                <div className="flex items-baseline gap-2">
                  <CountUp
                    from={0}
                    to={15}
                    duration={1.8}
                    className="font-mono text-4xl sm:text-5xl font-extrabold text-ink tracking-tight"
                  />
                  <span className="font-mono text-xs uppercase text-ink/50 font-medium">
                    Nodes
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-ink">
                  Merkle-Patricia nodes verified
                </h3>
                <p className="mt-1 text-xs text-ink/70 leading-relaxed">
                  Real Sepolia proof test: 9 account trie nodes + 6 storage trie
                  nodes.
                </p>
              </div>
            </div>
          </section>

          {/* NEW SECTION 1: How it works (4 SpotlightCards) */}
          <section className="mt-20 sm:mt-24">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-rule/50">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-ok font-bold">
                  Architecture
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight mt-1">
                  How it works
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-ink/70 font-mono">
                Ethereum Sepolia (11155111) ➔ Polygon Amoy (80002)
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1 */}
              <SpotlightCard
                spotlightColor="rgba(15, 118, 110, 0.12)"
                className="p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-mist font-mono text-xs font-bold">
                      01
                    </span>
                    <span className="font-mono text-[11px] text-ink/50 uppercase">
                      Sepolia
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-ink">
                    Send on source chain
                  </h3>
                  <p className="mt-2 text-sm text-ink/75 leading-relaxed">
                    User invokes <code className="rounded bg-rule/25 px-1 py-0.5 font-mono text-xs">send(payloadHash)</code> on the Sepolia Emitter contract, recording the payload in state.
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-rule/30 font-mono text-[11px] text-ink/50">
                  Emits <span className="text-ink">Sent()</span> event
                </div>
              </SpotlightCard>

              {/* Card 2 */}
              <SpotlightCard
                spotlightColor="rgba(15, 118, 110, 0.12)"
                className="p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-mist font-mono text-xs font-bold">
                      02
                    </span>
                    <span className="font-mono text-[11px] text-ink/50 uppercase">
                      Amoy
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-ink">
                    Sync trusted state root
                  </h3>
                  <p className="mt-2 text-sm text-ink/75 leading-relaxed">
                    The block's canonical state root is delivered to the Amoy LightClient contract. Only consensus-valid roots are accepted.
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-rule/30 font-mono text-[11px] text-ink/50">
                  Stores <span className="text-ink">stateRoot(block)</span>
                </div>
              </SpotlightCard>

              {/* Card 3 */}
              <SpotlightCard
                spotlightColor="rgba(15, 118, 110, 0.12)"
                className="p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-mist font-mono text-xs font-bold">
                      03
                    </span>
                    <span className="font-mono text-[11px] text-ink/50 uppercase">
                      Off-Chain
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-ink">
                    Build Merkle-Patricia proof
                  </h3>
                  <p className="mt-2 text-sm text-ink/75 leading-relaxed">
                    Fetches RLP-encoded trie branches directly from Ethereum archive RPC: 9 account nodes and 6 storage nodes.
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-rule/30 font-mono text-[11px] text-ink/50">
                  Untrusted relayer input
                </div>
              </SpotlightCard>

              {/* Card 4 */}
              <SpotlightCard
                spotlightColor="rgba(15, 118, 110, 0.12)"
                className="p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok text-white font-mono text-xs font-bold">
                      04
                    </span>
                    <span className="font-mono text-[11px] text-ok uppercase font-semibold">
                      Amoy Verifier
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-ink">
                    Verify on destination chain
                  </h3>
                  <p className="mt-2 text-sm text-ink/75 leading-relaxed">
                    Amoy Verifier executes cryptographic trie traversal against the trusted state root. Reverts with <code className="rounded bg-bad/10 text-bad px-1 py-0.5 font-mono text-xs">InvalidProof()</code> if tampered.
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-rule/30 font-mono text-[11px] text-ok font-semibold">
                  100% Math-based
                </div>
              </SpotlightCard>
            </div>
          </section>

          {/* NEW SECTION 2: Why not a bridge? (Comparison Table) */}
          <section className="mt-20 sm:mt-24">
            <div className="pb-4 border-b border-rule/50">
              <span className="font-mono text-xs uppercase tracking-wider text-ok font-bold">
                Comparison
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight mt-1">
                Why not a bridge?
              </h2>
              <p className="mt-2 text-sm text-ink/75 max-w-xl leading-relaxed">
                Traditional cross-chain bridges rely on trusted third parties.
                ProofLink replaces human authority with deterministic EVM
                verification.
              </p>
            </div>

            <div className="mt-8 overflow-x-auto rounded-xl border border-rule/70 bg-white/80 backdrop-blur-md shadow-xs">
              <table className="w-full min-w-[560px] text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-rule/50 bg-rule/10">
                    <th className="py-4 px-5 font-mono text-xs uppercase tracking-wider text-ink/70 w-1/4">
                      Dimension
                    </th>
                    <th className="py-4 px-5 font-mono text-xs uppercase tracking-wider text-bad/90 w-[37.5%]">
                      Traditional Bridge
                    </th>
                    <th className="py-4 px-5 font-mono text-xs uppercase tracking-wider text-ok font-bold w-[37.5%]">
                      ProofLink
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule/30 font-sans">
                  {/* Row 1 */}
                  <tr className="hover:bg-rule/5 transition-colors">
                    <td className="py-4 px-5 font-semibold text-ink">
                      Who you trust
                    </td>
                    <td className="py-4 px-5 text-ink/80">
                      A 3-of-5 or 5-of-9 multisig, centralized bridge operator,
                      or off-chain relayer committee.
                    </td>
                    <td className="py-4 px-5 font-medium text-ink bg-ok/5">
                      <span className="inline-flex items-center gap-1.5 text-ok font-semibold">
                        <span aria-hidden>✓</span> Ethereum consensus & math
                      </span>
                      <p className="text-xs text-ink/70 mt-0.5">
                        No human committee, no custodial keys.
                      </p>
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr className="hover:bg-rule/5 transition-colors">
                    <td className="py-4 px-5 font-semibold text-ink">
                      What a relayer can do
                    </td>
                    <td className="py-4 px-5 text-ink/80">
                      Sign arbitrary forged messages or steal locked funds if
                      their private keys are compromised.
                    </td>
                    <td className="py-4 px-5 font-medium text-ink bg-ok/5">
                      <span className="inline-flex items-center gap-1.5 text-ok font-semibold">
                        <span aria-hidden>✓</span> Only deliver raw proof bytes
                      </span>
                      <p className="text-xs text-ink/70 mt-0.5">
                        Any altered byte causes immediate on-chain revert with{" "}
                        <code className="font-mono text-xs text-bad">
                          InvalidProof()
                        </code>
                        .
                      </p>
                    </td>
                  </tr>

                  {/* Row 3 */}
                  <tr className="hover:bg-rule/5 transition-colors">
                    <td className="py-4 px-5 font-semibold text-ink">
                      Single point of failure
                    </td>
                    <td className="py-4 px-5 text-ink/80">
                      Compromised relayer keys, validator collusions, or
                      censorship by the relayer network.
                    </td>
                    <td className="py-4 px-5 font-medium text-ink bg-ok/5">
                      <span className="inline-flex items-center gap-1.5 text-ok font-semibold">
                        <span aria-hidden>✓</span> None
                      </span>
                      <p className="text-xs text-ink/70 mt-0.5">
                        Permissionless: anyone (including the end-user) can
                        submit the proof to the contract.
                      </p>
                    </td>
                  </tr>

                  {/* Row 4 */}
                  <tr className="hover:bg-rule/5 transition-colors">
                    <td className="py-4 px-5 font-semibold text-ink">
                      Verification
                    </td>
                    <td className="py-4 px-5 text-ink/80">
                      Off-chain attestations or simple multi-signature ECDSA
                      checks.
                    </td>
                    <td className="py-4 px-5 font-medium text-ink bg-ok/5">
                      <span className="inline-flex items-center gap-1.5 text-ok font-semibold">
                        <span aria-hidden>✓</span> Native Merkle-Patricia Trie
                      </span>
                      <p className="text-xs text-ink/70 mt-0.5">
                        Full cryptographic inclusion proof checked against the
                        canonical Ethereum state root.
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="mt-20 border-t border-rule/50 bg-mist/90 backdrop-blur-md py-8">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-ink text-mist font-mono text-xs font-bold">
                P
              </span>
              <span className="font-bold text-ink tracking-tight">ProofLink</span>
              <span className="text-xs font-mono text-ink/50 border-l border-rule/60 pl-3">
                Prototype. Not audited.
              </span>
            </div>

            <div className="flex items-center gap-6 text-xs text-ink/70">
              <a
                href="https://github.com/dravexel/TeamGenesis_RohanTarke"
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-ok transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ok"
              >
                github.com/dravexel/TeamGenesis_RohanTarke ↗
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
