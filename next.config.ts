import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    resolveAlias: {
      // qpdf-wasm's Emscripten glue requires these, but only runs that code under Node.
      fs: { browser: "./src/lib/empty-module.ts" },
      path: { browser: "./src/lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
