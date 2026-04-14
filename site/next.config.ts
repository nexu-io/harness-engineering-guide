import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Cloudflare Pages compatibility
  trailingSlash: true,
};

export default nextConfig;
