import { logSystem, supabase } from '../../db';
import { runScraperJob } from './scraper';
import { GuaranteeEngine } from './guaranteeEngine';

let isLoopRunning = false;
let nextScrapeTime = 0;
let lastCleanupTime = 0;

export async function closeStaleJobs(userId: string): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: oldJobs, error } = await supabase
    .from('jobs')
    .select('id, status, platform, url')
    .eq('user_id', userId)
    .neq('status', 'APPLIED')
    .neq('status', 'FAILED')
    .neq('status', 'INTERVIEW')
    .neq('status', 'OFFER')
    .lt('created_at', thirtyDaysAgo.toISOString());

  if (error) {
    await logSystem('ERROR', `[Cleanup] Failed to fetch stale jobs: ${error.message}`);
    return 0;
  }

  if (!oldJobs || oldJobs.length === 0) return 0;

  const ids = oldJobs.map(j => j.id);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('jobs')
    .update({ status: 'CLOSED', logs: supabase.raw(`COALESCE(logs, '[]') || '[{"type":"SYSTEM","message":"Job marked as CLOSED - no longer active","timestamp":"${now}"}]'`) })
    .in('id', ids);

  if (updateError) {
    await logSystem('ERROR', `[Cleanup] Failed to update stale jobs: ${updateError.message}`);
    return 0;
  }

  await logSystem('INFO', `[Cleanup] Marked ${ids.length} stale jobs as CLOSED for user ${userId}`);
  return ids.length;
}

export async function runAgentCycle() {
  if (isLoopRunning) return;
  isLoopRunning = true;

  try {
    const now = Date.now();

    // 0. Cleanup stale jobs once per day
    if (now >= lastCleanupTime + 24 * 60 * 60 * 1000) {
      lastCleanupTime = now;
      if (activeSettings && activeSettings.length > 0) {
        for (const setting of activeSettings) {
          await closeStaleJobs(setting.user_id);
        }
      }
    }

    // 1. Scraping & Application cycle (runs once every 60 minutes)
    if (now >= nextScrapeTime) {
      await logSystem('INFO', 'Background Coordinator: Starting scheduled scraping & auto-apply cycle...');
      
      // Get all active user settings
      const { data: activeSettings } = await supabase.from('agent_settings')
        .select('user_id')
        .eq('is_active', true);

      if (activeSettings && activeSettings.length > 0) {
        await logSystem('INFO', `Background Coordinator: Found ${activeSettings.length} active autopilot profile(s).`);
        for (const setting of activeSettings) {
          try {
            await logSystem('INFO', `Background Coordinator: Processing cycles for candidate: ${setting.user_id}`);
            
            // Step A: Trigger scraper to harvest new listings
            await runScraperJob(setting.user_id);
            
            // Step B: Trigger guarantee engine to run application pipeline loops
            const engine = new GuaranteeEngine(setting.user_id);
            await engine.ensureDailyTarget();
          } catch (userErr: any) {
            await logSystem('ERROR', `Background Coordinator: Failed cycle execution for candidate ${setting.user_id}: ${userErr.message}`);
          }
        }
      } else {
        await logSystem('INFO', 'Background Coordinator: No active autopilot profiles found.');
      }
      
      nextScrapeTime = now + 60 * 60 * 1000; // Schedule next run in 1 hour
    }

  } catch (error: any) {
    await logSystem('ERROR', `Background Coordinator Exception: ${error?.message || error}`);
  } finally {
    isLoopRunning = false;
  }
}

// Global reference to the background timer
let agentTimer: NodeJS.Timeout | null = null;

/**
 * Initializes and starts the background 24/7 daemon.
 */
export function startAgentDaemon() {
  if (agentTimer) return;
  
  logSystem('INFO', 'AI Autopilot Daemon: Starting background engine loop (running every 30 seconds)...');
  // Runs a cycle check every 30 seconds
  agentTimer = setInterval(runAgentCycle, 30 * 1000);
  
  // Proactively run immediately on startup
  runAgentCycle();
}

/**
 * Terminates the background daemon loop.
 */
export function stopAgentDaemon() {
  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
    logSystem('WARNING', 'AI Autopilot Daemon: Terminated background execution loop.');
  }
}
