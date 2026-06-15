/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0b0f",
          900: "#0f1117",
          850: "#151823",
          800: "#1b1f2e",
          700: "#262b3d",
          600: "#363c52",
        },
        accent: {
          DEFAULT: "#5b8cff",
          hover: "#4b7bf5",
          soft: "#1d2740",
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
