import { applyToJob } from './applier';
import { sendAutomatedEmail } from './gmailAutomator';
import { findHREmail } from '../hrFinder';
import { supabase, logSystem } from '../../db';

export interface ApplicationResult {
  success: boolean;
  methodUsed: 'EASY_APPLY' | 'COLD_EMAIL' | 'COMPANY_SITE' | 'LINKEDIN_MESSAGE' | 'NONE';
  reason?: string;
}

export class GuaranteedAutoPilot {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Processes a job through the fallback application pipeline.
   */
  async processJob(jobId: string): Promise<ApplicationResult> {
    const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (!job) {
      return { success: false, methodUsed: 'NONE', reason: 'Job not found in database' };
    }

    await logSystem('INFO', `[Autopilot] Processing job "${job.title}" at "${job.company}" via Guaranteed Apply Pipeline...`);

    // METHOD 1 & 2: Platform Application / Easy Apply / Company Site Form Fill
    // We run the Playwright applier.ts which handles form scanning, typing, and submitting.
    let formApplied = false;
    try {
      await logSystem('INFO', `[Autopilot] [Step 1] Attempting form-based application via Playwright stealth...`);
      // We set dryRun = false so it actually attempts to submit if forms are found!
      formApplied = await applyToJob(jobId, this.userId, false);
      if (formApplied) {
        await logSystem('SUCCESS', `[Autopilot] Successfully applied to "${job.title}" via form automation.`);
        return { success: true, methodUsed: 'COMPANY_SITE' };
      }
    } catch (e: any) {
      await logSystem('WARNING', `[Autopilot] Form-based application failed: ${e.message}. Proceeding to next fallback...`);
    }

    // METHOD 3 & 4: HR Discovery & Cold Email
    // If Playwright forms failed, we look for an HR contact and send a cold email!
    let hrEmail = job.hrEmail;
    let hrName = undefined;

    // Check if the logs already have HR email from scraper
    let parsedLogs: any[] = [];
    try {
      if (typeof job.logs === 'string') parsedLogs = JSON.parse(job.logs);
      else if (job.logs) parsedLogs = job.logs;
    } catch (e) {}
    
    const emailLog = parsedLogs.find((l: any) => typeof l === 'object' && l.type === 'HR_EMAIL');
    if (emailLog && emailLog.email) {
      hrEmail = emailLog.email;
      hrName = emailLog.name;
    }

    if (!hrEmail) {
      await logSystem('INFO', `[Autopilot] [Step 2] No HR email in job description. Discovering HR contact...`);
      try {
        const discovery = await findHREmail(job.company, job.title);
        if (discovery && discovery.email) {
          hrEmail = discovery.email;
          hrName = discovery.name;
          await logSystem('INFO', `[Autopilot] Discovered HR email for "${job.company}": ${hrEmail} (${hrName || 'Unknown'})`);
        }
      } catch (err: any) {
        await logSystem('WARNING', `[Autopilot] HR discovery failed: ${err.message}`);
      }
    }

    if (hrEmail) {
      try {
        await logSystem('INFO', `[Autopilot] [Step 3] Attempting cold outreach to HR at ${hrEmail}...`);
        await sendAutomatedEmail(jobId, this.userId, hrEmail, hrName);
        
        // Check if the database updated the sent status
        const { data: updatedJob } = await supabase.from('jobs').select('hr_email_sent').eq('id', jobId).single();
        if (updatedJob && updatedJob.hr_email_sent) {
          // Mark job status as APPLIED if cold email was successfully sent
          await supabase.from('jobs').update({ status: 'APPLIED', applied_at: new Date().toISOString() }).eq('id', jobId);
          await logSystem('SUCCESS', `[Autopilot] Cold email outreach successful. Job marked as APPLIED.`);
          return { success: true, methodUsed: 'COLD_EMAIL' };
        }
      } catch (e: any) {
        await logSystem('WARNING', `[Autopilot] Cold email outreach failed: ${e.message}`);
      }
    }

    // METHOD 5: LinkedIn InMail / Poster Message Fallback (Simulated / Logged)
    if (job.description && job.description.toLowerCase().includes('linkedin.com/in/')) {
      await logSystem('INFO', `[Autopilot] [Step 4] Form & Email failed. Detected LinkedIn profile in description. Queueing manual outreach reminder...`);
      const logs = typeof job.logs === 'string' ? JSON.parse(job.logs) : (job.logs || []);
      logs.push({ type: 'LINKEDIN_OUTREACH_REQUIRED', message: 'Recruiter LinkedIn URL detected in description. Please reach out manually.' });
      await supabase.from('jobs').update({ logs: JSON.stringify(logs) }).eq('id', jobId);
      return { success: false, methodUsed: 'LINKEDIN_MESSAGE', reason: 'LinkedIn message required (manual follow-up queued)' };
    }

    return { success: false, methodUsed: 'NONE', reason: 'All application fallbacks exhausted' };
  }
}
