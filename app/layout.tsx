import "./globals.css";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
const d=Bricolage_Grotesque({subsets:["latin"],variable:"--f-display"});
const m=IBM_Plex_Mono({subsets:["latin"],weight:["400","500"],variable:"--f-mono"});
export const metadata={title:"ProofLink",description:"Verify a transaction from one chain on another, with no bridge operator to trust."};
export default function L({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${d.variable} ${m.variable} font-display`}>{children}</body></html>}
