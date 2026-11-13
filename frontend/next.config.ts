import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const conIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Las fuentes de las tarjetas se leen con fs: sin esto Vercel no las copia a la función.
  outputFileTracingIncludes: { "/api/og": ["./src/assets/fonts/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default conIntl(nextConfig);
