import { gzipSync } from "node:zlib";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [name, value = "true"] = argument.replace(/^--/, "").split("=", 2);
  return [name, value];
}));

const appBaseUrl = new URL(options["app-url"] ?? "http://127.0.0.1:3100");
const apiBaseUrl = new URL(options["api-url"] ?? appBaseUrl);
const iterations = Number(options.iterations ?? 30);

if (!Number.isInteger(iterations) || iterations < 5) {
  throw new Error("--iterations must be an integer of at least 5");
}

const identityHeaders = { "accept-encoding": "identity" };
const apiHeaders = { ...identityHeaders, "x-chatgpt-user-id": options["user-id"] ?? "dev-user" };

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    minMs: Number(sorted[0].toFixed(2)),
    medianMs: Number(percentile(sorted, 0.5).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    maxMs: Number(sorted.at(-1).toFixed(2)),
  };
}

async function request(url, headers) {
  const started = performance.now();
  const response = await fetch(url, { headers, redirect: "manual" });
  const headersAt = performance.now();
  const body = Buffer.from(await response.arrayBuffer());
  const completed = performance.now();
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    etag: response.headers.get("etag"),
    body,
    ttfbMs: headersAt - started,
    totalMs: completed - started,
  };
}

async function benchmarkRoute(url, headers) {
  const warmup = await request(url, headers);
  if (warmup.status !== 200) {
    throw new Error(`${url} returned ${warmup.status}`);
  }

  const ttfb = [];
  const total = [];
  let bytes = warmup.body.byteLength;
  for (let index = 0; index < iterations; index += 1) {
    const result = await request(url, headers);
    if (result.status !== 200) throw new Error(`${url} returned ${result.status}`);
    bytes = result.body.byteLength;
    ttfb.push(result.ttfbMs);
    total.push(result.totalMs);
  }

  return {
    iterations,
    bytes,
    gzipBytes: gzipSync(warmup.body, { level: 9 }).byteLength,
    etag: warmup.etag,
    ttfb: summarize(ttfb),
    total: summarize(total),
    body: warmup.body,
  };
}

async function benchmarkConditionalApi(url, etag) {
  const total = [];
  const statuses = new Set();
  let bytes = 0;
  for (let index = 0; index < iterations; index += 1) {
    const result = await request(url, { ...apiHeaders, "if-none-match": etag });
    statuses.add(result.status);
    bytes += result.body.byteLength;
    total.push(result.totalMs);
  }
  return {
    iterations,
    statuses: [...statuses],
    averageBytes: bytes / iterations,
    total: summarize(total),
  };
}

function initialAssetPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"[^>]*>/g)) {
    const path = match[1];
    if (path.startsWith("/_next/static/")) paths.add(path);
  }
  return [...paths];
}

function fontPreloadPaths(html) {
  return [...html.matchAll(/<link\b(?=[^>]*rel="preload")(?=[^>]*as="font")[^>]*href="([^"]+)"[^>]*>/g)]
    .map((match) => match[1]);
}

const rootUrl = new URL("/", appBaseUrl);
const apiUrl = new URL("/api/workspace", apiBaseUrl);
const root = await benchmarkRoute(rootUrl, identityHeaders);
const api = await benchmarkRoute(apiUrl, apiHeaders);
const apiPayload = JSON.parse(api.body.toString("utf8"));
const conditionalApi = await benchmarkConditionalApi(apiUrl, api.etag ?? `"${apiPayload.updatedAt}"`);
const html = root.body.toString("utf8");
const assetPaths = initialAssetPaths(html);
const assetResults = await Promise.all(assetPaths.map(async (path) => {
  const result = await request(new URL(path, appBaseUrl), identityHeaders);
  return {
    path,
    status: result.status,
    bytes: result.body.byteLength,
    gzipBytes: gzipSync(result.body, { level: 9 }).byteLength,
    contentType: result.contentType,
  };
}));
const fontPreloads = await Promise.all(fontPreloadPaths(html).map(async (path) => {
  const result = await request(new URL(path, appBaseUrl), identityHeaders);
  return { path, status: result.status, bytes: result.body.byteLength, contentType: result.contentType };
}));

const initialAssets = assetResults.filter((asset) => asset.status === 200);
const report = {
  generatedAt: new Date().toISOString(),
  appUrl: appBaseUrl.href,
  apiUrl: apiBaseUrl.href,
  root: {
    bytes: root.bytes,
    gzipBytes: root.gzipBytes,
    elementCount: [...html.matchAll(/<[a-z][a-z0-9-]*(?:\s|>)/gi)].length,
    ttfb: root.ttfb,
    total: root.total,
  },
  api: {
    bytes: api.bytes,
    gzipBytes: api.gzipBytes,
    ttfb: api.ttfb,
    total: api.total,
  },
  conditionalApi,
  initialTransfer: {
    assetCount: initialAssets.length,
    rawBytes: root.bytes + initialAssets.reduce((total, asset) => total + asset.bytes, 0),
    gzipBytes: root.gzipBytes + initialAssets.reduce((total, asset) => total + asset.gzipBytes, 0),
    assets: assetResults,
  },
  fontPreloads,
};

console.log(JSON.stringify(report, null, 2));
