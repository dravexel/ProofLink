export type StepState="pending"|"active"|"done"|"failed";
export type Step={key:"sent"|"root_synced"|"proof_built"|"verified";label:string;state:StepState;detail?:string;txHash?:string};
export type Req={id:string;steps:Step[]};
export const MOCK=process.env.NEXT_PUBLIC_MOCK==="1";
const API=process.env.NEXT_PUBLIC_API_URL??"http://localhost:4000";
const L:Record<Step["key"],string>={sent:"Sent on Sepolia",root_synced:"Chain state root arrives on Amoy",proof_built:"Merkle proof built",verified:"Checked by the Amoy verifier contract"};
const mem=new Map<string,{t0:number;v?:"ok"|"bad";h:string}>();
const hex=()=>"0x"+Array.from({length:64},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
function mock(id:string):Req{const r=mem.get(id)!,s=(Date.now()-r.t0)/1000;
 const st=(a:number,b:number):StepState=>s>=b?"done":s>=a?"active":"pending";
 const steps:Step[]=([{key:"sent",state:"done",txHash:r.h},{key:"root_synced",state:st(0,2.5)},{key:"proof_built",state:s<2.5?"pending":st(2.5,5)},
  {key:"verified",state:r.v==="ok"?"done":r.v==="bad"?"failed":"pending",detail:r.v==="bad"?"Verifier reverted with InvalidProof(). The proof does not match the trusted state root.":undefined,txHash:r.v==="ok"?hex():undefined}] as Omit<Step,"label">[]).map(x=>({...x,label:L[x.key]}));
 return {id,steps}}
export async function createRequest(txHash:string):Promise<string>{
 if(MOCK){const id=hex().slice(0,10);mem.set(id,{t0:Date.now(),h:txHash});return id}
 const r=await fetch(`${API}/api/requests`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({txHash,sourceChainId:11155111})});
 return (await r.json()).id}
export async function getRequest(id:string):Promise<Req>{
 if(MOCK)return mock(id);return (await fetch(`${API}/api/requests/${id}`)).json()}
export async function verify(id:string,tamper:boolean):Promise<void>{
 if(MOCK){mem.get(id)!.v=tamper?"bad":"ok";return}
 await fetch(`${API}/api/requests/${id}/verify`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tamper})})}
