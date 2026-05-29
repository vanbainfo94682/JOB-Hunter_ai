import { supabase } from '../db';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { playwrightQueue } from '../utils/playwrightQueue';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

/**
 * Validates transaction status by scraping the public confirmation page.
 * Uses strict checks to ensure the payment is genuinely completed.
 */
