import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../app/list-motion.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(reduced = false) {
  const listeners = new Set();
  const controllers = [];
  const preference = {
    matches: reduced,
    addEventListener: (name, listener) => { assert.equal(name, "change"); listeners.add(listener); },
    removeEventListener: (name, listener) => { assert.equal(name, "change"); listeners.delete(listener); },
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: () => ({ default: (parent, plugin) => {
      const controller = { plugin, destroyed: false, destroy() { this.destroyed = true; } };
      controllers.push(controller);
      return controller;
    } }),
    window: { matchMedia: () => preference },
    KeyframeEffect: class {
      constructor(element, frames, options) { Object.assign(this, { element, frames, options }); }
    },
  });
  const exiting = new Set();
  const parent = { querySelectorAll: () => [...exiting] };
  return {
    ref: exports.listMotionRef, parent, controllers, exiting, listeners,
    setReduced(value) { preference.matches = value; listeners.forEach((listener) => listener()); },
  };
}

test("list motion respects preference changes and releases its controller and listener", () => {
  const state = setup(true);
  const cleanup = state.ref(state.parent);
  assert.equal(state.controllers.length, 0);
  state.setReduced(false);
  assert.equal(state.controllers.length, 1);
  state.setReduced(true);
  assert.equal(state.controllers[0].destroyed, true);
  state.setReduced(false);
  assert.equal(state.controllers.length, 2);
  cleanup();
  assert.equal(state.controllers[1].destroyed, true);
  assert.equal(state.listeners.size, 0);
});

test("exiting list rows become inaccessible and canceled exits are removed", () => {
  const state = setup();
  const cleanup = state.ref(state.parent);
  const attributes = new Map();
  const row = {
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    remove: () => state.exiting.delete(row),
  };
  const effect = state.controllers[0].plugin(row, "remove");
  assert.equal(attributes.get("inert"), "");
  assert.equal(attributes.get("aria-hidden"), "true");
  assert.equal(attributes.get("data-list-exiting"), "");
  assert.equal(effect.options.duration, 130);
  state.exiting.add(row);
  state.setReduced(true);
  assert.equal(state.exiting.size, 0);
  cleanup();
});

test("list motion leaves disclosure and drag transforms under their own control", () => {
  const state = setup();
  const cleanup = state.ref(state.parent);
  const plugin = state.controllers[0].plugin;
  const disclosure = { hasAttribute: () => true };
  assert.equal(plugin(disclosure, "remain").frames.length, 0);
  const dragged = { hasAttribute: () => false, matches: () => true };
  assert.equal(plugin(dragged, "remain", { left: 0, top: 0 }, { left: 10, top: 10 }).frames.length, 0);
  cleanup();
});
