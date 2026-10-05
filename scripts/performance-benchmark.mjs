import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const { values: options } = parseArgs({ options: {
  iterations: { type: 'string' }, output: { type: 'string' }, bundle: { type: 'string' },
  'reuse-bundle': { type: 'boolean', default: false },
} });
const iterations = Number(options.iterations ?? 5);
assert.ok(Number.isInteger(iterations) && iterations >= 3, '--iterations must be at least 3');
const output = resolve(options.output ?? 'output/performance/browser.json');
const bundleDir = resolve(options.bundle ?? 'output/performance/browser-bundle');
await mkdir(bundleDir, { recursive: true });

// An isolated production component harness, not an application preview. The real
// component and styles run with an in-memory client: no D1 or API writes occur.
if (!options['reuse-bundle']) {
  await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import FocusHQ from './app/focus-hq';
      import './app/globals.css';
      import './app/interface.css';
      import { createStarterWorkspace } from './app/starter-workspace.mjs';
      const large = new URLSearchParams(location.search).get('size') === 'large';
      let workspace = createStarterWorkspace();
      workspace.routines = [];
      workspace.planner.blockRules.forEach(rule => rule.effectiveOn = '2026-10-05');
      workspace.tasks = Array.from({length: large ? 1000 : 100}, (_, i) => ({
        id: 'benchmark-' + i, title: 'Benchmark task ' + i,
        status: 'todo', createdAt: i + 1, dueDate: '2026-10-07',
        ...(i < (large ? 300 : 30) ? {} : {areaId: 'trading', projectId: 'execution'})
      }));
      let updatedAt = 1;
      window.__saves = 0;
      const client = {
        read: async revision => revision === updatedAt ? null : ({workspace, updatedAt}),
        save: async (next, revision) => {
          if (revision !== updatedAt) throw Error('Benchmark revision conflict');
          workspace = next;
          window.__saves++;
          return {updatedAt: ++updatedAt};
        }
      };
      createRoot(document.getElementById('root')).render(<FocusHQ client={client} />);
    ` },
    outfile: resolve(bundleDir, 'app.js'), bundle: true, format: 'iife', platform: 'browser',
    target: 'es2022', minify: true, loader: { '.svg': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
}
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    if (path === '/') { response.setHeader('content-type', 'text/html'); response.end(html); return; }
    const file = path === '/app.js' || path === '/app.css' ? resolve(bundleDir, path.slice(1)) : resolve('public', '.' + path);
    if (!file.startsWith(bundleDir + '/') && !file.startsWith(resolve('public') + '/')) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', {'.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2'}[extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { median: +sorted[Math.ceil(sorted.length / 2) - 1].toFixed(2), p95: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2) };
}
async function metrics(session, page) {
  const {metrics} = await session.send('Performance.getMetrics');
  return {...Object.fromEntries(metrics.map(({name, value}) => [name, value])), ...await page.evaluate(() => ({...window.__perf, elements: document.querySelectorAll('*').length}))};
}
async function painted(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function navigate(page, name) {
  const menu = page.getByRole('button', { name: 'Workspace menu', exact: true });
  if (await menu.isVisible()) await menu.click();
  const nav = page.getByRole('navigation', { name: (await menu.isVisible()) ? 'Workspace menu' : 'Workspace', exact: true });
  await nav.getByRole('button', { name: new RegExp('^' + name) }).click();
}

const results = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const profile of [
    {name: 'desktop', viewport: {width: 1440, height: 1000}, cpuRate: 1},
    {name: 'mobile-4x', viewport: {width: 390, height: 844}, cpuRate: 4},
  ]) for (const size of ['small', 'large']) {
    const samples = [];
    for (let i = 0; i < iterations; i++) {
      const context = await browser.newContext({viewport: profile.viewport, reducedMotion: 'no-preference', timezoneId: 'America/Los_Angeles'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        // Fix only wall-clock dates. Playwright's clock also emulates timers,
        // which distorts requestAnimationFrame/idle observer performance.
        const fixedTime = Date.parse('2026-10-05T16:00:00Z');
        const fixedNow = () => fixedTime;
        window.Date = new Proxy(Date, {
          construct(target, args, newTarget) { return Reflect.construct(target, args.length ? args : [fixedTime], newTarget); },
          apply(target) { return new target(fixedTime).toString(); },
          get(target, property, receiver) { return property === 'now' ? fixedNow : Reflect.get(target, property, receiver); },
        });
        window.__perf = { geometryReads: 0, intlConstructors: 0, observerCreates: 0, longTaskMs: 0, lastClick: 0 };
        const rect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function (...args) { window.__perf.geometryReads++; return rect.apply(this, args); };
        Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, { construct(target, args) { window.__perf.intlConstructors++; return Reflect.construct(target, args); } });
        window.IntersectionObserver = new Proxy(window.IntersectionObserver, { construct(target, args) { window.__perf.observerCreates++; return Reflect.construct(target, args); } });
        new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__perf.longTaskMs += entry.duration; }).observe({type: 'longtask', buffered: true});
        document.addEventListener('click', () => { window.__perf.lastClick = performance.now(); }, true);
      });
      const session = await context.newCDPSession(page);
      await session.send('Performance.enable');
      await session.send('Emulation.setCPUThrottlingRate', {rate: profile.cpuRate});
      await page.goto(url + '/?size=' + size);
      await page.locator('.planner-calendar').waitFor();
      await page.locator('.sync-state.saved').waitFor();
      await painted(page);
      const ready = await page.evaluate(() => performance.now());
      await navigate(page, 'Inbox');
      await page.waitForFunction(count => document.querySelectorAll('.inbox-row').length === count, size === 'large' ? 300 : 30);
      await painted(page);
      const inboxMs = await page.evaluate(() => performance.now() - window.__perf.lastClick);
      await page.waitForTimeout(600);
      const inbox = await metrics(session, page);
      const beforeToggle = await metrics(session, page);
      const saves = await page.evaluate(() => window.__saves);
      const checkbox = page.getByRole('checkbox', {name: 'Complete Benchmark task 0', exact: true});
      await checkbox.click();
      await painted(page);
      const togglePaintMs = await page.evaluate(() => performance.now() - window.__perf.lastClick);
      assert.equal(await checkbox.isChecked(), true);
      await page.waitForFunction(previous => window.__saves > previous, saves);
      await page.locator('.sync-state.saved').waitFor();
      await page.waitForTimeout(300);
      const afterToggle = await metrics(session, page);
      let idle;
      if (i === 0) {
        // Let staggered auto-animation polls start before the fixed idle window.
        await page.waitForTimeout(2500);
        const before = await metrics(session, page);
        await page.waitForTimeout(4000);
        const after = await metrics(session, page);
        idle = { durationMs: 4000, geometryReads: after.geometryReads - before.geometryReads, observerCreates: after.observerCreates - before.observerCreates, taskMs: 1000 * (after.TaskDuration - before.TaskDuration) };
        await page.screenshot({path: resolve(bundleDir, `${profile.name}-${size}.png`), fullPage: false});
      }
      assert.deepEqual(errors, [], 'Browser errors');
      samples.push({readyMs: ready, inboxMs, togglePaintMs, toggleScriptMs: 1000 * (afterToggle.ScriptDuration - beforeToggle.ScriptDuration), toggleLayoutMs: 1000 * (afterToggle.LayoutDuration - beforeToggle.LayoutDuration), intlConstructors: inbox.intlConstructors, elements: inbox.elements, idle});
      await context.close();
    }
    const summary = Object.fromEntries(Object.keys(samples[0]).filter(key => key !== 'idle').map(key => [key, summarize(samples.map(sample => sample[key]))]));
    results.push({profile: profile.name, size, tasks: size === 'large' ? 1000 : 100, inboxTasks: size === 'large' ? 300 : 30, cpuRate: profile.cpuRate, summary, idle: samples[0].idle, samples});
    console.error(`${profile.name} ${size}: inbox ${summary.inboxMs.median} ms, toggle ${summary.togglePaintMs.median} ms`);
  }
  const assets = await Promise.all(['app.js', 'app.css'].map(async name => {const body = await readFile(resolve(bundleDir, name)); return {name, bytes: body.length, gzipBytes: gzipSync(body).length};}));
  const report = {generatedAt: new Date().toISOString(), browser: browser.version(), iterations, description: 'Production React component lab with synthetic in-memory workspaces. No network or D1 latency; CPU throttling is emulation, not real mobile hardware. Timings are click-to-two-animation-frames, not field INP.', assets, results};
  await mkdir(dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  try { await browser?.close(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
