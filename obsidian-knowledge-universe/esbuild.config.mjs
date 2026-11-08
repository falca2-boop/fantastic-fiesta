import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const mode = process.argv[2] || 'development';
const prod = mode === 'production';

const banner = `/*
Knowledge Universe – generated bundle (Three.js is included).
Source: src/ in the plugin repository.
*/`;

const common = {
  banner: { js: banner },
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  treeShaking: true,
  sourcemap: prod ? false : 'inline',
  minify: prod,
};

if (mode === 'plugin-harness') {
  // das echte Plugin gegen einen Browser-Nachbau der Obsidian-API (nur für Tests)
  await esbuild.build({ ...common, banner: {}, entryPoints: ['dev/plugin-harness.ts'], outfile: 'dev/out/plugin-harness.js', format: 'iife', sourcemap: false, minify: false,
    alias: { obsidian: './dev/obsidian-browser-mock.ts' } });
} else if (mode === 'harness') {
  // Standalone Seite zum Testen im Browser, ohne Obsidian
  await esbuild.build({ ...common, banner: {}, entryPoints: ['dev/harness.ts'], outfile: 'dev/out/harness.js', format: 'iife', sourcemap: false, minify: false });
} else {
  const ctx = await esbuild.context({
    ...common,
    entryPoints: ['src/main.ts'],
    external: ['obsidian', 'electron', '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands',
      '@codemirror/language', '@codemirror/lint', '@codemirror/search', '@codemirror/state', '@codemirror/view',
      '@lezer/common', '@lezer/highlight', '@lezer/lr', ...builtins],
    outfile: 'main.js',
  });
  if (prod) { await ctx.rebuild(); process.exit(0); }
  else await ctx.watch();
}
