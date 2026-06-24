import { supabase, logSystem } from '../../db';
import { MasterJobScraper } from './masterJobScraper';
import { GuaranteedAutoPilot } from './autopilot';
import { GmailLimitBypass } from './gmailBypass';
import { runScraperJob, isScrapingActive } from './scraper';

export class GuaranteeEngine {
  private userId: string;
  private readonly DAILY_TARGET = 50;
  private autopilot: GuaranteedAutoPilot;

  constructor(userId: string) {
    this.userId = userId;
    this.autopilot = new GuaranteedAutoPilot(userId);
  }

  /**
   * Returns the count of jobs successfully applied to today (UTC).
   */
  async getTodayApplicationCount(): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase.from('jobs')
      .select('*', { count: 'exact', head: true })
      .gte('applied_at', todayStart.toISOString())
      .eq('status', 'APPLIED')
      .eq('user_id', this.userId);

    if (error) {
      console.error('Failed to query today application count:', error);
      return 0;
    }
    return count || 0;
  }

  /**
   * Main loops execution ensuring the target of 50 applications is reached today.
   */
  async ensureDailyTarget(): Promise<void> {
    await logSystem('INFO', `[GuaranteeEngine] Initiating ensureDailyTarget loop for user ${this.userId} (Target: ${this.DAILY_TARGET})`);
    
    // Force isActive=true so downstream scrapers/appliers know autopilot is running
    await supabase.from('agent_settings').update({ is_active: true }).eq('user_id', this.userId).catch(() => {});
    
    let applied = await this.getTodayApplicationCount();
    await logSystem('INFO', `[GuaranteeEngine] Current successful applications count today: ${applied}`);

    if (applied >= this.DAILY_TARGET) {
      await logSystem('SUCCESS', `[GuaranteeEngine] Daily application target of ${this.DAILY_TARGET} already achieved today.`);
      await this.sendMorningReport(applied);
      return;
    }

    let loopIterations = 0;
    const maxIterations = 5;

    while (applied < this.DAILY_TARGET && loopIterations < maxIterations) {
      loopIterations++;
      await logSystem('INFO', `[GuaranteeEngine] Autopilot loop iteration ${loopIterations}/${maxIterations}. Applied: ${applied}/${this.DAILY_TARGET}`);

      // 1. Fetch all queued jobs (any match score)
      const { data: queuedJobs } = await supabase.from('jobs')
        .select('*')
        .eq('status', 'QUEUED')
        .eq('user_id', this.userId)
        .order('match_score', { ascending: false });

      if (queuedJobs && queuedJobs.length > 0) {
        await logSystem('INFO', `[GuaranteeEngine] Found ${queuedJobs.length} queued jobs. Processing...`);
        for (const job of queuedJobs) {
          if (applied >= this.DAILY_TARGET) break;

          const result = await this.autopilot.processJob(job.id);
          if (result.success) {
            applied++;
            await logSystem('SUCCESS', `[GuaranteeEngine] Application target progress: ${applied}/${this.DAILY_TARGET}`);
          }
        }
      }

      // 2. Lower threshold to harvest more jobs (any score > 15)
      if (applied < this.DAILY_TARGET) {
        await logSystem('INFO', `[GuaranteeEngine] Queued jobs exhausted. Lowering threshold to match score > 15...`);
        const { data: fallbackJobs } = await supabase.from('jobs')
          .select('id, match_score')
          .eq('status', 'SCRAPED')
          .eq('user_id', this.userId)
          .gt('match_score', 15);

        if (fallbackJobs && fallbackJobs.length > 0) {
          await logSystem('INFO', `[GuaranteeEngine] Upgrading ${fallbackJobs.length} fallback jobs to QUEUED status...`);
          const ids = fallbackJobs.map(j => j.id);
          await supabase.from('jobs').update({ status: 'QUEUED' }).in('id', ids);
          continue;
        }
      }

      // 3. Broadened search + scoring pipeline
      if (applied < this.DAILY_TARGET) {
        await logSystem('INFO', `[GuaranteeEngine] Fallback jobs exhausted. Broadening search...`);
        if (isScrapingActive) {
          await logSystem('INFO', `[GuaranteeEngine] Scraper already running. Waiting for it to finish...`);
          // Wait for the in-progress scrape to complete (poll every 5s, timeout 2 minutes)
          const pollStart = Date.now();
          while (isScrapingActive && Date.now() - pollStart < 120000) {
            await new Promise(r => setTimeout(r, 5000));
          }
          await logSystem('INFO', `[GuaranteeEngine] Scraper finished (or timed out). Re-checking database...`);
        } else {
          await runScraperJob(this.userId, true);
          await logSystem('INFO', `[GuaranteeEngine] Full scrape + scoring pipeline triggered. Waiting for jobs to populate...`);
          await new Promise(r => setTimeout(r, 10000));
        }
      }
    }

    await logSystem('SUCCESS', `[GuaranteeEngine] Target cycle finished. Final applications dispatched: ${applied}`);
    await this.sendMorningReport(applied);
  }

    let loopIterations = 0;
    const maxIterations = 3; // Prevent infinite loops if there are no more jobs on the web

    while (applied < this.DAILY_TARGET && loopIterations < maxIterations) {
      loopIterations++;
      await logSystem('INFO', `[GuaranteeEngine] Autopilot loop iteration ${loopIterations}/3. Applied: ${applied}/${this.DAILY_TARGET}`);

      // 1. Fetch matched queued jobs from DB
      const { data: queuedJobs } = await supabase.from('jobs')
        .select('*')
        .eq('status', 'QUEUED')
        .eq('user_id', this.userId)
        .order('match_score', { ascending: false });

      if (queuedJobs && queuedJobs.length > 0) {
        await logSystem('INFO', `[GuaranteeEngine] Found ${queuedJobs.length} queued high-fit jobs in queue. Processing...`);
        for (const job of queuedJobs) {
          if (applied >= this.DAILY_TARGET) break;

          const result = await this.autopilot.processJob(job.id);
          if (result.success) {
            applied++;
            await logSystem('SUCCESS', `[GuaranteeEngine] Application target progress: ${applied}/${this.DAILY_TARGET}`);
          }
        }
      }

      // 2. If still not enough, lower threshold (harvest jobs with score > 40)
      if (applied < this.DAILY_TARGET) {
        await logSystem('INFO', `[GuaranteeEngine] Queued jobs exhausted. Lowering threshold to harvest jobs with match score > 40...`);
        const { data: fallbackJobs } = await supabase.from('jobs')
          .select('id, match_score')
          .eq('status', 'SCRAPED')
          .eq('user_id', this.userId)
          .gt('match_score', 40);

        if (fallbackJobs && fallbackJobs.length > 0) {
          await logSystem('INFO', `[GuaranteeEngine] Upgrading ${fallbackJobs.length} fallback jobs to QUEUED status...`);
          // Upgrade status to QUEUED
          const ids = fallbackJobs.map(j => j.id);
          await supabase.from('jobs').update({ status: 'QUEUED' }).in('id', ids);

          // Rerun loop step to process newly queued jobs
          continue;
        }
      }

      // 3. If STILL not enough, broaden search keywords and trigger scrape again
      if (applied < this.DAILY_TARGET) {
        await logSystem('INFO', `[GuaranteeEngine] Fallback jobs exhausted. Broadening search terms and trigger active scrape...`);
        
        // Run the full scoring pipeline so jobs are actually saved and scored in DB
        // Run the full scoring pipeline so jobs are actually saved and scored in DB
        await runScraperJob(this.userId, true);
        await logSystem('INFO', `[GuaranteeEngine] Full scrape + scoring pipeline triggered. Waiting for jobs to populate in DB...`);

        // Wait a few seconds for database insertions/scoring to catch up
        await new Promise(r => setTimeout(r, 10000));
        
        // Next loop cycle will automatically read these newly scraped jobs from the database
      }
    }

    await logSystem('SUCCESS', `[GuaranteeEngine] Target cycle finished. Final applications dispatched: ${applied}`);
    await this.sendMorningReport(applied);
  }

  /**
   * Dispatches the morning summary report to the candidate's email.
   */
  async sendMorningReport(count: number): Promise<void> {
    try {
      const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', this.userId).maybeSingle();
      const { data: user } = await supabase.from('app_users').select('email').eq('id', this.userId).maybeSingle();

      const recipientEmail = profile?.email || user?.email;
      if (!recipientEmail) {
        await logSystem('WARNING', `[GuaranteeEngine] Could not dispatch Morning Report: No recipient email address found.`);
        return;
      }

      const averageScore = await this.getAverageMatchScore();

      await logSystem('INFO', `[GuaranteeEngine] Dispatching morning summary report to ${recipientEmail}...`);
      const bypass = new GmailLimitBypass(this.userId);

      const subject = `🌅 VANBA Morning Report — ${count} applications sent while you slept`;
      const body = `
Good morning ${profile?.fullName || 'Candidate'}!

While you were sleeping, VANBA Job Hunter AI processed:
✅ ${count} job applications successfully sent today
📊 Average match score: ${averageScore}%
🎯 Daily quota target: ${this.DAILY_TARGET}

Log in to your dashboard to see full details: https://vanba.ai/dashboard

Best regards,
VANBA Job Hunter AI Team
      `.trim();

      await bypass.sendEmail(recipientEmail, subject, body);
    } catch (e: any) {
      await logSystem('WARNING', `[GuaranteeEngine] Morning Report delivery failed: ${e.message}`);
    }
  }

  private async getAverageMatchScore(): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data } = await supabase.from('jobs')
      .select('match_score')
      .gte('applied_at', todayStart.toISOString())
      .eq('status', 'APPLIED')
      .eq('user_id', this.userId);

    if (!data || data.length === 0) return 0;
    const total = data.reduce((sum, item) => sum + (item.match_score || 0), 0);
    return Math.round(total / data.length);
  }
}
