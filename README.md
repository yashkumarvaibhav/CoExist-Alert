# CoExist Alert

<p align="center">
  <img src="public/coexist-logo.png" alt="CoExist Alert logo" width="420" />
</p>

**Edge early-warning for human-wildlife conflict.**
Code with Cisco · Silver Flag CSR Challenge · Mission 3 — Human-Animal Coexistence · Team **GitBoosters**

> Live demo: **[coexist.yashkumarvaibhav.me](https://coexist.yashkumarvaibhav.me)**

## The problem

Human-wildlife conflict kills people and animals every day at the forest edge. In India, elephants kill hundreds of people a year, and elephant–train collisions kill dozens of elephants. The tragedy is almost always about **time and warning**: a villager at dawn, a night bus, a train driver — none of them has an advance signal that an animal is on the path, and forest guards learn of incursions only after the damage is done. Walls, trenches and patrols are static. The missing capability is **real-time detection at the edge plus instant, reliable, targeted, multi-channel warning** — a sensing-and-network problem.

## The solution

CoExist Alert is an early-warning platform for the forest-village boundary and rail crossings. It demonstrates the full life-critical loop:

1. **Detect** — edge sensor nodes (cameras, thermal, acoustic, motion) report animal-presence signals with snapshots and confidence scores.
2. **Confirm** — false-positive suppression: a high-confidence signal, or two corroborating signals from different sources within a short window, confirm an event. Weak single signals never cry wolf — alert fatigue is the fastest way to lose a community's trust.
3. **Warn** — an alert cascade fires in seconds: local siren, geofenced villager phone alerts, a **real Cisco Webex message** with snapshot and map link to the nearest guard, and a slow/stop advisory to the rail control room.
4. **Escalate** — unacknowledged alerts escalate to the next responder tier on a timer. A warning nobody saw is not a warning.
5. **Respond** — guards acknowledge → en route → on site → resolved; response times are recorded per event.
6. **Observe** — every node's link and battery health is continuously monitored. A dead sensor is itself an alert: *"this corridor is now blind — dispatch a patrol."*
7. **Learn** — hotspot analytics (node × time-of-day) and reliability KPIs drive patrol planning.

**The star of the show is the alert cascade and network reliability, not ML.** Detection classification arrives from the edge already labelled with confidence — in production that inference runs *on the camera* (Meraki MV), not in this platform.

## Architecture

```
  FIELD (simulated, honestly labelled)
  N1 Village Boundary East   N2 Rail Crossing KM-47   N3 Waterhole 7
  [camera+motion]            [camera+thermal]         [camera+acoustic]
        │ heartbeats every 10s        │ detection signals (MV-Sense-shaped)
        ▼                             ▼
  POST /api/ingest/heartbeat    POST /api/ingest/detection
        │                             │
  ┌─────┴─────────────────────────────┴──────────────────────────────┐
  │              CoExist Alert server (Next.js, one process)         │
  │                                                                  │
  │  Node Health Engine        Event Confirmation Engine             │
  │  healthy→degraded→offline  high-confidence OR two-signal         │
  │  offline ⇒ BLIND-SPOT      corroboration in window; else expire  │
  │        │                             │ confirmed                 │
  │        │                   Alert Cascade Engine                  │
  │        │                   geofenced targeting → channel fan-out │
  │        │                   delivery tracking → tiered escalation │
  │        │                     │        │         │        │       │
  │        │                   Siren   Villager   Guard   Control    │
  │        │                   (sim)   phones     WEBEX   room       │
  │        │                           (sim)      (REAL)  (sim)      │
  │        ▼                                                         │
  │  SSE stream (/api/stream) → live dashboards                      │
  │  SQLite: nodes · signals · events · alerts · responses · outages │
  └──────────────────────────────────────────────────────────────────┘
        ▼
  Command Dashboard · Guard Mobile View · Villager/Rail Channel Views
  Analytics & Hotspots · Demo Control Panel
```

- **One persistent Node server** (Next.js App Router) — escalation timers, heartbeat-timeout evaluation and server-sent events need long-lived process state.
- **SQLite via Drizzle ORM** — zero-setup for anyone cloning the repo; typed schema with a straightforward Postgres migration path for production.
- **Deterministic domain core** — health state machine, confirmation engine, cascade planner, escalation and metrics are pure, I/O-free TypeScript, written test-first. This logic is life-critical; it is provably correct or it is nothing.
- **In-process field simulator** drives the system **through the public ingest API** — the pipeline you see demonstrated is the pipeline that actually runs.

## Cisco technology mapping

Cisco products are the solution architecture here, not a decoration — and we are explicit about what is real versus simulated in this POC:

| Stage | Cisco product | In production | In this POC | Honesty label |
|---|---|---|---|---|
| **Sense** | Meraki MV smart cameras (MV Sense), MT sensors, Cisco Spaces | On-camera detection at hotspots publishes object-detection payloads | Simulator emits payloads **shaped like MV Sense outputs** (`classification`, `confidence`, snapshot ref); ingest validates them as untrusted edge input | `SIMULATED` chip on every field signal |
| **Observe** | ThousandEyes, Splunk | Node-to-server tests per site; alert on loss/latency; Splunk drives analytics | Heartbeat pipeline models ThousandEyes tests: missed beats ⇒ degraded/offline with the same alarm semantics; analytics engine is Splunk-style aggregation | Health board labelled with its reliability model |
| **Engage** | Webex APIs | Guard alert rooms, response coordination, control-room notifications | **REAL** — a bot posts an alert card (snapshot, facts, map link) to a Webex space when configured; delivery status comes from the API response; falls back to a simulated channel otherwise | `LIVE` / `SIMULATED` chip switches automatically |
| **Connect** | Meraki MG / Catalyst + mesh backhaul | Remote backbone from forest edge to command | Topology narrative and diagram; node `link_quality` models backhaul health | Diagram labelled conceptual |
| **Secure** | Duo / Secure Access / Umbrella | MFA on the command console; zero-trust responder access; DNS-layer protection for field gateways | Documented production path; POC is deliberately unauthenticated for demo flow | Stated here explicitly |

**Why the network story matters:** detection is worthless if the warning silently fails. Monitoring the warning system itself — and alerting when a corridor goes blind — is what makes "a warning never silently fails" an honest promise. The network is the product.

## Measurable impact

- **Alert lead time** — seconds from detection to warning delivered (versus minutes-to-never today), shown live per event.
- **Delivery success rate** — per-channel delivery confirmation; no silent failures.
- **Guard response time** — detection → acknowledged → on site, tracked per event.
- **Sensor uptime / blind-spot minutes** — percentage of healthy time per node, and how long any crossing was blind (and that we alerted on it).
- **Hotspot coverage** — dawn/dusk risk windows identified per node, driving proactive patrols.

## Quickstart

> Full setup lands with the persistence phase; the commands below are the target developer experience.

```bash
git clone https://github.com/yashkumarvaibhav/CoExist-Alert.git
cd CoExist-Alert
npm install
npm run setup     # migrate + seed SQLite (coming with the persistence phase)
npm run dev       # http://localhost:3021
```

Production build: `npm run build && npm run start` (port 8021).
Tests: `npm run test` (unit) · `npm run test:e2e` (Playwright).

To enable the live Webex channel, copy `.env.example` to `.env` and provide `WEBEX_BOT_TOKEN` and `WEBEX_ROOM_ID` (a bot created at developer.webex.com, added to a space). Without them the channel runs in clearly-labelled simulated mode.

## Honesty rule

Every simulated element in the UI carries a visible `SIMULATED` chip; only real Webex sends show `LIVE`. Demo data is a fictionalized composite inspired by the Dooars elephant corridor (North Bengal), clearly labelled. We never fake a live-hardware claim.

## Team

**GitBoosters** — Yash Kumar Vaibhav (IIIT Delhi) · Varnika Pulipati (IIITDM Jabalpur) · Adeesh Jain (BITS Pilani Goa)
