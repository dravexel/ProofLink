import type { Config } from "tailwindcss";
export default { content:["./app/**/*.tsx"], theme:{extend:{colors:{mist:"#E8EEF2",ink:"#14213D",rule:"#9FB3C8",ok:"#0F766E",bad:"#B42318"},fontFamily:{display:["var(--f-display)"],mono:["var(--f-mono)"]}}}, plugins:[] } satisfies Config;
