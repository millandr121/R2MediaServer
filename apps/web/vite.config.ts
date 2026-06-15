import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev we proxy /api to the local Worker (wrangler dev on :8787) so the
// browser sees a single same-origin host — refresh cookies stay first-party.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
