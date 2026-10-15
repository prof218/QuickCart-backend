/**
 * Lightweight static check: ensures every source module parses and its imports
 * resolve/evaluate (without connecting to the DB or starting the server).
 * Run with: npm run check
 */
import { readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const roots = ['src', 'scripts'];
const skip = new Set(['server.js', 'seed.js', 'check-syntax.js']); // these have side effects

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const files = roots.flatMap((r) => walk(r)).filter((f) => !skip.has(path.basename(f)));

let failures = 0;
for (const file of files) {
  try {
    await import(pathToFileURL(path.resolve(file)).href);
    console.log(`  ok  ${file}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${file}: ${err.message}`);
  }
}

console.log(`\n[check] ${files.length - failures}/${files.length} modules loaded cleanly`);
process.exit(failures ? 1 : 0);
