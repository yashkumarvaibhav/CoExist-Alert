// Fail fast with a clear, actionable message when the host Node.js is too old.
// npm's own EBADENGINE is only a warning that scrolls past, so judges otherwise
// hit a cryptic crash several commands later. This turns that into one line.
//
// Uses only Node built-ins so it can run as a preinstall hook (before any
// dependency exists) as well as before dev/start/setup.

const MIN_MAJOR = 20;
const major = Number(process.versions.node.split(".")[0]);

if (Number.isNaN(major) || major < MIN_MAJOR) {
  const red = "[31m";
  const bold = "[1m";
  const reset = "[0m";
  const lines = [
    "",
    `${red}${bold}✗ CoExist Alert requires Node.js ${MIN_MAJOR}+ — you are on ${process.version}.${reset}`,
    "",
    "  Fix (pick one):",
    "    • Zero setup:  docker compose up        # no host Node needed at all",
    "    • Or:          nvm use                  # this repo ships an .nvmrc (Node 24)",
    "    • Or install Node 20+ from https://nodejs.org and reopen your terminal.",
    "",
  ];
  console.error(lines.join("\n"));
  process.exit(1);
}
