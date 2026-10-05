# Performance measurements

The performance suite separates React rendering, date-formatting CPU work, and
workspace API cost. All commands run inside Docker. It never benchmarks by
writing to the persisted development or production workspace.

## Reproduce

Start the normal development app with its Sites bindings:

```sh
APP_PORT=3010 docker-compose up -d --build
docker-compose exec -T --user root -e PLAYWRIGHT_BROWSERS_PATH=/opt/playwright app npx playwright install --with-deps chromium
```

Install Chromium again after recreating the container. Project dependencies stay
in the Compose volume; Chromium and its system libraries are container-local.

Before changing application code:

```sh
docker-compose exec -T -e PLAYWRIGHT_BROWSERS_PATH=/opt/playwright app npm run benchmark -- --bundle=output/performance/before-bundle --output=output/performance/before.json
```

After changing application code:

```sh
docker-compose exec -T -e PLAYWRIGHT_BROWSERS_PATH=/opt/playwright app npm run benchmark -- --bundle=output/performance/after-bundle --output=output/performance/after.json
```

To repeat a preserved build, add `--reuse-bundle` and use that bundle's directory.
Without that flag, the requested bundle directory is rebuilt from current source.
Use distinct directories for before and after. Run measurements sequentially,
without concurrent builds, tests, or benchmarks. Use `--iterations=10` for a
larger sample. Screenshots are written beside each bundle.

```sh
docker-compose exec -T app npm run benchmark:dates
docker-compose exec -T app npm run benchmark:workspace
```

The date benchmark runs nine samples of 2,000 calls after warmup. The API benchmark
runs ten warmups and sixty samples per operation; `--iterations=100` changes the
sample count. Redirect its JSON output with `node scripts/workspace-benchmark.mjs`
when saving machine-readable reports (npm also prints its script banner).

## What the browser benchmark measures

- Production React and the real app styles, compiled by esbuild using the same
  production settings as the embedded plugin UI. This isolates component costs
  from development tooling and framework hydration.
- A synthetic workspace with either 100 tasks (30 in the inbox) or 1,000 tasks
  (300 in the inbox), five projects, four areas, and recurring calendar blocks.
  Every task has a due date. Routines are omitted from this fixture and covered
  separately by the date benchmark and regression tests.
- Fresh browser contexts at 1440 × 1000 and 390 × 844. The narrow profile uses
  Chromium's 4× CPU slowdown. Both keep normal animations enabled.
- Calendar readiness, inbox navigation, task completion, and the subsequent
  save cycle. Saves use an in-memory revision-checked client. Completion must
  update the checkbox and finish saving; browser errors fail the run.
- Native timers, animation frames, and `performance.now()`. Only `Date` is fixed
  to October 5, 2026 at 09:00 in Los Angeles so calendar content is repeatable.
- Click-to-two-animation-frame timings, scripting and layout durations from
  Chrome DevTools, formatter constructions, DOM size, and one four-second idle
  observation window per profile/fixture after animation polling has started.

These are component lab measurements, not production LCP, INP, or real-device
results. Network, authentication, framework hydration, real D1 latency, and MCP
bridge latency are excluded. Five samples give a useful local comparison; the
reported p95 is simply the largest of those five samples. Idle CPU time is noisy;
geometry-read and observer counts identify the repeated work more directly.

## Findings and changes

1. Due-date labels, routine date parts, calendar headers, and weekly review
   repeatedly constructed `Intl.DateTimeFormat` objects. Fixed formatters now
   live outside render functions; timezone-aware helpers reuse formatter
   instances. Dates and timezone offsets remain uncached, preserving midnight
   and daylight-saving behavior.
2. Each task's inner content had its own auto-animation controller in addition
   to the containing list. This polled every child and repeatedly rebuilt
   intersection observers while idle. The containing list still animates task
   movement, and `Presence` still owns expanding editors and notes. Removing the
   redundant inner controller reduces this work without changing task markup.
3. Unchanged API reads still fetch and validate the whole saved document. The
   isolated D1 measurements show that validation is a small fraction of request
   cost. The backend remains unchanged: matching ETags must not conceal an
   invalid persisted workspace, and a parsed-document cache would add retained
   user data and invalidation complexity for little measured benefit.

## Results — October 4, 2026

Baseline application revision: `223a089`. Node 22.23.2, Linux ARM64 in Docker,
Playwright 1.63.0 / Chromium 153.0.8010.12. Five fresh contexts per browser case.
Both runs used preserved production bundles, identical fixtures, normal motion,
and native browser timers. Initial experiments using Playwright's emulated clock
were discarded because its timer emulation distorted animation measurements.

Median times in milliseconds (before → after):

| Profile / inbox tasks | Open inbox | Complete task | Scripting through save |
| --- | ---: | ---: | ---: |
| Desktop / 30 | 91.6 → 72.4 | 42.6 → 33.4 | 14.65 → 8.84 |
| Desktop / 300 | 216.5 → 175.2 | 65.6 → 48.1 | 34.32 → 20.03 |
| Mobile 4× / 30 | 159.6 → 145.2 | 50.4 → 42.2 | 18.36 → 11.60 |
| Mobile 4× / 300 | 722.9 → 550.9 | 153.6 → 90.4 | 122.90 → 59.16 |

For the large mobile fixture, inbox navigation improved 24%, task completion
41%, and scripting through the save cycle 52%. Its observed p95 completion
time fell from 197.5 to 118.7 ms. These are the component timings defined above,
not field INP.

Idle geometry reads / intersection observer constructions fell from 2,410 to
614 on large desktop and 2,404 to 604 on large mobile during the four-second
window: about 75% less repeated work. Date formatter constructions through inbox
navigation fell from 652 / 672 to 9 on desktop / mobile respectively. DOM counts
were unchanged, as expected.

Initial calendar readiness showed no consistent improvement: desktop large
222.8 → 212.0 ms, mobile large 669.2 → 697.8 ms. The small mobile layout portion
also rose from 0.75 to 1.29 ms while total interaction time improved. This pass
claims improvements to interaction and repeated CPU work, not startup or every
individual metric. The production component JS increased only 42 gzip bytes
(176,404 → 176,446); CSS was unchanged.

Date CPU medians per 2,000 calls:

| Function | Before | After |
| --- | ---: | ---: |
| `plannerDateKey` | 65.770 ms | 2.790 ms |
| `routineDateKey` | 67.850 ms | 4.167 ms |
| `routineDateParts` | 75.246 ms | 3.856 ms |
| `currentWeekKey` | 81.782 ms | 3.747 ms |

API baseline medians (backend unchanged):

| Synthetic fixture | Full GET | Unchanged GET | Parse + validate |
| --- | ---: | ---: | ---: |
| Starter, 4.6 KB | 16.77 ms | 16.60 ms | 0.11 ms |
| 2,000 tasks, 1.48 MB | 74.35 ms | 81.09 ms | 2.87 ms |

The API benchmark runs the real handlers with authentication/bindings stubbed
and disposable Miniflare D1. Its timings include local IPC and should not be
interpreted as Cloudflare production latency.

Raw measurements, including all browser samples and p95 values:
[browser before](../benchmarks/2026-10-04/browser-before.json),
[browser after](../benchmarks/2026-10-04/browser-after.json),
[dates before](../benchmarks/2026-10-04/date-before.json),
[dates after](../benchmarks/2026-10-04/date-after.json), and
[API baseline](../benchmarks/2026-10-04/workspace-baseline.json).

## Remaining costs

The stress inbox still mounts every row and every native destination option
(10,566 elements with 300 inbox tasks). The calendar also registers 476
quarter-hour drop targets. These are candidates for a later measured change if
workspaces grow further. This pass preserves the existing controls and drag
behavior. Bundle size is measured but is not the bottleneck addressed here.

## Validation

Run `npm run typecheck`, `npm run lint`, and `npm test` inside Docker. Date tests
cover timezone switching, midnight, both daylight-saving transitions, leap days,
ISO week boundaries, and invalid inputs. API tests use disposable D1 and cover
authentication, ETags, successful and stale writes, account isolation, and
byte-for-byte preservation of malformed or obsolete saved workspaces.

For this change, the production build, all 108 tests, typechecking, and lint
passed. Independent source review found no application regressions. Browser
smoke checks passed for rename, due-date editing, note editing/Escape, delete/undo,
move/undo, and saving on desktop and on mobile with reduced motion. Desktop and
mobile screenshots were inspected. Persisted user workspaces were untouched.
