import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: [
      // Especificadores Deno (npm:) resolvidos para node_modules nos testes.
      { find: /^npm:@modelcontextprotocol\/sdk@[\d.]+\//, replacement: "@modelcontextprotocol/sdk/" },
      { find: /^npm:zod@[\d.]+$/, replacement: "zod" },
      { find: /^npm:@supabase\/supabase-js@[\d.]+$/, replacement: "@supabase/supabase-js" },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
  },
});
