import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { supabase, logSystem, logEmitter, isMncCompany, prisma } from './db';
import { LoginSchema, SignupSchema, ApplySchema, SettingsSchema } from './middleware/validate';
import { extractTextFromPdf, parseResumeWithAI } from './services/resumeParser';
import { runScraperJob, crawlStealthJobLink } from './services/agent/scraper';
import { applyToJob } from './services/agent/applier';
import { calculateJobMatch } from './services/agent/matcher';
import { OPENROUTER_MODELS } from './services/openrouter';
import { getOrCreateUserSettings, getOrCreateSubscription } from './services/subscriptionService';
import { verifyCosmofeedPayment } from './services/paymentVerifier';
import { findHREmail } from './services/hrFinder';
import { generateColdEmail } from './services/emailGenerator';
import { encryptString, decryptString } from './utils/crypto';
import crypto, { randomUUID } from 'crypto';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

app.use(helmet());

const allowedOrigins = ['https://vanbaaijob.netlify.app', 'http://localhost:3000', 'http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// API Rate Limiting: 500 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Strict Rate Limiting for Auth
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 5 minutes.'
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
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  } catch (err: any) {
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
  try {
    const userId = getUserId(req);
    const sub = await getOrCreateSubscription(userId);
    if (sub.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Premium subscription required. Please upgrade.' });
    }
    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to verify subscription status.' });
  }
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
      full_name: (u.user_metadata?.full_name ?? fullName ?? ''),
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
      full_name: (u.user_metadata?.full_name ?? u.user_metadata?.name ?? email),
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
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('userId', userId).maybeSingle();
    const { data: subs } = await supabase.from('subscriptions').select('*').eq('userId', userId).order('created_at', { ascending: false }).limit(3);

    res.json({
      user,
      profile: profile ? {
        ...profile,
        skills: JSON.parse(profile.skills || '[]'),
        experience: JSON.parse(profile.experience || '[]'),
        education: JSON.parse(profile.education || '[]'),
        target_titles: JSON.parse(profile.target_titles || '[]'),
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
      resume_url: existing?.resume_url || '',
      target_titles: JSON.stringify(parsedData.targetTitles),
    };

    if (existing?.id) upsertPayload.id = existing.id;
    if (!existing) {
       // Fallbacks for NOT NULL columns if this is the first time creating
       upsertPayload.dob = '1970-01-01';
       upsertPayload.city = '';
       upsertPayload.state = '';
       upsertPayload.current_institution = '';
       upsertPayload.onboarding_completed = false;
    }

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

    res.json({
      ...profile,
      fullName: profile.full_name || '',
      email: profile.user?.email || '',
      onboarding_completed: extraData.onboardingCompleted || false,
      dob: extraData.dob || '',
      city: extraData.city || '',
      state: extraData.state || '',
      current_institution: extraData.currentInstitution || '',
      skills: profile.skills ? JSON.parse(profile.skills) : [],
      experience: profile.experience ? JSON.parse(profile.experience) : [],
      education: eduList,
      target_titles: profile.target_titles ? JSON.parse(profile.target_titles) : [],
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
      state: req.body.state !== undefined ? req.body.state : (existingExtraData.state || null),
      onboardingCompleted: req.body.onboarding_completed !== undefined ? req.body.onboarding_completed : (existingExtraData.onboardingCompleted ?? false)
    });

    const updatePayload: any = {
      user_id: userId,
      full_name: req.body.full_name || req.body.fullName || existing?.full_name || 'User',
      phone: req.body.phone !== undefined ? req.body.phone : (existing?.phone || null),
      professional_email: req.body.professional_email || existing?.professional_email || '',
      resume_url: req.body.resume_url || req.body.resumePath || existing?.resume_url || '',
      raw_resume_text: req.body.raw_resume_text || req.body.rawResumeText || existing?.raw_resume_text || '',
      target_titles: req.body.target_titles ? JSON.stringify(req.body.target_titles) : (existing?.target_titles || '[]'),
      skills: req.body.skills ? (typeof req.body.skills === 'string' ? req.body.skills : JSON.stringify(req.body.skills)) : (existing?.skills || '[]'),
      experience: req.body.experience ? (typeof req.body.experience === 'string' ? req.body.experience : JSON.stringify(req.body.experience)) : (existing?.experience || '[]'),
      education: packedEducation
    };
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

app.get('/api/jobs', requireAuth, requirePremium, async (req, res) => {
  try {
    const userId = getUserId(req);
    const sub = await getOrCreateSubscription(userId);
    const limit = sub.jobs_visible || 10;

    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('match_score', { ascending: false })
      .limit(limit);

    res.json((jobs || []).map(j => ({
      ...j,
      logs: j.logs ? JSON.parse(j.logs) : [],
    })));
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
    if (rawSettings.cookies_json) {
      rawSettings.cookies_json = decryptString(rawSettings.cookies_json);
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
      cookiesJson: rawSettings.cookies_json || '',
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
    if (req.body.cookiesJson !== undefined) {
      payload.cookies_json = encryptString(req.body.cookiesJson);
    }
    // Ensure settings row exists first
    await getOrCreateUserSettings(userId);
    const { data: updated, error } = await supabase
      .from('agent_settings')
      .update(payload)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    // Return mapped camelCase
    res.json({
      id: updated.id,
      isActive: updated.is_active ?? false,
      dailyLimit: updated.daily_limit ?? 10,
      remoteOnly: updated.remote_only ?? true,
      includeInternships: updated.include_internships ?? true,
      autoApplyThreshold: updated.auto_apply_threshold ?? 75,
      proxyUrl: updated.proxy_url || '',
      cookiesJson: updated.cookies_json ? decryptString(updated.cookies_json) : '',
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
    
    if (sub.plan_type === 'WEEKLY') {
      return res.status(403).json({ error: 'HR Email Discovery is available on Monthly plan and above. Please upgrade!' });
    }

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
    if (sub.plan_type === 'WEEKLY' || sub.plan_type === 'MONTHLY') {
      return res.status(403).json({ error: 'AI Cold Email Drafting is locked on Weekly/Monthly Plans. Upgrade to Quarterly or VIP to unlock this feature!' });
    }

    const { jobTitle, companyName, hrEmail } = req.body;
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('userId', userId).maybeSingle();
    
    const parsedProfile = profile ? {
      full_name: profile.full_name,
      skills: JSON.parse(profile.skills || '[]')
    } : {};

    const draft = await generateColdEmail(jobTitle, companyName, hrEmail, parsedProfile);
    res.json({ draft });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cosmofeed Webhook
app.post('/api/payments/cosmofeed/webhook', async (req, res) => {
  try {
    const { order_id, user_email, status, plan_type } = req.body;
    if (status === 'COMPLETED') {
      const { data: user } = await supabase.from('app_users').select('id').eq('email', user_email).single();
      if (user) {
        const days = plan_type === 'WEEKLY' ? 7 : plan_type === 'MONTHLY' ? 30 : plan_type === 'TWO_MONTH' ? 60 : 90;
        const quotas = {
          WEEKLY: { r: 10, h: 10, o: 10 },
          MONTHLY: { r: 15, h: 15, o: 15 },
          TWO_MONTH: { r: 25, h: 25, o: 25 },
          THREE_MONTH: { r: 35, h: 35, o: 35 }
        }[plan_type as 'WEEKLY'|'MONTHLY'|'TWO_MONTH'|'THREE_MONTH'] || { r: 10, h: 10, o: 10 };

        await supabase.from('subscriptions').upsert({
          user_id: user.id,
          plan_type: plan_type,
          status: 'ACTIVE',
          cycle_start: new Date().toISOString(),
          cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
          jobs_remote_count: quotas.r,
          jobs_hybrid_count: quotas.h,
          jobs_onsite_count: quotas.o
        });
        console.log('SUCCESS', `Payment verified for ${user_email}`);
      }
    }
    res.status(200).send('OK');
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Secure Payment Verification ───────────────────────────────
app.post('/api/payments/verify', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = getUserId(req);

    // 1. Anti-Replay Check: Ensure ID hasn't been used before
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('razorpay_order_id', transactionId) // Using this field for Cosmofeed Order ID
      .maybeSingle();

    if (existingPayment) return res.status(400).json({ error: 'Transaction ID already used.' });

    // 2. Automated Verification via Scraper
    const verification = await verifyCosmofeedPayment(transactionId);
    
    if (verification.success && verification.plan) {
      const days = verification.plan === 'WEEKLY' ? 7 : verification.plan === 'MONTHLY' ? 30 : verification.plan === 'TWO_MONTH' ? 60 : 90;
      const quotas = {
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      }[verification.plan as 'WEEKLY'|'MONTHLY'|'TWO_MONTH'|'THREE_MONTH'] || { r: 10, h: 10, o: 10 };
      
      // Update Subscription
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        plan_type: verification.plan,
        status: 'ACTIVE',
        cycle_start: new Date().toISOString(),
        cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      // Record Payment
      await supabase.from('payments').insert([{
        user_id: userId,
        amount: 0, // Recorded via scraper
        plan_type: verification.plan,
        razorpay_order_id: transactionId,
        status: 'COMPLETED'
      }]);

      console.log('SUCCESS', `Verified payment for user ${userId} with transaction ${transactionId}`);
      res.json({ message: 'Subscription activated!' });
    } else {
      res.status(400).json({ error: 'Payment verification failed. Please check your Transaction ID.' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀  VANBA Job Hunter AI — Port ${PORT} (Cloud Data Enabled)`);
});

export default app;

// Self-ping to keep Render awake
setInterval(() => {
  const url = 'https://job-hunter-ai-koe0.onrender.com/';
  fetch(url).then(res => console.log('Self-ping successful: ' + res.status)).catch(err => console.error('Self-ping failed:', err));
}, 10 * 60 * 1000);
