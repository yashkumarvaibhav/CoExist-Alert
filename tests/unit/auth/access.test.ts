import { describe, expect, it } from "vitest";

import { isApiPath, routeAccess } from "@/auth/access";

describe("routeAccess", () => {
  it("leaves landing, health/version, webhook and auth endpoints public", () => {
    for (const path of [
      "/",
      "/api/version",
      "/api/health",
      "/api/webex/webhook",
      "/api/auth/login",
      "/api/auth/logout",
    ]) {
      expect(routeAccess(path)).toEqual({ kind: "public" });
    }
  });

  it("gates console pages by role", () => {
    expect(routeAccess("/command")).toEqual({ kind: "protected", roles: ["command", "admin"] });
    expect(routeAccess("/command/events/e1")).toEqual({ kind: "protected", roles: ["command", "admin"] });
    expect(routeAccess("/guard")).toEqual({ kind: "protected", roles: ["guard", "command", "admin"] });
    expect(routeAccess("/channels")).toEqual({ kind: "protected", roles: ["control", "command", "admin"] });
    expect(routeAccess("/demo")).toEqual({ kind: "protected", roles: ["admin"] });
  });

  it("locks field-driving APIs to admin and shares stream/responses with console roles", () => {
    expect(routeAccess("/api/ingest/detection")).toEqual({ kind: "protected", roles: ["admin"] });
    expect(routeAccess("/api/demo/scenario")).toEqual({ kind: "protected", roles: ["admin"] });
    expect(routeAccess("/api/export/events.ndjson")).toEqual({ kind: "protected", roles: ["command", "admin"] });
    expect(routeAccess("/api/events/e1/respond")).toEqual({
      kind: "protected",
      roles: ["guard", "command", "control", "admin"],
    });
    expect(routeAccess("/api/stream")).toEqual({
      kind: "protected",
      roles: ["guard", "command", "control", "admin"],
    });
  });

  it("classifies API paths", () => {
    expect(isApiPath("/api/stream")).toBe(true);
    expect(isApiPath("/command")).toBe(false);
  });
});
