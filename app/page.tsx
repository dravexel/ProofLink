"use client";
import { useEffect, useRef, useState } from "react";
import { createWalletClient, custom, encodeFunctionData, keccak256, toHex, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { MOCK, Req, Step, createRequest, getRequest, verify } from "@/lib/api";

const EMITTER=(process.env.NEXT_PUBLIC_EMITTER_ADDRESS??"0x0") as `0x${string}`;
const abi=parseAbi(["function send(bytes32 payloadHash)"]);
const short=(h?:string)=>h?`${h.slice(0,10)}…${h.slice(-6)}`:"";

function Track({steps}:{steps:Step[]}){
  const done=steps.filter(s=>s.state==="done").length, failed=steps.some(s=>s.state==="failed");
  return <ol className="relative ml-3 border-l-2 border-rule pl-8 space-y-8">
    <span aria-hidden className={`absolute -left-[2px] top-0 w-[2px] transition-all duration-700 ${failed?"bg-bad":"bg-ok"}`} style={{height:`${(done/steps.length)*100}%`}}/>
    {steps.map(s=>{const c=s.state==="done"?"bg-ok border-ok":s.state==="failed"?"bg-bad border-bad":s.state==="active"?"border-ink animate-pulse bg-mist":"border-rule bg-mist";
      return <li key={s.key} className="relative">
        <span className={`absolute -left-[41px] top-1 h-4 w-4 rounded-full border-2 ${c}`}/>
        <p className={`text-lg font-semibold ${s.state==="pending"?"text-rule":""}`}>{s.label}</p>
        {s.detail&&<p role="alert" className="mt-1 text-bad text-sm max-w-md">{s.detail}</p>}
        {s.txHash&&<p className="mt-1 font-mono text-xs text-ink/70">{short(s.txHash)}</p>}
      </li>})}
  </ol>}

export default function Page(){
  const [acct,setAcct]=useState<string>(); const [msg,setMsg]=useState("unlock-demo-nft");
  const [id,setId]=useState<string>(); const [req,setReq]=useState<Req>(); const [err,setErr]=useState<string>(); const [busy,setBusy]=useState(false);
  const timer=useRef<ReturnType<typeof setInterval>>();
  useEffect(()=>{if(!id)return;const tick=async()=>setReq(await getRequest(id));tick();timer.current=setInterval(tick,1500);return()=>clearInterval(timer.current)},[id]);

  async function connect(){try{const eth=(window as any).ethereum;if(!eth)throw new Error("No wallet found. Install MetaMask, or set NEXT_PUBLIC_MOCK=1.");
    const [a]=await eth.request({method:"eth_requestAccounts"});await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:"0xaa36a7"}]});setAcct(a)}catch(e:any){setErr(e.message)}}
  async function send(){setErr(undefined);setBusy(true);setReq(undefined);setId(undefined);
    try{let tx:string;
      if(MOCK)tx="0x"+"ab12".repeat(16);
      else{const w=createWalletClient({chain:sepolia,transport:custom((window as any).ethereum)});
        tx=await w.sendTransaction({account:acct as `0x${string}`,to:EMITTER,data:encodeFunctionData({abi,functionName:"send",args:[keccak256(toHex(msg))]})})}
      setId(await createRequest(tx))}catch(e:any){setErr(e.shortMessage??e.message)}setBusy(false)}
  const ready=req?.steps.find(s=>s.key==="proof_built")?.state==="done"&&req.steps.find(s=>s.key==="verified")?.state!=="done";
  const canSend=(MOCK||acct)&&msg.trim()&&!busy;

  return <main className="mx-auto max-w-5xl px-6 py-14 grid gap-14 md:grid-cols-[1fr_1.1fr]">
    <section>
      <h1 className="text-5xl font-extrabold leading-[1.05]">Prove it happened on Sepolia.<br/>Use it on Amoy.</h1>
      <p className="mt-5 max-w-md text-lg text-ink/80">No bridge operator, no multisig. Amoy checks a cryptographic proof against Ethereum's own state.</p>
      <div className="mt-10 space-y-4 max-w-md">
        {!MOCK&&!acct&&<button onClick={connect} className="w-full rounded-md bg-ink px-5 py-3 font-semibold text-mist focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok">Connect wallet</button>}
        {acct&&<p className="font-mono text-sm">Connected {short(acct)}</p>}
        <label className="block text-sm font-semibold">Message to prove
          <input value={msg} onChange={e=>setMsg(e.target.value)} className="mt-1 w-full rounded-md border-2 border-rule bg-white/60 px-3 py-2 font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ok"/></label>
        <button disabled={!canSend} onClick={send} className="w-full rounded-md bg-ok px-5 py-3 font-semibold text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">{busy?"Sending…":"Send on Sepolia"}</button>
        {err&&<p role="alert" className="text-bad text-sm">{err}</p>}
        {MOCK&&<p className="text-xs text-ink/60">Demo mode: no wallet or backend needed.</p>}
      </div>
    </section>
    <section aria-live="polite">
      {!req?<p className="mt-24 text-ink/60 max-w-xs">Send a message and each step of the proof will appear here as it completes.</p>:<>
        <Track steps={req.steps}/>
        <div className="mt-10 ml-3 pl-8 flex flex-wrap gap-3">
          <button disabled={!ready} onClick={()=>verify(req.id,false)} className="rounded-md bg-ink px-4 py-2 font-semibold text-mist disabled:opacity-30">Verify on Amoy</button>
          <button disabled={!ready} onClick={()=>verify(req.id,true)} className="rounded-md border-2 border-bad px-4 py-2 font-semibold text-bad disabled:opacity-30">Try a tampered proof</button>
        </div></>}
    </section>
  </main>}
