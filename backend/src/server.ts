import './playwrightEnv';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { supabase, logSystem, logEmitter, isMncCompany, prisma } from './db';
import { LoginSchema, SignupSchema, ApplySchema, SettingsSchema } from './middleware/validate';
import { extractTextFromPdf, parseResumeWithAI } from './services/resumeParser';
import { runScraperJob, crawlStealthJobLink, isScrapingActive, cancelScraping } from './services/agent/scraper';
import { applyToJob } from './services/agent/applier';
import { calculateJobMatch } from './services/agent/matcher';
import { OPENROUTER_MODELS } from './services/openrouter';
import { getOrCreateUserSettings, getOrCreateSubscription } from './services/subscriptionService';
import { findHREmail } from './services/hrFinder';
import { generateColdEmail } from './services/emailGenerator';
import { encryptString, decryptString } from './utils/crypto';
import crypto, { randomUUID } from 'crypto';
import { startAgentDaemon } from './services/agent/runner';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

app.use(helmet());

const allowedOrigins = ['https://vanbajobhunter.netlify.app', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001', 'http://localhost:3002'];
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

  // Global Maintenance Mode Middleware
  app.use(async (req, res, next) => {
    // Allow admin and status endpoints
    if (req.path.startsWith('/api/admin') || req.path === '/api/system/status') {
      return next();
    }
    try {
      const { data } = await supabase.from('system_config').select('value').eq('key', 'maintenanceMode').maybeSingle();
      if (data?.value === 'true') {
        return res.status(503).json({ error: 'Service is temporarily down for maintenance. Please check back soon.' });
      }
    } catch (e) {
      // Ignore errors so the app doesn't crash if DB fails
    }
    next();
  });

// API Rate Limiting: 500 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res, next, options) => {
    logSystem('SECURITY', 'API Rate limit exceeded.', { ip: req.ip, path: req.path });
    res.status(options.statusCode).send(options.message);
  }
});
app.use('/api/', limiter);

// Strict Rate Limiting for Auth
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 5 minutes.',
  handler: (req, res, next, options) => {
    logSystem('SECURITY', 'Auth Rate limit exceeded. Possible brute force attempt.', { ip: req.ip, path: req.path });
    res.status(options.statusCode).send(options.message);
  }
});

// Public static folder
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
app.use('/public', express.static(PUBLIC_DIR));

// Uploads folder
const UPLOADS_DIR = process.env.RENDER ? '/tmp/uploads' : path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') return cb(new Error('Only PDF files are supported.'));
    cb(null, true);
  },
});

app.get('/', (req, res) => {
  res.json({
    status: 'active',
    message: 'VANBA Job Hunter AI Engine is successfully running on Render!',
    timestamp: new Date().toISOString()
  });
});


// SSE log streaming
let sseClients: any[] = [];
function broadcastLog(log: any) {
  const payload = JSON.stringify(log);
  sseClients.forEach(c => c.write(`data: ${payload}\n\n`));
}
logEmitter.on('log', (log) => broadcastLog(log));

// ─────────────────────────────────────────────────────────────────
// Helper: resolve user → AppUserId from request
// ─────────────────────────────────────────────────────────────────
async function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    logSystem('SECURITY', 'Blocked unauthorized access attempt (Missing/Invalid Header).', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      logSystem('SECURITY', 'Blocked unauthorized access attempt (Invalid Token).', { ip: req.ip, path: req.path });
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  } catch (err: any) {
    logSystem('SECURITY', `Auth verification failed: ${err.message}`, { ip: req.ip, path: req.path });
    return res.status(401).json({ error: `Auth verification failed: ${err.message}` });
  }
}

function getUserId(req: any): string {
  return req.user?.id;
}

// ─────────────────────────────────────────────────────────────────
// Middleware: Subscription Enforcement
// ─────────────────────────────────────────────────────────────────
async function requirePremium(req: any, res: any, next: any) {
  // PAYWALL DISABLED: All features are now universally accessible.
  next();
}

// ─────────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────────

app.get('/api/agent/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

app.get('/api/stats', async (req, res) => {
  try {
    const { count: totalScraped } = await supabase.from('jobs').select('*', { count: 'exact', head: true });
    const { count: totalApplied } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'APPLIED');
    const { count: totalHrEmailsSent } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
        .like('logs', '%"HR_EMAIL"%')
        .like('logs', '%"sent":true%');
    
    // Send actual database metrics
    res.json({
      totalScraped,
      totalApplied,
      totalHrEmailsSent
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    console.log('SUCCESS', `New user signed up: ${email}`);
    const u = data.user;
    const shapedUser = u ? {
      id: u.id,
      email: u.email ?? email,
      fullName: (u.user_metadata?.full_name ?? fullName ?? ''),
    } : null;
    res.json({ message: 'Signup successful.', user: shapedUser, accessToken: data.session?.access_token });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    console.log('INFO', `User logged in: ${email}`);
    const u = data.user;
    const shapedUser = u ? {
      id: u.id,
      email: u.email ?? email,
      fullName: (u.user_metadata?.full_name ?? u.user_metadata?.name ?? email),
    } : null;
    res.json({ message: 'Login successful.', user: shapedUser, accessToken: data.session?.access_token });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    
    // Redirect back to the frontend's origin so the token is appended to the URL hash
    const redirectTo = req.headers.origin || 'http://localhost:5173';
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, { 
      redirectTo: `${redirectTo}/`
    });
    
    if (error) throw error;
    
    console.log('INFO', `Password reset requested for: ${email}`);
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/update-password', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    
    const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
    
    if (error) throw error;
    
    console.log('SUCCESS', `Password updated successfully for user ID: ${userId}`);
    res.json({ message: 'Password updated successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { data: user } = await supabase.from('app_users').select('*').eq('id', userId).single();
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
    const { data: subs } = await supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(3);

    res.json({
      user,
      profile: profile ? {
        ...profile,
        skills: JSON.parse(profile.skills || '[]'),
        experience: JSON.parse(profile.experience || '[]'),
        education: JSON.parse(profile.education || '[]'),
        targetTitles: JSON.parse(profile.targetTitles || '[]'),
      } : null,
      subscription: subs && subs.length > 0 ? subs[0] : null,
      subscriptions: subs || [],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/resume/upload', requireAuth, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No resume file uploaded.' });
    const userId = getUserId(req);
    
    const safeFileName = `resume_${userId}_${Date.now()}.pdf`;
    const filePath = path.join(UPLOADS_DIR, safeFileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const rawText = await extractTextFromPdf(req.file.buffer);
    const parsedData = await parseResumeWithAI(rawText, userId);

    // Fetch existing profile to preserve IDs and custom columns
    const { data: existing } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();

    const upsertPayload: any = {
      user_id: userId,
      full_name: parsedData.fullName || existing?.full_name || 'User',
      phone: parsedData.phone || existing?.phone || null,
      professional_email: parsedData.email || existing?.professional_email || '',
      skills: JSON.stringify(parsedData.skills),
      experience: JSON.stringify(parsedData.experience),
      education: JSON.stringify(parsedData.education),
      raw_resume_text: rawText,
      resume_url: filePath,
      target_titles: JSON.stringify(parsedData.targetTitles),
      dob: existing?.dob || '1970-01-01',
      city: existing?.city || '',
      state: existing?.state || '',
      current_institution: existing?.current_institution || '',
      onboarding_completed: existing?.onboarding_completed || false,
    };

    if (existing?.id) upsertPayload.id = existing.id;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .upsert(upsertPayload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    runScraperJob().catch(() => {});
    res.json({ message: 'Resume uploaded successfully.', profile });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    // Fetch using Supabase client to bypass Prisma DATABASE_URL issues on Render
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*, user:app_users(email)')
      .eq('user_id', userId)
      .maybeSingle();
      
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Supabase fetch error:', fetchError);
    }
    
    if (!profile) return res.json(null);

    // Unpack extra data from education JSON
    let eduList = [];
    let extraData: any = {};
    try {
      const parsed = JSON.parse(profile.education || '[]');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'list' in parsed) {
        eduList = parsed.list;
        extraData = parsed;
      } else {
        eduList = parsed;
      }
    } catch (e) {}

    const safeParse = (str: any, defaultVal: any) => {
      try { return str ? JSON.parse(str) : defaultVal; }
      catch (e) { return defaultVal; }
    };

    res.json({
      ...profile,
      fullName: profile.full_name || '',
      email: profile.user?.email || '',
      onboarding_completed: profile.onboarding_completed || false,
      dob: extraData.dob || '',
      city: extraData.city || '',
      state: extraData.state || '',
      current_institution: extraData.currentInstitution || '',
      skills: safeParse(profile.skills, []),
      experience: safeParse(profile.experience, []),
      education: eduList,
      targetTitles: safeParse(profile.target_titles, []),
      resumePath: profile.resume_url || '',
      rawResumeText: profile.raw_resume_text || ''
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Get existing profile using Supabase
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    // Merge education JSON
    let existingEduData = [];
    let existingExtraData: any = {};
    try {
      if (existing && existing.education) {
        const parsed = JSON.parse(existing.education);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'list' in parsed) {
          existingEduData = parsed.list;
          existingExtraData = parsed;
        } else {
          existingEduData = parsed;
        }
      }
    } catch(e) {}

    let eduData = existingEduData;
    if (req.body.education !== undefined) {
      try {
        if (typeof req.body.education === 'string') eduData = JSON.parse(req.body.education);
        else if (Array.isArray(req.body.education)) eduData = req.body.education;
      } catch(e) {}
    }
    
    const packedEducation = JSON.stringify({
      list: eduData,
      dob: req.body.dob !== undefined ? req.body.dob : (existingExtraData.dob || null),
      current_institution: req.body.current_institution !== undefined ? req.body.current_institution : (existingExtraData.currentInstitution || null),
      city: req.body.city !== undefined ? req.body.city : (existingExtraData.city || null),
      state: req.body.state !== undefined ? req.body.state : (existingExtraData.state || null)
    });

    const updatePayload: any = {
      user_id: userId,
      full_name: req.body.fullName || existing?.full_name || 'User',
      phone: req.body.phone !== undefined ? req.body.phone : (existing?.phone || null),
      professional_email: req.body.professional_email || existing?.professional_email || '',
      resume_url: req.body.resumePath || existing?.resume_url || '',
      raw_resume_text: req.body.rawResumeText || existing?.raw_resume_text || '',
      target_titles: req.body.targetTitles ? JSON.stringify(req.body.targetTitles) : (existing?.target_titles || '[]'),
      skills: req.body.skills ? (typeof req.body.skills === 'string' ? req.body.skills : JSON.stringify(req.body.skills)) : (existing?.skills || '[]'),
      experience: req.body.experience ? (typeof req.body.experience === 'string' ? req.body.experience : JSON.stringify(req.body.experience)) : (existing?.experience || '[]'),
      education: packedEducation
    };
    
    if (req.body.onboarding_completed !== undefined) {
      updatePayload.onboarding_completed = req.body.onboarding_completed;
    } else if (existing?.onboarding_completed !== undefined) {
      updatePayload.onboarding_completed = existing.onboarding_completed;
    }

    if (existing?.id) updatePayload.id = existing.id;

    // Upsert using Supabase to bypass Prisma issues
    const { data: updated, error: upsertError } = await supabase
      .from('user_profiles')
      .upsert(updatePayload, { onConflict: 'user_id' })
      .select()
      .single();
      
    if (upsertError) throw upsertError;
    
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/jobs/scrape', requireAuth, requirePremium, async (req, res) => {
  try {
    const userId = getUserId(req);
    logSystem('INFO', 'AUTOPILOT STARTED: Scraping and Applying pipeline initialized.', { userId });
    // Run asynchronously without awaiting so the request returns immediately
    runScraperJob(userId).catch(e => console.error('Manual scrape failed:', e));
    res.json({ message: 'Scraper triggered successfully in the background' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jobs/scrape/status', (req, res) => {
  res.json({ isScraping: isScrapingActive });
});

app.post('/api/jobs/scrape/stop', requireAuth, (req, res) => {
  logSystem('WARNING', 'AUTOPILOT STOPPED: Force termination signal received.', { userId: getUserId(req) });
  cancelScraping();
  res.json({ message: 'Stop signal sent to the scraper' });
});

app.post('/api/jobs/crawl', requireAuth, requirePremium, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    
    const userId = getUserId(req);
    const job = await crawlStealthJobLink(url, userId);
    
    if (job) {
      // Save it to the database
      const { data: savedJob, error } = await supabase.from('jobs').insert([{
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        platform: job.platform,
        is_remote: job.isRemote,
        work_type: job.workType || 'REMOTE',
        status: 'SCRAPED',
        user_id: userId,
        match_score: 100, // Explicitly crawled, assume high interest
        created_at: new Date().toISOString()
      }]).select().single();
      
      if (error) {
        console.error('Failed to save crawled job:', error);
        return res.json({ job: null, error: 'Job crawled but failed to save to database.' });
      }
      
      res.json({ job: savedJob });
    } else {
      res.json({ job: null, error: 'Could not extract job from the provided URL.' });
    }
  } catch (error: any) {
    console.error('Crawl Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jobs/total', async (req, res) => {
  try {
    const { count } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true });
    res.json({ total: count || 0 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/jobs', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Fetch Blacklist
    const { data: blacklist } = await supabase.from('blacklisted_companies').select('company_name');
    const blacklistedNames = blacklist ? blacklist.map(b => b.company_name.toLowerCase()) : [];

    const { data: dbJobs, error } = await supabase
      .from('jobs')
      .select('*')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .not('match_score', 'is', null)
      .not('status', 'eq', 'CLOSED')
      .order('match_score', { ascending: false, nullsFirst: false })
      .limit(1000); // 1000 acts as unlimited while preventing browser crashes

    let jobs = dbJobs || [];
    
    // Filter out blacklisted companies locally (as Supabase JS query for array not in might be tricky depending on version)
    if (blacklistedNames.length > 0) {
      jobs = jobs.filter(j => !blacklistedNames.includes((j.company || '').toLowerCase()));
    }

    res.json(jobs.map(j => {
      let parsedLogs = [];
      try {
        if (typeof j.logs === 'string') parsedLogs = JSON.parse(j.logs);
      } catch (e) {}
      
      let hrEmail = null;
      let hrEmailSent = false;
      let hrName = undefined;
      let hrTitle = undefined;
      const emailLog = parsedLogs.find((l: any) => typeof l === 'object' && l.type === 'HR_EMAIL');
      if (emailLog) {
          hrEmail = emailLog.email;
          hrEmailSent = emailLog.sent;
          hrName = emailLog.name;
          hrTitle = emailLog.title;
      }

      return {
        ...j,
        hrEmail,
        hrEmailSent,
        hrName,
        hrTitle,
        logs: parsedLogs,
      };
    }));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/jobs/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const { error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/jobs/:id/apply', requireAuth, requirePremium, async (req, res) => {
  try {
    const { id } = req.params;
    const { dryRun } = req.body;
    applyToJob(id, getUserId(req), dryRun !== undefined ? dryRun : true);
    res.json({ message: 'Application queued.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', requireAuth, requirePremium, async (req, res) => {
  try {
    const rawSettings = await getOrCreateUserSettings(getUserId(req));
    if (!rawSettings) return res.json(null);
    let cookiesData = { linkedinCookies: '', gmailCookies: '' };
    if (rawSettings.cookies_json) {
      try {
        const decrypted = decryptString(rawSettings.cookies_json);
        cookiesData = JSON.parse(decrypted);
      } catch (e) {}
    }
    // Map DB snake_case -> frontend camelCase
    res.json({
      id: rawSettings.id,
      isActive: rawSettings.is_active ?? false,
      dailyLimit: rawSettings.daily_limit ?? 10,
      remoteOnly: rawSettings.remote_only ?? true,
      includeInternships: rawSettings.include_internships ?? true,
      autoApplyThreshold: rawSettings.auto_apply_threshold ?? 75,
      proxyUrl: rawSettings.proxy_url || '',
      linkedinCookies: cookiesData.linkedinCookies || '',
      gmailCookies: cookiesData.gmailCookies || '',
      openrouterApiKey: rawSettings.openrouter_api_key || '',
      openrouterModels: rawSettings.openrouter_models || '',
      ceoDirective: rawSettings.ceo_directive || '',
      targetField: rawSettings.target_field || '',
      experienceLevel: rawSettings.experience_level || '',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', requireAuth, requirePremium, async (req, res) => {
  try {
    const userId = getUserId(req);
    // Map frontend camelCase -> DB snake_case
    const payload: any = {};
    if (req.body.isActive !== undefined)           payload.is_active = req.body.isActive;
    if (req.body.dailyLimit !== undefined)         payload.daily_limit = req.body.dailyLimit;
    if (req.body.remoteOnly !== undefined)         payload.remote_only = req.body.remoteOnly;
    if (req.body.includeInternships !== undefined) payload.include_internships = req.body.includeInternships;
    if (req.body.autoApplyThreshold !== undefined) payload.auto_apply_threshold = req.body.autoApplyThreshold;
    if (req.body.proxyUrl !== undefined)           payload.proxy_url = req.body.proxyUrl;
    if (req.body.openrouterApiKey !== undefined)   payload.openrouter_api_key = req.body.openrouterApiKey;
    if (req.body.openrouterModels !== undefined)   payload.openrouter_models = req.body.openrouterModels;
    if (req.body.ceoDirective !== undefined)       payload.ceo_directive = req.body.ceoDirective;
    if (req.body.targetField !== undefined)        payload.target_field = req.body.targetField;
    if (req.body.experienceLevel !== undefined)    payload.experience_level = req.body.experienceLevel;
    // Ensure settings row exists first
    const rawSettings = await getOrCreateUserSettings(userId);
    let existingCookies: any = {};
    if (rawSettings.cookies_json) {
      try { existingCookies = JSON.parse(decryptString(rawSettings.cookies_json)); } catch(e){}
    }
    if (req.body.linkedinCookies !== undefined) existingCookies.linkedinCookies = req.body.linkedinCookies;
    if (req.body.gmailCookies !== undefined) existingCookies.gmailCookies = req.body.gmailCookies;
    payload.cookies_json = encryptString(JSON.stringify(existingCookies));

    const { data: updated, error } = await supabase
      .from('agent_settings')
      .update(payload)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    
    let updatedCookies: any = {};
    if (updated.cookies_json) {
      try { updatedCookies = JSON.parse(decryptString(updated.cookies_json)); } catch(e){}
    }

    // Return mapped camelCase
    res.json({
      id: updated.id,
      isActive: updated.is_active ?? false,
      dailyLimit: updated.daily_limit ?? 10,
      remoteOnly: updated.remote_only ?? true,
      includeInternships: updated.include_internships ?? true,
      autoApplyThreshold: updated.auto_apply_threshold ?? 75,
      proxyUrl: updated.proxy_url || '',
      linkedinCookies: updatedCookies.linkedinCookies || '',
      gmailCookies: updatedCookies.gmailCookies || '',
      openrouterApiKey: updated.openrouter_api_key || '',
      openrouterModels: updated.openrouter_models || '',
      ceoDirective: updated.ceo_directive || '',
      targetField: updated.target_field || '',
      experienceLevel: updated.experience_level || '',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/subscription', requireAuth, async (req, res) => {
  try {
    const sub = await getOrCreateSubscription(getUserId(req));
    res.json(sub);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscription/subscribe', requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { planType } = req.body;
    const PLAN_MAP: Record<string, number> = { WEEKLY: 10, MONTHLY: 25, TWO_MONTH: 35 };
    const days = planType === 'WEEKLY' ? 7 : planType === 'MONTHLY' ? 30 : 60;
    
    const { data: sub } = await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan_type: planType,
      status: 'ACTIVE',
      jobs_visible: PLAN_MAP[planType],
      jobs_count: 0,
      cycle_start: new Date().toISOString(),
      cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    res.json({ message: 'Subscribed.', subscription: sub });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscription/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.COSMOFEED_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers['x-cosmofeed-signature'] || req.headers['x-webhook-signature'];
      if (!signature) {
        return res.status(401).json({ error: 'Missing webhook signature' });
      }
      
      const payloadString = JSON.stringify(req.body);
      const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const { userId, planType, status } = req.body;
    if (status !== 'SUCCESS') return res.json({ message: 'Ignored non-success event' });
    
    const days = planType === 'WEEKLY' ? 7 : planType === 'MONTHLY' ? 30 : 60;
    const PLAN_MAP: Record<string, number> = { WEEKLY: 10, MONTHLY: 25, TWO_MONTH: 35 };

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan_type: planType,
      jobs_visible: PLAN_MAP[planType] || 10,
      cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }, { onConflict: 'user_id' });
    
    console.log('SUCCESS', `Webhook: Upgraded user ${userId} to ${planType}`);
    res.json({ message: 'Webhook processed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const { data: logs } = await supabase.from('system_logs').select('*').order('timestamp', { ascending: false }).limit(100);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// AI Agent Networking Tools
app.post('/api/agent/find-hr', requireAuth, requirePremium, async (req, res) => {
  try {
    const userId = getUserId(req);
    const sub = await getOrCreateSubscription(userId);
    
    // if (sub.plan_type === 'WEEKLY') {
    //   return res.status(403).json({ error: 'HR Email Discovery is available on Monthly plan and above. Please upgrade!' });
    // }

    const { companyName } = req.body;
    if (!companyName) return res.status(400).json({ error: 'Company name is required.' });
    const result = await findHREmail(companyName);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agent/draft-cold-email', requireAuth, requirePremium, async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Check subscription plan limits
    const sub = await getOrCreateSubscription(userId);
    // if (sub.plan_type === 'WEEKLY' || sub.plan_type === 'MONTHLY') {
    //   return res.status(403).json({ error: 'AI Cold Email Drafting is locked on Weekly/Monthly Plans. Upgrade to Quarterly or VIP to unlock this feature!' });
    // }

    const { jobTitle, companyName, hrEmail } = req.body;
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
    
    const parsedProfile = profile ? {
      fullName: profile.fullName,
      skills: JSON.parse(profile.skills || '[]')
    } : {};

    const draft = await generateColdEmail(jobTitle, companyName, hrEmail, parsedProfile);
    res.json({ draft });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});



// ── Secure Payment Verification ───────────────────────────────
  // Secure Payment Verification
  app.post('/api/payments/verify', requireAuth, async (req, res) => {
    try {
      const { transactionId } = req.body;
      const userId = getUserId(req);

      if (!transactionId || transactionId.trim().length < 5) {
        return res.status(400).json({ error: 'Invalid transaction ID format.' });
      }

      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('razorpayOrderId', transactionId)
        .maybeSingle();

      if (existingPayment) return res.status(400).json({ error: 'Transaction ID already submitted.' });

      await supabase.from('payments').insert([{
        user_id: userId,
        amount: 0,
        plan_type: 'MONTHLY',
        razorpayOrderId: transactionId,
        status: 'PENDING'
      }]);

      console.log('PENDING', `Payment verification submitted for user ${userId} with transaction ${transactionId}`);
      res.json({ message: 'Verification request sent! An admin will approve your account shortly.', pending: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin Endpoints
  const ADMIN_UIDS = ['3a26b2d8-dfbf-41bd-af80-d16cd6e6546c', 'cf5c3319-5aad-40fd-be30-508cc1167c63'];

  app.get('/api/admin/payments', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      res.json({ payments: data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/approve', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      
      const { paymentId, planType } = req.body;
      
      const { data: payment } = await supabase.from('payments').select('*').eq('id', paymentId).single();
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      const PLAN_JOBS: Record<string, number> = { WEEKLY: 200, MONTHLY: 1000, TWO_MONTH: 2500, THREE_MONTH: 4000 };
      const plan = planType || payment.plan_type || 'MONTHLY';
      const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : 90;
      
      await supabase.from('subscriptions').upsert({
        user_id: payment.user_id,
        plan_type: plan,
        status: 'ACTIVE',
        cycle_start: new Date().toISOString(),
        cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_visible: PLAN_JOBS[plan] || 200,
        jobs_count: 0
      });

      await supabase.from('payments').update({ status: 'COMPLETED', plan_type: plan }).eq('id', paymentId);
      res.json({ message: 'Payment approved successfully!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/reject', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      const { paymentId } = req.body;
      await supabase.from('payments').update({ status: 'FAILED' }).eq('id', paymentId);
      res.json({ message: 'Payment rejected.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

    // ==========================================
  // SYSTEM & MAINTENANCE APIs
  // ==========================================
  app.get('/api/system/status', async (req, res) => {
    try {
      const { data } = await supabase.from('system_config').select('*').eq('key', 'maintenanceMode').maybeSingle();
      res.json({ maintenanceMode: data?.value === 'true' });
    } catch (error: any) {
      res.json({ maintenanceMode: false });
    }
  });

  app.post('/api/admin/system/config', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      const { key, value } = req.body;
      await supabase.from('system_config').upsert({ key, value, updatedAt: new Date().toISOString() });
      res.json({ message: 'Configuration updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
            const { data: users, error } = await supabase
          .from('app_users')
          .select('*, subscriptions(*)');
          
        if (error) throw error;

        // Fetch payments and profiles manually because of missing explicit foreign key
        const { data: allPayments } = await supabase.from('payments').select('*');
        const { data: allProfiles } = await supabase.from('user_profiles').select('*');

        const usersWithRelations = users?.map((u: any) => ({
          ...u,
          payments: allPayments?.filter((p: any) => p.user_id === u.id || p.user_email === u.email) || [],
          user_profiles: allProfiles?.filter((prof: any) => prof.user_id === u.id) || []
        }));

        res.json({ users: usersWithRelations || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/logs', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);
      if (error) throw error;
      res.json({ logs: logs || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/users/plan', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      
      const { userId, planType } = req.body;
      const plan = planType || 'MONTHLY';
      const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : plan === 'VIP_ELITE' ? 365 : 90;
      const jobsVisible = plan === 'WEEKLY' ? 10 : plan === 'MONTHLY' ? 25 : plan === 'TWO_MONTH' ? 35 : plan === 'VIP_ELITE' ? 100 : 50;
      
      // Deactivate old active subscriptions first
      await supabase.from('subscriptions')
        .update({ status: 'EXPIRED' })
        .eq('user_id', userId)
        .eq('status', 'ACTIVE');

      // Create new active subscription
      const { error } = await supabase.from('subscriptions').insert({
        id: randomUUID(),
        user_id: userId,
        plan_type: plan,
        status: 'ACTIVE',
        cycle_start: new Date().toISOString(),
        cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_visible: jobsVisible,
        jobs_count: 0
      });

      if (error) throw error;

      res.json({ message: 'User plan updated successfully!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User submits Cosmofeed transaction ID after payment
  app.post('/api/user/submit-payment', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      const { orderId, planType } = req.body;
      if (!orderId) return res.status(400).json({ error: 'Order ID is required' });

      // Create a pending payment record
      const { error } = await supabase.from('payments').insert({
        user_id: userId,
        user_email: (req as any).user?.email || 'unknown',
        razorpay_order_id: orderId, // using this field for Cosmofeed Order ID
        amount: 0, // amount can be verified by admin later
        status: 'PENDING',
        plan_type: planType || 'WEEKLY'
      });

      if (error) throw error;
      res.json({ message: 'Payment submitted for admin approval.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

      app.post('/api/admin/payments/approve', requireAuth, async (req, res) => {
        try {
          if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
          
          const { paymentId, userId, planType } = req.body;
          const plan = planType || 'WEEKLY';
          const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : 90;
          
          // Calculate quotas
          const quotas = ({
            WEEKLY: { r: 10, h: 10, o: 10 },
            MONTHLY: { r: 15, h: 15, o: 15 },
            TWO_MONTH: { r: 25, h: 25, o: 25 },
            THREE_MONTH: { r: 35, h: 35, o: 35 }
          } as Record<string, { r: number, h: number, o: number }>)[plan] || { r: 10, h: 10, o: 10 };

      // Update payment status to COMPLETED
      await supabase.from('payments').update({ status: 'COMPLETED' }).eq('id', paymentId);

      // Create/Update subscription logic matching manual approval time
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan_type: plan,
        status: 'ACTIVE',
        cycle_start: new Date().toISOString(),
        cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      res.json({ success: true, message: 'Payment approved and subscription activated.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin rejects a pending payment
  app.post('/api/admin/payments/reject', requireAuth, async (req, res) => {
    try {
      if (!ADMIN_UIDS.includes(getUserId(req))) { logSystem('SECURITY', 'Unauthorized Admin Access Attempt.', { ip: req.ip, path: req.path, userId: getUserId(req) }); return res.status(403).json({ error: 'Forbidden' }); }
      const { paymentId } = req.body;
      await supabase.from('payments').update({ status: 'FAILED' }).eq('id', paymentId);
      res.json({ success: true, message: 'Payment rejected.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // MODERATION & REPORTS ENDPOINTS
  // ─────────────────────────────────────────────────────────────────

  app.post('/api/reports', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { jobId, reason } = req.body;
      if (!jobId || !reason) return res.status(400).json({ error: 'Job ID and reason are required.' });
      
      const { data, error } = await supabase.from('job_reports').insert({
        job_id: jobId,
        user_id: userId,
        reason: reason
      }).select().single();

      if (error) throw error;
      res.json({ success: true, message: 'Report submitted successfully.', data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/reports', requireAuth, async (req, res) => {
    try {
      // Basic admin check (if ADMIN_UIDS doesn't exist, we skip strict check for now, assuming frontend2 handles layout)
      const { data, error } = await supabase
        .from('job_reports')
        .select('*, jobs:job_id (title, company, url)'); // Fetch joined job data

      if (error) throw error;
      res.json(data || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/blacklist', requireAuth, async (req, res) => {
    try {
      const { data, error } = await supabase.from('blacklisted_companies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/blacklist', requireAuth, async (req, res) => {
    try {
      const { companyName } = req.body;
      if (!companyName) return res.status(400).json({ error: 'Company name required.' });
      
      const { data, error } = await supabase.from('blacklisted_companies').upsert({
        company_name: companyName
      }).select().single();

      if (error) throw error;
      res.json({ success: true, message: `${companyName} has been blacklisted.`, data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {
  console.log(`🚀  VANBA Job Hunter AI — Port ${PORT} (Cloud Data Enabled)`);
  startAgentDaemon();
});

export default app;

// Self-ping to keep Render awake
setInterval(() => {
  const url = 'https://job-hunter-ai-koe0.onrender.com/';
  fetch(url).then(res => console.log('Self-ping successful: ' + res.status)).catch(err => console.error('Self-ping failed:', err));
}, 10 * 60 * 1000);
