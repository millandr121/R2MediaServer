/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm, sandy "beach" surfaces — cream page, white cards.
        ink: {
          950: "#fdf4e6", // page background (warm cream)
          900: "#ffffff", // cards / inputs
          850: "#faf1e0", // menus / raised surfaces
          800: "#f4e9d4", // hover surfaces (sand)
          700: "#e9dcc2", // borders
          600: "#d8c6a2", // strong borders / hover borders
        },
        // Sunshine yellow — primary brand & CTAs (use dark text on it).
        primary: {
          DEFAULT: "#ffc233",
          hover: "#f2ac10",
          soft: "#fff0c7",
        },
        // Ocean teal/cyan — links, focus rings, selection, spinners.
        accent: {
          DEFAULT: "#06b6d4",
          hover: "#0699b4",
          soft: "#ccf2f8",
        },
        // Sunset coral — playful pop (brand gradient, highlights).
        coral: {
          DEFAULT: "#ff6f5e",
          hover: "#f64e3b",
          soft: "#ffe1db",
        },
        // Warm-neutral text (driftwood) to match the sandy surfaces.
        slate: {
          400: "#a8a29e",
          500: "#867f79",
          600: "#6b635d",
          700: "#514a44",
          800: "#3a342f",
          900: "#272320",
        },
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
      },
    },
  },
  plugins: [],
};
