import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Export async config to safely use dynamic imports without top-level await
export default defineConfig(async ({ mode }) => {
  const isDev = mode !== "production";

  const plugins: PluginOption[] = [react() as PluginOption];

  // Replit-only dev plugins should not run in production/CI
  if (isDev) {
    plugins.push(runtimeErrorOverlay() as PluginOption);
    if (process.env.REPL_ID !== undefined) {
      const replit = await import("@replit/vite-plugin-cartographer");
      plugins.push(replit.cartographer() as PluginOption);
    }
  }

  return {
    base: "./",
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    root: path.resolve(__dirname, "client"),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
  };
});
