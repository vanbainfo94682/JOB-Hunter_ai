import fs from 'fs';
import pdf from 'pdf-parse';
import { generateJSONResponse } from './openrouter';
import { logSystem } from '../db';

export interface ParsedResume {
  fullName: string;
  email: string;
  phone: string;
  skills: string[];
  experience: {
    company: string;
    title: string;
    duration: string;
    description: string;
  }[];
  education: {
    school: string;
    degree: string;
    year: string;
  }[];
  targetTitles: string[];
}

/**
 * Extracts text from a PDF file using pdf-parse
 */
export async function extractTextFromPdf(input: string | Buffer): Promise<string> {
  try {
    const dataBuffer = typeof input === 'string' ? fs.readFileSync(input) : input;
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error: any) {
    console.log('ERROR', `Failed to parse PDF file content: ${error?.message || error}`);
    throw new Error(`PDF parsing failed: ${error?.message || error}`);
  }
}

/**
 * Sends raw resume text to OpenRouter to build a clean structured profile.
 * userId is used to fetch the per-user API key and model list from AgentSettings.
 */
export async function parseResumeWithAI(rawText: string, userId?: string): Promise<ParsedResume> {
  const systemInstruction = `You are an expert ATS (Applicant Tracking System) parser and CV auditor. 
Your objective is to read raw text from a candidate resume and map it strictly to the provided JSON structure. 
Be highly fault-tolerant. Even if the resume is poorly formatted, fragmented, or in an unusual layout, do your absolute best to extract ANY available data.
Infer professional skills, structured work history, education history, and generate 5 highly optimized target search job titles (e.g. "Remote Full Stack Engineer", "Senior React Developer") based on their background.
If any specific information is entirely missing, use empty strings ("") or empty arrays ([]) instead of null. 
Return ONLY valid JSON complying with the required schema. Do not write markdown text other than JSON.`;

  const prompt = `Please parse the following raw resume text and output a JSON object matching this structure:
{
  "fullName": "Name",
  "email": "Email Address",
  "phone": "Phone Number or empty string",
  "skills": ["Skill1", "Skill2", "Skill3", ...],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Duration (e.g., June 2021 - Present or 3 Years)",
      "description": "Short explanation of achievements and tasks"
    }
  ],
  "education": [
    {
      "school": "University or Institution Name",
      "degree": "Degree (e.g., Bachelor of Science in Computer Science)",
      "year": "Graduation Year (e.g., 2020)"
    }
  ],
  "targetTitles": ["Target Title 1", "Target Title 2", ...]
}

Raw Resume Text:
------------------------------------------
${rawText}
------------------------------------------
`;

  try {
    const structuredProfile = await generateJSONResponse<ParsedResume>(prompt, systemInstruction, userId);
    return structuredProfile;
  } catch (error: any) {
    console.log('ERROR', `AI Resume Parsing failed: ${error?.message || error}`);
    throw new Error(`AI Parsing failed: ${error?.message || error}`);
  }
}
