import path from 'path';
import fs from 'fs';
import { supabase, logSystem, prisma } from '../../db';
import { generateApplicationMaterials } from './matcher';
import { sendAutomatedEmail } from './gmailAutomator';
import { decryptString } from '../../utils/crypto';
import { browserPool } from './browserPool';

// Ensure the screenshots directory exists
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', '..', 'public', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

/**
 * Utility to introduce human-like random pauses
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Simulates typing text into a locator with natural keystroke timings and occasional backspaces.
 */
async function humanType(page: any, selector: string, text: string) {
  const element = page.locator(selector).first();
  await element.click();
  await sleep(Math.floor(Math.random() * 200) + 100);
  
  for (const char of text) {
    await element.type(char, { delay: Math.floor(Math.random() * 120) + 40 });
    if (Math.random() < 0.15) {
      await sleep(Math.floor(Math.random() * 200) + 50);
    }
  }
}

/**
 * Executes a stealth browser automation application session for a queued job.
 * userId is used to fetch the per-user profile, settings, and matcher materials.
 */
export async function applyToJob(jobId: string, userId?: string, dryRun: boolean = true): Promise<boolean> {
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();

  let pReq = supabase.from('user_profiles').select('*');
  if (userId) pReq = pReq.eq('user_id', userId);
  const { data: pData } = await pReq.maybeSingle();
  let profile = pData ? { ...pData, fullName: pData.full_name, rawResumeText: pData.raw_resume_text } : null;

  let sReq = supabase.from('agent_settings').select('*');
  if (userId) sReq = sReq.eq('user_id', userId);
  const { data: sData } = await sReq.maybeSingle();
  let settings = sData ? { ...sData, targetField: sData.target_field, experienceLevel: sData.experience_level, ceoDirective: sData.ceo_directive, isActive: sData.is_active } : null;

  if (!job) {
    await logSystem('ERROR', `Queue Error: Job ID ${jobId} not found in database.`);
    return false;
  }

  let parsedLogs: any[] = [];
  try {
    if (typeof job.logs === 'string') parsedLogs = JSON.parse(job.logs);
    else if (job.logs) parsedLogs = job.logs;
  } catch (e) {}
  
  let hrEmail = null;
  let hrEmailSent = false;
  let hrName = undefined;
  
  const emailLog = parsedLogs.find((l: any) => typeof l === 'object' && l.type === 'HR_EMAIL');
  if (emailLog) {
      hrEmail = emailLog.email;
      hrEmailSent = emailLog.sent;
      hrName = emailLog.name;
  }

  await logSystem('INFO', `[Applier] Starting autonomous session for "${job.title}" at "${job.company}"...`);

  if (!profile) {
    await logSystem('ERROR', `Application aborted for "${job.title}". No User Profile uploaded.`);
    await supabase.from('jobs').update({ status: 'FAILED', logs: JSON.stringify([{ time: new Date(), message: 'Aborted: No user profile uploaded.' }]) }).eq('id', jobId);
    return false;
  }

  const shouldAutoSubmit = !dryRun;
  await logSystem('INFO', `Starting stealth auto-apply sequence for "${job.title}" at "${job.company}"... Mode: ${shouldAutoSubmit ? 'LIVE FIRE' : 'DRY RUN'}`);
  await supabase.from('jobs').update({ status: 'APPLYING' }).eq('id', jobId);

  const sessionLogs: { time: Date; message: string }[] = [];
  const logStep = async (msg: string) => {
    console.log(`[Job ${jobId}] ${msg}`);
    sessionLogs.push({ time: new Date(), message: msg });
    await supabase.from('jobs').update({ logs: JSON.stringify(sessionLogs) }).eq('id', jobId);
  };

  await logStep('Generating customized cover letter and screening materials...');
  const materials = await generateApplicationMaterials(
    { fullName: profile.fullName, skills: JSON.parse(profile.skills), rawResumeText: (job as any).tailoredResumeText || profile.rawResumeText },
    job.title,
    job.company,
    job.description,
    userId
  );

  const userEmail = profile.professional_email || profile.email || 'user@example.com';

  let page = null;
  try {
    page = await browserPool.getPage(settings?.proxyUrl || undefined);
    await logStep(`Navigating to application URL: ${job.url}`);
    
    await page.goto(job.url, { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(2000);

    const initialScreenshotPath = path.join(SCREENSHOTS_DIR, `${jobId}_initial.png`);
    await page.screenshot({ path: initialScreenshotPath });
    await logStep(`Captured initial page loaded state.`);

    await logStep('Scanning page DOM structure for job application form fields...');

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

    for (const selector of emailSelectors) {
      if (await page.locator(selector).count() > 0) {
        await logStep(`Filling email input field with ${userEmail}...`);
        await humanType(page, selector, userEmail);
        formsFound = true;
        break;
      }
    }

    for (const selector of nameSelectors) {
      if (await page.locator(selector).count() > 0) {
        await logStep(`Filling full name input field...`);
        await humanType(page, selector, profile.fullName);
        formsFound = true;
        break;
      }
    }

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

    const resumePath = profile.resume_url || profile.resumePath;
    if (resumePath) {
      const resolvedPath = path.resolve(process.cwd(), resumePath);
      if (fs.existsSync(resolvedPath)) {
        for (const selector of fileSelectors) {
          if (await page.locator(selector).count() > 0) {
            await logStep(`Uploading resume PDF to file input...`);
            await page.locator(selector).first().setInputFiles(resolvedPath);
            formsFound = true;
            break;
          }
        }
      } else {
        await logStep(`Note: Resume file not found at ${resolvedPath}. Skipping file upload.`);
      }
    }

    for (const selector of coverLetterSelectors) {
      if (await page.locator(selector).count() > 0) {
        await logStep(`Writing tailored AI cover letter into text block...`);
        await humanType(page, selector, materials.coverLetter);
        formsFound = true;
        break;
      }
    }

    const textareas = await page.locator('textarea').all();
    for (const area of textareas) {
      const isVisible = await area.isVisible();
      if (!isVisible) continue;
      
      const label = await area.evaluate((el: any) => {
        const parent = el.parentElement;
        if (!parent) return '';
        return parent.innerText || '';
      });

      if (label && label.length > 5 && !label.toLowerCase().includes('cover letter')) {
        const bestAnswer = materials.customAnswers.find(ans => 
          label.toLowerCase().includes(ans.question.toLowerCase()) || 
          ans.question.toLowerCase().includes(label.toLowerCase())
        );

        if (bestAnswer) {
          await logStep(`Answering custom field: "${label.substring(0, 40)}..."`);
          await area.click();
          await area.fill(bestAnswer.answer);
          await sleep(1000);
        }
      }
    }

    const filledScreenshotPath = path.join(SCREENSHOTS_DIR, `${jobId}_filled.png`);
    await page.screenshot({ path: filledScreenshotPath });
    await logStep(`Captured state of filled application forms.`);

    if (!formsFound) {
      await logStep('Note: Standard application forms were not directly detected on this page (might require external login/sign-in).');
    }

    if (!shouldAutoSubmit) {
      await logStep('[DRY RUN] Bypassed final submit action for security and compliance. Enable autopilot in settings to submit live.');
      await supabase.from('jobs').update({
        status: 'APPLIED',
        applied_at: new Date().toISOString()
      }).eq('id', jobId);
      await logSystem('SUCCESS', `Dry-run application completed successfully for "${job.title}".`);

      if (hrEmail && !hrEmailSent) {
        sendAutomatedEmail(job.id, userId || job.user_id || '', hrEmail, hrName).catch(e => console.error('[Gmail Automator Error]', e));
      }
      
      return true;
    }

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '[data-testid="submit-button"]',
      '[data-testid="application-submit"]',
      'button:has-text("Submit Application")',
      'text=Submit Application',
      'button:has-text("Submit")',
      'button:has-text("Apply Now")',
      'button:has-text("Apply")',
      '[role="button"]:has-text("Submit")'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      const button = page.locator(selector).first();
      if (await button.count() > 0 && await button.isVisible()) {
        await logStep(`Submitting application using button: "${await button.innerText()}"`);
        await button.click();
        await sleep(5000);
        
        const successScreenshotPath = path.join(SCREENSHOTS_DIR, `${jobId}_success.png`);
        await page.screenshot({ path: successScreenshotPath });
        
        submitted = true;
        break;
      }
    }

    if (submitted) {
      await supabase.from('jobs').update({
        status: 'APPLIED',
        applied_at: new Date().toISOString()
      }).eq('id', jobId);
      await logSystem('SUCCESS', `Successfully submitted application to "${job.title}" at "${job.company}"!`);

      if (hrEmail && !hrEmailSent) {
        sendAutomatedEmail(job.id, userId || job.user_id || '', hrEmail, hrName).catch(e => console.error('[Gmail Automator Error]', e));
      }
      
      return true;
    } else {
      await logStep('Could not automatically determine the final submit button. Marked as Manual Review.');
      await supabase.from('jobs').update({ status: 'MATCHED' }).eq('id', jobId);
      return false;
    }

  } catch (error: any) {
    await logStep(`Exception occurred during execution: ${error?.message || error}`);
    await supabase.from('jobs').update({ status: 'FAILED' }).eq('id', jobId);
    await logSystem('ERROR', `Auto-apply session failed for "${job.title}": ${error?.message || error}`);
    return false;
  } finally {
    if (page) {
      await browserPool.closePage(page);
    }
  }
}
