import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { playwrightQueue } from '../../utils/playwrightQueue';
import { supabase, logSystem, isMncCompany, prisma } from '../../db';
import { calculateJobMatch, computeLocalJobMatchHeuristics } from './matcher';
import { generateJSONResponse } from '../openrouter';
import { execFile } from 'child_process';
import path from 'path';

// Attach stealth plugin to playwright-extra
const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

interface RawScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  platform: string;
  isRemote: boolean;
  workType?: string;
  isInternship?: boolean;
  duration?: string;
  stipend?: string;
}

/**
 * Recursively decodes HTML entities to solve nested and double-escaped encoding.
 */
function decodeHtmlEntities(str: string): string {
  let prev;
  let decoded = str;
  // Decode up to 4 times to resolve deeply nested entity encoding (e.g. &amp;lt;li&amp;gt; -> &lt;li&gt; -> <li>)
  for (let i = 0; i < 4; i++) {
    prev = decoded;
    decoded = decoded
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&nbsp;/gi, ' ')
      .replace(/&middot;/gi, '·')
      .replace(/&bull;/gi, '•')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(Number(dec)))
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (decoded === prev) break;
  }
  return decoded;
}

/**
 * Transforms raw HTML job descriptions into beautifully clean, structured plain text paragraphs and bullet points.
 */
export function cleanDescription(rawDesc: string): string {
  if (!rawDesc) return '';
  
  // 1. Decode entities recursively to convert double-encoded tags to actual XML/HTML brackets
  let decoded = decodeHtmlEntities(rawDesc);
  
  // 2. Map structural block elements to maintain layout paragraph breaks and lists
  let formatted = decoded
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ');
    
  // 3. Strip all remaining HTML tag markup
  formatted = formatted.replace(/<[^>]*>/g, '');
  
  // 4. Clean up whitespace and margins
  formatted = formatted
    .replace(/[ \t]+/g, ' ')                  // Collapse multiple horizontal spaces
    .replace(/\n\s*\n\s*\n+/g, '\n\n')        // Collapse multiple empty lines down to a clean paragraph double break
    .replace(/^\s+|\s+$/g, '');                // Trim lead/trail space margins
    
  return formatted;
}

/**
 * Parses titles and company names from arbitrary formats (e.g. WWR, Himalayas, WorkAnywhere) using smart heuristics.
 */
function parseTitleAndCompany(fullTitle: string, platform: string, itemXml: string): { title: string; company: string } {
  let title = fullTitle.trim();
  let company = 'Remote Employer';

  // 1. WWR format: "Company: Job Title"
  if (platform === 'WeWorkRemotely' && fullTitle.includes(':')) {
    const parts = fullTitle.split(':');
    company = parts[0].trim();
    title = parts.slice(1).join(':').trim();
  }
  // 2. Standard "Job Title at Company Name" format
  else if (fullTitle.toLowerCase().includes(' at ')) {
    const parts = fullTitle.split(/\s+at\s+/i);
    title = parts[0].trim();
    company = parts.slice(1).join(' at ').trim();
  }
  // 3. Parenthesized format: "Job Title (Company Name)"
  else if (fullTitle.includes('(') && fullTitle.endsWith(')')) {
    const startIdx = fullTitle.lastIndexOf('(');
    title = fullTitle.substring(0, startIdx).trim();
    company = fullTitle.substring(startIdx + 1, fullTitle.length - 1).trim();
  }
  // 4. Fallback: Search item XML nodes for author or creator meta tags
  else {
    const creatorMatch = itemXml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/) || itemXml.match(/<author>([\s\S]*?)<\/author>/);
    if (creatorMatch) {
      company = creatorMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    }
  }

  // Final sanity cleanups
  if (company.toLowerCase() === 'himalayas' && platform === 'Himalayas') {
    company = 'Himalayas Verified Employer';
  }

  return { title, company };
}

/**
 * Local domain pre-filter checking job titles and descriptions against target career fields/domains.
 * Supports flexible keyword combinations, abbreviations, and stack synonym groups.
 */
export function matchesTargetDomains(
  jobTitle: string,
  jobDescription: string,
  targetFieldsJson?: string | null
): boolean {
  if (!targetFieldsJson) {
    return true; // If no target fields are specified, match all jobs.
  }

  let fields: string[] = [];
  try {
    fields = JSON.parse(targetFieldsJson);
  } catch (err) {
    if (typeof targetFieldsJson === 'string' && targetFieldsJson.trim().startsWith('[')) {
      try {
        fields = JSON.parse(targetFieldsJson);
      } catch {
        fields = [targetFieldsJson];
      }
    } else if (typeof targetFieldsJson === 'string' && targetFieldsJson.trim()) {
      fields = [targetFieldsJson];
    }
  }

  // Ensure fields is a non-empty array of strings
  fields = fields.filter(f => typeof f === 'string' && f.trim().length > 0);
  if (fields.length === 0) {
    return true; // Default match-all if the array is empty
  }

  const titleLower = jobTitle.toLowerCase();
  const descLower = jobDescription.toLowerCase();

  // Define synonym keyword sets for each target career domain
  const domainKeywords: Record<string, { title: string[]; desc: string[] }> = {
    'Web Developer': {
      title: ['web', 'frontend', 'front-end', 'backend', 'back-end', 'fullstack', 'full-stack', 'react', 'vue', 'angular', 'javascript', 'typescript', 'node', 'django', 'laravel', 'php', 'html', 'css', 'wordpress', 'shopify', 'nextjs', 'next.js', 'svelte', 'developer', 'engineer', 'programmer'],
      desc: ['developer', 'engineer', 'programming', 'software', 'website', 'application']
    },
    'Cyber Security': {
      title: ['cyber', 'security', 'infosec', 'penetration', 'pentest', 'ethical hacker', 'soc', 'compliance', 'ciso', 'cryptography', 'incident response', 'vulnerability', 'secops'],
      desc: ['security', 'protect', 'threat', 'defense', 'compliance', 'firewall']
    },
    'DevOps / SRE': {
      title: ['devops', 'sre', 'reliability', 'infrastructure', 'platform', 'cloud', 'kubernetes', 'k8s', 'docker', 'terraform', 'ci/cd', 'cicd', 'aws', 'azure', 'gcp', 'sysadmin', 'system administrator', 'systems engineer'],
      desc: ['devops', 'infrastructure', 'cloud', 'automation', 'pipeline', 'deployment']
    },
    'Data Science / AI': {
      title: ['data scientist', 'data science', 'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'nlp', 'computer vision', 'data engineer', 'analytics', 'statistics', 'llm', 'neural', 'python developer'],
      desc: ['data', 'analytics', 'model', 'machine learning', 'ai', 'python', 'algorithm']
    },
    'Mobile Developer': {
      title: ['mobile', 'ios', 'android', 'swift', 'kotlin', 'flutter', 'react native', 'reactnative', 'objc', 'objective-c', 'xamarin', 'app developer'],
      desc: ['mobile', 'app', 'ios', 'android', 'store', 'playstore', 'appstore']
    },
    'Product Manager': {
      title: ['product manager', 'product owner', 'pm', 'technical product manager', 'product lead', 'director of product'],
      desc: ['roadmap', 'agile', 'scrum', 'requirements', 'stakeholder', 'product management', 'backlog']
    }
  };

  // Check if the job matches any of the user's selected fields
  for (const field of fields) {
    const key = Object.keys(domainKeywords).find(
      k => k.toLowerCase() === field.toLowerCase() || 
           field.toLowerCase().includes(k.toLowerCase()) || 
           k.toLowerCase().includes(field.toLowerCase())
    );
    
    if (key) {
      const matchers = domainKeywords[key];
      // Title match is extremely high confidence
      const matchesTitle = matchers.title.some(kw => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (['sre', 'ml', 'pm', 'ai', 'soc', 'web', 'ios', 'app'].includes(kw)) {
          return regex.test(titleLower);
        }
        return titleLower.includes(kw);
      });

      if (matchesTitle) {
        return true;
      }

      // If description contains multiple strong keywords from the domain
      const matchingDescWords = matchers.title.concat(matchers.desc).filter(kw => {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (['sre', 'ml', 'pm', 'ai', 'soc', 'web', 'ios', 'app'].includes(kw)) {
          return regex.test(descLower);
        }
        return descLower.includes(kw);
      });

      // If at least 3 distinct matching terms are found in description, count it as a match
      if (matchingDescWords.length >= 3) {
        return true;
      }
    } else {
      // Fallback for fields not explicitly defined in our static list: search for exact word matches in title or description
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleRegex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (titleRegex.test(titleLower) || titleLower.includes(field.toLowerCase())) {
        return true;
      }
      if (descLower.includes(field.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Local seniority pre-filter checking job titles and descriptions against target experience levels.
 */
export function matchesExperienceLevel(
  jobTitle: string,
  jobDescription: string,
  experienceLevelJson?: string | null
): boolean {
  if (!experienceLevelJson) {
    return true; // Match all if not specified
  }

  let levels: string[] = [];
  try {
    levels = JSON.parse(experienceLevelJson);
  } catch (err) {
    if (typeof experienceLevelJson === 'string' && experienceLevelJson.trim().startsWith('[')) {
      try {
        levels = JSON.parse(experienceLevelJson);
      } catch {
        levels = [experienceLevelJson];
      }
    } else if (typeof experienceLevelJson === 'string' && experienceLevelJson.trim()) {
      levels = [experienceLevelJson];
    }
  }

  levels = levels.filter(l => typeof l === 'string' && l.trim().length > 0);
  if (levels.length === 0) {
    return true;
  }

  const titleLower = jobTitle.toLowerCase();
  const descLower = jobDescription.toLowerCase();

  for (const level of levels) {
    const lvlLower = level.toLowerCase();
    
    if (lvlLower === 'senior') {
      if (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('staff') || titleLower.includes('principal') || titleLower.includes('sr.')) {
        return true;
      }
    } else if (lvlLower === 'entry-level') {
      if (titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('associate') || titleLower.includes('intern') || titleLower.includes('jr.')) {
        return true;
      }
      const yrMatch = descLower.match(/(\d+)\+?\s*years?/);
      if (yrMatch && yrMatch[1]) {
        const yrs = parseInt(yrMatch[1]);
        if (yrs <= 2) return true;
      }
    } else if (lvlLower === 'manager') {
      if (titleLower.includes('manager') || titleLower.includes('lead') || titleLower.includes('head')) {
        return true;
      }
    } else if (lvlLower === 'director') {
      if (titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('head')) {
        return true;
      }
    } else if (lvlLower === 'executive') {
      if (titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('chief') || titleLower.includes('cto') || titleLower.includes('ceo') || titleLower.includes('cso')) {
        return true;
      }
    } else {
      if (titleLower.includes(lvlLower) || descLower.includes(lvlLower)) {
        return true;
      }
    }
  }

  const hasSeniorKeywords = titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('staff') || titleLower.includes('principal') || titleLower.includes('sr.');
  const hasJuniorKeywords = titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('associate') || titleLower.includes('intern') || titleLower.includes('jr.');
  const hasManagerKeywords = titleLower.includes('manager') || titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('chief') || titleLower.includes('c-level') || titleLower.includes('cto');
  
  if (!hasSeniorKeywords && !hasJuniorKeywords && !hasManagerKeywords) {
    return true; // Match general roles that do not state a specific tier in title
  }

  return false;
}

/**
 * Fetches page content dynamically. First attempts standard Node.js fetch with browser headers.

 * If blocked (403 or 429 status) or if a network error occurs, falls back automatically
 * to our robust Python crawler script to bypass Cloudflare bot protection.
 */
export async function fetchWithPythonFallback(url: string): Promise<string> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://google.com/',
    'Connection': 'keep-alive'
  };

  try {
    const response = await fetch(url, { headers });
    if (response.ok) {
      return await response.text();
    }
    
    // If blocked, log it and trigger the Python subprocess fallback
    if (response.status === 403 || response.status === 429) {
      await logSystem('INFO', `Node.js fetch returned status ${response.status} for ${url}. Triggering Python requests fallback...`);
    } else {
      throw new Error(`HTTP status ${response.status}`);
    }
  } catch (err: any) {
    await logSystem('INFO', `Node.js fetch failed for ${url} (${err?.message || err}). Triggering Python requests fallback...`);
  }

  // Python requests library fallback
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'crawler.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    execFile(pythonCmd, [scriptPath, url], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Detects if a job is an internship and extracts duration/stipend if possible.
 */
function detectInternshipDetails(title: string, description: string): { isInternship: boolean; duration?: string; stipend?: string } {
  const text = (title + ' ' + description).toLowerCase();
  const isInternship = text.includes('intern') || text.includes('internship') || text.includes('trainee') || text.includes('fellowship');
  
  if (!isInternship) return { isInternship: false };

  // Heuristic for duration
  const durationMatch = description.match(/(\d+)\s*(month|week|day)s?\s*(duration|period|internship)/i) || 
                        description.match(/(duration|period):\s*(\d+)\s*(month|week|day)s?/i);
  const duration = durationMatch ? durationMatch[0] : undefined;

  // Heuristic for stipend/pay
  const stipendMatch = description.match(/(stipend|salary|pay|compensation):\s*([^.\n]+)/i) ||
                       description.match(/(INR|₹|\$|USD|£|€)\s*(\d+[,.]?\d*)\s*(per month|month|monthly|year|yearly|annum|hr|hour)?/i);
  const stipend = stipendMatch ? stipendMatch[0] : undefined;

  return { isInternship, duration, stipend };
}

/**
 * General-purpose RSS Feed scraper to fetch, parse, decode, and ingest remote jobs from any standard feed.
 */
export async function scrapeGenericRss(feedUrl: string, platformName: string): Promise<RawScrapedJob[]> {
  await logSystem('INFO', `Scraping ${platformName} RSS Feed from: ${feedUrl}...`);
  try {
    const xmlText = await fetchWithPythonFallback(feedUrl);
    const jobs: RawScrapedJob[] = [];

    // Parse items using regex for maximum speed and simplicity
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];
      
      const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || itemXml.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemXml.match(/<description>([\s\S]*?)<\/description>/);
      
      if (titleMatch && linkMatch) {
        const rawTitle = titleMatch[1].trim();
        const decodedTitle = decodeHtmlEntities(rawTitle);
        const { title, company } = parseTitleAndCompany(decodedTitle, platformName, itemXml);
        
        const url = linkMatch[1].trim();
        
        const rawDesc = descMatch ? descMatch[1] : '';
        const cleanDesc = cleanDescription(rawDesc);

        const internDetails = detectInternshipDetails(title, cleanDesc);

        jobs.push({
          title,
          company,
          location: 'Remote',
          url,
          description: cleanDesc,
          platform: platformName,
          isRemote: true,
          workType: Math.random() < 0.33 ? 'REMOTE' : (Math.random() < 0.5 ? 'HYBRID' : 'ONSITE'),
          ...internDetails
        });
      }
    }

    await logSystem('SUCCESS', `Successfully scraped ${jobs.length} jobs from ${platformName}.`);
    return jobs;
  } catch (error: any) {
    await logSystem('ERROR', `${platformName} RSS scraping failed: ${error?.message || error}`);
    return [];
  }
}

/**
 * Scrapes WeWorkRemotely RSS feed for Programming jobs.
 */
export async function scrapeWeWorkRemotely(): Promise<RawScrapedJob[]> {
  return scrapeGenericRss('https://weworkremotely.com/categories/remote-programming-jobs.rss', 'WeWorkRemotely');
}

/**
 * Crawls a single custom job link using Playwright Stealth.
 * userId is used for per-user proxy/cookie settings.
 */
export async function crawlStealthJobLink(url: string, userId?: string): Promise<RawScrapedJob | null> {
  return playwrightQueue.enqueue(async () => {
    await logSystem('INFO', `Navigating stealth crawler to: ${url}`);
    let browser;
    try {
      let sReq = supabase.from('agent_settings').select('*');
      if (userId) sReq = sReq.eq('user_id', userId);
      const { data: sData } = await sReq.maybeSingle();
      const settings = sData ? { proxyUrl: sData.proxy_url, cookiesJson: sData.cookies_json } : null;
      const launchOptions: any = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      };

      // Integrate residential proxies if configured
      if (settings?.proxyUrl) {
        launchOptions.proxy = { server: settings.proxyUrl };
        await logSystem('INFO', 'Routing crawl traffic through residential proxy...');
      }

      browser = await chromiumStealth.launch(launchOptions);
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });

      // Rehydrate cookies/session if available
      if (settings?.cookiesJson) {
        try {
          const cookies = JSON.parse(settings.cookiesJson);
          await context.addCookies(cookies);
          await logSystem('INFO', 'Injected saved session cookies for target site authentication.');
        } catch (e) {
          await logSystem('WARNING', 'Failed to load saved session cookies.');
        }
      }

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Mimic natural user wait
      await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);

      // Extract page metadata
      const title = await page.title();
      
      // Heuristic analysis of page to find body text
      const textContent = await page.evaluate(() => {
        // Find element containing primary content
        const body = document.querySelector('body');
        if (!body) return '';
        
        // Target containers likely to hold descriptions while stripping scripts/styles
        const scripts = body.querySelectorAll('script, style, nav, footer, header');
        scripts.forEach(s => s.remove());
        
        return body.innerHTML;
      });

      const cleanText = cleanDescription(textContent);
      
      // Extract name & company heuristics based on title structure
      let jobTitle = title.split('|')[0].trim();
      let company = 'Direct Application';
      
      if (url.includes('linkedin.com')) {
        company = title.split(' hiring ')[0] || 'LinkedIn Employer';
        jobTitle = jobTitle.replace(' hiring now!', '').trim();
      } else if (url.includes('indeed.com')) {
        company = title.split(' - ')[1] || 'Indeed Employer';
      }

      await logSystem('SUCCESS', `Successfully extracted page content for "${jobTitle}" at "${company}".`);

      const jobData = {
        title: jobTitle,
        company,
        location: 'Remote',
        url,
        description: cleanText,
        platform: url.includes('linkedin.com') ? 'LinkedIn' : url.includes('indeed.com') ? 'Indeed' : 'Web Direct',
        isRemote: true
      };
      return jobData;
    } catch (e: any) {
      await logSystem('ERROR', `Stealth Crawler Error on ${url}: ${e.message}`);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  });
}

/**
 * Scrapes Remotive using their official, unblocked developer API with smart targeted queries.
 */
export async function scrapeRemotiveApi(searchTerms: string[]): Promise<RawScrapedJob[]> {
  let allJobs: RawScrapedJob[] = [];
  
  for (const term of searchTerms) {
    await logSystem('INFO', `Scraping Remotive API specifically for role: "${term}"...`);
    try {
      const response = await fetch(`https://remotive.com/api/remote-jobs?search=${term}`);
      if (!response.ok) {
        throw new Error(`Remotive API responded with status: ${response.status}`);
      }
      const data: any = await response.json();
      if (!data || !Array.isArray(data.jobs)) {
        continue;
      }

      const jobs: RawScrapedJob[] = data.jobs.map((job: any) => ({
        title: job.title,
        company: job.company_name || 'Remote Employer',
        location: job.candidate_required_location || 'Remote',
        url: job.url,
        description: cleanDescription(job.description || ''),
        platform: 'Remotive',
        isRemote: true,
        workType: Math.random() < 0.33 ? 'REMOTE' : (Math.random() < 0.5 ? 'HYBRID' : 'ONSITE')
      }));
      
      allJobs = [...allJobs, ...jobs];
    } catch (error: any) {
      await logSystem('WARNING', `Remotive API query for "${term}" failed: ${error?.message || error}`);
    }
  }

  // Remove duplicates by url
  const uniqueJobs = Array.from(new Map(allJobs.map(item => [item.url, item])).values());
  await logSystem('SUCCESS', `Successfully scraped ${uniqueJobs.length} unique remote jobs from Remotive API.`);
  return uniqueJobs;
}

/**
 * Scrapes URLs from listofwebsite.txt using Python curl_cffi fallback.
 */
export async function scrapeCustomListUrls(searchTerms: string[]): Promise<RawScrapedJob[]> {
  const listPath = path.join(__dirname, '../../../../listofwebsite.txt');
  let allJobs: RawScrapedJob[] = [];
  
  if (!require('fs').existsSync(listPath)) {
    return allJobs;
  }

  const lines = require('fs').readFileSync(listPath, 'utf8').split('\n');
  const targetUrls: {name: string, url: string}[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 4) {
      const name = parts[0];
      const url = parts[3].trim();
      
      if (searchTerms.some(term => name.toLowerCase().includes(term.toLowerCase()) || url.toLowerCase().includes(term.toLowerCase()))) {
         targetUrls.push({name, url});
      }
    }
  }

  // Execute scraping on all matching target URLs without limits
  const selectedUrls = targetUrls;
  
  for (const target of selectedUrls) {
    await logSystem('INFO', `Python Scraper: Fetching ${target.name} -> ${target.url}`);
    try {
      const jobsJsonStr = await new Promise<string>((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'python_job_scraper.py');
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        execFile(pythonCmd, [scriptPath, target.url], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
          } else {
            resolve(stdout);
          }
        });
      });
      
      const parsed = JSON.parse(jobsJsonStr);
      if (parsed.success && Array.isArray(parsed.jobs)) {
        allJobs = [...allJobs, ...parsed.jobs.map((j: any) => ({
          ...j,
          platform: 'PythonCustom',
          company: target.name.split('-')[0].trim() || 'Unknown',
          isRemote: true
        }))];
      }
    } catch (e: any) {
      await logSystem('WARNING', `Python Scraper failed for ${target.url}: ${e?.message || e}`);
    }
  }

  return allJobs;
}

/**
 * Runs a full scraping iteration — per-user mode.
 * @param userId   Supabase auth UUID. When omitted (called by background daemon), falls back to the first available user.
 */
export async function runScraperJob(userId?: string) {
  try {
    let pReq = supabase.from('user_profiles').select('*');
    if (userId) pReq = pReq.eq('user_id', userId);
    const { data: pData } = await pReq.maybeSingle();
    const profile = pData ? { ...pData, fullName: pData.full_name, skills: pData.skills, rawResumeText: pData.raw_resume_text, targetTitles: pData.target_titles } : null;
    
    if (!profile) {
      await logSystem('WARNING', 'Scraper aborted: No user profile found. Please upload your resume first.');
      return;
    }

    let sReq = supabase.from('agent_settings').select('*');
    if (userId) sReq = sReq.eq('user_id', userId);
    const { data: sData } = await sReq.maybeSingle();
    const settings = sData ? { ...sData, targetField: sData.target_field, experienceLevel: sData.experience_level, ceoDirective: sData.ceo_directive, autoApplyThreshold: sData.auto_apply_threshold, includeInternships: sData.include_internships, openrouterApiKey: sData.openrouter_api_key, openrouterModels: sData.openrouter_models } : null;
    
    let searchTerms: string[] = [];
    try {
      const prompt = `
        Analyze the following candidate profile and career preferences.
        Generate a JSON object with a single key "keywords" containing an array of 3 to 5 highly specific job search keywords (e.g., 'react', 'python', 'cybersecurity') that represent the best matches for this candidate's skills and interests.

        Resume Text/Skills: ${profile.rawResumeText || profile.skills}
        Target Roles: ${profile.targetTitles}
        Experience Level: ${settings?.experienceLevel || 'Entry Level'}
        User Custom Directives/Interests: ${settings?.ceoDirective || 'None'}
      `;
      const aiResponse = await generateJSONResponse<{ keywords: string[] }>(prompt, "You are a professional tech recruiter AI. Return strictly valid JSON.");
      if (aiResponse && aiResponse.keywords && Array.isArray(aiResponse.keywords)) {
        searchTerms = aiResponse.keywords;
      }
    } catch (e) {
      console.error('AI Keyword Extraction failed, falling back to basic terms', e);
    }
    
    if (searchTerms.length === 0) {
      if (settings?.targetField) {
        try {
          const parsed = JSON.parse(settings.targetField);
          if (Array.isArray(parsed)) searchTerms = parsed;
        } catch (e) {}
      }
    }
    
    searchTerms = Array.from(new Set(searchTerms)).filter(Boolean);
    if (searchTerms.length === 0) {
      searchTerms = ['developer'];
    }

    await logSystem('INFO', `[AI Executive Report] Audited resume. Smart crawler dynamically extracted optimized search keywords: ${searchTerms.join(', ')}`);

    // 1. Fetch remote job listings across multiple premium remote job boards
    const feeds = [
      { url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss', platform: 'WeWorkRemotely' },
      { url: 'https://larajobs.com/feed', platform: 'LaraJobs' },
      { url: 'https://authenticjobs.com/feed', platform: 'AuthenticJobs' },
      { url: 'https://www.workingnomads.com/jobs?category=development&format=rss', platform: 'WorkingNomads' },
      { url: 'https://www.realworkfromanywhere.com/rss.xml', platform: 'RealWorkFromAnywhere' },
      { url: 'https://remoteok.com/remote-jobs.rss', platform: 'RemoteOK' },
      { url: 'https://jobspresso.co/feed', platform: 'Jobspresso' }
    ];

    // Append search-specific feeds dynamically based on user details
    for (const term of searchTerms) {
      feeds.push({ url: `https://himalayas.app/jobs/rss?q=${term}`, platform: 'Himalayas' });
      if (settings?.includeInternships) {
        feeds.push({ url: `https://himalayas.app/jobs/rss?q=${term}+intern`, platform: 'Himalayas' });
      }
    }

    // Add Internship specific sources if enabled
    if (settings?.includeInternships) {
      feeds.push({ url: 'https://weworkremotely.com/categories/remote-internships.rss', platform: 'WeWorkRemotely' });
      feeds.push({ url: 'https://www.workingnomads.com/jobs?category=internships&format=rss', platform: 'WorkingNomads' });
      feeds.push({ url: 'https://remoteok.com/remote-internship-jobs.rss', platform: 'RemoteOK' });
    }

    let allScrapedJobs: RawScrapedJob[] = [];
    
    // Scrape RSS Feeds
    for (const feed of feeds) {
      try {
        const feedJobs = await scrapeGenericRss(feed.url, feed.platform);
        allScrapedJobs = [...allScrapedJobs, ...feedJobs];
      } catch (err: any) {
        await logSystem('WARNING', `Failed to scrape feed for ${feed.platform}: ${err?.message || err}`);
      }
    }

    // Scrape Remotive via official public API with targeted terms
    try {
      const remotiveJobs = await scrapeRemotiveApi(searchTerms);
      allScrapedJobs = [...allScrapedJobs, ...remotiveJobs];
    } catch (err: any) {
      await logSystem('WARNING', `Failed to scrape Remotive API: ${err?.message || err}`);
    }

    // Custom Python Scraper from listofwebsite.txt
    try {
      const customJobs = await scrapeCustomListUrls(searchTerms);
      allScrapedJobs = [...allScrapedJobs, ...customJobs];
    } catch (err: any) {
      await logSystem('WARNING', `Failed to run custom Python scraper: ${err?.message || err}`);
    }

    await logSystem('INFO', `Scraper aggregated ${allScrapedJobs.length} total remote jobs. Commencing AI evaluation...`);

    let savedCount = 0;
    let matchCount = 0;
    const threshold = settings?.autoApplyThreshold || 75;

    for (const rawJob of allScrapedJobs) {
      try {
        // Check if job already exists to avoid duplicates
        const { data: existing } = await supabase.from('jobs').select('id').eq('url', rawJob.url).maybeSingle();
        
        if (existing) continue;

        // Check if job matches user's target domains/fields
        if (!matchesTargetDomains(rawJob.title, rawJob.description, settings?.targetField)) {
          await logSystem('INFO', `[Pre-Filter] Skipped irrelevant job: "${rawJob.title}" at "${rawJob.company}" (does not match target fields: ${settings?.targetField})`);
          continue;
        }

        // Check if job matches user's selected experience levels
        if (!matchesExperienceLevel(rawJob.title, rawJob.description, settings?.experienceLevel)) {
          await logSystem('INFO', `[Pre-Filter] Skipped job with mismatched experience level: "${rawJob.title}" at "${rawJob.company}" (does not match experience levels: ${settings?.experienceLevel})`);
          continue;
        }

        // Run smart local keyword heuristics screening first to preserve Gemini API limits!
        const localScreen = computeLocalJobMatchHeuristics(
          { fullName: profile.fullName, skills: JSON.parse(profile.skills), rawResumeText: profile.rawResumeText },
          rawJob.title,
          rawJob.description,
          settings?.targetField,
          settings?.experienceLevel
        );

        if (localScreen.matchScore < 40) {
          await logSystem('INFO', `[Pre-Filter] Skipped irrelevant job: "${rawJob.title}" at "${rawJob.company}" (Local Match Score: ${localScreen.matchScore}% - Below 40% threshold)`);
          continue;
        }

        if (localScreen.matchScore < 60) {
          // If the job has a very low local keyword/skills overlap, save it as SCRAPED directly without calling Gemini!
          // This saves massive API tokens.
          await supabase.from('jobs').insert([{
            user_id: userId,
            title: rawJob.title,
            company: rawJob.company,
            is_mnc: isMncCompany(rawJob.company),
            location: rawJob.location,
            url: rawJob.url,
            description: rawJob.description,
            platform: rawJob.platform,
            is_remote: rawJob.isRemote,
            is_internship: rawJob.isInternship || false,
            duration: rawJob.duration,
            stipend: rawJob.stipend,
            match_score: localScreen.matchScore,
            match_reason: `[Local Screen - Scraped] Role compatibility scored at ${localScreen.matchScore}% locally (skipped high-fidelity AI matching to conserve API quotas).`,
            status: 'SCRAPED'
          }]);
          savedCount++;
          continue;
        }

        // AI matching for high-compatibility matches
        const evaluation = await calculateJobMatch(
          { fullName: profile.fullName, skills: JSON.parse(profile.skills), rawResumeText: profile.rawResumeText },
          rawJob.title,
          rawJob.description,
          settings?.ceoDirective,
          settings?.targetField,
          settings?.experienceLevel,
          userId
        );

        // Decide status
        let status = 'SCRAPED';
        if (evaluation.matchScore >= threshold) {
          status = 'QUEUED'; // Queue for automatic stealth applying!
          matchCount++;
        }

        await supabase.from('jobs').insert([{
            user_id: userId,
            title: rawJob.title,
            company: rawJob.company,
            is_mnc: isMncCompany(rawJob.company),
            location: rawJob.location,
            url: rawJob.url,
            description: rawJob.description,
            platform: rawJob.platform,
            is_remote: rawJob.isRemote,
            work_type: rawJob.workType || 'REMOTE',
            is_internship: rawJob.isInternship || false,
            duration: rawJob.duration,
            stipend: rawJob.stipend,
            match_score: evaluation.matchScore,
            match_reason: evaluation.reason,
            status: status
        }]);
        savedCount++;

        // Rate limit API calls to Gemini during batch match (4 seconds for RPM safety)
        await new Promise(r => setTimeout(r, 4000));
      } catch (err) {
        // Skip individual job errors to continue flow
      }
    }

    await logSystem('SUCCESS', `Scraper finished. Saved ${savedCount} new jobs across multiple remote boards, with ${matchCount} auto-queued for applications.`);
  } catch (error: any) {
    await logSystem('ERROR', `Main scraper run loop failed: ${error?.message || error}`);
  }
}
