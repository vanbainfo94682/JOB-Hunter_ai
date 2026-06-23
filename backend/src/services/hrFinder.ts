import { chromium, Page } from 'playwright-extra';
import stealthPlugin = require('puppeteer-extra-plugin-stealth');
import { logSystem } from '../db';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

const extractEmailsFromText = (text: string): string[] => {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex) || [];
  return Array.from(new Set(emails)).map(e => e.toLowerCase()).filter(e => {
    return !e.includes('duckduckgo') && !e.includes('example.com') && !e.includes('domain.com') && !e.endsWith('.png') && !e.endsWith('.jpg');
  });
};

const getCompanyDomain = (companyName: string, domain?: string): string => {
  return domain || companyName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '') + '.com';
};

// Layer 1: Direct LinkedIn Job Page Extraction
async function scrapeLinkedInJobContact(page: Page, jobUrl: string): Promise<{ email?: string, name?: string } | null> {
  if (!jobUrl || !jobUrl.includes('linkedin.com/jobs')) return null;
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // Check for structured data
    const ldJson = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      return Array.from(scripts).map(s => s.textContent).join('');
    });
    
    const pageText = await page.evaluate(() => document.body.innerText);
    const foundEmails = extractEmailsFromText(pageText + ' ' + ldJson);
    
    const posterName = await page.$eval('.job-poster__name', el => el.textContent?.trim()).catch(() => null);
    
    if (foundEmails.length > 0) {
      return { email: foundEmails[0], name: posterName || undefined };
    }
    
    return posterName ? { name: posterName } : null;
  } catch (error) {
    return null;
  }
}

// Layer 2: DuckDuckGo Intelligent Search
async function findHREmailViaSearch(page: Page, companyName: string, jobTitle: string, domain: string, posterName?: string): Promise<{ email: string, name?: string, title?: string } | null> {
  const searchQueries = [
    `${companyName} HR manager email`,
    `${companyName} recruiter email contact`,
    `${companyName} hiring manager ${jobTitle.split(' ').slice(0, 2).join(' ')}`,
    `${companyName} careers HR department email`,
    `${companyName} talent acquisition email`,
    `"${companyName}" AND "recruiter" AND email`,
    `${companyName} human resources contact`,
    `${companyName} "@${domain}" email`
  ];
  
  if (posterName) {
    searchQueries.unshift(`"${posterName}" "${companyName}" email`);
  }

  const baseDomain = domain.split('.')[0];
  let bestName = posterName;
  
  for (const query of searchQueries) {
    await page.waitForTimeout(randomBetween(1500, 3500)); // Stealth delay
    try {
      await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
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

      const combinedText = results.map(r => r.title + ' ' + r.snippet).join(' ');
      const emails = extractEmailsFromText(combinedText);
      
      const relevantEmails = emails.filter(e => 
        e.includes(baseDomain) ||
        e.includes('hr@') || e.includes('recruiting@') ||
        e.includes('careers@') || e.includes('talent@') ||
        e.includes('jobs@') || e.includes('hiring@') ||
        e.includes('people@')
      );
      
      if (relevantEmails.length > 0) {
        if (results.length > 0) {
          const parts = results[0].title.split('-');
          if (!bestName && parts.length >= 2) bestName = parts[0].replace(/linkedin/ig, '').trim();
        }
        return { email: relevantEmails[0], name: bestName };
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Layer 3: Pattern-Based Email Generation
function generatePatternEmails(companyName: string, domain: string): string[] {
  const patterns = [
    `hr@${domain}`,
    `careers@${domain}`,
    `recruiting@${domain}`,
    `talent@${domain}`,
    `jobs@${domain}`,
    `hiring@${domain}`,
    `people@${domain}`
  ];
  const prefix = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (prefix) {
    patterns.push(`${prefix}hr@${domain}`);
    patterns.push(`${prefix}careers@${domain}`);
  }
  return patterns;
}

// Layer 4: Authenticated LinkedIn Extraction
async function extractFromAuthenticatedLinkedIn(page: Page, companyName: string, cookiesStr: string): Promise<string | null> {
  if (!cookiesStr) return null;
  try {
    const cookiesArray = JSON.parse(cookiesStr);
    if (!Array.isArray(cookiesArray) || cookiesArray.length === 0) return null;
    
    await page.context().addCookies(cookiesArray);
    const companySlug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    await page.goto(`https://www.linkedin.com/company/${companySlug}/people/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(randomBetween(2000, 4000));
    
    const hrProfiles = await page.evaluate(() => {
      const profiles = document.querySelectorAll('.org-people-profile-card');
      return Array.from(profiles).filter(p => {
        const title = p.querySelector('.org-people-profile-card__headline')?.textContent?.toLowerCase() || '';
        return title.includes('hr') || title.includes('recruiter') || title.includes('talent') || title.includes('hiring');
      }).map(p => ({
        name: p.querySelector('.org-people-profile-card__name')?.textContent?.trim()
      }));
    });
    
    if (hrProfiles.length > 0 && hrProfiles[0].name) {
      const nameParts = hrProfiles[0].name.toLowerCase().replace(/[^a-z\s]/g, '').split(' ');
      if (nameParts.length >= 2) {
        return `${nameParts[0]}.${nameParts[nameParts.length - 1]}`; // Return name prefix to be joined with domain
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Advanced 4-Layer HR Email Finder Service
 */
export async function findHREmail(companyName: string, jobTitle: string = 'Software Engineer', domain?: string, jobUrl?: string, cookies?: string): Promise<{ email: string, name?: string, title?: string, confidence: string }> {
  let browser = null;
  try {
    await logSystem('INFO', `Starting Deep HR Discovery (4-Layer) for: ${companyName}`);
    browser = await chromiumStealth.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const actualDomain = getCompanyDomain(companyName, domain);
    let posterName: string | undefined = undefined;

    // Layer 1: Direct Job Page
    if (jobUrl) {
      const directMatch = await scrapeLinkedInJobContact(page, jobUrl);
      if (directMatch?.email) {
        await logSystem('SUCCESS', `Layer 1 (Direct) found email for ${companyName}: ${directMatch.email}`);
        return { email: directMatch.email, name: directMatch.name, confidence: 'very_high' };
      }
      if (directMatch?.name) posterName = directMatch.name;
    }

    // Layer 2: DuckDuckGo Stealth
    const searchMatch = await findHREmailViaSearch(page, companyName, jobTitle, actualDomain, posterName);
    if (searchMatch?.email) {
      await logSystem('SUCCESS', `Layer 2 (Search) found email for ${companyName}: ${searchMatch.email}`);
      return { email: searchMatch.email, name: searchMatch.name, confidence: 'high' };
    }

    // Layer 4: Authenticated Lookup
    if (cookies) {
      const namePrefix = await extractFromAuthenticatedLinkedIn(page, companyName, cookies);
      if (namePrefix) {
        const predicted = `${namePrefix}@${actualDomain}`;
        await logSystem('SUCCESS', `Layer 4 (Authenticated) generated email for ${companyName}: ${predicted}`);
        return { email: predicted, confidence: 'medium' };
      }
    }

    // Layer 3: Fallback Generators
    const patterns = generatePatternEmails(companyName, actualDomain);
    await logSystem('WARNING', `Falling back to Layer 3 (Generator) for ${companyName}`);
    return { email: patterns[0], confidence: 'low' };

  } catch (error: any) {
    await logSystem('ERROR', `HR Discovery Engine failed for ${companyName}: ${error.message}`);
    return { email: `careers@${getCompanyDomain(companyName, domain)}`, confidence: 'low' };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
