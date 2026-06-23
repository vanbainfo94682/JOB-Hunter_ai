import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, 'public');
const versionFilePath = path.join(publicDir, 'version.json');
const swFilePath = path.join(publicDir, 'sw.js');

// Generate a random version hash
const deployHash = Date.now().toString(36) + Math.random().toString(36).substring(2);
const newVersion = `1.0.0-${deployHash}`;

// 1. Update version.json
fs.writeFileSync(versionFilePath, JSON.stringify({ version: newVersion }, null, 2));
console.log(`[VANBA DEPLOY] Updated version.json to: ${newVersion}`);

// 2. Update sw.js DEPLOY_HASH
if (fs.existsSync(swFilePath)) {
  let swContent = fs.readFileSync(swFilePath, 'utf-8');
  // Replace the first line containing DEPLOY_HASH
  swContent = swContent.replace(/const DEPLOY_HASH = '.*';/, `const DEPLOY_HASH = '${newVersion}';`);
  fs.writeFileSync(swFilePath, swContent);
  console.log(`[VANBA DEPLOY] Updated sw.js DEPLOY_HASH to: ${newVersion}`);
} else {
  console.warn(`[VANBA DEPLOY] sw.js not found at ${swFilePath}, skipping.`);
}
