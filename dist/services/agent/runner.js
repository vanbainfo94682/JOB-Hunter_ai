"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentCycle = runAgentCycle;
exports.startAgentDaemon = startAgentDaemon;
exports.stopAgentDaemon = stopAgentDaemon;
const db_1 = require("../../db");
const scraper_1 = require("./scraper");
const applier_1 = require("./applier");
let isLoopRunning = false;
let nextScrapeTime = 0;
/**
 * Main coordinator loop representing the 24/7 background AI agent worker.
 */
async function runAgentCycle() {
    if (isLoopRunning)
        return;
    isLoopRunning = true;
    try {
        const settings = await db_1.prisma.agentSettings.findFirst();
        // Check if the agent is enabled by user
        if (!settings || !settings.isActive) {
            isLoopRunning = false;
            return;
        }
        const now = Date.now();
        // 1. Scraping cycle (runs once every 60 minutes)
        if (now >= nextScrapeTime) {
            await (0, db_1.logSystem)('INFO', 'Background Scheduler: Starting scheduled job scraping cycle...');
            await (0, scraper_1.runScraperJob)();
            nextScrapeTime = now + 60 * 60 * 1000; // Next check in 1 hour
        }
        // 2. Application cycle (processes one application per cycle to stay rate-limited & avoid block warnings)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const applicationsToday = await db_1.prisma.job.count({
            where: {
                appliedAt: {
                    gte: todayStart
                },
                status: 'APPLIED'
            }
        });
        const limit = settings.dailyLimit || 10;
        if (applicationsToday >= limit) {
            await (0, db_1.logSystem)('WARNING', `Daily application limit (${limit}) reached. Autopilot paused until tomorrow.`);
            isLoopRunning = false;
            return;
        }
        // Fetch the highest-matching queued job
        const nextJob = await db_1.prisma.job.findFirst({
            where: { status: 'QUEUED' },
            orderBy: { matchScore: 'desc' }
        });
        if (nextJob) {
            await (0, db_1.logSystem)('INFO', `Scheduler Queue: Preparing to apply to "${nextJob.title}" at "${nextJob.company}" (${nextJob.matchScore}% Match Score)...`);
            // Execute play-stealth applier (runs dryRun for safety unless user alters behavior)
            const success = await (0, applier_1.applyToJob)(nextJob.id, nextJob.userId || undefined);
            if (success) {
                await (0, db_1.logSystem)('SUCCESS', `Scheduler Queue: Successfully processed application for "${nextJob.title}".`);
            }
            else {
                await (0, db_1.logSystem)('ERROR', `Scheduler Queue: Application process failed for "${nextJob.title}".`);
            }
        }
    }
    catch (error) {
        await (0, db_1.logSystem)('ERROR', `Background Coordinator Exception: ${error?.message || error}`);
    }
    finally {
        isLoopRunning = false;
    }
}
// Global reference to the background timer
let agentTimer = null;
/**
 * Initializes and starts the background 24/7 daemon.
 */
function startAgentDaemon() {
    if (agentTimer)
        return;
    (0, db_1.logSystem)('INFO', 'AI Autopilot Daemon: Starting background engine loop (running every 30 seconds)...');
    // Runs a cycle check every 30 seconds
    agentTimer = setInterval(runAgentCycle, 30 * 1000);
    // Proactively run immediately on startup
    runAgentCycle();
}
/**
 * Terminates the background daemon loop.
 */
function stopAgentDaemon() {
    if (agentTimer) {
        clearInterval(agentTimer);
        agentTimer = null;
        (0, db_1.logSystem)('WARNING', 'AI Autopilot Daemon: Terminated background execution loop.');
    }
}
