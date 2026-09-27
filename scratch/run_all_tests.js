import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

function findTests(dir) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findTests(filePath));
    } else if (file.endsWith('.test.js')) {
      results.push(filePath);
    }
  }
  return results;
}

const tests = findTests('src');
console.log(`Found ${tests.length} test files.`);
let passedFiles = 0;
let failedFiles = 0;

for (const testFile of tests) {
  try {
    execSync(`node --env-file=.env --test --test-force-exit "${testFile}"`, { stdio: 'pipe', encoding: 'utf-8' });
    passedFiles++;
  } catch (err) {
    failedFiles++;
    console.error(`FAIL in: ${testFile}`);
    console.error(err.stdout?.slice(-800) || err.message);
  }
}

console.log(`Done. Passed files: ${passedFiles}, Failed files: ${failedFiles}`);
