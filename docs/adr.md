# Architecture Decision Record

Status: Accepted
Date: 2026-07-07
Scope: Silver Flag submission architecture for CoExist Alert

## Context

CoExist Alert is a proof of concept for human-wildlife conflict response at forest-village boundaries and rail crossings. The core risk is not only detecting animal movement; it is delivering a warning quickly, proving the warning was delivered, and escalating when nobody responds. Reviewers must be able to clone the repository, run the demo without external services, and still see a credible Cisco-powered architecture.

The app also has to be honest about what is simulated. Field hardware, villager phones, sirens, and control-room feeds are simulated. Webex delivery, app auth, RBAC, the Duo integration path, SQLite persistence, health monitoring, event export, and the full ingest-to-response workflow are implemented.

## Decisions

### 1. Use one persistent Next.js application

The product is a single Next.js 16 App Router application with API routes, server-rendered pages, client dashboards, an in-process simulator, and a user-scoped systemd deployment. Escalation timers, heartbeat timeout checks, and server-sent events need a long-lived process, so a serverless deployment is not a good fit.

This keeps the judge setup simple: `npm install`, `npm run setup`, and `npm run dev` start the full proof of concept.

### 2. Keep edge classification outside the platform

In production, Meraki MV cameras and field sensors perform detection at the edge and publish object-detection style payloads. The platform consumes `{ classification, confidence, snapshot }` payloads, validates them, suppresses false positives, and routes warnings. The proof of concept therefore simulates MV-Sense-shaped payloads rather than adding a separate model runtime.

This makes the Cisco story cleaner: the cloud app is responsible for confirmation, warning reliability, responder workflow, and observability, while camera inference stays where it belongs.

### 3. Make the domain core deterministic and testable

Health transitions, event confirmation, cascade planning, escalation, targeting, and metrics are implemented as pure TypeScript logic with unit coverage. A weak single signal cannot alert; corroboration must be cross-source and inside the window; a confirmed rail-crossing event always includes control-room targeting; missed heartbeats create blind-spot alerts.

This is the trust layer of the product. The system must be able to prove why an alert did or did not fire.

### 4. Use SQLite with Drizzle for zero-setup persistence

SQLite keeps the clone path lightweight while still giving the demo durable state, migrations, seed data, and auditable tables for nodes, signals, events, alerts, responses, outages, responders, and users. Drizzle keeps schema and repository access typed and leaves a straightforward migration path to Postgres if the project moves beyond the proof of concept.

### 5. Use REST for actions and SSE for live dashboards

Mutations use normal HTTP endpoints: ingest detection, ingest heartbeat, demo scenario controls, responder actions, Webex webhook callbacks, and NDJSON export. Dashboards subscribe to `/api/stream` for live updates and refetch server snapshots on reconnect.

This provides the real-time feel of an operations console without introducing bidirectional socket infrastructure the product does not need.

### 6. Treat Cisco integrations as architecture, not decoration

The proof of concept maps Cisco products to real system roles:

- Meraki MV / MT / Spaces: production sensing and edge payload shape.
- ThousandEyes and Splunk: health semantics, reliability analytics, and NDJSON export.
- Webex: live guard alert delivery and optional in-card acknowledgement.
- Meraki MG / Catalyst: remote backhaul narrative and link-quality model.
- Duo / Secure Access / Umbrella: real app auth/RBAC now, Duo step-up when configured, production access-control path.

Every simulated element is labelled `SIMULATED`; live Webex sends are labelled `LIVE`; Duo is documented as dormant unless configured.

### 7. Keep the simulator inside the product boundary

The field simulator drives the same public ingest APIs that a real field integration would call. Demo buttons do not write fake UI state directly; they create heartbeats, signals, outages, events, alerts, and responses through the same route and repository layers used by the rest of the app.

This makes the demo credible: the visible workflow is backed by the same records and state transitions that power the audit timeline and analytics.

## Consequences

The architecture favors reliability, clarity, and reviewability over breadth. It does not depend on live field hardware, a model sidecar, or paid cloud setup. It does include a real backend, durable data model, auth/RBAC, Webex integration, responder loop, health monitoring, export path, and repeatable demo seed.

The main tradeoff is that sensing hardware and most channel endpoints are simulated. The product handles that openly with visible labels and by showing the production Cisco product mapped to each simulated layer.
