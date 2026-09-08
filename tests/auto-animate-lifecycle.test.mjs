import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../vendor/auto-animate/index.mjs', import.meta.url), 'utf8');
function harness(childFirst = false) {
  const timeouts = new Map(), intervals = new Map(), idle = [];
  const mutations = [], intersections = [], resized = new Set();
  let id = 0;
  class Element {
    constructor() {
      this.children = [];
      this.children.item = (i) => this.children[i];
      this.isConnected = true;
      this.style = {};
      this.parentElement = null;
      this.offsetWidth = this.offsetHeight = this.clientWidth = this.clientHeight = 100;
    }
    getBoundingClientRect() { return { top: 0, left: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
    appendChild(child) { this.children.push(child); child.parentElement = this; child.isConnected = true; }
    remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
    animate() {
      let resolve;
      const finished = new Promise((r) => { resolve = r; });
      const handlers = [];
      this.animation = { finished, playState: 'running', cancel() {}, addEventListener(_, fn) { handlers.push(fn); }, finish() { this.playState = 'finished'; resolve(); handlers.forEach((fn) => fn()); } };
      return this.animation;
    }
  }
  const root = new Element();
  class ResizeObserver { observe(el) { resized.add(el); } unobserve(el) { resized.delete(el); } }
  class IntersectionObserver {
    constructor(cb) { this.cb = cb; intersections.push(this); }
    observe(el) { this.el = el; this.active = true; }
    disconnect() { this.active = false; }
  }
  class MutationObserver { constructor(cb) { this.cb = cb; mutations.push(this); } observe(el) { this.el = el; } disconnect() {} }
  const context = vm.createContext({
    Element, HTMLElement: Element, HTMLBodyElement: class {}, ResizeObserver, IntersectionObserver, MutationObserver,
    document: { documentElement: root, body: root },
    window: { ResizeObserver, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollX: 0, scrollY: 0 },
    getComputedStyle: () => ({ position: 'relative', getPropertyValue: () => 'border-box', borderTopWidth: '0', borderLeftWidth: '0' }),
    setTimeout: (fn) => { timeouts.set(++id, fn); return id; }, clearTimeout: (i) => timeouts.delete(i),
    setInterval: (fn) => { intervals.set(++id, fn); return id; }, clearInterval: (i) => intervals.delete(i),
    requestIdleCallback: (fn) => idle.push(fn),
  });
  vm.runInContext(source.replace(/export \{[^}]+\};/, 'globalThis.autoAnimate = autoAnimate;'), context);
  const parent = new Element(), child = new Element(); parent.appendChild(child);
  const childController = childFirst ? context.autoAnimate(child) : null;
  const controller = context.autoAnimate(parent);
  const flush = async () => { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach((fn) => fn()); await Promise.resolve(); await Promise.resolve(); };
  const mutate = (removedNodes = []) => mutations.find((m) => m.el === parent).cb([{ target: parent, addedNodes: removedNodes.length ? [] : [child], removedNodes, previousSibling: null, nextSibling: null }]);
  return { timeouts, intervals, idle, intersections, resized, parent, child, controller, childController, flush, mutate };
}

test('destroy cancels initial polling timers, including a child detached before mutation delivery', async () => {
  const h = harness();
  assert.equal(h.timeouts.size, 4);
  h.child.remove();
  h.controller.destroy();
  assert.equal(h.timeouts.size, 0);
  await h.flush();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.resized.has(h.child), false);
  h.mutate([h.child]);
  assert.equal(h.child.isConnected, false);
});

test('removed children release resize observation and recurring polling', async () => {
  const h = harness();
  await h.flush();
  assert.equal(h.intervals.size, 2);
  h.child.remove(); h.mutate([h.child]); h.child.animation.finish();
  await h.flush();
  assert.equal(h.resized.has(h.child), false);
  assert.equal(h.intervals.size, 1);
  assert.equal(h.intersections.some((o) => o.el === h.child && o.active), false);
  h.controller.destroy();
  assert.equal(h.intervals.size, 0);
});

test('position work awaiting animation or queued idle work cannot revive a destroyed element', async () => {
  const h = harness();
  await h.flush();
  h.mutate();
  for (const fn of h.intervals.values()) fn();
  const childObserver = h.intersections.find((o) => o.el === h.child);
  childObserver.cb(); childObserver.cb();
  const pending = [...h.timeouts.values()]; h.timeouts.clear(); pending.forEach((fn) => fn());
  h.controller.destroy();
  h.child.animation.finish();
  h.idle.forEach((fn) => fn());
  await h.flush();
  assert.equal(h.timeouts.size, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.intersections.some((o) => o.active), false);
});

test('queued position work cannot recreate observers after child removal finishes', async () => {
  const h = harness();
  await h.flush();
  h.mutate();
  const previousAnimation = h.child.animation;
  const observer = h.intersections.find((o) => o.el === h.child);
  observer.cb(); observer.cb();
  const pending = [...h.timeouts.values()]; h.timeouts.clear(); pending.forEach((fn) => fn());
  h.child.remove(); h.mutate([h.child]); h.child.animation.finish();
  previousAnimation.finish();
  await h.flush();
  assert.equal(h.resized.has(h.child), false);
  assert.equal(h.intersections.some((o) => o.el === h.child && o.active), false);
  assert.equal(h.intervals.size, 1);
  h.controller.destroy();
});

for (const startPolling of [false, true]) {
  test(`nested child-first controllers retain only one poll per node (${startPolling ? 'running' : 'pending'})`, async () => {
    const h = harness(true);
    assert.equal(h.timeouts.size, 4);
    if (startPolling) {
      await h.flush();
      assert.equal(h.intervals.size, 2);
    }
    h.controller.destroy();
    h.childController.destroy();
    await h.flush();
    assert.equal(h.timeouts.size, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.resized.has(h.child), false);
    assert.equal(h.intersections.some((o) => o.active), false);
  });
}
