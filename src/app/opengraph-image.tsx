import { ImageResponse } from "next/og";

import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";

// Social share card. Self-contained (inline styles, system fonts) so it needs
// no external asset fetch — matches the immersive-hero identity.
export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0b1315 0%, #10191b 55%, #132225 100%)",
          color: "#f5f8f8",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "18px",
              height: "18px",
              transform: "rotate(45deg)",
              background: "#66dcd5",
            }}
          />
          <div
            style={{
              fontSize: "34px",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              fontFamily: "Arial, sans-serif",
            }}
          >
            {APP_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              fontSize: "84px",
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              maxWidth: "960px",
            }}
          >
            Seconds save lives on both sides.
          </div>
          <div
            style={{
              fontSize: "30px",
              color: "#a7b2b3",
              fontFamily: "Arial, sans-serif",
              maxWidth: "900px",
            }}
          >
            Edge early-warning for human-wildlife conflict — detect, confirm and
            warn within seconds, with the network monitored so a warning never
            silently fails.
          </div>
        </div>

        <div
          style={{
            fontSize: "22px",
            color: "#7ce4de",
            fontFamily: "Arial, sans-serif",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Team GitBoosters
        </div>
      </div>
    ),
    size,
  );
}
