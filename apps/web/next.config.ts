import type { NextConfig } from "next";

// The root .env is provided explicitly by the npm scripts
// (`node --env-file-if-exists=../../.env`). No framework env discovery magic.
const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@skills-hub/core"],
  serverExternalPackages: ["@prisma/client", "prisma", "undici"],
  poweredByHeader: false,
  async headers() {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://127.0.0.1:4780";
    const dev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      // React's dev-only stack reconstruction uses eval; production does not.
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      `connect-src 'self' ${agentUrl} ws://localhost:3000 ws://127.0.0.1:3000`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
