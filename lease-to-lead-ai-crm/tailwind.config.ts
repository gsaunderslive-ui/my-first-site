import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        slate: "#0f172a",
        mist: "#f1f5f9",
        mint: "#14b8a6",
        amber: "#f59e0b",
        coral: "#f97316"
      },
      boxShadow: {
        soft: "0 20px 45px -20px rgba(15, 23, 42, 0.35)"
      },
      keyframes: {
        riseIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        riseIn: "riseIn 450ms ease-out"
      }
    }
  },
  plugins: []
};

export default config;
