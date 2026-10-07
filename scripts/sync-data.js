// Sync public/data to functions/data and src/shared/data.
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const srcDir = path.join(rootDir, 'public', 'data');
const targets = [
  path.join(rootDir, 'functions', 'data'),
  path.join(rootDir, 'src', 'shared', 'data')
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(srcDir, target, { recursive: true });
}

console.log('Successfully synced public/data to functions/data and src/shared/data');