import { build } from 'esbuild';

await build({
  entryPoints: ['web/src/main.js'],
  bundle: true,
  sourcemap: true,
  format: 'esm',
  target: ['es2022'],
  outfile: 'web/public/app.js',
  logLevel: 'info'
});
