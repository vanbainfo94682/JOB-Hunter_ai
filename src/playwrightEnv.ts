import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const browserCachePath = path.resolve(__dirname, '..', '..', '.playwright-browsers');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserCachePath;
}

console.log('Playwright browser path set to:', process.env.PLAYWRIGHT_BROWSERS_PATH);
