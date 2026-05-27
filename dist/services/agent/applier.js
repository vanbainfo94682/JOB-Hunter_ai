"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyToJob = applyToJob;
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../../db");
const matcher_1 = require("./matcher");
const crypto_1 = require("../../utils/crypto");
const chromiumStealth = playwright_extra_1.chromium;
chromiumStealth.use((0, puppeteer_extra_plugin_stealth_1.default)());
// Ensure the screenshots directory exists
const SCREENSHOTS_DIR = path_1.default.join(__dirname, '..', '..', '..', 'public', 'screenshots');
if (!fs_1.default.existsSync(SCREENSHOTS_DIR)) {
    fs_1.default.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
/**
 * Utility to introduce human-like random pauses
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Simulates typing text into a locator with natural keystroke timings and occasional backspaces.
 */
async function humanType(page, selector, text) {
    const element = page.locator(selector).first();
    await element.click();
    await sleep(Math.floor(Math.random() * 200) + 100);
    for (const char of text) {
        await element.type(char, { delay: Math.floor(Math.random() * 120) + 40 });
        // Occasional micro-pauses
        if (Math.random() < 0.15) {
            await sleep(Math.floor(Math.random() * 200) + 50);
        }
    }
}
/**
 * Executes a stealth browser automation application session for a queued job.
 * userId is used to fetch the per-user profile, settings, and matcher materials.
 */
async function applyToJob(jobId, userId, dryRun = true) {
    const job = await db_1.prisma.job.findUnique({ where: { id: jobId } });
    // Per-user profile lookup
    let profile;
    if (userId) {
        profile = await db_1.prisma.userProfile.findFirst({ where: { userId } });
    }
    else {
        profile = await db_1.prisma.userProfile.findFirst();
    }
    // Per-user settings lookup
    let settings;
    if (userId) {
        settings = await db_1.prisma.agentSettings.findFirst({ where: { userId } });
    }
    else {
        settings = await db_1.prisma.agentSettings.findFirst();
    }
    if (!job) {
        await (0, db_1.logSystem)('ERROR', `Application aborted. Job ID "${jobId}" not found.`);
        return false;
    }
    if (!profile) {
        await (0, db_1.logSystem)('ERROR', `Application aborted for "${job.title}". No User Profile uploaded.`);
        await db_1.prisma.job.update({
            where: { id: jobId },
            data: { status: 'FAILED', logs: JSON.stringify([{ time: new Date(), message: 'Aborted: No user profile uploaded.' }]) }
        });
        return false;
    }
    await (0, db_1.logSystem)('INFO', `Starting stealth auto-apply sequence for "${job.title}" at "${job.company}"...`);
    await db_1.prisma.job.update({
        where: { id: jobId },
        data: { status: 'APPLYING' }
    });
    const sessionLogs = [];
    const logStep = async (msg) => {
        console.log(`[Job ${jobId}] ${msg}`);
        sessionLogs.push({ time: new Date(), message: msg });
        await db_1.prisma.job.update({
            where: { id: jobId },
            data: { logs: JSON.stringify(sessionLogs) }
        });
    };
    await logStep('Generating customized cover letter and screening materials...');
    const materials = await (0, matcher_1.generateApplicationMaterials)({ fullName: profile.fullName, skills: JSON.parse(profile.skills), rawResumeText: profile.rawResumeText }, job.title, job.company, job.description, userId);
    let browser;
    try {
        const launchOptions = {
            headless: true, // Run headless for 24/7 background task, but stealth mimics real window.
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        };
        if (settings?.proxyUrl) {
            launchOptions.proxy = { server: settings.proxyUrl };
            await logStep('Routing automation connection through residential proxy server...');
        }
        browser = await chromiumStealth.launch(launchOptions);
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 850 },
            deviceScaleFactor: 1
        });
        if (settings?.cookiesJson) {
            try {
                const decryptedCookiesJson = (0, crypto_1.decryptString)(settings.cookiesJson);
                const cookies = JSON.parse(decryptedCookiesJson);
                await context.addCookies(cookies);
                await logStep('Rehydrated session storage with saved cookies.');
            }
            catch (err) {
                await logStep('Warning: Failed to import session cookies.');
            }
        }
        const page = await context.newPage();
        await logStep(`Navigating to application URL: ${job.url}`);
        // Set a natural timeout
        await page.goto(job.url, { waitUntil: 'networkidle', timeout: 45000 });
        await sleep(2000);
        // Take screenshot of the initial load state
        const initialScreenshotPath = path_1.default.join(SCREENSHOTS_DIR, `${jobId}_initial.png`);
        await page.screenshot({ path: initialScreenshotPath });
        await logStep(`Captured initial page loaded state.`);
        // Perform smart form detection
        await logStep('Scanning page DOM structure for job application form fields...');
        // Try to find common input fields
        const emailSelectors = [
            'input[type="email"]',
            'input[name*="email" i]',
            'input[id*="email" i]'
        ];
        const nameSelectors = [
            'input[name*="name" i]',
            'input[id*="name" i]',
            'input[placeholder*="name" i]'
        ];
        const phoneSelectors = [
            'input[type="tel"]',
            'input[name*="phone" i]',
            'input[id*="phone" i]'
        ];
        const fileSelectors = [
            'input[type="file"]',
            'input[name*="resume" i]',
            'input[name*="cv" i]'
        ];
        const coverLetterSelectors = [
            'textarea[name*="cover" i]',
            'textarea[id*="cover" i]',
            'textarea[placeholder*="cover" i]',
            'textarea[name*="letter" i]'
        ];
        let formsFound = false;
        // 1. Email Fill
        for (const selector of emailSelectors) {
            if (await page.locator(selector).count() > 0) {
                await logStep(`Filling email input field...`);
                await humanType(page, selector, 'user@example.com'); // Placeholder for now
                formsFound = true;
                break;
            }
        }
        // 2. Name Fill
        for (const selector of nameSelectors) {
            if (await page.locator(selector).count() > 0) {
                await logStep(`Filling full name input field...`);
                await humanType(page, selector, profile.fullName);
                formsFound = true;
                break;
            }
        }
        // 3. Phone Fill
        if (profile.phone) {
            for (const selector of phoneSelectors) {
                if (await page.locator(selector).count() > 0) {
                    await logStep(`Filling phone number...`);
                    await humanType(page, selector, profile.phone);
                    formsFound = true;
                    break;
                }
            }
        }
        // 4. Resume File Upload (Disabled - Files are not stored)
        // 5. Cover Letter Textarea Fill
        for (const selector of coverLetterSelectors) {
            if (await page.locator(selector).count() > 0) {
                await logStep(`Writing tailored AI cover letter into text block...`);
                await humanType(page, selector, materials.coverLetter);
                formsFound = true;
                break;
            }
        }
        // Handle generic text questions if present
        const textareas = await page.locator('textarea').all();
        for (const area of textareas) {
            const isVisible = await area.isVisible();
            if (!isVisible)
                continue;
            const label = await area.evaluate((el) => {
                // Look up parent or sibling label text
                const parent = el.parentElement;
                if (!parent)
                    return '';
                return parent.innerText || '';
            });
            if (label && label.length > 5 && !label.toLowerCase().includes('cover letter')) {
                // Find best predicted answer
                const bestAnswer = materials.customAnswers.find(ans => label.toLowerCase().includes(ans.question.toLowerCase()) ||
                    ans.question.toLowerCase().includes(label.toLowerCase()));
                if (bestAnswer) {
                    await logStep(`Answering custom field: "${label.substring(0, 40)}..."`);
                    await area.click();
                    await area.fill(bestAnswer.answer);
                    await sleep(1000);
                }
            }
        }
        // Take screenshots of final filled forms
        const filledScreenshotPath = path_1.default.join(SCREENSHOTS_DIR, `${jobId}_filled.png`);
        await page.screenshot({ path: filledScreenshotPath });
        await logStep(`Captured state of filled application forms.`);
        if (!formsFound) {
            await logStep('Note: Standard application forms were not directly detected on this page (might require external login/sign-in).');
        }
        if (dryRun) {
            await logStep('[DRY RUN] Bypassed final submit action for security and compliance.');
            await db_1.prisma.job.update({
                where: { id: jobId },
                data: {
                    status: 'APPLIED',
                    appliedAt: new Date()
                }
            });
            await (0, db_1.logSystem)('SUCCESS', `Dry-run application completed successfully for "${job.title}".`);
            return true;
        }
        // Find submit button and submit!
        const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Apply")',
            'button:has-text("Submit")',
            'button:has-text("Submit Application")'
        ];
        let submitted = false;
        for (const selector of submitSelectors) {
            const button = page.locator(selector).first();
            if (await button.count() > 0 && await button.isVisible()) {
                await logStep(`Submitting application using button: "${await button.innerText()}"`);
                await button.click();
                await sleep(5000); // Wait for page transitions after submit
                // Take final screenshot
                const successScreenshotPath = path_1.default.join(SCREENSHOTS_DIR, `${jobId}_success.png`);
                await page.screenshot({ path: successScreenshotPath });
                submitted = true;
                break;
            }
        }
        if (submitted) {
            await db_1.prisma.job.update({
                where: { id: jobId },
                data: {
                    status: 'APPLIED',
                    appliedAt: new Date()
                }
            });
            await (0, db_1.logSystem)('SUCCESS', `Successfully submitted application to "${job.title}" at "${job.company}"!`);
            return true;
        }
        else {
            await logStep('Could not automatically determine the final submit button. Marked as Manual Review.');
            await db_1.prisma.job.update({
                where: { id: jobId },
                data: { status: 'MATCHED' } // Reset back to matched for manual click
            });
            return false;
        }
    }
    catch (error) {
        await logStep(`Exception occurred during execution: ${error?.message || error}`);
        await db_1.prisma.job.update({
            where: { id: jobId },
            data: { status: 'FAILED' }
        });
        await (0, db_1.logSystem)('ERROR', `Auto-apply session failed for "${job.title}": ${error?.message || error}`);
        return false;
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
}
