# Scaling Guideline

CoExist Alert runs today as one simulated corridor — three sensor nodes, five villager zones, three responder tiers plus rail section control — hosted as a single service. This document describes how the same architecture grows to many real corridors across a district, a state, or the country, and what deliberately never changes on the way.

## 1. The unit of scale is a corridor

A corridor is a node cluster plus its villager zones and its responder roster. All three are **data rows, not code**: the `nodes`, `villager_zones` and `responders` tables drive geofenced targeting and tier-ordered escalation at runtime. Standing up corridor #2 means seeding rows — coordinates, geofence radii, zone labels, tier assignments — not writing features. The confirmation window, cascade planner and escalation clock read the same settings row wherever they run.

## 2. Field and data plane

- **Sensors:** Meraki MV cameras (MV Sense) and MT sensors publish detections and telemetry shaped exactly like the payloads the ingest API validates today. The simulator is replaced by real endpoints posting to the same contract; ingest already treats every payload as untrusted edge input.
- **Backhaul:** Meraki MG cellular and Catalyst mesh carry node traffic from the forest edge; each site's link quality feeds the same per-node health model the POC maintains.
- **Reliability:** per-corridor heartbeat SLOs keep ThousandEyes-style synthetic-test semantics — missed beats open outages and blind-spot alerts corridor by corridor.
- **Storage:** SQLite gives way to Postgres behind the same Drizzle repository layer; the schema and the audit-timeline guarantees carry over unchanged.
- **Analytics:** the NDJSON event export becomes a continuous feed into a Splunk HTTP Event Collector, so cross-corridor risk analysis and long-horizon retention live in the fleet's observability stack rather than in the app.

## 3. People plane

Responder tiers are configured per corridor: beat officers at tier 1, range rapid-response at tier 2, the district duty officer as the tier-3 backstop, with rail section control attached to crossing nodes. Each range gets its own Webex space for alert delivery and in-card acknowledgement. The deliberately open one-click demo accounts of the POC become directory-backed identities with Cisco Duo MFA step-up on operational routes — the session middleware, role gates and route policy stay exactly as they are.

## 4. Product surfaces at N corridors

The command dashboard becomes corridor-scoped with a corridor switcher and a roll-up view: fleet-wide KPIs, blind-spot totals, and hotspot comparison across corridors. Guard and channel views are already responder-scoped, so they scale by assignment rather than redesign. Adjacent corridors that share a boundary de-duplicate through the same confirmation-window logic, scoped per node cluster.

## 5. Operations

A central operations room owns blind-spot response the way the POC's ops channel models it: an offline node pages ops with the same urgency as a confirmed incursion, and every blind minute stays on the record. Rail advisories integrate with section control at the divisional level. The per-event audit timeline — signal, corroboration, per-channel delivery, acknowledgement, resolution — remains the incident record of record for every corridor.

## 6. What deliberately never changes

The trust model is the product, and scale must not dilute it:

- weak single signals never alert; confirmation requires high confidence or cross-source corroboration;
- every alert has a recorded per-channel outcome — a failure is a visible row, never a silent miss;
- unacknowledged alerts escalate on a timer until someone owns them;
- a dead sensor is itself an alert;
- simulated and live elements are labelled as such, everywhere, at every scale.

Scaling CoExist Alert is a swap of endpoints and storage — real sensors behind the same ingest contract, Postgres behind the same repositories, directory identity behind the same middleware — not a redesign.
