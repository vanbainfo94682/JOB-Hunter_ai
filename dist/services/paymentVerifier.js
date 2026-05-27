"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCosmofeedPayment = verifyCosmofeedPayment;
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const chromiumStealth = playwright_extra_1.chromium;
chromiumStealth.use((0, puppeteer_extra_plugin_stealth_1.default)());
/**
 * Validates transaction status by scraping the public confirmation page.
 * Uses strict checks to ensure the payment is genuinely completed.
 */
async function verifyCosmofeedPayment(orderId) {
    const browser = await chromiumStealth.launch({ headless: true });
    const page = await browser.newPage();
    try {
        // Cosmofeed public order page URL pattern
        const url = `https://cosmofeed.com/order/${orderId}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        // 1. Anti-Fake check: Ensure the order exists and is marked as 'Success'
        const statusText = await page.textContent('.order-status'); // Adjust selector based on Cosmofeed's actual DOM
        const isSuccess = statusText?.toLowerCase().includes('success') || statusText?.toLowerCase().includes('completed');
        // 2. Extract Plan type if present on page
        const planText = await page.textContent('.plan-name');
        const planType = planText?.toLowerCase().includes('weekly') ? 'WEEKLY' :
            planText?.toLowerCase().includes('monthly') ? 'MONTHLY' : 'TWO_MONTH';
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
}
