import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "pdfjs-dist"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    }
    // Prevent __dirname issues leaking into edge middleware bundle
    config.node = { __dirname: false, __filename: false };
    return config;
  },
};

export default nextConfig;
