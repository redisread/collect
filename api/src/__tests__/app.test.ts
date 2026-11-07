import { describe, expect, it } from "vitest";
import { createApiApp } from "../app";

describe("API application", () => {
  it("serves the API health check with a correlation id", async () => {
    const app = createApiApp();

    const response = await app.request("http://collect.test/api/health", {
      headers: { "x-request-id": "request-from-client" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("request-from-client");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "collect",
    });
  });

  it("does not reflect credentialed cross-origin requests", async () => {
    const app = createApiApp();

    const response = await app.request("http://collect.test/api/health", {
      headers: { origin: "https://attacker.example" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
});
