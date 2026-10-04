import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['plugin-ui/index.tsx'], outdir: 'plugin-bundle', bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true, define: { 'process.env.NODE_ENV': '"production"' } });
const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
const script = result.outputFiles.find((file) => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
await writeFile('app/mcp/ui.generated.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FocusHQ</title><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`);
