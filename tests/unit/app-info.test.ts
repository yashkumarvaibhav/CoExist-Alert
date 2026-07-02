import { describe, expect, it } from "vitest";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";

describe("app info", () => {
  it("exposes the product name and tagline", () => {
    expect(APP_NAME).toBe("CoExist Alert");
    expect(APP_TAGLINE).toContain("early-warning");
  });
});
