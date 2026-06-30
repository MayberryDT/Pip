import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#2E2D2A",
        paper: "#F8F3EA",
        porcelain: "#FFFDF8",
        line: "#E8DDD1",
        taupe: "#A79B91",
        moss: "#607461",
        river: "#7B8F96",
        coral: "#B96A58",
        gold: "#B49769",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(60, 50, 40, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
