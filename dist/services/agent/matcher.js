"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeLocalJobMatchHeuristics = computeLocalJobMatchHeuristics;
exports.calculateJobMatch = calculateJobMatch;
exports.generateApplicationMaterials = generateApplicationMaterials;
const openrouter_1 = require("../openrouter");
const db_1 = require("../../db");
/**
 * Local keyword-based matching algorithm that runs as a safety net when the OpenRouter API is exhausted or failing.
 */
function computeLocalJobMatchHeuristics(profile, jobTitle, jobDescription, targetField, experienceLevel) {
    const titleLower = jobTitle.toLowerCase();
    const descLower = jobDescription.toLowerCase();
    let fieldScore = 0;
    const matchedFields = [];
    // 1. Target Field Heuristics (Max 40 points)
    if (targetField) {
        try {
            const fields = JSON.parse(targetField);
            if (Array.isArray(fields) && fields.length > 0) {
                for (const field of fields) {
                    const fieldLower = field.toLowerCase();
                    // Title check
                    if (titleLower.includes(fieldLower)) {
                        fieldScore = 40;
                        matchedFields.push(field);
                        break;
                    }
                    // General broad matches in title (e.g. "Frontend" in title for "Frontend Developer" target)
                    const words = fieldLower.split(/\s+/);
                    const hasWordInTitle = words.some(w => w.length > 3 && titleLower.includes(w));
                    if (hasWordInTitle) {
                        fieldScore = 35;
                        matchedFields.push(field);
                        break;
                    }
                }
                // Fallback to description check
                if (fieldScore === 0) {
                    for (const field of fields) {
                        if (descLower.includes(field.toLowerCase())) {
                            fieldScore = 20;
                            matchedFields.push(field);
                        }
                    }
                }
            }
        }
        catch (e) {
            // In case string is not JSON array
            if (titleLower.includes(String(targetField).toLowerCase())) {
                fieldScore = 40;
                matchedFields.push(String(targetField));
            }
        }
    }
    else {
        // If no target field, default to full alignment
        fieldScore = 30;
    }
    // 2. Experience Level Heuristics (Max 20 points)
    let seniorityScore = 15; // default moderate
    const matchedLevels = [];
    if (experienceLevel) {
        try {
            const levels = JSON.parse(experienceLevel);
            if (Array.isArray(levels) && levels.length > 0) {
                let matched = false;
                for (const level of levels) {
                    const lvlLower = level.toLowerCase();
                    if (lvlLower === 'senior' && (titleLower.includes('senior') || titleLower.includes('lead') || titleLower.includes('staff') || titleLower.includes('principal') || titleLower.includes('sr.'))) {
                        seniorityScore = 20;
                        matchedLevels.push(level);
                        matched = true;
                        break;
                    }
                    if (lvlLower === 'entry-level' && (titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('associate') || titleLower.includes('intern') || titleLower.includes('jr.'))) {
                        seniorityScore = 20;
                        matchedLevels.push(level);
                        matched = true;
                        break;
                    }
                    if (lvlLower === 'manager' && (titleLower.includes('manager') || titleLower.includes('lead') || titleLower.includes('head'))) {
                        seniorityScore = 20;
                        matchedLevels.push(level);
                        matched = true;
                        break;
                    }
                    if (lvlLower === 'director' && (titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('head'))) {
                        seniorityScore = 20;
                        matchedLevels.push(level);
                        matched = true;
                        break;
                    }
                    if (lvlLower === 'executive' && (titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('chief') || titleLower.includes('cto') || titleLower.includes('ceo'))) {
                        seniorityScore = 20;
                        matchedLevels.push(level);
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    // Check description for years
                    const yrMatch = descLower.match(/(\d+)\+?\s*years?/);
                    if (yrMatch && yrMatch[1]) {
                        const yrs = parseInt(yrMatch[1]);
                        const wantsSenior = levels.includes('Senior') || levels.includes('Manager');
                        if (yrs >= 5 && wantsSenior) {
                            seniorityScore = 20;
                        }
                        else if (yrs <= 2 && levels.includes('Entry-level')) {
                            seniorityScore = 20;
                        }
                        else {
                            seniorityScore = 10; // mismatch
                        }
                    }
                }
            }
        }
        catch (e) { }
    }
    // 3. Skills Heuristics (Max 40 points)
    let skillScore = 0;
    const matchingSkills = [];
    const missingSkills = [];
    if (profile.skills && profile.skills.length > 0) {
        for (const skill of profile.skills) {
            const skillClean = skill.toLowerCase().trim();
            if (skillClean.length === 0)
                continue;
            // Escape special characters for regex keyword matching
            const escapedSkill = skillClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const skillRegex = new RegExp(`\\b${escapedSkill}\\b`, 'i');
            if (titleLower.includes(skillClean) || skillRegex.test(descLower)) {
                matchingSkills.push(skill);
            }
            else {
                missingSkills.push(skill);
            }
        }
        // Proportional scaling: 10 points per matching skill keyword, capped at 40
        skillScore = Math.min(40, matchingSkills.length * 10);
    }
    const matchScore = Math.min(100, Math.max(30, fieldScore + seniorityScore + skillScore));
    // Assemble bullet lists
    const pros = [];
    if (matchedFields.length > 0) {
        pros.push(`Fits your target career domains: ${matchedFields.join(', ')}`);
    }
    if (matchingSkills.length > 0) {
        pros.push(`Detected skills overlap: ${matchingSkills.slice(0, 5).join(', ')}`);
    }
    if (seniorityScore === 20) {
        pros.push(`Fits your active seniority experience target`);
    }
    else {
        pros.push(`Generically compatible engineering role structure`);
    }
    const cons = [
        `[API Fallback] Gemini API rate limit reached; scoring computed locally`
    ];
    if (missingSkills.length > 0) {
        cons.push(`Unmatched resume skills: ${missingSkills.slice(0, 3).join(', ')}`);
    }
    const reason = `[Heuristic Fallback Engine] Evaluated compatibility locally at ${matchScore}% due to Google rate-limiting caps. Your profile shows solid keyword alignment: ${matchingSkills.length} matches found (${matchingSkills.slice(0, 4).join(', ')}) with strong functional alignment for "${jobTitle}".`;
    return {
        matchScore,
        pros,
        cons,
        reason
    };
}
/**
 * Compares user profile with job description to score compatibility.
 */
async function calculateJobMatch(profile, jobTitle, jobDescription, ceoDirective, targetField, experienceLevel, userId) {
    const systemInstruction = `You are a critical Technical Recruiter and Hiring Coordinator. 
Your task is to review a candidate's profile and compare it thoroughly with a given job description. 
Be highly realistic:
- Award score > 85 only if they match all core skills.
- Award score 60-80 if they have transferrable skills but some gaps.
- Award score < 50 if there is a fundamental mismatch.
Output ONLY JSON matching the requested structure.`;
    const prompt = `
Candidate Profile Details:
- Name: ${profile.fullName}
- Primary Skills: ${profile.skills.join(', ')}
- Summary Resume: ${profile.rawResumeText.substring(0, 1500)}

${targetField ? `CORE TARGET CAREER FIELD: "${targetField}"
[IMPORTANT] The candidate specifically wishes to target roles in this functional field. Ensure the evaluation reflects whether the job description falls under this field.` : ''}

${experienceLevel ? `TARGET SENIORITY LEVEL: "${experienceLevel}"
[IMPORTANT] Candidate wishes to target roles matching this specific seniority level (e.g. Junior, Mid, Senior, Lead). Verify if the job requirements, years of experience requested, and leadership elements match this tier.` : ''}

${ceoDirective ? `CEO DIRECTIVE MANDATE: "${ceoDirective}"
[CRITICAL] You MUST evaluate the job specifically against this directive. Weigh compatibility heavily based on how well this role satisfies the CEO's directive, listing pros/cons relative to it.` : ''}

Target Job:
- Title: ${jobTitle}
- Description: ${jobDescription}

Please evaluate the match and respond with this exact JSON structure:
{
  "matchScore": 85,
  "pros": ["Has 3 years of React experience requested", "Strong Node backend alignment"],
  "cons": ["No experience with GraphQL mentioned", "Candidate's timezone is EST, job is PST"],
  "reason": "Detailed summary explaining why the user is a strong, moderate, or weak fit for the role."
}
`;
    try {
        return await (0, openrouter_1.generateJSONResponse)(prompt, systemInstruction, userId);
    }
    catch (error) {
        // Run the local heuristic matcher fallback to keep loop functioning 24/7
        const localResult = computeLocalJobMatchHeuristics(profile, jobTitle, jobDescription, targetField, experienceLevel);
        await (0, db_1.logSystem)('WARNING', `AI Job matching failed for \"${jobTitle}\": Rate limits/quota exhausted. Fallback to Local Heuristics calculated: ${localResult.matchScore}% fit.`);
        return localResult;
    }
}
/**
 * Generates a highly tailored cover letter and anticipates custom question answers.
 */
async function generateApplicationMaterials(profile, jobTitle, company, jobDescription, userId) {
    const coverLetterPrompt = `
Generate a professional, highly engaging, and tailored cover letter for:
Candidate: ${profile.fullName}
Skills: ${profile.skills.join(', ')}
Resume details: ${profile.rawResumeText.substring(0, 2000)}

Target Position:
Title: ${jobTitle}
Company: ${company}
Description: ${jobDescription.substring(0, 2000)}

Instructions:
- Keep it concise, engaging, and professional (under 300 words).
- Highlight specific candidate skills that directly map to requirements in the job description.
- Write in a natural, confident, human tone. Do not use generic AI buzzwords or cliché phrases.
- Address it to the hiring manager at ${company}.
`;
    const answersPrompt = `
Analyze the job description for ${jobTitle} at ${company} and predict answers for typical screening questions a candidate might face:
Resume details: ${profile.rawResumeText.substring(0, 2000)}

Please return a JSON array containing answers to 3-4 typical screening questions (e.g. "Why do you want to work here?", "How do your skills align?").
Output ONLY JSON structured like this:
[
  { "question": "Why do you want to join our company?", "answer": "Concise professional response matching candidate history..." },
  { "question": "What is your experience level with this role?", "answer": "Detailed breakdown..." }
]
`;
    try {
        const coverLetter = await (0, openrouter_1.generateTextResponse)(coverLetterPrompt, "You are a professional copywriter specialized in job search materials.", userId);
        const customAnswers = await (0, openrouter_1.generateJSONResponse)(answersPrompt, "You are the job candidate drafting custom form answers.", userId);
        return {
            coverLetter,
            customAnswers
        };
    }
    catch (error) {
        await (0, db_1.logSystem)('ERROR', `Failed to generate application materials: ${error?.message || error}`);
        // Provide safe local defaults for letters/answers
        const skillsList = profile.skills.slice(0, 5).join(', ');
        return {
            coverLetter: `Dear Hiring Manager,\n\nI am writing to express my strong interest in the ${jobTitle} position at ${company}. Given my background in technology and experience with ${skillsList}, I am confident in my ability to add immediate value to your team.\n\nThroughout my career, I have refined my ability to build scalable, high-performance web systems and coordinate across remote workspaces. I would welcome the opportunity to discuss how my skill set aligns with the needs of ${company}.\n\nThank you for your time and consideration,\n\nSincerely,\n${profile.fullName}`,
            customAnswers: [
                { question: "Why do you want to join our company?", answer: `I am highly inspired by ${company}'s remote culture and technical scale. I believe my development history will allow me to solve your active bottlenecks.` },
                { question: "What is your experience level with this stack?", answer: `I have over 3 years of hands-on experience developing web systems utilizing our target technologies.` }
            ]
        };
    }
}
