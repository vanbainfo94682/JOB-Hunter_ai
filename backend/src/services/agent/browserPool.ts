import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, BrowserContext, Page } from 'playwright';
import { logSystem } from '../../db';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

export class BrowserPool {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private useCount = 0;

  async getPage(proxyUrl?: string): Promise<Page> {
    // If browser doesn't exist or has been reused more than 50 times, restart it to prevent memory leaks
    if (!this.browser || this.useCount >= 50) {
      await this.restartBrowser(proxyUrl);
    }

    // Refresh context every 10 requests to clear cache/session cookies and prevent fingerprinting
    if (this.useCount % 10 === 0 || !this.context) {
      if (this.context) {
        await this.context.close().catch(() => {});
      }
      
      const launchContextOptions: any = {
        userAgent: this.randomUA(),
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        deviceScaleFactor: 1
      };

      this.context = await this.browser!.newContext(launchContextOptions);
    }

    this.useCount++;
    return await this.context!.newPage();
  }

  async closePage(page: Page): Promise<void> {
    await page.close().catch(() => {});
    
    // Explicit browser restart to free RAM after 50 pages have been created/closed
    if (this.useCount >= 50) {
      await this.restartBrowser();
    }
  }

  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.useCount = 0;
  }

  private async restartBrowser(proxyUrl?: string): Promise<void> {
    await this.cleanup();
    
    await logSystem('INFO', `[BrowserPool] Restarting Playwright stealth browser to free system RAM...`);
    
    const launchOptions: any = {
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process', // Memory efficient flag
        '--js-flags=--max-old-space-size=256' // Limit memory footprint
      ]
    };

    if (proxyUrl) {
      launchOptions.proxy = { server: proxyUrl };
    }

    this.browser = await chromiumStealth.launch(launchOptions);
    this.useCount = 0;
  }

  private randomUA(): string {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }
}

export const browserPool = new BrowserPool();
