import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pin tracing root to this app (a stray lockfile exists higher up)
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
