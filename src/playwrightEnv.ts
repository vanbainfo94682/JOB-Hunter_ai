import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Force Playwright to install and look for browsers inside the local project folder (node_modules).
// This is required on Render because the global cache (~/.cache) is discarded after the build step.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
