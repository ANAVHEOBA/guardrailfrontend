import { defineConfig, loadEnv } from "vite";
import { nitroV2Plugin as nitro } from "@solidjs/vite-plugin-nitro-2";

import { solidStart } from "@solidjs/start/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_API_PROXY_TARGET?.trim();

  return {
    plugins: [
      solidStart(),
      nitro({
        preset: process.env.VERCEL ? "vercel" : "node-server",
      }),
    ],
    server: proxyTarget
      ? {
          proxy: {
            "/api": {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: path => path.replace(/^\/api/, ""),
            },
          },
        }
      : undefined,
  };
});
