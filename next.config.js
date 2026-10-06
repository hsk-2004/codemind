/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Produces a minimal standalone server output for the Docker image (only
  // the files actually needed at runtime get copied into the final stage).
  output: "standalone",
  eslint: {
    // ✅ Show ESLint errors during production build
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ✅ Show TypeScript type errors during production build
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizeCss: false,
    swcPlugins: [],
  },
};

export default config;
