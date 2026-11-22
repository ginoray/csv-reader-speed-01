// The driver the harness runs (node /bot/main.ts, Node 22): reads every case from
// /input/cases.json — a JSON array of {id, input} — answers each one alone with run() from
// ./solve.js, and writes /output/answers.json, a JSON array of the answers in the cases' order.
// Outside the grading container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for
// /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// The house driver runs with V8's incremental marking off, set before solve.js is imported so
// all of its work runs under it; the rules allow an entry the same tuning.
setFlagsFromString('--no-incremental-marking');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = new Array(cases.length);
for (let k = 0; k < cases.length; k++) answers[k] = run(cases[k].input);
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
