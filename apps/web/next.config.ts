// Security headers per .claude/rules/security.md §SECURE PRODUCTION DEFAULTS + Turnstile CSP requirements.
// Tighten script-src 'unsafe-inline'/'unsafe-eval' to nonces in production hardening pass.

import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(), payment=(self), display-capture=(self)",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com wss: ws:",
      "frame-src 'self' https://challenges.cloudflare.com",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: [
    "@yelli/ui",
    "@yelli/shared",
    "@yelli/api-client",
    "@yelli/db",
    "@yelli/storage",
  ],
  // isomorphic-dompurify → jsdom does fs.readFileSync(__dirname + "../../browser/default-stylesheet.css")
  // at module load. Webpack bundles jsdom but flattens directory structure, so
  // the relative read path breaks during page-data collection. Keep jsdom out
  // of the bundle and let Node resolve it at runtime from node_modules.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom"],
  experimental: {
    serverActions: {
      allowedOrigins: [],
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
