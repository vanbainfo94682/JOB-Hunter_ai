import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { supabase, logSystem } from '../../db';
import { extractHrEmail } from './matcher';
import { findHREmail } from '../hrFinder';
import { decryptString } from '../../utils/crypto';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

interface OmniScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  platform: string;
  matchScore: number;
}

export async function runOmniAggregator() {
  await logSystem('INFO', '[Omni-Aggregator] Starting global Omni-Aggregator to scrape jobs from all 50+ portals via Search Engine...');
  
  // Get active users settings
  const { data: settings } = await supabase.from('agent_settings').select('user_id, target_field, experience_level, linkedin_cookies').eq('is_active', true);
  if (!settings || settings.length === 0) return;

  let browser = null;
  try {
    browser = await chromiumStealth.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const setting of settings) {
      if (!setting.target_field) continue;
      
      let role = setting.target_field;
      let experience = setting.experience_level || 'internship';
      
      try {
        const rolesArr = JSON.parse(role);
        if (Array.isArray(rolesArr) && rolesArr.length > 0) {
          role = rolesArr[Math.floor(Math.random() * rolesArr.length)];
        }
      } catch (e) {}

      try {
        const expArr = JSON.parse(experience);
        if (Array.isArray(expArr) && expArr.length > 0) {
          experience = expArr[Math.floor(Math.random() * expArr.length)];
        }
      } catch (e) {}

      // Build dynamic search query that captures Nauki, Internshala, Wellfound, AICTE, Upwork, Glassdoor, etc.
      // Search engines aggregate all these.
      const query = `(${role}) (${experience}) jobs OR internships in India OR Remote`;
      await logSystem('INFO', `[Omni-Aggregator] Querying Search Engine for: ${query}`);

      // We use DuckDuckGo HTML or Bing to pull aggregate lists
      await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);

      const results = await page.$$eval('.result__body', elements => {
        return elements.map(el => {
          const titleEl = el.querySelector('.result__title');
          const snippetEl = el.querySelector('.result__snippet');
          const urlEl = el.querySelector('.result__url');
          return {
            title: titleEl ? (titleEl as HTMLElement).innerText : '',
            snippet: snippetEl ? (snippetEl as HTMLElement).innerText : '',
            url: urlEl ? (urlEl as HTMLElement).getAttribute('href') : ''
          };
        });
      });

      let addedCount = 0;

      for (const res of results) {
        if (!res.title || !res.snippet) continue;

        // Try to parse Company and Title from the search result title.
        // Usually, search results format is "Job Title - Company Name - Platform"
        let title = res.title;
        let company = 'Unknown Company';
        
        const parts = title.split('-');
        if (parts.length >= 2) {
          title = parts[0].trim();
          company = parts[1].trim();
        }

        // Avoid adding generic portal homepages
        if (title.toLowerCase().includes('jobs in') || title.toLowerCase().includes('internships in')) continue;

        // Basic match score heuristic based on keyword density
        let score = 50;
        const lowerDesc = res.snippet.toLowerCase();
        const roleTerms = role.toLowerCase().split(' ');
        for (const term of roleTerms) {
            if (term.length > 2 && lowerDesc.includes(term)) score += 15;
        }
        if (lowerDesc.includes(experience.toLowerCase())) score += 20;
        score = Math.min(score, 99);

        if (score >= 70) {
            // Check if job exists
            const { count } = await supabase.from('jobs')
                .select('*', { count: 'exact', head: true })
                .eq('company', company)
                .eq('title', title);
                
            if (count === 0) {
                // Find HR email
                let hrEmail = await extractHrEmail(res.snippet, setting.user_id);
                let hrName, hrTitle;

                if (!hrEmail) {
                    let cookiesToPass;
                    if (setting.linkedin_cookies) {
                        try { cookiesToPass = decryptString(setting.linkedin_cookies); } catch(e) {}
                    }
                    const discovery = await findHREmail(company, role, undefined, res.url || undefined, cookiesToPass);
                    if (discovery && discovery.email) {
                        hrEmail = discovery.email;
                        hrName = discovery.name;
                        hrTitle = discovery.title;
                    }
                }

                let initialLogs = [];
                if (hrEmail) {
                    initialLogs.push({ type: 'HR_EMAIL', email: hrEmail, name: hrName, title: hrTitle, sent: false });
                }

                await supabase.from('jobs').insert([{
                    user_id: setting.user_id,
                    title: title,
                    company: company,
                    is_mnc: false, // Defaulting, could enhance
                    location: 'India/Remote',
                    url: res.url || 'https://google.com',
                    description: res.snippet,
                    match_score: score,
                    status: 'QUEUED',
                    logs: JSON.stringify(initialLogs)
                }]);
                addedCount++;
            }
        }
      }

      await logSystem('SUCCESS', `[Omni-Aggregator] Aggregated ${addedCount} highly matching jobs from all 50+ portals for user ${setting.user_id}`);
    }
  } catch (error: any) {
    await logSystem('ERROR', `[Omni-Aggregator] Engine failure: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
