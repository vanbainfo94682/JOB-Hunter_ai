import { logSystem } from '../db';
import { generateTextResponse } from './openrouter';

/**
 * Cold Email Generator Service
 * Uses AI to write a personalized cold email for a specific job and profile.
 */

export async function generateColdEmail(jobTitle: string, companyName: string, hrEmail: string, profileDetails: any): Promise<string> {
  try {
    console.log('INFO', `Drafting personalized cold email for ${jobTitle} at ${companyName}`);
    
    const skills = Array.isArray(profileDetails.skills) ? profileDetails.skills.join(', ') : profileDetails.skills;
    const name = profileDetails.fullName || 'Candidate';
    
    const prompt = `
      You are an expert career coach and copywriter.
      Draft a short, highly professional, and compelling "Cold Email" to an HR/Recruiter.
      
      Details:
      - Job Title: ${jobTitle}
      - Company: ${companyName}
      - HR Email: ${hrEmail}
      - Candidate Name: ${name}
      - Candidate Skills: ${skills}
      
      Rules:
      1. Keep it under 150 words.
      2. Start with a strong hook.
      3. Mention 1-2 relevant skills.
      4. End with a clear Call to Action (CTA) for a brief chat.
      5. Do not include subject line in the body, just the email body itself.
      6. No placeholder text like [Insert Name], use the provided variables.
    `;

    const result = await generateTextResponse(prompt, 'gemini-1.5-flash');
    
    console.log('SUCCESS', `Successfully drafted cold email for ${companyName}`);
    return result.trim();
  } catch (error: any) {
    console.log('ERROR', `Failed to draft cold email: ${error.message}`);
    return `Dear Hiring Team at ${companyName},\n\nI am writing to express my interest in the ${jobTitle} position. With my background in ${profileDetails.skills ? profileDetails.skills.slice(0,2) : 'technology'}, I am confident I can bring value to your team.\n\nI would love to arrange a brief call to discuss this further.\n\nBest regards,\n${profileDetails.fullName || 'Candidate'}`;
  }
}
