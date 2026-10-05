import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
export async function loadTS(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ginduyah-test-'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  for (const file of files) {
    const source = await readFile(new URL('../' + file + '.ts', import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from "(\.[^"]+)"/g, 'from "$1.js"');
    const path = join(dir, file + '.js'); await mkdir(dirname(path), { recursive: true }); await writeFile(path, js);
  }
  return { load: file => import(pathToFileURL(join(dir, file + '.js')).href), close: () => rm(dir, { recursive: true, force: true }) };
}
