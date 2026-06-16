/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral surfaces & borders — a light scale (white cards on soft gray).
        ink: {
          950: "#f4f6f9", // page background
          900: "#ffffff", // cards / inputs
          850: "#f1f4f8", // menus / subtle raised surfaces
          800: "#e9edf3", // hover surfaces
          700: "#dde3ec", // borders
          600: "#c7d0dd", // strong borders / hover borders
        },
        // Primary brand & calls-to-action — warm yellow (use dark text on it).
        primary: {
          DEFAULT: "#f5b50a",
          hover: "#e0a300",
          soft: "#fdf3d6",
        },
        // Secondary accent — blue for links, focus rings, spinners, selection.
        accent: {
          DEFAULT: "#2563eb",
          hover: "#1d4ed8",
          soft: "#e7efff",
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
