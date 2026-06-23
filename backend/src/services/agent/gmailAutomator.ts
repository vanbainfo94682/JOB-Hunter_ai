import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { logSystem, supabase } from '../../db';
import { decryptString } from '../../utils/crypto';
import { generateTextResponse } from '../openrouter';
import path from 'path';
import fs from 'fs';
import { GmailLimitBypass } from './gmailBypass';

const chromiumStealth = chromium;
chromiumStealth.use(stealthPlugin());

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeHumanLike(element: any, text: string) {
  for (const char of text) {
    await element.type(char, { delay: Math.floor(Math.random() * 80) + 20 });
    if (Math.random() < 0.1) await sleep(Math.floor(Math.random() * 100) + 30);
  }
}

export async function sendAutomatedEmail(jobId: string, userId: string, hrEmail: string, hrName?: string) {
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
  const { data: settings } = await supabase.from('agent_settings').select('*').eq('user_id', userId).single();

  let gmailCookies = null;
  if (settings.cookies_json) {
    try {
      const decoded = JSON.parse(decryptString(settings.cookies_json));
      gmailCookies = decoded.gmailCookies;
    } catch(e) {}
  }
  
  if (!gmailCookies) {
    await logSystem('WARNING', `Cannot send automated HR email for "${job.title}". No Gmail cookies configured.`);
    return;
  }

  // Generate Email Content dynamically based on experience and field
  const prompt = `
Write a highly professional, concise, and compelling cold outreach email to a recruiter or hiring manager.
The candidate is applying for the position of "${job.title}" at "${job.company}".
Candidate Name: ${profile.fullName}
Candidate Skills: ${profile.skills}
Candidate Target Field: ${settings.targetField || 'Tech'}
Candidate Experience Level: ${settings.experienceLevel || 'Professional'}

Rules:
1. Subject line MUST be on the first line prefixed with "SUBJECT: ".
2. Limit to 3 short paragraphs.
3. DO NOT include placeholder brackets like [Company Name]. Replace them with the actual values.
4. Start the email with "Dear ${hrName || 'Hiring Manager'}," if a name is provided. Otherwise, "Dear Hiring Team,".
5. End with a polite sign-off.
`;

  let subject = `Application for ${job.title} - ${profile.fullName}`;
  let body = `Dear ${hrName || 'Hiring Team'},\n\nI am writing to express my strong interest in the ${job.title} position at ${job.company}. Please find my resume attached.\n\nBest regards,\n${profile.fullName}`;

  try {
    const aiResponse = await generateTextResponse(prompt, "You are an expert executive career coach writing a cold email to a recruiter.", userId);
    const lines = aiResponse.split('\\n');
    const subjectLineIndex = lines.findIndex((l: string) => l.toUpperCase().startsWith('SUBJECT:'));
    if (subjectLineIndex !== -1) {
      subject = lines[subjectLineIndex].replace(/SUBJECT:\\s*/i, '').trim();
      lines.splice(subjectLineIndex, 1);
      body = lines.join('\\n').trim();
    } else {
      body = aiResponse.trim();
    }
  } catch (err) {
    await logSystem('WARNING', `Failed to generate AI email content. Using fallback template.`);
  }

  // Generate absolute path for resume
  let absolutePath: string | undefined = undefined;
  if (profile.resumePath) {
    const resolvedPath = path.resolve(process.cwd(), profile.resumePath);
    if (fs.existsSync(resolvedPath)) {
      absolutePath = resolvedPath;
    }
  }

  // Phase 2: Try Gmail Limit Bypass (API / SMTP)
  try {
    const bypass = new GmailLimitBypass(userId);
    const sent = await bypass.sendEmail(hrEmail, subject, body, absolutePath);
    if (sent) {
      // Update job logs & database status
      const { data: currentJob } = await supabase.from('jobs').select('logs').eq('id', job.id).single();
      let logs = [];
      if (currentJob && currentJob.logs) {
         logs = typeof currentJob.logs === 'string' ? JSON.parse(currentJob.logs) : currentJob.logs;
         const emailLog = logs.find((l: any) => typeof l === 'object' && l.type === 'HR_EMAIL');
         if (emailLog) emailLog.sent = true;
         else logs.push({ type: 'HR_EMAIL', email: hrEmail, sent: true });
      } else {
         logs.push({ type: 'HR_EMAIL', email: hrEmail, sent: true });
      }

      await supabase.from('jobs').update({
        logs: JSON.stringify(logs),
        hr_email_sent: true
      }).eq('id', job.id);

      return;
    }
  } catch (bypassErr: any) {
    await logSystem('WARNING', `[Automated Email] Bypass engine error: ${bypassErr.message}. Falling back to browser automation.`);
  }

  await logSystem('INFO', `[Automated Email] Initiating Gmail stealth automation to contact ${hrEmail} for ${job.company}...`);

  let browser;
  try {
    const launchOptions: any = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'] };
    if (settings.proxyUrl) launchOptions.proxy = { server: settings.proxyUrl };

    browser = await chromiumStealth.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    try {
      const cookies = JSON.parse(decryptString(settings.gmailCookies));
      await context.addCookies(cookies);
    } catch (e) {
      await logSystem('ERROR', `[Automated Email] Failed to decrypt or parse Gmail cookies.`);
      await browser.close();
      return;
    }

    const page = await context.newPage();
    
    // Attempt navigation to Gmail inbox compose
    await page.goto('https://mail.google.com/mail/u/0/#inbox?compose=new', { waitUntil: 'networkidle', timeout: 45000 });
    await sleep(3000);

    // Wait for compose window to appear
    const toFieldSelector = 'input[peoplekit-id]';
    const toFallback = '[name="to"]';
    
    let toInput;
    try {
        toInput = await page.waitForSelector(toFieldSelector, { timeout: 10000 });
    } catch (e) {
        toInput = await page.waitForSelector(toFallback, { timeout: 5000 });
    }
    
    if (!toInput) throw new Error("Could not find the 'To' input field in Gmail. Check if cookies are valid.");

    await toInput.click();
    await typeHumanLike(toInput, hrEmail);
    await page.keyboard.press('Enter'); 
    await sleep(1000);

    // Subject
    const subjectInput = await page.$('[name="subjectbox"]');
    if (subjectInput) {
      await subjectInput.click();
      await typeHumanLike(subjectInput, subject);
    }
    await sleep(500);

    // Body
    const bodyInput = await page.$('div[aria-label="Message Body"]');
    if (bodyInput) {
      await bodyInput.click();
      await typeHumanLike(bodyInput, body);
    }
    await sleep(1000);

    // Attach File
    const fileInput = await page.$('input[type="file"][name="Filedata"]');
    if (fileInput && profile.resumePath) {
      const absolutePath = path.resolve(process.cwd(), profile.resumePath);
      if (fs.existsSync(absolutePath)) {
        await fileInput.setInputFiles(absolutePath);
        await logSystem('INFO', `[Automated Email] Uploaded tailored resume: ${absolutePath}`);
        await sleep(6000); // Wait for upload to complete visually
      } else {
        await logSystem('WARNING', `[Automated Email] Resume file not found at path: ${absolutePath}. Sending email without attachment.`);
      }
    }

    // Click Send
    const sendButton = await page.$('div[aria-label^="Send"]');
    if (sendButton) {
      await sendButton.click();
      await logSystem('SUCCESS', `[Automated Email] Successfully sent automated HR outreach to ${hrEmail} for ${job.company}!`);
      
      const { data: currentJob } = await supabase.from('jobs').select('logs').eq('id', job.id).single();
      let logs = [];
      if (currentJob && currentJob.logs) {
         logs = typeof currentJob.logs === 'string' ? JSON.parse(currentJob.logs) : currentJob.logs;
         const emailLog = logs.find((l: any) => typeof l === 'object' && l.type === 'HR_EMAIL');
         if (emailLog) emailLog.sent = true;
         else logs.push({ type: 'HR_EMAIL', email: hrEmail, sent: true });
      } else {
         logs.push({ type: 'HR_EMAIL', email: hrEmail, sent: true });
      }

      await supabase.from('jobs').update({
        logs: JSON.stringify(logs)
      }).eq('id', job.id);
    } else {
      throw new Error("Send button not found. Could not dispatch email.");
    }

    await sleep(3000);
  } catch (error: any) {
    await logSystem('ERROR', `[Automated Email] Failed to send email to ${hrEmail}: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
