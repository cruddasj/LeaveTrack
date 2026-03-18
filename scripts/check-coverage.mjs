import { spawnSync } from 'node:child_process';

const threshold = 80;
const args = ['--test', '--experimental-test-coverage'];

const run = spawnSync(process.execPath, args, {
  encoding: 'utf8',
  env: { ...process.env, FORCE_COLOR: '0' },
});

if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

const combined = `${run.stdout || ''}\n${run.stderr || ''}`;
const summaryLine = combined
  .split('\n')
  .find((line) => /all files\s*\|/i.test(line));

if (!summaryLine) {
  console.error('Coverage summary not found in test output.');
  process.exit(1);
}

const parts = summaryLine
  .split('|')
  .map((part) => part.trim())
  .filter(Boolean);

const lineCoverage = Number.parseFloat(parts[1]);
const branchCoverage = Number.parseFloat(parts[2]);

if (!Number.isFinite(lineCoverage) || !Number.isFinite(branchCoverage)) {
  console.error('Unable to parse line/branch coverage from summary:', summaryLine);
  process.exit(1);
}

if (lineCoverage < threshold || branchCoverage < threshold) {
  console.error(
    `Coverage check failed: lines ${lineCoverage}% and branches ${branchCoverage}% require at least ${threshold}%.`,
  );
  process.exit(1);
}

console.log(
  `Coverage check passed: lines ${lineCoverage}% and branches ${branchCoverage}% are both >= ${threshold}%.`,
);
