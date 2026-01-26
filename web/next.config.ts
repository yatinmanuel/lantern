import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only use static export for production builds (not in dev mode)
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  distDir: 'out',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  swcMinify: true,
};

export default nextConfig;
