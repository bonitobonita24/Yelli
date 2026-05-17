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
  //
  // socket.io (Phase 7 #10 — fixes regression introduced in #8e): the Phase 7
  // #8e instrumentation hook imports `socket.io` (server-side) which transitively
  // requires Node built-ins (http, crypto). Webpack tries to bundle it for the
  // edge/browser graph and fails on `Module not found: 'http'`. socket.io must
  // run from node_modules at runtime, identical to jsdom. Only the SERVER
  // `socket.io` package needs externalising — `socket.io-client` is browser-safe.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom", "socket.io"],
  experimental: {
    serverActions: {
      allowedOrigins: [],
    },
  },
  // Phase 7 #10 — Edge-runtime stub for the Node-only instrumentation chain
  // (fixes regression introduced in Phase 7 #8e, never caught because that
  // ticket validated tests/typecheck/lint but not `pnpm build`).
  //
  // instrumentation.ts dynamically imports @/server/socket/server (statically
  // imports `socket.io`) and Node's `http`. The runtime gate
  // `NEXT_RUNTIME !== "nodejs"` early-returns on Edge, but webpack still
  // STATICALLY BUNDLES every reachable import for both the Node AND Edge
  // graphs in case the gate is bypassed. The Edge graph has no `http`/
  // `crypto`/`path` — hence the build break.
  //
  // `serverExternalPackages` applies to Server Components, not the
  // instrumentation Edge chunk, so we alias the whole Node-only chain to
  // `false` (empty module) for the Edge runtime only. The runtime gate keeps
  // Node behaviour intact; the alias just satisfies webpack's static analysis.
  // socket.io-client (browser-safe) is untouched.
  webpack: (config, { nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string | false>),
        // socket.io chain
        "socket.io": false,
        // The two project modules that pull in Node built-ins via socket.io
        "@/server/socket/server": false,
        "@/server/socket/revalidation": false,
      };
      config.resolve.fallback = {
        ...(config.resolve.fallback as Record<string, false>),
        http: false,
        https: false,
        crypto: false,
        path: false,
      };
    }
    return config;
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
