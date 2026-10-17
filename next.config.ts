import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  experimental: {
    // Needed for a 404 page because each language has its own root layout.
    globalNotFound: true,
  },
  turbopack: {
    resolveAlias: {
      // qpdf-wasm's Emscripten glue requires these, but only runs that code under Node.
      fs: { browser: "./src/lib/empty-module.ts" },
      path: { browser: "./src/lib/empty-module.ts" },
    },
  },
};

export default nextConfig;
