export interface ScrapingTimeSlot {
  bestTimeHours: number[]; // hours of the day in UTC, e.g. [0, 6, 12, 18]
  maxJobsPerRun: number;
  rateLimit: number; // requests per minute
  useXRay?: boolean;
}

export const SCRAPING_SCHEDULE: Record<string, ScrapingTimeSlot> = {
  'Indeed': {
    bestTimeHours: [0, 6, 12, 18],
    maxJobsPerRun: 200,
    rateLimit: 10
  },
  'LinkedIn': {
    bestTimeHours: [1, 7, 13, 19],
    maxJobsPerRun: 100,
    rateLimit: 5,
    useXRay: true
  },
  'GoogleJobs': {
    bestTimeHours: [2, 8, 14, 20],
    maxJobsPerRun: 500,
    rateLimit: 15
  },
  'Naukri': {
    bestTimeHours: [3, 9, 15, 21],
    maxJobsPerRun: 150,
    rateLimit: 8
  },
  'Internshala': {
    bestTimeHours: [4, 10, 16, 22],
    maxJobsPerRun: 100,
    rateLimit: 6
  }
};

/**
 * Checks if a specific platform should be scraped at the given date/time (default to current time).
 */
export function shouldScrapeRightNow(platform: string, date: Date = new Date()): boolean {
  const schedule = SCRAPING_SCHEDULE[platform];
  if (!schedule) {
    return true; // Default to true if not defined in schedule (e.g. for fallback RSS feeds)
  }
  const currentUTCHour = date.getUTCHours();
  return schedule.bestTimeHours.includes(currentUTCHour);
}

/**
 * Returns a list of platforms that should be scraped right now.
 */
export function getPlatformsToScrape(date: Date = new Date()): string[] {
  const platforms = Object.keys(SCRAPING_SCHEDULE);
  return platforms.filter(p => shouldScrapeRightNow(p, date));
}
