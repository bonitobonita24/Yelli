// Non-tRPC: public liveness probe — intentionally unauthenticated so Docker/k8s
// probes can call it without credentials (security.md §AGENT PROHIBITIONS item 11
// lists /api/health as an explicit auth-exempt Route Handler exception).
// Returns 200 if the Node.js process is responsive. No dependency checks here —
// for readiness with DB/Valkey/MinIO checks, add a separate /api/ready endpoint.
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", service: "yelli-web" });
}
