import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

// Chromium's installability criteria: a name, a start_url, standalone (or
// minimal-ui) display, and at least 192px + 512px icons. The guard view is the
// install target — a beat officer pins the response console to their phone.
describe("web app manifest", () => {
  const m = manifest();

  it("meets the installability criteria", () => {
    expect(m.name).toBe("CoExist Alert");
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe("/guard");
    expect(m.display).toBe("standalone");

    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("ships a maskable icon so launchers do not clip the mark", () => {
    const maskable = (m.icons ?? []).filter((icon) =>
      (icon.purpose ?? "").includes("maskable"),
    );
    expect(maskable.length).toBeGreaterThan(0);
    for (const icon of maskable) {
      expect(icon.sizes).toBe("512x512");
    }
  });

  it("scopes the whole app so in-app navigation stays in the window", () => {
    expect(m.scope).toBe("/");
    expect(m.id).toBe("/");
  });
});
