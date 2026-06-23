import { chromium } from 'playwright-extra';
import stealthPlugin = require('puppeteer-extra-plugin-stealth');
import { logSystem } from '../db';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

/**
 * HR Email Finder Service
 * Scrapes DuckDuckGo HTML directly to find public HR/recruiting emails for the given company.
 */
export async function findHREmail(companyName: string, domain?: string): Promise<{ email: string, name?: string, title?: string, confidence: string }> {
  let browser = null;
  try {
    await logSystem('INFO', `Starting Deep HR Discovery for: ${companyName}`);
    
    browser = await chromiumStealth.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // 1. Search for LinkedIn profiles of HR/Recruiters at the target company
    const query = `site:linkedin.com/in "Recruiter" OR "Talent" OR "HR" "${companyName}"`;
    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    
    // Extract search result snippets
    const results = await page.$$eval('.result__body', elements => {
      return elements.map(el => {
        const titleEl = el.querySelector('.result__title');
        const snippetEl = el.querySelector('.result__snippet');
        return {
          title: titleEl ? (titleEl as HTMLElement).innerText : '',
          snippet: snippetEl ? (snippetEl as HTMLElement).innerText : ''
        };
      });
    });

    let hrName = '';
    let hrTitle = 'HR Manager / Recruiter';

    if (results.length > 0) {
      // Look at the top result
      const topResult = results[0];
      // LinkedIn titles in DDG often look like "First Last - Job Title - Company Name"
      const parts = topResult.title.split('-');
      if (parts.length >= 2) {
        hrName = parts[0].trim();
        hrTitle = parts[1].trim();
        // Remove "LinkedIn" if it appears in the name
        hrName = hrName.replace(/\s*\|?\s*LinkedIn\s*/gi, '').trim();
      }
    }

    // 2. Search for raw emails as a fallback, or to match the exact corporate domain
    const emailQuery = `"${companyName}" HR email OR "careers@" OR "recruiting@" OR "jobs@" OR "talent@"${domain ? ` OR "@${domain}"` : ''}`;
    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(emailQuery)}`);
    const emailText = await page.innerText('body');
    
    // Regex to match typical email structures
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = emailText.match(emailRegex) || [];
    
    // Clean and filter emails
    const uniqueEmails = Array.from(new Set(emails)).filter((e: unknown) => {
      if (typeof e !== 'string') return false;
      const lower = e.toLowerCase();
      return !lower.includes('duckduckgo') && 
             !lower.includes('example.com') && 
             !lower.includes('sentry.io') &&
             !lower.includes('domain.com');
    });
    
    let bestEmail = '';
    let confidence = 'low';

    // If we found a specific person's name and have a domain, generate a predicted corporate email
    if (hrName && domain) {
      const names = hrName.toLowerCase().split(' ');
      if (names.length >= 2) {
        const first = names[0].replace(/[^a-z]/g, '');
        const last = names[names.length - 1].replace(/[^a-z]/g, '');
        bestEmail = `${first}.${last}@${domain}`; // e.g. john.doe@company.com
        confidence = 'medium';
      }
    }
    
    // If we scraped an actual real email, prioritize careers/hr, OR prioritize a match to the person's name
    if (uniqueEmails.length > 0) {
      for (const email of uniqueEmails) {
        const lower = email.toLowerCase();
        
        // If the email matches the scraped HR person's first or last name, this is a goldmine match
        if (hrName) {
           const names = hrName.toLowerCase().split(' ');
           if (names.some(n => n.length > 2 && lower.includes(n))) {
             bestEmail = email;
             confidence = 'very_high';
             break;
           }
        }

        if (lower.startsWith('careers@') || lower.startsWith('hr@') || lower.startsWith('recruiting@') || lower.startsWith('talent@')) {
          bestEmail = email;
          confidence = 'high';
          if (!hrName) break; // Keep searching just in case there's a name match
        }
      }
      
      // Fallback to first scraped email if nothing specific matched
      if (!bestEmail) {
        bestEmail = uniqueEmails[0];
      }
    }
    
    if (bestEmail) {
      await logSystem('SUCCESS', `Deep Discovery found HR Contact for ${companyName}: ${hrName || 'Unknown Name'} (${bestEmail})`);
      return { email: bestEmail, name: hrName || undefined, title: hrTitle || undefined, confidence };
    }
    
    throw new Error("No valid email addresses found and could not confidently predict one.");
  } catch (error: any) {
    await logSystem('WARNING', `Failed deep HR discovery for ${companyName}: ${error.message}. Using fallback generator.`);
    
    const fallbackEmail = `careers@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    return { email: fallbackEmail, confidence: 'low' };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
