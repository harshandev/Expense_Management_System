import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["unpdf", "pdfjs-dist", "xlsx"],
  turbopack: {},
};

export default nextConfig;
