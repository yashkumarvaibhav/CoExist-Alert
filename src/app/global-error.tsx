"use client";

// Last-resort boundary for failures in the root layout itself. Must render its
// own <html>/<body>. Kept dependency-free so it works even if app chrome fails.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10191b",
          color: "#f5f8f8",
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>CoExist Alert</h1>
          <p style={{ color: "#a7b2b3", marginTop: "0.75rem" }}>
            The application hit an unexpected error. Reload to continue.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              minHeight: "2.75rem",
              padding: "0 1rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#7ce4de",
              color: "#0c1416",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
