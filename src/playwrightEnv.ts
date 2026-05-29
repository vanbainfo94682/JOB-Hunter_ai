import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// Removed custom browser path override to allow Playwright to use its default global cache path,
// which matches where 'npx playwright install' downloads browsers by default on Render.
