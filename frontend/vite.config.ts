import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  envDir: process.env.AOA_ENV_DIR,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": process.env.AOA_API_TARGET || "http://localhost:8000",
    },
  },
});