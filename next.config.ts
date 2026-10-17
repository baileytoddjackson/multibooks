import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Book content is read from disk on the server; make sure Vercel ships it with the functions.
  outputFileTracingIncludes: { "/**": ["./content/books/**/*.json"] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
