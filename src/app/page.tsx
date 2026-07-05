import Image from "next/image";
import Link from "next/link";

import { BuildStamp } from "@/components/build-stamp";
import { SignInLauncher } from "@/components/auth/sign-in-launcher";
import { LandingScene } from "@/components/landing-scene";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";

const problemStats = [
  {
    value: "Hundreds",
    label: "of people are killed in encounters with elephants in India every year.",
  },
  {
    value: "Dozens",
    label: "of elephants die on rail lines that cut through forest corridors.",
  },
  {
    value: "Zero",
    label: "advance warning reaches anyone on the path today. That is the gap.",
  },
];

const workflow = [
  {
    step: "Detect",
    title: "Movement at the boundary",
    body: "A camera or thermal sensor spots a large animal and reports it with a snapshot and a confidence score.",
  },
  {
    step: "Confirm",
    title: "No crying wolf",
    body: "A weak, single signal stays quiet. An event confirms only on high confidence or a second, independent sensor.",
  },
  {
    step: "Warn",
    title: "Everyone in the path",
    body: "Siren at the crossing, phone alerts to the hamlets inside the risk zone, an alert card in the guard’s messaging space, a slow-order to rail control.",
  },
  {
    step: "Respond",
    title: "Escalate until answered",
    body: "The guard’s acknowledgement stops the clock. Silence pages the next tier automatically — no alert is allowed to die unread.",
  },
];

const architecture = [
  {
    stage: "Sense",
    product: "Meraki MV smart cameras · MT sensors",
    proof:
      "The demo field emits detections shaped like MV Sense output — classification, confidence, snapshot — and the ingest pipeline treats them as untrusted edge input.",
    label: "SIMULATED",
  },
  {
    stage: "Connect",
    product: "Meraki MG cellular · Catalyst mesh backhaul",
    proof:
      "Each node’s link quality and battery are modelled and monitored continuously; the backhaul topology is documented as the production path.",
    label: "SIMULATED",
  },
  {
    stage: "Observe",
    product: "ThousandEyes-style tests · Splunk-style analytics",
    proof:
      "Missed heartbeats open outages and blind-spot alerts with agent-test semantics; thirty days of events feed the hotspot and reliability analytics.",
    label: "SIMULATED",
  },
  {
    stage: "Engage",
    product: "Webex messaging",
    proof:
      "Guard alerts post to a real Webex space — snapshot, map link and facts on an adaptive card — when credentials are configured, and fall back to a labelled simulation otherwise.",
    label: "LIVE/SIMULATED",
  },
  {
    stage: "Secure",
    product: "Duo · Secure Access · Umbrella",
    proof:
      "Every console now requires a signed-in account with role-based access. Admin-only controls stay behind operator credentials; Duo MFA is the Cisco step-up gate when configured.",
    label: "LIVE",
  },
];

const impact = [
  {
    metric: "Lead time",
    detail: "seconds from first detection to first delivered warning, per event.",
  },
  {
    metric: "Delivery success",
    detail:
      "every alert ends in a recorded per-channel result; a failure is a visible row, never a silent miss.",
  },
  {
    metric: "Response time",
    detail: "detection to acknowledged to on-site, timed against the escalation clock.",
  },
  {
    metric: "Blind-spot minutes",
    detail: "every minute a corridor went unwatched, on the record.",
  },
  {
    metric: "Risk windows",
    detail: "dawn and dusk hotspots per crossing, so patrols go where the risk is.",
  },
];

function HeroChip({ children }: { children: string }) {
  return (
    <span className="rounded-sm border border-white/30 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/80">
      {children}
    </span>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // The request proxy bounces signed-out visitors here with ?signin=1&next=… so the
  // sign-in modal can open in place (no standalone login page).
  const signinOpen = params.signin === "1";
  const nextRaw = params.next;
  const next = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : null;

  return (
    <div className="min-h-screen bg-page text-body">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-contrast"
      >
        Skip to content
      </a>

      <header className="border-b border-line bg-page/95 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-line bg-white">
              <Image
                src="/coexist-icon.png"
                alt=""
                width={34}
                height={34}
                priority
                className="h-8 w-8 object-contain"
              />
            </span>
            <span className="truncate font-serif text-2xl font-medium tracking-tight text-ink">
              {APP_NAME}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/command"
              className="hidden min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-medium text-ink transition-colors hover:bg-hover sm:flex"
            >
              Dashboard
            </Link>
            <SignInLauncher defaultOpen={signinOpen} next={next} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main">
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden bg-[#10191b]"
        >
          <LandingScene />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,20,22,0.45),rgba(12,20,22,0.1)_38%,rgba(12,20,22,0.16)_68%,rgba(12,20,22,0.55))]" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-[#0c1416]/70 via-[#0c1416]/25 to-transparent lg:block" />

          <div className="relative mx-auto flex min-h-[max(38rem,92svh)] w-full max-w-7xl flex-col justify-start px-4 pb-24 pt-20 sm:px-6 sm:pt-24 lg:justify-center lg:py-24">
            <div className="max-w-3xl">
              <div className="rise-in mb-5 flex flex-wrap items-center gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7ce4de]">
                  Early warning for the forest edge
                </p>
                <HeroChip>SIMULATED FIELD</HeroChip>
              </div>
              <h1
                id="hero-heading"
                className="rise-in display-hero text-balance"
              >
                Seconds save lives on both sides.
              </h1>
              <p className="rise-in-2 mt-6 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
                When an elephant nears a village or a rail crossing,{" "}
                {APP_NAME} confirms the sighting and warns everyone in its path
                — the hamlet, the forest guard, the rail control room — within
                seconds, on channels they already carry.
              </p>
              <div className="rise-in-3 mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/command"
                  className="flex min-h-11 items-center justify-center rounded-md bg-[#66dcd5] px-5 text-sm font-medium text-[#0c1416] transition-colors hover:bg-[#7ce4de]"
                >
                  Open command dashboard
                </Link>
                <a
                  href="https://github.com/yashkumarvaibhav/CoExist-Alert"
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-center rounded-md border border-white/25 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                >
                  View on GitHub
                </a>
              </div>
              <p className="rise-in-3 mt-6 text-sm text-white/65">
                Watching a fictional corridor in the Dooars, North Bengal —
                three sensor nodes, five hamlets, one rail line.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="problem-heading" className="border-b border-line bg-page">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">
                  Why it exists
                </p>
                <h2
                  id="problem-heading"
                  className="display-section mt-4 text-balance"
                >
                  The tragedy is almost always about time.
                </h2>
              </div>
              <div>
                <p className="text-base leading-relaxed text-muted sm:text-lg">
                  A villager stepping out at dawn, a night bus on a forest
                  road, a train driver on a dark curve — none of them knows an
                  elephant is on the path until they can see it, and guards
                  learn of incursions after the damage is done. Walls, trenches
                  and patrol rosters are static answers to an animal that
                  moves. What is missing is time: detection at the edge, and a
                  warning that reliably reaches the right people while it can
                  still change what happens.
                </p>
              </div>
            </div>
            <dl className="mt-12 grid gap-8 border-t border-line pt-10 sm:grid-cols-3">
              {problemStats.map((stat) => (
                <div key={stat.value} className="border-l border-line pl-5">
                  <dt className="font-serif text-4xl leading-none text-ink sm:text-5xl">
                    {stat.value}
                  </dt>
                  <dd className="mt-3 text-sm leading-relaxed text-muted">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="workflow-heading" className="border-b border-line bg-sidebar">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">
                  How it works
                </p>
                <h2
                  id="workflow-heading"
                  className="display-section mt-4 text-balance"
                >
                  From first movement to first responder.
                </h2>
              </div>
              <Link
                href="/demo"
                className="flex min-h-11 items-center justify-center rounded-md border border-line bg-raised px-4 text-sm font-medium text-ink transition-colors hover:bg-hover"
              >
                Drive it yourself — demo panel
              </Link>
            </div>
            <ol className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map((item, index) => (
                <li key={item.step} className="relative border-t border-line pt-6">
                  <span
                    aria-hidden="true"
                    className="absolute -top-[5px] left-0 h-[9px] w-[9px] rounded-full bg-accent"
                  />
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
                    {String(index + 1).padStart(2, "0")} — {item.step}
                  </p>
                  <h3 className="mt-3 font-sans text-base font-semibold tracking-normal text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="blindspot-heading" className="bg-[#10191b]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="max-w-3xl">
              <h2
                id="blindspot-heading"
                className="display-quote text-balance"
              >
                A dead sensor is a missed warning.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
                So the network watches itself. Every node reports a heartbeat;
                when one goes quiet, the corridor it watched is declared blind,
                a patrol is dispatched to cover it, and every blind minute is
                counted on the record. An outage gets the same urgency as an
                elephant at the fence.
              </p>
              <p className="mt-6 flex flex-wrap items-center gap-3 font-mono text-xs text-[#7ce4de]/85 sm:text-sm">
                <span>
                  n3 · Waterhole 7 — heartbeat lost → corridor blind → patrol
                  dispatched
                </span>
                <HeroChip>SIMULATED</HeroChip>
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="architecture-heading" className="border-b border-line bg-page">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16 lg:py-24">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">
                System architecture
              </p>
              <h2
                id="architecture-heading"
                className="display-section mt-4 text-balance"
              >
                Built like public infrastructure.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                Sensing, connectivity, monitoring, messaging and access are
                separate layers with named production hardware — and the
                working system is honest about which of them run live today
                and which are simulated for the demo. Nothing on this page
                pretends.
              </p>
            </div>
            <div className="grid gap-3">
              {architecture.map((item) => (
                <article
                  key={item.stage}
                  className="grid gap-3 rounded-md border border-line bg-raised px-4 py-4 sm:grid-cols-[0.6fr_1fr_auto] sm:items-start"
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint">
                      {item.stage}
                    </p>
                    <h3 className="mt-1 font-sans text-sm font-semibold tracking-normal text-ink">
                      {item.product}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{item.proof}</p>
                  <span className="justify-self-start rounded-sm border border-line px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-faint sm:justify-self-end">
                    {item.label}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="impact-heading" className="bg-sidebar">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:py-24">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-faint">
                Measurable impact
              </p>
              <h2
                id="impact-heading"
                className="display-section mt-4 text-balance"
              >
                Every promise on this page is a number in the product.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                The demo does not end on a story — it ends on the analytics
                screen, where the claims are computed from what actually
                happened, including the failures.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/command/analytics"
                  className="flex min-h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
                >
                  View analytics
                </Link>
                <Link
                  href="/guard"
                  className="flex min-h-11 items-center justify-center rounded-md border border-line bg-raised px-5 text-sm font-medium text-ink transition-colors hover:bg-hover"
                >
                  Open guard view
                </Link>
              </div>
            </div>
            <dl>
              {impact.map((item) => (
                <div
                  key={item.metric}
                  className="grid gap-1 border-t border-line py-4 last:border-b sm:grid-cols-[11rem_1fr] sm:gap-4"
                >
                  <dt className="text-sm font-semibold text-ink">{item.metric}</dt>
                  <dd className="text-sm leading-relaxed text-muted">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-page px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-muted">Built by Team GitBoosters · {APP_TAGLINE}</p>
            <p className="mt-1">
              Demo geography is a fictional corridor in the Dooars, North
              Bengal. All names and snapshots are demo data.
            </p>
          </div>
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
