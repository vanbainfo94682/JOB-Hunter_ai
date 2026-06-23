import { logSystem, supabase } from '../../db';
import { generateTextResponse } from '../openrouter';
import { GmailLimitBypass } from './gmailBypass';
import path from 'path';
import fs from 'fs';

export async function sendAutomatedEmail(jobId: string, userId: string, hrEmail: string, hrName?: string) {
  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
  const { data: settings } = await supabase.from('agent_settings').select('*').eq('user_id', userId).single();

  if (!job || !profile || !settings) {
    await logSystem('ERROR', `[Automated Email] Aborted: Missing job, profile, or settings in database.`);
    return;
  }

  // Generate Email Content dynamically based on experience and target field
  const prompt = `
    Write a highly professional, concise, and compelling cold outreach email to a recruiter or hiring manager.
    The candidate is applying for the position of "${job.title}" at "${job.company}".
    Candidate Name: ${profile.fullName}
    Candidate Skills: ${profile.skills}
    Candidate Target Field: ${settings.targetField || 'Tech'}
    Candidate Experience Level: ${settings.experienceLevel || 'Professional'}

    Rules:
    1. Subject line MUST be on the first line prefixed with "SUBJECT: ".
    2. Limit to 3 short paragraphs.
    3. DO NOT include placeholder brackets like [Company Name]. Replace them with the actual values.
    4. Start the email with "Dear ${hrName || 'Hiring Manager'}," if a name is provided. Otherwise, "Dear Hiring Team,".
    5. End with a polite sign-off.
  `;

  let subject = `Application for ${job.title} - ${profile.fullName}`;
  let body = `Dear ${hrName || 'Hiring Team'},\n\nI am writing to express my strong interest in the ${job.title} position at ${job.company}. Please find my resume attached.\n\nBest regards,\n${profile.fullName}`;

  try {
    const aiResponse = await generateTextResponse(prompt, "You are an expert career advisor writing a cold email to a recruiter.", userId);
    const lines = aiResponse.split('\n');
    const subjectLineIndex = lines.findIndex((l: string) => l.toUpperCase().startsWith('SUBJECT:'));
    if (subjectLineIndex !== -1) {
      subject = lines[subjectLineIndex].replace(/SUBJECT:\s*/i, '').trim();
      lines.splice(subjectLineIndex, 1);
      body = lines.join('\n').trim();
    } else {
      body = aiResponse.trim();
    }
  } catch (err) {
    await logSystem('WARNING', `Failed to generate AI email content. Using fallback template.`);
  }

  // Generate absolute path for resume
  let absolutePath: string | undefined = undefined;
  if (profile.resumePath) {
    const resolvedPath = path.resolve(process.cwd(), profile.resumePath);
    if (fs.existsSync(resolvedPath)) {
      absolutePath = resolvedPath;
    }
  }

  await logSystem('INFO', `[Automated Email] Dispatching email to ${hrEmail} using GmailLimitBypass API/SMTP...`);

  try {
    const bypass = new GmailLimitBypass(userId);
    const sent = await bypass.sendEmail(hrEmail, subject, body, absolutePath);
    
    if (sent) {
      // Update job logs & database status
      const { data: currentJob } = await supabase.from('jobs').select('logs').eq('id', job.id).single();
      let logs = [];
      if (currentJob && currentJob.logs) {
         logs = typeof currentJob.logs === 'string' ? JSON.parse(currentJob.logs) : currentJob.logs;
         const emailLog = logs.find((l: any) => typeof l === 'object' && l.type === 'HR_EMAIL');
         if (emailLog) emailLog.sent = true;
         else logs.push({ type: 'HR_EMAIL', email: hrEmail, sent: true });
      } else {
         logs.push({ type: 'HR_EMAIL', email: hrEmail, sent: true });
      }

      await supabase.from('jobs').update({
        logs: JSON.stringify(logs),
        hr_email_sent: true
      }).eq('id', job.id);

      await logSystem('SUCCESS', `[Automated Email] Successfully dispatched outreach to ${hrEmail} for ${job.company}!`);
    } else {
      throw new Error("API/SMTP Dispatch failed. Check Gmail API OAuth/SMTP credentials in agent settings.");
    }
  } catch (error: any) {
    await logSystem('ERROR', `[Automated Email] Failed to send email to ${hrEmail}: ${error.message}`);
  }
}
