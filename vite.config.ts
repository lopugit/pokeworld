import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { workflow } from "workflow/vite";

const publicDir = new URL("./public", import.meta.url).pathname;

export default defineConfig({
  plugins: [
    nitro({
      preset: process.env.NITRO_PRESET,
      serverDir: "./server",
      publicAssets: [{ dir: publicDir, baseURL: "/", maxAge: 0 }],
    }),
    workflow({
      dirs: ["./workflows"],
      runtime: "nodejs24.x",
      typescriptPlugin: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@server": new URL("./server", import.meta.url).pathname,
    },
  },
  server: {
    allowedHosts: ["lopus-macbook-pro-2.tail9606f9.ts.net"],
    host: "127.0.0.1",
    port: 3847,
    strictPort: true,
  },
});
