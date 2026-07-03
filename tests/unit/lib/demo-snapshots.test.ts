import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SNAPSHOT_DIR = join(process.cwd(), "public", "demo-snapshots");

/**
 * The SIMULATED DEMO SNAPSHOT chip is baked into every demo snapshot SVG.
 * The label uses an explicit textLength so glyph metrics can't change its
 * width across font substitutions; these checks pin the geometry so the
 * label always fits the pill with symmetric padding, inside the canvas.
 */
describe("demo snapshot chip geometry", () => {
  const files = readdirSync(SNAPSHOT_DIR).filter((name) => name.endsWith(".svg"));

  it("covers the full snapshot set", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of files) {
    it(`keeps the label inside the pill in ${file}`, () => {
      const svg = readFileSync(join(SNAPSHOT_DIR, file), "utf8");

      const rect = /<rect x="(\d+)" y="30" width="(\d+)" height="50" rx="12"[^>]*\/>/.exec(svg);
      const text =
        /<text x="(\d+)"[^>]*textLength="(\d+)"[^>]*>SIMULATED DEMO SNAPSHOT<\/text>/.exec(svg);
      expect(rect, "chip pill rect").not.toBeNull();
      expect(text, "chip label with pinned textLength").not.toBeNull();
      if (rect === null || text === null) return;

      const pillX = Number(rect[1]);
      const pillWidth = Number(rect[2]);
      const labelX = Number(text[1]);
      const labelLength = Number(text[2]);
      const leftPadding = labelX - pillX;

      expect(leftPadding).toBeGreaterThan(0);
      // Right edge of the label + the same padding must stay inside the pill.
      expect(labelX + labelLength + leftPadding).toBeLessThanOrEqual(pillX + pillWidth);
      // And the pill itself stays inside the 960-wide canvas.
      expect(pillX + pillWidth).toBeLessThanOrEqual(960);
    });
  }
});
