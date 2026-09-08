# Local lifecycle patch

Source: `@formkit/auto-animate` 0.10.0, MIT (see LICENSE).
Only the upstream core runtime, public types, and license are vendored. The
application imports the core API; framework adapter subpaths are not packaged.

Changes in `index.mjs`:

- Store the initial staggered polling timeout in the same registry as the later
  interval, so disable/destroy can cancel either stage. Reuse an existing poll
  when nested controllers register the same element.
- Release resize/intersection observers, timers, and lifetime state when a child
  finishes removal, as well as when its controller is destroyed.
- Track a controller's registered nodes so destroy also releases children already
  detached from the DOM before mutation delivery.
- Guard queued idle/debounce work and animation promise continuations with a
  registration identity and connection check. Ignore mutations for destroyed
  parents. Stale callbacks cannot recreate position observers after teardown.

Animation keyframes, timings, options, and public core types are unchanged.
`tests/auto-animate-lifecycle.test.mjs` exercises the runtime with deterministic
browser observer/timer doubles, including pending polls and animation promises.
