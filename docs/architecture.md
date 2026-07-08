# Architecture Diagrams

These diagrams summarize the major components and workflows behind CoExist Alert. The live app is the source of truth; simulated field elements are explicitly labelled in the UI.

## 1. System Components

```mermaid
flowchart LR
  subgraph Field["Field edge - simulated in this POC"]
    N1["Village Boundary East\ncamera + motion"]
    N2["Rail Crossing KM-47\ncamera + thermal"]
    N3["Waterhole 7\ncamera + acoustic"]
  end

  subgraph App["CoExist Alert server\nNext.js + TypeScript"]
    Ingest["Ingest API\nheartbeat + detection"]
    Health["Node health engine\nhealthy / degraded / offline"]
    Confirm["Confirmation engine\nconfidence or cross-source corroboration"]
    Cascade["Alert cascade engine\ngeofence + tiers + delivery tracking"]
    Response["Responder workflow\nack / en route / on site / resolved"]
    Stream["SSE stream\nlive console updates"]
    Analytics["Analytics + NDJSON export\nhotspots + reliability KPIs"]
    DB[("SQLite via Drizzle")]
  end

  subgraph Views["User-facing surfaces - behind sign-in + RBAC"]
    Command["Command dashboard"]
    Guard["Guard mobile view"]
    Channels["Villager + rail channel view"]
    Demo["Demo controls"]
  end

  Webex["Cisco Webex\nlive when env-configured"]

  N1 --> Ingest
  N2 --> Ingest
  N3 --> Ingest
  Demo --> Ingest
  Ingest --> Health
  Ingest --> Confirm
  Health --> Cascade
  Confirm --> Cascade
  Cascade --> Webex
  Cascade --> Response
  Health --> DB
  Confirm --> DB
  Cascade --> DB
  Response --> DB
  DB --> Analytics
  DB --> Stream
  Stream --> Command
  Stream --> Guard
  Stream --> Channels
```

## 2. Detection To Warning Sequence

```mermaid
sequenceDiagram
  participant Sensor as Edge sensor node
  participant Ingest as Ingest API
  participant Confirm as Confirmation engine
  participant Cascade as Cascade engine
  participant Webex as Cisco Webex
  participant Guard as Guard view
  participant DB as SQLite audit log
  participant Command as Command dashboard

  Sensor->>Ingest: POST detection signal
  Ingest->>DB: Store raw signal
  Ingest->>Confirm: Evaluate confidence and corroboration
  alt High-confidence or corroborated
    Confirm->>DB: Mark event confirmed
    Confirm->>Cascade: Plan targeted alerts
    Cascade->>DB: Queue siren, villager, guard, control alerts
    Cascade->>Webex: Send guard alert card when configured
    Webex-->>Cascade: Delivery result
    Cascade->>DB: Store delivery status
    Cascade-->>Command: SSE event + delivery updates
    Cascade-->>Guard: SSE incoming alert
  else Weak single signal
    Confirm->>DB: Keep event unconfirmed, then expire if no corroboration
    Confirm-->>Command: Logged quietly, no public alert
  end
```

## 3. Escalation And Ownership Workflow

```mermaid
stateDiagram-v2
  [*] --> Unconfirmed: first weak signal
  Unconfirmed --> Confirmed: high confidence\nor second source in window
  Unconfirmed --> Expired: window closes\nno alert sent
  Confirmed --> Tier1Paged: dispatch tier 1
  Tier1Paged --> Responding: tier 1 acknowledges
  Tier1Paged --> Tier2Paged: timeout, no ack
  Tier2Paged --> Responding: senior acknowledges\nor takes over
  Tier2Paged --> Tier3Paged: timeout, no ack
  Tier3Paged --> Responding: duty officer acknowledges
  Responding --> EnRoute: responder en route
  EnRoute --> OnSite: responder on site
  OnSite --> Resolved: incident resolved
  Resolved --> [*]
  Expired --> [*]
```

## 4. Runtime And Deployment Flow

```mermaid
flowchart TB
  Repo["GitHub repository (private)"]
  CI["GitHub Actions\nlint + typecheck + tests + build"]
  Build["Production build\nnpm run build"]
  Docker["docker compose up\nmigrate + seed + production build"]
  Local["Local judge run\nhttp://localhost:3021"]
  Service["coexist-alert.service\nNext start on 127.0.0.1:8021"]
  Public["https://coexist.yashkumarvaibhav.me"]
  Version["/api/version\nshort SHA + build time"]
  Health["/api/health\nDB + simulator + Webex status"]
  Env[".env on server\nWebex, auth secret, optional Duo"]
  DB[("SQLite var/coexist.sqlite")]

  Repo --> CI
  Repo --> Build
  Repo --> Docker
  Docker --> Local
  Build --> Service
  Env --> Service
  Service --> DB
  Service --> Public
  Public --> Version
  Public --> Health
```
