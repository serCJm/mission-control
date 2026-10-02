import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['plugin-ui/index.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
const css = await readFile('plugin-ui/style.css', 'utf8');
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
await writeFile('app/mcp/ui.generated.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mission Control</title><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`);
