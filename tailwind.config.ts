import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.tsx", "./components/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        mist: "#E8EEF2",
        ink: "#14213D",
        rule: "#9FB3C8",
        ok: "#0F766E",
        bad: "#B42318",
      },
      fontFamily: {
        display: ["var(--f-display)"],
        mono: ["var(--f-mono)"],
      },
      keyframes: {
        "star-movement-top": {
          "0%": { transform: "translate(0%, 0%)", opacity: "1" },
          "50%": { transform: "translate(50%, 50%)", opacity: "0.5" },
          "100%": { transform: "translate(100%, 0%)", opacity: "1" },
        },
        "star-movement-bottom": {
          "0%": { transform: "translate(0%, 0%)", opacity: "1" },
          "50%": { transform: "translate(-50%, -50%)", opacity: "0.5" },
          "100%": { transform: "translate(-100%, 0%)", opacity: "1" },
        },
        shine: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "-100% 0" },
        },
      },
      animation: {
        "star-top": "star-movement-top linear infinite alternate",
        "star-bottom": "star-movement-bottom linear infinite alternate",
        shine: "shine 5s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
