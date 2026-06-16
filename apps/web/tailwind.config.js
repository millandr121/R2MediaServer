/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Clean, near-white surfaces — white cards on a faint off-white page.
        ink: {
          950: "#f7f8fa", // page background (faint off-white)
          900: "#ffffff", // cards / inputs
          850: "#f3f5f9", // menus / raised surfaces
          800: "#eceff4", // hover surfaces
          700: "#e2e6ee", // borders
          600: "#cdd3df", // strong borders / hover borders
        },
        // Inky "poster" line — outlines, hard shadows, strong marks.
        night: "#1c1917",
        // Sunny yellow — primary brand & CTAs (use dark text on it).
        primary: {
          DEFAULT: "#ffcb1f",
          hover: "#f2b400",
          soft: "#fff2c2",
        },
        // Electric blue — links, focus rings, selection, spinners.
        accent: {
          DEFAULT: "#2f6bff",
          hover: "#1f56e6",
          soft: "#e4ecff",
        },
        // Surf-poster accent set (used sparingly for pops + categories).
        pink: { DEFAULT: "#ff4d97", hover: "#f02d80", soft: "#ffe1ee" },
        lime: { DEFAULT: "#5fce4a", hover: "#49b836", soft: "#e7f8e2" },
        purple: { DEFAULT: "#9b5de5", hover: "#8344d6", soft: "#efe6fb" },
        orange: { DEFAULT: "#ff7a3d", hover: "#f0601f", soft: "#ffe8db" },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // Chunky rounded display for the logo + hero headings (surf-poster feel).
        display: ["Fredoka", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
