# Third-Party Notices

CoExist Alert is MIT licensed. This file summarizes the primary open-source packages used directly by the project. The full resolved dependency graph is captured in `package-lock.json`; each package retains its own license and copyright notices.

## Runtime Dependencies

| Package | License | Purpose |
|---|---:|---|
| `@fontsource-variable/newsreader` | OFL-1.1 | Bundled Newsreader font files for the editorial identity. |
| `@visx/group` | MIT | SVG chart grouping for analytics. |
| `@visx/scale` | MIT | Chart scales for analytics. |
| `better-sqlite3` | MIT | SQLite driver. |
| `drizzle-orm` | Apache-2.0 | Typed database ORM. |
| `leaflet` | BSD-2-Clause | Interactive map rendering. |
| `next` | MIT | Application framework and server runtime. |
| `react` | MIT | UI library. |
| `react-dom` | MIT | React DOM renderer. |
| `zod` | MIT | Runtime validation for API boundaries. |

## Development And Verification Dependencies

| Package | License | Purpose |
|---|---:|---|
| `@axe-core/playwright` | MPL-2.0 | Accessibility checks in Playwright. |
| `@playwright/test` | Apache-2.0 | End-to-end browser tests. |
| `@tailwindcss/postcss` | MIT | Tailwind CSS PostCSS integration. |
| `@types/*` packages | MIT | TypeScript type declarations. |
| `@vitejs/plugin-react` | MIT | React support for Vitest. |
| `drizzle-kit` | MIT | Database migration tooling. |
| `eslint` | MIT | Linting. |
| `eslint-config-next` | MIT | Next.js lint configuration. |
| `tailwindcss` | MIT | Utility CSS framework. |
| `tsx` | MIT | TypeScript execution for scripts. |
| `typescript` | Apache-2.0 | TypeScript compiler. |
| `vite-tsconfig-paths` | MIT | Path alias support in Vitest. |
| `vitest` | MIT | Unit and integration test runner. |

## Map Data And Tiles

The interactive map uses Leaflet with map tile attribution displayed in the UI. OpenStreetMap data is credited to OpenStreetMap contributors through the map attribution control.
