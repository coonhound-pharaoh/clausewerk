// Run every database suite.
//
// This exists because the previous `npm test` hard-listed five suite names. A
// new suite added to this directory was never run, so a green `npm test` proved
// only that the five remembered suites passed — an acceptance check that cannot
// notice new work is not an acceptance check. Discovery removes the failure
// mode entirely: a suite is run because it is here, not because someone
// remembered to add it.
//
//   node db/test/run-all.mjs

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

const suites = readdirSync(HERE)
  .filter(f => f.endsWith('.test.mjs'))
  .sort();

if (suites.length === 0) {
  console.error('no *.test.mjs suites found in db/test — discovery is broken');
  process.exit(1);
}

const failed = [];

for (const suite of suites) {
  try {
    execFileSync(process.execPath, [join(HERE, suite)], { stdio: 'inherit' });
  } catch {
    failed.push(suite);
  }
}

console.log(`\n${suites.length - failed.length}/${suites.length} suites passed`);
if (failed.length) {
  console.log('\nfailing suites:');
  for (const s of failed) console.log('  · ' + s);
  process.exit(1);
}
