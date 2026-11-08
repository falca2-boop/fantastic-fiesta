// Baut die Tests mit esbuild (obsidian -> Mock) und führt sie mit dem Node-Testrunner aus.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await esbuild.build({
  entryPoints: [path.join(root, 'test/core.test.ts')],
  outfile: path.join(root, 'test/out/core.test.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning',
  alias: { obsidian: path.join(root, 'test/obsidian-mock.ts') },
});
const r = spawnSync(process.execPath, ['--test', path.join(root, 'test/out/core.test.cjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
