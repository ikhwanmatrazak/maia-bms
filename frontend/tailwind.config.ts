import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/react/node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            primary: {
              50: "#eeeef9",
              100: "#d3d3f0",
              200: "#a7a7e0",
              300: "#7b7bd0",
              400: "#5454c3",
              500: "#2e2e8f",
              600: "#252579",
              700: "#1d1d61",
              800: "#15154a",
              900: "#0e0e32",
              DEFAULT: "#1a1a2e",
              foreground: "#ffffff",
            },
            focus: "#1a1a2e",
          },
        },
      },
    }),
  ],
};
export default config;
