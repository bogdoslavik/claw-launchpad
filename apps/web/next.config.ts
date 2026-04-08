import type { NextConfig } from "next";

const internalApiUrl = process.env.LAUNCHPAD_INTERNAL_API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/api/:path*`,
      },
      {
        source: "/healthz",
        destination: `${internalApiUrl}/healthz`,
      },
      {
        source: "/readyz",
        destination: `${internalApiUrl}/readyz`,
      },
    ];
  },
};

export default nextConfig;
