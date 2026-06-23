const { execSync } = require('child_process');

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
console.log('Forcing Playwright to install browsers into local node_modules');

try {
  // Using node directly bypasses 'sh: 1: playwright: Permission denied' errors on Render
  execSync('node node_modules/playwright/cli.js install chromium', {
    stdio: 'inherit',
    env: process.env
  });
  console.log('Playwright browser installation completed.');
} catch (error) {
  console.error('Playwright browser installation failed:', error.message || error);
  process.exit(1);
}
