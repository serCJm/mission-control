# Performance report

Measured on August 30, 2026 in the project Docker container. The page benchmark used a warmed Vinext production server and 50 sequential requests. The workspace benchmark used the local development D1 binding and the same 50-request sample. Byte counts and HTML element counts are deterministic; local latency figures are directional and can vary with host load.

## Results

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial HTML | 75,525 B | 10,186 B | -86.5% |
| Initial HTML, gzip estimate | 6,899 B | 2,415 B | -65.0% |
| Server-rendered elements | 893 | 50 | -94.4% |
| Root median TTFB | 8.31 ms | 4.83 ms | -41.9% |
| Root p95 TTFB | 14.77 ms | 7.65 ms | -48.2% |
| Initial HTML + static assets | 771,102 B | 691,953 B | -10.3% |
| Initial HTML + static assets, gzip estimate | 194,281 B | 186,307 B | -4.1% |
| Initial CSS | 127,975 B | 117,645 B | -8.1% |
| Initial CSS, gzip estimate | 23,094 B | 20,806 B | -9.9% |
| Initial page JavaScript | 199,378 B | 195,882 B | -1.8% |
| Initial page JavaScript, gzip estimate | 53,488 B | 52,280 B | -2.3% |
| Failed font preloads | 2 | 0 | -100% |
| Unchanged workspace refresh payload | 7,930 B | 0 B | -100% |
| Unchanged workspace refresh median | 11.18 ms | 9.63 ms | -13.9% |
| Unchanged workspace refresh p95 | 23.55 ms | 11.47 ms | -51.3% |
| Warm build median, 3 runs | 2,614 ms | 2,529 ms | -3.3% |

Gzip figures are level-9 estimates over the exact response and asset bodies. Production edge compression may produce slightly different transfer sizes.

## Bottlenecks and changes

1. The loading response rendered the complete planner and workspace underneath an opaque sync gate. The server now renders only the 50-element loading surface and mounts the workspace after its data is ready.
2. The generated page preloaded two local filesystem font URLs that returned 404 responses. The app now uses a system font stack, eliminating both failed requests and font-driven layout work.
3. Tailwind's generated base and utilities were shipped even though this interface uses its own semantic CSS. The unused processor and dependencies were removed.
4. Quick-capture input lived at the workspace root, so each keystroke rerendered the planner. It now owns its input state locally. Autosave serialization also moved behind the existing debounce and reuses one serialized workspace instead of serializing before and during every save.
5. Starter workspace content was parsed by every returning user. It is now a separate lazy chunk loaded only when a new workspace actually needs to be created.
6. Focus and visibility refreshes downloaded and revalidated the entire workspace even when unchanged. The API now emits an ETag and answers matching refreshes with an empty `304 Not Modified` response before JSON parsing and schema normalization.

## Reproduce

Start the project with development data enabled, build it, run the production server on a second internal port, then execute:

```sh
docker-compose exec -T app npm run benchmark -- \
  --app-url=http://127.0.0.1:3104 \
  --api-url=http://127.0.0.1:3000 \
  --iterations=50
```

The repeatable benchmark is in `scripts/performance-benchmark.mjs`. Regression coverage also caps the server-rendered loading response at 20 KB and rejects filesystem font preloads.

## Validation

- Production build completed successfully.
- ESLint completed with no findings.
- All 34 tests passed.
- The active local workspace remained valid after the work: 4 areas, 5 projects, 9 tasks, 2 routines, and 3 planner rules.

The largest remaining initial cost is the Vinext/React runtime plus the planner application code. A future pass could split infrequently used area, project, and review screens into on-demand chunks, but the default Today screen should stay eagerly available to avoid introducing a data-to-code waterfall.
