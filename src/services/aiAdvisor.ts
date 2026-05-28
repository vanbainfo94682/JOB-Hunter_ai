import { logSystem } from '../db';
import { generateTextResponse } from './openrouter';

/**
 * AI Advisor Service
 * Generates personalized upskilling roadmaps and salary negotiation scripts.
 */

export async function generateUpskillRoadmap(profileDetails: any, targetJobTitle: string): Promise<string> {
  try {
    console.log('INFO', `Generating upskill roadmap for ${profileDetails.fullName} targeting ${targetJobTitle}`);
    
    const skills = Array.isArray(profileDetails.skills) ? profileDetails.skills.join(', ') : profileDetails.skills;
    
    const prompt = `
      Act as a Senior Tech Career Coach.
      A candidate with these current skills: [${skills}] wants to get a job as a "${targetJobTitle}".
      Provide a brief, 3-step action plan to bridge their skill gap.
      For the biggest missing skill, suggest a specific topic to search on YouTube (e.g., "Learn Docker in 100 Seconds").
      Keep it actionable, encouraging, and under 150 words. Format with bullet points.
    `;

    const result = await generateTextResponse(prompt, 'gemini-1.5-flash');
    return result.trim();
  } catch (error: any) {
    return "Error generating roadmap. Please focus on fundamental system design and cloud architecture.";
  }
}

export async function generateSalaryNegotiation(jobTitle: string, location: string): Promise<string> {
  try {
    console.log('INFO', `Generating salary negotiation script for ${jobTitle}`);
    
    const prompt = `
      Act as an expert Salary Negotiator.
      Draft a short, polite, but firm email to HR negotiating a higher salary for a "${jobTitle}" role located in "${location}" (or Remote).
      Assume they offered X, and we want to ask for X + 15% based on market rates.
      Keep it under 100 words. Do not use subject lines.
    `;

    const result = await generateTextResponse(prompt, 'gemini-1.5-flash');
    return result.trim();
  } catch (error: any) {
    return "Dear HR,\n\nThank you for the offer. Based on current market rates for this role, I would like to discuss the possibility of adjusting the base compensation closer to my expectations.\n\nBest regards.";
  }
}
