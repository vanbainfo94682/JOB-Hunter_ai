"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCosmofeedPayment = verifyCosmofeedPayment;
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const playwrightQueue_1 = require("../utils/playwrightQueue");
const chromiumStealth = playwright_extra_1.chromium;
chromiumStealth.use((0, puppeteer_extra_plugin_stealth_1.default)());
/**
 * Validates transaction status by scraping the public confirmation page.
 * Uses strict checks to ensure the payment is genuinely completed.
 */
async function verifyCosmofeedPayment(orderId) {
    return playwrightQueue_1.playwrightQueue.enqueue(async () => {
        const browser = await chromiumStealth.launch({ headless: true });
        const page = await browser.newPage();
        try {
            // Cosmofeed public order page URL pattern
            const url = `https://cosmofeed.com/order/${orderId}`;
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            // 1. Anti-Fake check: Ensure the order exists and is marked as 'Success'
            const statusText = await page.textContent('.order-status').catch(() => null);
            const bodyText = await page.textContent('body').catch(() => '');
            let isSuccess = false;
            if (statusText) {
                isSuccess = statusText.toLowerCase().includes('success') || statusText.toLowerCase().includes('completed');
            }
            if (!isSuccess && bodyText) {
                // Fallback: Check if the page itself mentions success
                const lowerBody = bodyText.toLowerCase();
                isSuccess = lowerBody.includes('payment successful') || lowerBody.includes('order successful') || lowerBody.includes('payment completed');
            }
            // 2. Extract Plan type if present on page
            let planType = null;
            const planText = await page.textContent('.plan-name').catch(() => null);
            if (planText) {
                planType = planText.toLowerCase().includes('weekly') ? 'WEEKLY' :
                    planText.toLowerCase().includes('monthly') ? 'MONTHLY' : 'TWO_MONTH';
            }
            if (!planType && bodyText) {
                const lowerBody = bodyText.toLowerCase();
                planType = lowerBody.includes('weekly') ? 'WEEKLY' :
                    lowerBody.includes('monthly') ? 'MONTHLY' :
                        lowerBody.includes('quarterly') || lowerBody.includes('two') ? 'TWO_MONTH' : 'WEEKLY'; // default to weekly if not found
            }
            if (isSuccess && planType) {
                await browser.close();
                return { success: true, plan: planType };
            }
        }
        catch (error) {
            console.error('Payment verification scrape failed:', error);
        }
        finally {
            await browser.close();
        }
        return { success: false };
    });
}
