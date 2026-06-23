import { logSystem } from '../db';
import { generateTextResponse } from './openrouter';

/**
 * HR Email Finder Service
 * Uses AI to guess/generate the HR email format based on company name/domain
 * and provides a draft cold email based on the job and profile.
 */

export async function findHREmail(companyName: string, domain?: string): Promise<{ email: string, confidence: string }> {
  try {
    // Simulated HR discovery using AI to predict standard corporate email patterns
    // In a real production system, this would call Hunter.io API or Apollo.io API
    
    console.log('INFO', `Starting AI HR Discovery for company: ${companyName}`);
    
    const prompt = `
      You are an expert recruiter and OSINT analyst.
      I have a company named "${companyName}". 
      Predict the most likely email address for the HR department, Hiring Manager, or Talent Acquisition team.
      If a domain is not provided, guess the domain (e.g., @google.com).
      Respond ONLY with a JSON object in this exact format:
      {"email": "careers@company.com", "confidence": "high/medium/low"}
    `;

    const result = await generateTextResponse(prompt, 'gemini-1.5-flash');
    
    try {
      const cleaned = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      console.log('SUCCESS', `HR Email discovered for ${companyName}: ${parsed.email}`);
      return { email: parsed.email, confidence: parsed.confidence };
    } catch (e) {
      // Fallback if AI fails to output valid JSON
      const fallbackEmail = `careers@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      return { email: fallbackEmail, confidence: 'low' };
    }

  } catch (error: any) {
    console.log('ERROR', `Failed to find HR email for ${companyName}: ${error.message}`);
    return { email: `talent@${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`, confidence: 'low' };
  }
}
