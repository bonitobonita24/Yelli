import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("/api/health", () => {
  it("returns 200", () => {
    const response = GET();
    expect(response.status).toBe(200);
  });

  it("returns status: 'ok' in the JSON body", async () => {
    const response = GET();
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("identifies the service as yelli-web", async () => {
    const response = GET();
    const body = (await response.json()) as { service: string };
    expect(body.service).toBe("yelli-web");
  });

  it("responds with application/json content type", () => {
    const response = GET();
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});
