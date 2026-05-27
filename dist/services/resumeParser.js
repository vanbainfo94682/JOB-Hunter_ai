"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromPdf = extractTextFromPdf;
exports.parseResumeWithAI = parseResumeWithAI;
const fs_1 = __importDefault(require("fs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const openrouter_1 = require("./openrouter");
const db_1 = require("../db");
/**
 * Extracts text from a PDF file using pdf-parse
 */
async function extractTextFromPdf(input) {
    try {
        const dataBuffer = typeof input === 'string' ? fs_1.default.readFileSync(input) : input;
        const data = await (0, pdf_parse_1.default)(dataBuffer);
        return data.text;
    }
    catch (error) {
        await (0, db_1.logSystem)('ERROR', `Failed to parse PDF file content: ${error?.message || error}`);
        throw new Error(`PDF parsing failed: ${error?.message || error}`);
    }
}
/**
 * Sends raw resume text to OpenRouter to build a clean structured profile.
 * userId is used to fetch the per-user API key and model list from AgentSettings.
 */
async function parseResumeWithAI(rawText, userId) {
    const systemInstruction = `You are an expert ATS (Applicant Tracking System) parser and CV auditor. 
Your objective is to read raw text from a candidate resume and map it strictly to the provided JSON structure. 
Be accurate, clean, and make sure to infer professional skills, structured work history, education history, and generate 5 highly optimized target search job titles (e.g. "Remote Full Stack Engineer", "Senior React Developer") based on their background.
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
        const structuredProfile = await (0, openrouter_1.generateJSONResponse)(prompt, systemInstruction, userId);
        return structuredProfile;
    }
    catch (error) {
        await (0, db_1.logSystem)('ERROR', `AI Resume Parsing failed: ${error?.message || error}`);
        throw new Error(`AI Parsing failed: ${error?.message || error}`);
    }
}
