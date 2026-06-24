import { supabase, logSystem } from '../../db';
import { extractHrEmail } from './matcher';
import { findHREmail } from '../hrFinder';
import { generateJSONResponse } from '../openrouter';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { decryptString } from '../../utils/crypto';
import { proxyPool } from './proxyPool';
import { torManager } from './torManager';
import { shouldScrapeRightNow } from './scheduler';
import { playwrightQueue } from '../../utils/playwrightQueue';
import { browserPool } from './browserPool';

export interface RawScrapedJob {
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

export class MasterJobScraper {
  private userId: string;
  private profile: any = null;
  private settings: any = null;
  private isCancelled: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  cancel() {
    this.isCancelled = true;
  }

  async init(): Promise<boolean> {
    const pReq = supabase.from('user_profiles').select('*').eq('user_id', this.userId);
    const { data: pData } = await pReq.maybeSingle();
    if (!pData) {
      await logSystem('WARNING', `MasterJobScraper aborted: No user profile found for user ${this.userId}.`);
      return false;
    }
    this.profile = {
      id: pData.id,
      userId: pData.user_id,
      fullName: pData.full_name,
      skills: pData.skills,
      rawResumeText: pData.raw_resume_text,
      targetTitles: pData.target_titles
    };

    const sReq = supabase.from('agent_settings').select('*').eq('user_id', this.userId);
    const { data: sData } = await sReq.maybeSingle();
    this.settings = sData ? {
      targetField: sData.target_field,
      experienceLevel: sData.experience_level,
      ceoDirective: sData.ceo_directive,
      autoApplyThreshold: sData.auto_apply_threshold,
      includeInternships: sData.include_internships,
      proxyUrl: sData.proxy_url,
      isActive: sData.is_active
    } : null;

    return true;
  }

  private cleanDescription(rawDesc: string): string {
    if (!rawDesc) return '';
    let decoded = rawDesc;
    for (let i = 0; i < 4; i++) {
      const prev = decoded;
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
    
    let formatted = decoded
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, ' ');
      
    formatted = formatted.replace(/<[^>]*>/g, '');
    formatted = formatted
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
      
    return formatted || rawDesc.substring(0, 1000);
  }

  private detectInternshipDetails(title: string, description: string): { isInternship: boolean; duration?: string; stipend?: string } {
    const text = (title + ' ' + description).toLowerCase();
    const isInternship = text.includes('intern') || text.includes('internship') || text.includes('trainee') || text.includes('fellowship');
    if (!isInternship) return { isInternship: false };

    const durationMatch = description.match(/(\d+)\s*(month|week|day)s?\s*(duration|period|internship)/i) || 
                          description.match(/(duration|period):\s*(\d+)\s*(month|week|day)s?/i);
    const duration = durationMatch ? durationMatch[0] : undefined;

    const stipendMatch = description.match(/(stipend|salary|pay|compensation):\s*([^.\n]+)/i) ||
                         description.match(/(INR|₹|\$|USD|£|€)\s*(\d+[,.]?\d*)\s*(per month|month|monthly|year|yearly|annum|hr|hour)?/i);
    const stipend = stipendMatch ? stipendMatch[0] : undefined;

    return { isInternship, duration, stipend };
  }

  private detectEmploymentType(text: string): 'fulltime' | 'parttime' | 'contract' | 'internship' {
    const lower = text.toLowerCase();
    if (lower.includes('intern') || lower.includes('internship')) return 'internship';
    if (lower.includes('part') || lower.includes('part-time')) return 'parttime';
    if (lower.includes('contract') || lower.includes('temporary')) return 'contract';
    return 'fulltime';
  }

  private parseTitleAndCompany(fullTitle: string, platform: string, itemXml: string): { title: string; company: string } {
    let title = fullTitle.trim();
    let company = 'Remote Employer';

    if (platform === 'WeWorkRemotely' && fullTitle.includes(':')) {
      const parts = fullTitle.split(':');
      company = parts[0].trim();
      title = parts.slice(1).join(':').trim();
    } else if (fullTitle.toLowerCase().includes(' at ')) {
      const parts = fullTitle.split(/\s+at\s+/i);
      title = parts[0].trim();
      company = parts.slice(1).join(' at ').trim();
    } else if (fullTitle.includes('(') && fullTitle.endsWith(')')) {
      const startIdx = fullTitle.lastIndexOf('(');
      title = fullTitle.substring(0, startIdx).trim();
      company = fullTitle.substring(startIdx + 1, fullTitle.length - 1).trim();
    } else {
      const creatorMatch = itemXml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/) || itemXml.match(/<author>([\s\S]*?)<\/author>/);
      if (creatorMatch) {
        company = creatorMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      }
    }
    return { title, company };
  }

  private async fetchWithPythonFallback(url: string): Promise<string> {
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
    } catch (err) {}

    return new Promise((resolve, reject) => {
      const isDist = __dirname.includes('dist');
      const basePath = isDist ? path.join(__dirname, '../../../src/services/agent') : __dirname;
      const scriptPath = path.join(basePath, 'crawler.py');
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

  private cleanDuckDuckGoUrl(ddgUrl: string): string {
    if (!ddgUrl) return '';
    if (ddgUrl.includes('uddg=')) {
      const parts = ddgUrl.split('uddg=');
      if (parts.length > 1) {
        return decodeURIComponent(parts[1].split('&')[0]);
      }
    }
    if (ddgUrl.startsWith('//')) {
      return 'https:' + ddgUrl;
    }
    return ddgUrl;
  }

  async scrapeEverything(isManual: boolean = false): Promise<RawScrapedJob[]> {
    if (!this.profile) {
      const inited = await this.init();
      if (!inited) return [];
    }

    const allJobs: RawScrapedJob[] = [];
    const searchTerms = await this.generateSearchKeywords();

    await logSystem('INFO', `[MasterScraper] Initiating multi-source scrape cycle. Target keywords: ${searchTerms.join(', ')}`);

    const platformsToHit: string[] = [];
    if (isManual) {
      platformsToHit.push('Indeed', 'LinkedIn', 'GoogleJobs', 'Naukri', 'Internshala', 'YCStartups', 'Wellfound');
    } else {
      if (shouldScrapeRightNow('Indeed')) platformsToHit.push('Indeed');
      if (shouldScrapeRightNow('LinkedIn')) platformsToHit.push('LinkedIn');
      if (shouldScrapeRightNow('GoogleJobs')) platformsToHit.push('GoogleJobs');
      if (shouldScrapeRightNow('Naukri')) platformsToHit.push('Naukri');
      if (shouldScrapeRightNow('Internshala')) platformsToHit.push('Internshala');
      if (shouldScrapeRightNow('YCStartups')) platformsToHit.push('YCStartups');
      if (shouldScrapeRightNow('Wellfound')) platformsToHit.push('Wellfound');
    }

    const rssJobs = await this.scrapeRssFeeds(searchTerms);
    allJobs.push(...rssJobs);

    for (const platform of platformsToHit) {
      if (this.isCancelled) break;
      await logSystem('INFO', `[MasterScraper] Running scraper for platform: ${platform}`);
      
      try {
        if (platform === 'Indeed') {
          const indeedJobs = await this.scrapeIndeed(searchTerms);
          allJobs.push(...indeedJobs);
        } else if (platform === 'LinkedIn') {
          const linkedinJobs = await this.scrapeLinkedInXRay(searchTerms);
          allJobs.push(...linkedinJobs);
        } else if (platform === 'GoogleJobs') {
          const googleJobs = await this.scrapeGoogleJobs(searchTerms);
          allJobs.push(...googleJobs);
        } else if (platform === 'Naukri') {
          const naukriJobs = await this.scrapeNaukriFallback(searchTerms);
          allJobs.push(...naukriJobs);
        } else if (platform === 'Internshala') {
          const internshalaJobs = await this.scrapeInternshala(searchTerms);
          allJobs.push(...internshalaJobs);
        } else if (platform === 'YCStartups') {
          const ycJobs = await this.scrapeYCombinatorStartups(searchTerms);
          allJobs.push(...ycJobs);
        } else if (platform === 'Wellfound') {
          const wfJobs = await this.scrapeWellfound(searchTerms);
          allJobs.push(...wfJobs);
        }
      } catch (err: any) {
        await logSystem('WARNING', `[MasterScraper] Platform ${platform} scraper encountered errors: ${err.message}`);
      }
    }

    try {
      const remotiveJobs = await this.scrapeRemotiveApi(searchTerms);
      allJobs.push(...remotiveJobs);
    } catch (e: any) {
      await logSystem('WARNING', `[MasterScraper] Remotive API scrape failed: ${e.message}`);
    }

    try {
      const customJobs = await this.scrapeCustomListUrls(searchTerms);
      allJobs.push(...customJobs);
    } catch (e: any) {
      await logSystem('WARNING', `[MasterScraper] Custom website list scrape failed: ${e.message}`);
    }

    return allJobs;
  }

  private async generateSearchKeywords(): Promise<string[]> {
    let searchTerms: string[] = [];
    try {
      const isEntryLevel = this.settings?.experienceLevel && JSON.parse(this.settings.experienceLevel).some((l: string) => l.toLowerCase().includes('entry'));
      
      const prompt = `
        Analyze the following candidate profile and career preferences.
        Generate a JSON object with a single key "keywords" containing an array of 3 to 5 highly specific job search keywords that combine these career fields and experience levels to use on job boards.

        Interested Career Fields (Target Fields): ${this.settings?.targetField || 'None selected'}
        Experience Level (Seniority): ${this.settings?.experienceLevel || 'Entry Level'}
        User Custom Directives: ${this.settings?.ceoDirective || 'None'}
        Fallback Resume Skills (Only use to enrich keywords if fields are empty): ${this.profile.skills}
        ${isEntryLevel ? 'IMPORTANT: The candidate is Entry Level. Also include at least one keyword variant with "Internship" or "Intern" to capture internship listings.' : ''}
      `;
      const aiResponse = await generateJSONResponse<{ keywords: string[] }>(prompt, "You are a professional tech recruiter AI. Return strictly valid JSON.");
      if (aiResponse && aiResponse.keywords && Array.isArray(aiResponse.keywords)) {
        searchTerms = aiResponse.keywords;
      }
    } catch (e) {
      console.error('AI Keyword Extraction failed, falling back to basic terms', e);
    }

    if (searchTerms.length === 0 && this.settings?.targetField) {
      try {
        const parsedFields = JSON.parse(this.settings.targetField);
        let exp = '';
        if (this.settings?.experienceLevel) {
          const expParsed = JSON.parse(this.settings.experienceLevel);
          if (Array.isArray(expParsed) && expParsed.length > 0) exp = expParsed[0];
        }
        if (Array.isArray(parsedFields)) {
          searchTerms = parsedFields.map(field => exp ? `${field} ${exp}` : field);
        }
      } catch (e) {}
    }

    searchTerms = Array.from(new Set(searchTerms)).filter(Boolean);
    if (searchTerms.length === 0) searchTerms = ['developer'];
    return searchTerms;
  }

  private async scrapeIndeed(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    
    for (const term of searchTerms) {
      if (this.isCancelled) break;
      
      const rssUrls = [
        `https://www.indeed.com/rss?q=${encodeURIComponent(term)}&sort=date`,
        `https://rss.indeed.com/rss?q=${encodeURIComponent(term)}`
      ];

      for (const url of rssUrls) {
        try {
          const xmlText = await this.fetchWithPythonFallback(url);
          const $ = cheerio.load(xmlText, { xmlMode: true });
          
          $('item').each((_, item) => {
            const title = $(item).find('title').text();
            const link = $(item).find('link').text();
            const description = $(item).find('description').text();
            
            if (title && link) {
              const cleanDesc = this.cleanDescription(description);
              const { title: parsedTitle, company } = this.parseTitleAndCompany(title, 'Indeed', $(item).html() || '');
              const internDetails = this.detectInternshipDetails(parsedTitle, cleanDesc);

              jobs.push({
                title: parsedTitle,
                company: company || 'Indeed Employer',
                location: 'Remote/India',
                url: link,
                description: cleanDesc,
                platform: 'Indeed',
                isRemote: true,
                workType: 'REMOTE',
                ...internDetails
              });
            }
          });
          
          if (jobs.length > 0) break;
        } catch (err: any) {}
      }
      
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    }
    
    return jobs;
  }

  private async scrapeLinkedInXRay(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    const jobUrls = new Set<string>();

    for (const term of searchTerms) {
      if (this.isCancelled) break;

      const query = `site:linkedin.com/jobs/view/ "${term}" remote OR hybrid`;
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      try {
        await logSystem('INFO', `[LinkedIn X-Ray] Querying DuckDuckGo for: ${query}`);
        const html = await this.fetchWithPythonFallback(searchUrl);
        const $ = cheerio.load(html);
        
        $('.result__url').each((_, el) => {
          const rawUrl = $(el).attr('href');
          if (rawUrl) {
            const cleanUrl = this.cleanDuckDuckGoUrl(rawUrl);
            if (cleanUrl.includes('linkedin.com/jobs/view/')) {
              const match = cleanUrl.match(/linkedin\.com\/jobs\/view\/\d+/);
              if (match) {
                jobUrls.add('https://' + match[0]);
              }
            }
          }
        });
      } catch (err: any) {
        await logSystem('WARNING', `[LinkedIn X-Ray] DuckDuckGo crawl failed: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
    }

    const urlList = Array.from(jobUrls).slice(0, 15);
    await logSystem('INFO', `[LinkedIn X-Ray] Found ${urlList.length} candidate LinkedIn job listings. Executing stealth details crawl...`);

    for (const url of urlList) {
      if (this.isCancelled) break;

      const jobData = await playwrightQueue.enqueue(async () => {
        let page = null;
        try {
          let proxyUrlString = undefined;
          if (torManager.isReady) {
             proxyUrlString = torManager.getProxyUrl();
             await torManager.requestNewIdentity();
          } else {
             const pUrl = await proxyPool.getProxy();
             if (pUrl) {
               proxyUrlString = pUrl.startsWith('http') || pUrl.startsWith('socks') ? pUrl : `http://${pUrl}`;
             }
          }

          page = await browserPool.getPage(proxyUrlString);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1000 + Math.random() * 2000);

          const title = await page.title();
          const pageText = await page.evaluate(() => document.body.innerText);

          let jobTitle = title.split('|')[0].trim();
          let company = 'LinkedIn Employer';
          if (title.includes(' hiring ')) {
            company = title.split(' hiring ')[0].trim();
            jobTitle = jobTitle.replace(' hiring now!', '').trim();
          } else if (title.includes(' - ')) {
            company = title.split(' - ')[1].split('|')[0].trim();
          }

          const cleanText = this.cleanDescription(pageText);
          const internDetails = this.detectInternshipDetails(jobTitle, cleanText);

          return {
            title: jobTitle,
            company,
            location: 'Remote',
            url,
            description: cleanText,
            platform: 'LinkedIn',
            isRemote: true,
            workType: 'REMOTE',
            ...internDetails
          };
        } catch (e: any) {
          return null;
        } finally {
          if (page) await browserPool.closePage(page);
        }
      });

      if (jobData) {
        jobs.push(jobData);
      }
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    }

    return jobs;
  }

  private async scrapeGoogleJobs(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];

    for (const term of searchTerms) {
      if (this.isCancelled) break;

      const query = `${term} jobs`;
      await logSystem('INFO', `[GoogleJobs] Searching Google for Jobs: "${query}"`);

      const googleJobsResult = await playwrightQueue.enqueue(async () => {
        let page = null;
        try {
          let proxyUrlString = undefined;
          if (torManager.isReady) {
             proxyUrlString = torManager.getProxyUrl();
             await torManager.requestNewIdentity();
          } else {
             const pUrl = await proxyPool.getProxy();
             if (pUrl) {
               proxyUrlString = pUrl.startsWith('http') || pUrl.startsWith('socks') ? pUrl : `http://${pUrl}`;
             }
          }

          page = await browserPool.getPage(proxyUrlString);

          const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&ibp=htl;jobs`;
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          await page.waitForSelector('[role="listitem"]', { timeout: 10000 }).catch(() => {});
          const cards = await page.$$('[role="listitem"]');

          const pageJobs: RawScrapedJob[] = [];
          for (const card of cards.slice(0, 10)) {
            try {
              await card.click();
              await page.waitForTimeout(1000 + Math.random() * 1000);

              const title = await card.$eval('[class*="TL8aV"], [class*="i316Ob"], .i316Ob', el => el.textContent?.trim()).catch(() => '');
              const company = await card.$eval('[class*="vpx5gf"], [class*="FCUp0c"], .FCUp0c', el => el.textContent?.trim()).catch(() => '');
              const location = await card.$eval('[class*="Q23Fnd"], .Q23Fnd', el => el.textContent?.trim()).catch(() => 'Remote');

              const description = await page.$eval('[class*="Yg2xdb"], [class*="HBgCmd"], .HBgCmd, .job-description-text', el => el.textContent?.trim()).catch(() => '');
              const applyLink = await page.$eval('a[href*="google.com/url"], a.e1gGeb', el => el.getAttribute('href')).catch(() => '');

              if (title && company && description) {
                const cleanText = this.cleanDescription(description);
                const isRemote = cleanText.toLowerCase().includes('remote') || location.toLowerCase().includes('remote');
                const internDetails = this.detectInternshipDetails(title, cleanText);

                pageJobs.push({
                  title,
                  company,
                  location,
                  url: applyLink || `https://google.com/search?q=${encodeURIComponent(title + ' ' + company)}&ibp=htl;jobs`,
                  description: cleanText,
                  platform: 'GoogleJobs',
                  isRemote,
                  workType: isRemote ? 'REMOTE' : 'ONSITE',
                  ...internDetails
                });
              }
            } catch (err) {}
          }
          return pageJobs;
        } catch (e: any) {
          await logSystem('WARNING', `[GoogleJobs] Playwright crawl failed for query "${query}": ${e.message}`);
          return [];
        } finally {
          if (page) await browserPool.closePage(page);
        }
      });

      if (googleJobsResult && googleJobsResult.length > 0) {
        jobs.push(...googleJobsResult);
      }
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    }
    return jobs;
  }

  private async scrapeInternshala(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    
    for (const term of searchTerms) {
      if (this.isCancelled) break;
      const categories = ['internship', 'job'];
      
      for (const type of categories) {
        const url = `https://internshala.com/${type}s/${term.toLowerCase().replace(/\s+/g, '-')}-${type}`;
        
        const pageJobs = await playwrightQueue.enqueue(async () => {
          let page = null;
          try {
            page = await browserPool.getPage();
            
            await page.setExtraHTTPHeaders({
              'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8'
            });
            
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);

            const cards = await page.evaluate(() => {
              const elements = document.querySelectorAll('.internship_list_container .individual_internship');
              return Array.from(elements).slice(0, 10).map(card => {
                const title = card.querySelector('.heading_4_5')?.textContent?.trim();
                const company = card.querySelector('.company_name')?.textContent?.trim();
                const location = card.querySelector('.location_link')?.textContent?.trim();
                const jobType = card.querySelector('.job_type')?.textContent?.trim();
                const link = (card.querySelector('a') as HTMLAnchorElement)?.href;
                return { title, company, location, jobType, link };
              });
            });

            const subJobs: RawScrapedJob[] = [];
            for (const card of cards) {
              if (card.link) {
                await page.goto(card.link, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const pageText = await page.evaluate(() => document.body.innerText);
                const description = await page.evaluate(() => document.querySelector('.details_container')?.textContent || '');
                
                const cleanText = this.cleanDescription(description);
                const emails = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                const hrEmail = emails.length > 0 ? emails[0] : undefined;

                subJobs.push({
                  title: card.title || '',
                  company: card.company || 'Internshala Employer',
                  location: card.location || 'India',
                  url: card.link,
                  description: cleanText,
                  platform: 'Internshala',
                  isRemote: card.location?.toLowerCase().includes('work from home') || false,
                  workType: card.location?.toLowerCase().includes('work from home') ? 'REMOTE' : 'ONSITE',
                  isInternship: type === 'internship',
                  stipend: hrEmail
                });
              }
            }
            return subJobs;
          } catch (err: any) {
            return [];
          } finally {
            if (page) await browserPool.closePage(page);
          }
        });

        if (pageJobs && pageJobs.length > 0) {
          jobs.push(...pageJobs);
        }
      }
    }
    return jobs;
  }

  private async scrapeYCombinatorStartups(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    
    for (const term of searchTerms) {
      if (this.isCancelled) break;

      const queries = [
        `site:ycombinator.com/jobs "${term}"`,
        `site:wellfound.com/jobs "${term}" startup`,
        `site:workatastartup.com "${term}"`
      ];

      for (const query of queries) {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        try {
          await logSystem('INFO', `[YC/Startups] DuckDuckGo X-Ray query: ${query}`);
          const html = await this.fetchWithPythonFallback(searchUrl);
          const $ = cheerio.load(html);
          
          $('.result__body').each((_, el) => {
            const title = $(el).find('.result__title').text().trim();
            const rawUrl = $(el).find('.result__url').attr('href');
            const snippet = $(el).find('.result__snippet').text().trim();
            
            if (rawUrl && title) {
              const cleanUrl = this.cleanDuckDuckGoUrl(rawUrl);
              const { title: parsedTitle, company } = this.parseTitleAndCompany(title, 'YCStartups', '');
              const internDetails = this.detectInternshipDetails(parsedTitle, snippet);

              jobs.push({
                title: parsedTitle,
                company: company || 'Startup',
                location: 'Remote',
                url: cleanUrl,
                description: this.cleanDescription(snippet),
                platform: 'YCStartups',
                isRemote: true,
                workType: 'REMOTE',
                ...internDetails
              });
            }
          });
        } catch (err: any) {
          await logSystem('WARNING', `[YC/Startups] DuckDuckGo crawl failed for query "${query}": ${err.message}`);
        }

        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      }

      const ycDirectUrl = 'https://ycombinator.com/jobs';
      const wellfoundUrl = `https://wellfound.com/jobs?query=${encodeURIComponent(term)}`;

      for (const startupUrl of [ycDirectUrl, wellfoundUrl]) {
        try {
          const html = await this.fetchWithPythonFallback(startupUrl);
          const $ = cheerio.load(html);
          
          $('a[href*="/jobs/"], a[href*="/jobs?"], .job_link').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            if (text && href) {
              const fullUrl = href.startsWith('http') ? href : `https://wellfound.com${href}`;
              const { title: parsedTitle, company } = this.parseTitleAndCompany(text, 'YCStartups', '');
              const internDetails = this.detectInternshipDetails(parsedTitle, text);

              jobs.push({
                title: parsedTitle,
                company: company || 'Startup',
                location: 'Remote',
                url: fullUrl,
                description: text,
                platform: 'YCStartups',
                isRemote: true,
                workType: 'REMOTE',
                ...internDetails
              });
            }
          });
        } catch (err) {}
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    return jobs;
  }

  private async scrapeWellfound(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    
    for (const term of searchTerms) {
      if (this.isCancelled) break;

      const queries = [
        `site:wellfound.com/jobs "${term}"`,
        `site:angel.co/jobs "${term}" startup remote`
      ];

      for (const query of queries) {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        try {
          await logSystem('INFO', `[Wellfound] DuckDuckGo X-Ray query: ${query}`);
          const html = await this.fetchWithPythonFallback(searchUrl);
          const $ = cheerio.load(html);
          
          $('.result__body').each((_, el) => {
            const title = $(el).find('.result__title').text().trim();
            const rawUrl = $(el).find('.result__url').attr('href');
            const snippet = $(el).find('.result__snippet').text().trim();
            
            if (rawUrl && title) {
              const cleanUrl = this.cleanDuckDuckGoUrl(rawUrl);
              const { title: parsedTitle, company } = this.parseTitleAndCompany(title, 'Wellfound', '');
              const internDetails = this.detectInternshipDetails(parsedTitle, snippet);

              jobs.push({
                title: parsedTitle,
                company: company || 'Wellfound Startup',
                location: 'Remote',
                url: cleanUrl,
                description: this.cleanDescription(snippet),
                platform: 'Wellfound',
                isRemote: true,
                workType: 'REMOTE',
                ...internDetails
              });
            }
          });
        } catch (err: any) {
          await logSystem('WARNING', `[Wellfound] DuckDuckGo crawl failed for query "${query}": ${err.message}`);
        }

        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      }
    }

    return jobs;
  }

  private async scrapeNaukriFallback(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    for (const term of searchTerms) {
      if (this.isCancelled) break;
      const query = `site:naukri.com/job-listings- "${term}"`;
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      try {
        const html = await this.fetchWithPythonFallback(searchUrl);
        const $ = cheerio.load(html);
        
        $('.result__body').each((_, el) => {
          const title = $(el).find('.result__title').text().trim();
          const rawUrl = $(el).find('.result__url').attr('href');
          const snippet = $(el).find('.result__snippet').text().trim();
          
          if (rawUrl && title) {
            const cleanUrl = this.cleanDuckDuckGoUrl(rawUrl);
            const { title: parsedTitle, company } = this.parseTitleAndCompany(title, 'Naukri', '');
            const internDetails = this.detectInternshipDetails(parsedTitle, snippet);

            jobs.push({
              title: parsedTitle,
              company: company || 'Naukri Employer',
              location: 'India',
              url: cleanUrl,
              description: this.cleanDescription(snippet),
              platform: 'Naukri',
              isRemote: snippet.toLowerCase().includes('remote') || snippet.toLowerCase().includes('work from home'),
              workType: 'REMOTE',
              ...internDetails
            });
          }
        });
      } catch (err) {}
      await new Promise(r => setTimeout(r, 2000));
    }
    return jobs;
  }

  private async scrapeRssFeeds(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    const feeds = [
      { url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss', platform: 'WeWorkRemotely' },
      { url: 'https://larajobs.com/feed', platform: 'LaraJobs' },
      { url: 'https://authenticjobs.com/feed', platform: 'AuthenticJobs' },
      { url: 'https://www.workingnomads.com/jobs?category=development&format=rss', platform: 'WorkingNomads' },
      { url: 'https://remoteok.com/remote-jobs.rss', platform: 'RemoteOK' },
      { url: 'https://jobspresso.co/feed', platform: 'Jobspresso' },
      { url: 'https://remote.co/remote-jobs/feed/', platform: 'Remote.co' },
      { url: 'https://jsremotely.com/feed', platform: 'JSRemotely' },
      { url: 'https://remotive.com/startup-jobs.rss', platform: 'RemotiveStartups' },
      { url: 'https://himalayas.app/jobs/rss?tags=startup', platform: 'HimalayasStartups' }
    ];

    if (this.settings?.includeInternships) {
      feeds.push({ url: 'https://weworkremotely.com/categories/remote-internships.rss', platform: 'WeWorkRemotely' });
    }

    for (const term of searchTerms) {
      feeds.push({ url: `https://himalayas.app/jobs/rss?q=${encodeURIComponent(term)}`, platform: 'Himalayas' });
    }

    for (const feed of feeds) {
      if (this.isCancelled) break;
      try {
        const xmlText = await this.fetchWithPythonFallback(feed.url);
        const $ = cheerio.load(xmlText, { xmlMode: true });
        
        $('item').each((_, item) => {
          const title = $(item).find('title').text();
          const link = $(item).find('link').text();
          const description = $(item).find('description').text() || $(item).find('content\\:encoded').text();
          
          if (title && link) {
            const cleanDesc = this.cleanDescription(description);
            const { title: parsedTitle, company } = this.parseTitleAndCompany(title, feed.platform, $(item).html() || '');
            const internDetails = this.detectInternshipDetails(parsedTitle, cleanDesc);

            jobs.push({
              title: parsedTitle,
              company,
              location: 'Remote',
              url: link,
              description: cleanDesc,
              platform: feed.platform,
              isRemote: true,
              workType: 'REMOTE',
              ...internDetails
            });
          }
        });
      } catch (err) {}
    }
    return jobs;
  }

  private async scrapeRemotiveApi(searchTerms: string[]): Promise<RawScrapedJob[]> {
    let allJobs: RawScrapedJob[] = [];
    for (const term of searchTerms) {
      if (this.isCancelled) break;
      try {
        const response = await fetch(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}`);
        if (response.ok) {
          const data: any = await response.json();
          if (data && Array.isArray(data.jobs)) {
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

            const jobs: RawScrapedJob[] = data.jobs
              .filter((job: any) => !job.publication_date || new Date(job.publication_date) >= twoMonthsAgo)
              .map((job: any) => ({
                title: job.title,
                company: job.company_name || 'Remote Employer',
                location: job.candidate_required_location || 'Remote',
                url: job.url,
                description: this.cleanDescription(job.description || ''),
                platform: 'Remotive',
                isRemote: true,
                workType: 'REMOTE'
              }));
            allJobs = [...allJobs, ...jobs];
          }
        }
      } catch (err) {}
    }
    return allJobs;
  }

  private async scrapeCustomListUrls(searchTerms: string[]): Promise<RawScrapedJob[]> {
    const listPath = path.join(__dirname, '../../../../listofwebsite.txt');
    let allJobs: RawScrapedJob[] = [];
    if (!fs.existsSync(listPath)) return allJobs;

    try {
      const lines = fs.readFileSync(listPath, 'utf8').split('\n');
      const targetUrls: { name: string; url: string }[] = [];

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 4) {
          const name = parts[0];
          const url = parts[3].trim();
          if (searchTerms.some(term => name.toLowerCase().includes(term.toLowerCase()) || url.toLowerCase().includes(term.toLowerCase()))) {
            targetUrls.push({ name, url });
          }
        }
      }

      for (const target of targetUrls) {
        if (this.isCancelled) break;
        try {
          const jobsJsonStr = await new Promise<string>((resolve, reject) => {
            const isDist = __dirname.includes('dist');
            const basePath = isDist ? path.join(__dirname, '../../../src/services/agent') : __dirname;
            const scriptPath = path.join(basePath, 'python_job_scraper.py');
            const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
            execFile(pythonCmd, [scriptPath, target.url], { maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (error, stdout) => {
              if (error) reject(error);
              else resolve(stdout);
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
        } catch (e) {}
      }
    } catch (e) {}
    return allJobs;
  }
}
