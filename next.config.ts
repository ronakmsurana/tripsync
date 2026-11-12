import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / WASM packages used by the local embedding model must not be bundled.
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
