import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const JS_FILES = [
  'assets/js/app.js',
  'assets/js/utils.js',
  'service-worker.js',
  'scripts/generate-icons.mjs',
  'scripts/lint.mjs',
  'scripts/check-coverage.mjs',
  'tests/utils.test.js',
];

for (const relativeFile of JS_FILES) {
  const absoluteFile = path.join(ROOT, relativeFile);
  const source = fs.readFileSync(absoluteFile, 'utf8');

  if (/\t/.test(source)) {
    throw new Error(`${relativeFile}: contains tab characters; use spaces.`);
  }

  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) {
      throw new Error(`${relativeFile}:${index + 1} has trailing whitespace.`);
    }
  });

  execFileSync(process.execPath, ['--check', absoluteFile], { stdio: 'pipe' });
}

console.log(`Lint checks passed for ${JS_FILES.length} files.`);
