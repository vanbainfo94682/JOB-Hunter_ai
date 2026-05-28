const { execSync } = require('child_process');
const path = require('path');

const browserCachePath = path.resolve(__dirname, '..', '.playwright-browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || browserCachePath;

console.log('Installing Playwright browser binaries to:', process.env.PLAYWRIGHT_BROWSERS_PATH);

try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }
  });
  console.log('Playwright browser installation completed.');
} catch (error) {
  console.error('Playwright browser installation failed:', error.message || error);
  process.exit(1);
}
