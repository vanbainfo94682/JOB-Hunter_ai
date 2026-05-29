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
import { runScraperJob, crawlStealthJobLink } from './services/agent/scraper';
import { applyToJob } from './services/agent/applier';
import { calculateJobMatch } from './services/agent/matcher';
import { OPENROUTER_MODELS } from './services/openrouter';
import { getOrCreateUserSettings, getOrCreateSubscription } from './services/subscriptionService';
import { findHREmail } from './services/hrFinder';
import { generateColdEmail } from './services/emailGenerator';
import { encryptString, decryptString } from './utils/crypto';
import crypto, { randomUUID } from 'crypto';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

app.use(helmet());

const allowedOrigins = ['https://vanbaaijob.netlify.app', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001', 'http://localhost:3002'];
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
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('userId', userId).maybeSingle();
    const { data: subs } = await supabase.from('subscriptions').select('*').eq('userId', userId).order('created_at', { ascending: false }).limit(3);

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
    const rawText = await extractTextFromPdf(req.file.buffer);
    const parsedData = await parseResumeWithAI(rawText, userId);

    // Fetch existing profile to preserve IDs and custom columns
    const { data: existing } = await supabase.from('user_profiles').select('*').eq('userId', userId).maybeSingle();

    const upsertPayload: any = {
      userId: userId,
      fullName: parsedData.fullName || existing?.fullName || 'User',
      phone: parsedData.phone || existing?.phone || null,
      professional_email: parsedData.email || existing?.professional_email || '',
      skills: JSON.stringify(parsedData.skills),
      experience: JSON.stringify(parsedData.experience),
      education: JSON.stringify(parsedData.education),
      rawResumeText: rawText,
      resumePath: existing?.resumePath || '',
      targetTitles: JSON.stringify(parsedData.targetTitles),
      dob: existing?.dob || '1970-01-01',
      city: existing?.city || '',
      state: existing?.state || '',
      current_institution: existing?.current_institution || '',
      onboarding_completed: existing?.onboarding_completed || false,
    };

    if (existing?.id) upsertPayload.id = existing.id;

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .upsert(upsertPayload, { onConflict: 'userId' })
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
      .eq('userId', userId)
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
      fullName: profile.fullName || '',
      email: profile.user?.email || '',
      onboarding_completed: extraData.onboardingCompleted || false,
      dob: extraData.dob || '',
      city: extraData.city || '',
      state: extraData.state || '',
      current_institution: extraData.currentInstitution || '',
      skills: profile.skills ? JSON.parse(profile.skills) : [],
      experience: profile.experience ? JSON.parse(profile.experience) : [],
      education: eduList,
      targetTitles: profile.targetTitles ? JSON.parse(profile.targetTitles) : [],
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
      .eq('userId', userId)
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
      userId: userId,
      fullName: req.body.fullName || req.body.fullName || existing?.fullName || 'User',
      phone: req.body.phone !== undefined ? req.body.phone : (existing?.phone || null),
      professional_email: req.body.professional_email || existing?.professional_email || '',
      resumePath: req.body.resumePath || req.body.resumePath || existing?.resumePath || '',
      rawResumeText: req.body.rawResumeText || req.body.rawResumeText || existing?.rawResumeText || '',
      targetTitles: req.body.targetTitles ? JSON.stringify(req.body.targetTitles) : (existing?.targetTitles || '[]'),
      skills: req.body.skills ? (typeof req.body.skills === 'string' ? req.body.skills : JSON.stringify(req.body.skills)) : (existing?.skills || '[]'),
      experience: req.body.experience ? (typeof req.body.experience === 'string' ? req.body.experience : JSON.stringify(req.body.experience)) : (existing?.experience || '[]'),
      education: packedEducation
    };
    if (existing?.id) updatePayload.id = existing.id;

    // Upsert using Supabase to bypass Prisma issues
    const { data: updated, error: upsertError } = await supabase
      .from('user_profiles')
      .upsert(updatePayload, { onConflict: 'userId' })
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
    const limit = sub.jobsVisible || 10;

    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .or(`userId.eq.${userId},userId.is.null`)
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
    if (rawSettings.cookiesJson) {
      rawSettings.cookiesJson = decryptString(rawSettings.cookiesJson);
    }
    // Map DB snake_case -> frontend camelCase
    res.json({
      id: rawSettings.id,
      isActive: rawSettings.isActive ?? false,
      dailyLimit: rawSettings.dailyLimit ?? 10,
      remoteOnly: rawSettings.remoteOnly ?? true,
      includeInternships: rawSettings.includeInternships ?? true,
      autoApplyThreshold: rawSettings.autoApplyThreshold ?? 75,
      proxyUrl: rawSettings.proxyUrl || '',
      cookiesJson: rawSettings.cookiesJson || '',
      openrouterApiKey: rawSettings.openrouterApiKey || '',
      openrouterModels: rawSettings.openrouterModels || '',
      ceoDirective: rawSettings.ceoDirective || '',
      targetField: rawSettings.targetField || '',
      experienceLevel: rawSettings.experienceLevel || '',
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
    if (req.body.isActive !== undefined)           payload.isActive = req.body.isActive;
    if (req.body.dailyLimit !== undefined)         payload.dailyLimit = req.body.dailyLimit;
    if (req.body.remoteOnly !== undefined)         payload.remoteOnly = req.body.remoteOnly;
    if (req.body.includeInternships !== undefined) payload.includeInternships = req.body.includeInternships;
    if (req.body.autoApplyThreshold !== undefined) payload.autoApplyThreshold = req.body.autoApplyThreshold;
    if (req.body.proxyUrl !== undefined)           payload.proxyUrl = req.body.proxyUrl;
    if (req.body.openrouterApiKey !== undefined)   payload.openrouterApiKey = req.body.openrouterApiKey;
    if (req.body.openrouterModels !== undefined)   payload.openrouterModels = req.body.openrouterModels;
    if (req.body.ceoDirective !== undefined)       payload.ceoDirective = req.body.ceoDirective;
    if (req.body.targetField !== undefined)        payload.targetField = req.body.targetField;
    if (req.body.experienceLevel !== undefined)    payload.experienceLevel = req.body.experienceLevel;
    if (req.body.cookiesJson !== undefined) {
      payload.cookiesJson = encryptString(req.body.cookiesJson);
    }
    // Ensure settings row exists first
    await getOrCreateUserSettings(userId);
    const { data: updated, error } = await supabase
      .from('agent_settings')
      .update(payload)
      .eq('userId', userId)
      .select()
      .single();
    if (error) throw error;
    // Return mapped camelCase
    res.json({
      id: updated.id,
      isActive: updated.isActive ?? false,
      dailyLimit: updated.dailyLimit ?? 10,
      remoteOnly: updated.remoteOnly ?? true,
      includeInternships: updated.includeInternships ?? true,
      autoApplyThreshold: updated.autoApplyThreshold ?? 75,
      proxyUrl: updated.proxyUrl || '',
      cookiesJson: updated.cookiesJson ? decryptString(updated.cookiesJson) : '',
      openrouterApiKey: updated.openrouterApiKey || '',
      openrouterModels: updated.openrouterModels || '',
      ceoDirective: updated.ceoDirective || '',
      targetField: updated.targetField || '',
      experienceLevel: updated.experienceLevel || '',
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
      userId: userId,
      planType: planType,
      status: 'ACTIVE',
      jobsVisible: PLAN_MAP[planType],
      jobsCount: 0,
      cycleStart: new Date().toISOString(),
      cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
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
      userId: userId,
      planType: planType,
      jobsVisible: PLAN_MAP[planType] || 10,
      cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    }, { onConflict: 'userId' });
    
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
    
    if (sub.planType === 'WEEKLY') {
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
    if (sub.planType === 'WEEKLY' || sub.planType === 'MONTHLY') {
      return res.status(403).json({ error: 'AI Cold Email Drafting is locked on Weekly/Monthly Plans. Upgrade to Quarterly or VIP to unlock this feature!' });
    }

    const { jobTitle, companyName, hrEmail } = req.body;
    const { data: profile } = await supabase.from('user_profiles').select('*').eq('userId', userId).maybeSingle();
    
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

        console.log('SUCCESS', `Payment verified for ${user_email}`);
      }
    }
    res.status(200).send('OK');
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
        userId: userId,
        amount: 0,
        planType: 'MONTHLY',
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
  const ADMIN_UID = '3a26b2d8-dfbf-41bd-af80-d16cd6e6546c';

  app.get('/api/admin/payments', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { data, error } = await supabase
        .from('payments')
        .select('*, app_users(email)')
        .eq('status', 'PENDING')
        .order('createdAt', { ascending: false });
        
      if (error) throw error;
      res.json({ payments: data });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/approve', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { paymentId, planType } = req.body;
      
      const { data: payment } = await supabase.from('payments').select('*').eq('id', paymentId).single();
      if (!payment) return res.status(404).json({ error: 'Payment not found' });

      const plan = planType || payment.planType || 'MONTHLY';
      const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : 90;
      const quotas = ({
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      } as Record<string, { r: number, h: number, o: number }>)[plan] || { r: 10, h: 10, o: 10 };
      
      await supabase.from('subscriptions').upsert({
        userId: payment.userId,
        planType: plan,
        status: 'ACTIVE',
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      await supabase.from('payments').update({ status: 'COMPLETED', planType: plan }).eq('id', paymentId);
      res.json({ message: 'Payment approved successfully!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/payments/reject', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
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
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      const { key, value } = req.body;
      await supabase.from('system_config').upsert({ key, value, updatedAt: new Date().toISOString() });
      res.json({ message: 'Configuration updated successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { data: users, error } = await supabase
        .from('app_users')
        .select('*, subscriptions(*), user_profiles(*), payments(*)');
        
      if (error) throw error;
      res.json({ users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/users/plan', requireAuth, async (req, res) => {
    try {
      if (getUserId(req) !== ADMIN_UID) return res.status(403).json({ error: 'Forbidden' });
      
      const { userId, planType } = req.body;
      const plan = planType || 'MONTHLY';
      const days = plan === 'WEEKLY' ? 7 : plan === 'MONTHLY' ? 30 : plan === 'TWO_MONTH' ? 60 : 90;
      const quotas = ({
        WEEKLY: { r: 10, h: 10, o: 10 },
        MONTHLY: { r: 15, h: 15, o: 15 },
        TWO_MONTH: { r: 25, h: 25, o: 25 },
        THREE_MONTH: { r: 35, h: 35, o: 35 }
      } as Record<string, { r: number, h: number, o: number }>)[plan] || { r: 10, h: 10, o: 10 };
      
      await supabase.from('subscriptions').upsert({
        userId: userId,
        planType: plan,
        status: 'ACTIVE',
        cycleStart: new Date().toISOString(),
        cycleEnd: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        jobs_remote_count: quotas.r,
        jobs_hybrid_count: quotas.h,
        jobs_onsite_count: quotas.o
      });

      res.json({ message: 'User plan updated successfully!' });
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
