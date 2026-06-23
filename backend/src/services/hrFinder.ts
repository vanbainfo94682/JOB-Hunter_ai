import { chromium } from 'playwright-extra';
import stealthPlugin = require('puppeteer-extra-plugin-stealth');
import { logSystem } from '../db';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

/**
 * HR Email Finder Service
 * Scrapes DuckDuckGo HTML directly to find public HR/recruiting emails for the given company.
 */
export async function findHREmail(companyName: string, domain?: string): Promise<{ email: string, confidence: string }> {
  let browser = null;
  try {
    await logSystem('INFO', `Starting Automated Web Scraper for HR Email Discovery: ${companyName}`);
    
    browser = await chromiumStealth.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Construct search query
    const domainQuery = domain ? ` OR "@${domain}"` : '';
    const query = `"${companyName}" HR email OR "careers@" OR "recruiting@" OR "jobs@" OR "talent@"${domainQuery}`;
    
    // Navigate to DuckDuckGo HTML version to bypass strict bot protections
    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    
    // Extract text from search results
    const text = await page.innerText('body');
    
    // Regex to match typical email structures
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    
    // Clean and filter emails
    const uniqueEmails = Array.from(new Set(emails)).filter((e: unknown) => {
      if (typeof e !== 'string') return false;
      const lower = e.toLowerCase();
      // Filter out obvious fake/search engine emails
      return !lower.includes('duckduckgo') && 
             !lower.includes('example.com') && 
             !lower.includes('sentry.io') &&
             !lower.includes('domain.com');
    });
    
    if (uniqueEmails.length > 0) {
      // Prioritize careers/hr/recruiting emails if multiple found
      let bestEmail = uniqueEmails[0];
      let confidence = 'medium';
      
      for (const email of uniqueEmails) {
        const lower = email.toLowerCase();
        if (lower.startsWith('careers@') || lower.startsWith('hr@') || lower.startsWith('recruiting@') || lower.startsWith('talent@')) {
          bestEmail = email;
          confidence = 'high';
          break;
        }
      }
      
      await logSystem('SUCCESS', `Scraped web and found HR Email for ${companyName}: ${bestEmail}`);
      return { email: bestEmail, confidence };
    }
    
    throw new Error("No valid email addresses found in search results.");
  } catch (error: any) {
    await logSystem('WARNING', `Failed to scrape HR email for ${companyName}: ${error.message}. Using fallback generator.`);
    
    // Fallback: Generate an educated guess if scraping yields zero results
    const fallbackEmail = `careers@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    return { email: fallbackEmail, confidence: 'low' };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
