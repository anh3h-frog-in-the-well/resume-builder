import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  logging: {
    // The dev server mirrors the browser console into the terminal. Set
    // NEXT_BROWSER_LOGS=off to silence it (the e2e tests do, because they
    // deliberately exercise error paths that log in the browser).
    browserToTerminal: process.env.NEXT_BROWSER_LOGS !== "off",
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
