import assert from "node:assert/strict";
import test from "node:test";
import { createNavigationTransition } from "../app/navigation-transition.mjs";

test("navigation commits only the newest deferred view-transition callback", () => {
  const callbacks = [];
  const updates = [];
  const navigate = createNavigationTransition();
  const startTransition = (callback) => callbacks.push(callback);

  navigate({ unchanged: false, reducedMotion: false, startTransition, update: () => updates.push("inbox") });
  navigate({ unchanged: false, reducedMotion: false, startTransition, update: () => updates.push("review") });

  assert.equal(callbacks.length, 2);
  callbacks[0]();
  assert.deepEqual(updates, []);
  callbacks[1]();
  assert.deepEqual(updates, ["review"]);
});

test("navigation updates immediately when a transition is inappropriate or unavailable", () => {
  for (const request of [
    { unchanged: true, reducedMotion: false, startTransition: () => assert.fail("same-page navigation must not animate") },
    { unchanged: false, reducedMotion: true, startTransition: () => assert.fail("reduced-motion navigation must not animate") },
    { unchanged: false, reducedMotion: false, startTransition: undefined },
  ]) {
    let updates = 0;
    createNavigationTransition()({ ...request, update: () => updates++ });
    assert.equal(updates, 1);
  }
});

test("an immediate navigation invalidates an older deferred transition", () => {
  let staleCallback;
  const updates = [];
  const navigate = createNavigationTransition();

  navigate({
    unchanged: false,
    reducedMotion: false,
    startTransition: (callback) => { staleCallback = callback; },
    update: () => updates.push("inbox"),
  });
  navigate({ unchanged: true, reducedMotion: false, startTransition: undefined, update: () => updates.push("today") });

  staleCallback();
  assert.deepEqual(updates, ["today"]);
});
