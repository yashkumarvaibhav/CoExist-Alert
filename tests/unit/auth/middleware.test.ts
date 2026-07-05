import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";

describe("auth middleware", () => {
  it("redirects unauthenticated page requests to the landing sign-in modal", async () => {
    const response = await middleware(
      new NextRequest("http://localhost/command/events?state=confirmed"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/?signin=1&next=%2Fcommand%2Fevents%3Fstate%3Dconfirmed",
    );
  });

  it("returns 401 JSON for unauthenticated protected API requests", async () => {
    const response = await middleware(new NextRequest("http://localhost/api/export/events.ndjson"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });
});
