import { logSystem, supabase } from '../../db';
import { runScraperJob } from './scraper';
import { GuaranteeEngine } from './guaranteeEngine';

let isLoopRunning = false;
let nextScrapeTime = 0;

/**
 * Coordinator loop representing the 24/7 background worker.
 * Runs periodically to sweep and process active candidate tasks.
 */
export async function runAgentCycle() {
  if (isLoopRunning) return;
  isLoopRunning = true;

  try {
    const now = Date.now();

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
