"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_1 = require("./db");
const resumeParser_1 = require("./services/resumeParser");
const scraper_1 = require("./services/agent/scraper");
const applier_1 = require("./services/agent/applier");
const subscriptionService_1 = require("./services/subscriptionService");
const paymentVerifier_1 = require("./services/paymentVerifier");
const hrFinder_1 = require("./services/hrFinder");
const emailGenerator_1 = require("./services/emailGenerator");
const crypto_1 = require("./utils/crypto");
const crypto_2 = __importDefault(require("crypto"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, helmet_1.default)());
const allowedOrigins = ['https://vanbaaijob.netlify.app', 'http://localhost:3000', 'http://localhost:5173'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express_1.default.json({ limit: '1mb' }));
// API Rate Limiting: 500 requests per 15 minutes
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
// Strict Rate Limiting for Auth
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Limit each IP to 10 login requests per windowMs
    message: 'Too many login attempts from this IP, please try again after 5 minutes.'
});
// Public static folder
const PUBLIC_DIR = path_1.default.join(__dirname, '..', '..', 'public');
app.use('/public', express_1.default.static(PUBLIC_DIR));
// Uploads folder
const UPLOADS_DIR = process.env.RENDER ? '/tmp/uploads' : path_1.default.join(__dirname, '..', '..', 'uploads');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (ext !== '.pdf')
            return cb(new Error('Only PDF files are supported.'));
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
let sseClients = [];
function broadcastLog(log) {
    const payload = JSON.stringify(log);
    sseClients.forEach(c => c.write(`data: ${payload}\n\n`));
}
db_1.logEmitter.on('log', (log) => broadcastLog(log));
// ─────────────────────────────────────────────────────────────────
// Helper: resolve user → AppUserId from request
// ─────────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const token = authHeader.slice(7);
    try {
        const { data: { user }, error } = await db_1.supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    }
    catch (err) {
        return res.status(401).json({ error: `Auth verification failed: ${err.message}` });
    }
}
function getUserId(req) {
    return req.user?.id;
}
// ─────────────────────────────────────────────────────────────────
// Middleware: Subscription Enforcement
// ─────────────────────────────────────────────────────────────────
async function requirePremium(req, res, next) {
    try {
        const userId = getUserId(req);
        const sub = await (0, subscriptionService_1.getOrCreateSubscription)(userId);
        if (sub.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Premium subscription required. Please upgrade.' });
        }
        next();
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to verify subscription status.' });
    }
}
// ─────────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────────
app.get('/api/agent/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        const { data, error } = await db_1.supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
        });
        if (error)
            throw error;
        await (0, db_1.logSystem)('SUCCESS', `New user signed up: ${email}`);
        const u = data.user;
        const shapedUser = u ? {
            id: u.id,
            email: u.email ?? email,
            fullName: (u.user_metadata?.full_name ?? fullName ?? ''),
        } : null;
        res.json({ message: 'Signup successful.', user: shapedUser, accessToken: data.session?.access_token });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await db_1.supabase.auth.signInWithPassword({ email, password });
        if (error)
            throw error;
        await (0, db_1.logSystem)('INFO', `User logged in: ${email}`);
        const u = data.user;
        const shapedUser = u ? {
            id: u.id,
            email: u.email ?? email,
            fullName: (u.user_metadata?.full_name ?? u.user_metadata?.name ?? email),
        } : null;
        res.json({ message: 'Login successful.', user: shapedUser, accessToken: data.session?.access_token });
    }
    catch (error) {
        res.status(401).json({ error: error.message });
    }
});
app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { data: user } = await db_1.supabase.from('app_users').select('*').eq('id', userId).single();
        const { data: profile } = await db_1.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
        const { data: subs } = await db_1.supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(3);
        res.json({
            user,
            profile: profile ? {
                ...profile,
                skills: JSON.parse(profile.skills || '[]'),
                experience: JSON.parse(profile.experience || '[]'),
                education: JSON.parse(profile.education || '[]'),
                targetTitles: JSON.parse(profile.target_titles || '[]'),
            } : null,
            subscription: subs && subs.length > 0 ? subs[0] : null,
            subscriptions: subs || [],
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/resume/upload', requireAuth, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No resume file uploaded.' });
        const userId = getUserId(req);
        const rawText = await (0, resumeParser_1.extractTextFromPdf)(req.file.buffer);
        const parsedData = await (0, resumeParser_1.parseResumeWithAI)(rawText, userId);
        await db_1.supabase.from('user_profiles').delete().eq('user_id', userId);
        const { data: profile } = await db_1.supabase.from('user_profiles').insert([{
                user_id: userId,
                full_name: parsedData.fullName,
                phone: parsedData.phone || null,
                skills: JSON.stringify(parsedData.skills),
                experience: JSON.stringify(parsedData.experience),
                education: JSON.stringify(parsedData.education),
                raw_resume_text: rawText,
                resume_path: null,
                target_titles: JSON.stringify(parsedData.targetTitles),
            }]).select().single();
        (0, scraper_1.runScraperJob)().catch(() => { });
        res.json({ message: 'Resume uploaded successfully.', profile });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { data: profile } = await db_1.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
        if (!profile)
            return res.json(null);
        res.json({
            ...profile,
            onboarding_completed: !!profile.onboarding_completed,
            skills: JSON.parse(profile.skills || '[]'),
            experience: JSON.parse(profile.experience || '[]'),
            education: JSON.parse(profile.education || '[]'),
            targetTitles: JSON.parse(profile.target_titles || '[]'),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/profile', requireAuth, async (req, res) => {
    try {
        const userId = getUserId(req);
        const dbPayload = {
            user_id: userId,
            full_name: req.body.full_name || req.body.fullName || '',
            professional_email: req.body.professional_email || req.body.email || '',
            phone: req.body.phone || '',
            dob: req.body.dob || new Date().toISOString().split('T')[0],
            current_institution: req.body.current_institution || 'N/A',
            state: req.body.state || '',
            city: req.body.city || '',
            resume_url: req.body.resume_url || '',
            raw_resume_text: req.body.raw_resume_text || '',
            target_titles: req.body.target_titles ? JSON.stringify(req.body.target_titles) : '[]',
            skills: req.body.skills ? (typeof req.body.skills === 'string' ? req.body.skills : JSON.stringify(req.body.skills)) : '[]',
            experience: req.body.experience ? (typeof req.body.experience === 'string' ? req.body.experience : JSON.stringify(req.body.experience)) : '[]',
            education: req.body.education ? (typeof req.body.education === 'string' ? req.body.education : JSON.stringify(req.body.education)) : '[]',
            onboarding_completed: true
        };
        const { data: updated, error } = await db_1.supabase
            .from('user_profiles')
            .upsert(dbPayload, { onConflict: 'user_id' })
            .select()
            .single();
        if (error)
            throw error;
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/jobs', requireAuth, requirePremium, async (req, res) => {
    try {
        const userId = getUserId(req);
        const sub = await (0, subscriptionService_1.getOrCreateSubscription)(userId);
        const limit = sub.jobs_visible || 10;
        const { data: jobs } = await db_1.supabase
            .from('jobs')
            .select('*')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .order('match_score', { ascending: false })
            .limit(limit);
        res.json((jobs || []).map(j => ({
            ...j,
            logs: j.logs ? JSON.parse(j.logs) : [],
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/jobs/:id/apply', requireAuth, requirePremium, async (req, res) => {
    try {
        const { id } = req.params;
        const { dryRun } = req.body;
        (0, applier_1.applyToJob)(id, getUserId(req), dryRun !== undefined ? dryRun : true);
        res.json({ message: 'Application queued.' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/settings', requireAuth, requirePremium, async (req, res) => {
    try {
        const settings = await (0, subscriptionService_1.getOrCreateUserSettings)(getUserId(req));
        if (settings && settings.cookiesJson) {
            settings.cookiesJson = (0, crypto_1.decryptString)(settings.cookiesJson);
        }
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/settings', requireAuth, requirePremium, async (req, res) => {
    try {
        const userId = getUserId(req);
        const payload = { ...req.body };
        if (payload.cookiesJson) {
            payload.cookiesJson = (0, crypto_1.encryptString)(payload.cookiesJson);
        }
        const { data: updated } = await db_1.supabase
            .from('agent_settings')
            .update(payload)
            .eq('user_id', userId)
            .select()
            .single();
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/subscription', requireAuth, async (req, res) => {
    try {
        const sub = await (0, subscriptionService_1.getOrCreateSubscription)(getUserId(req));
        res.json(sub);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/subscription/subscribe', requireAuth, async (req, res) => {
    try {
        const userId = getUserId(req);
        const { planType } = req.body;
        const PLAN_MAP = { WEEKLY: 10, MONTHLY: 25, TWO_MONTH: 35 };
        const days = planType === 'WEEKLY' ? 7 : planType === 'MONTHLY' ? 30 : 60;
        const { data: sub } = await db_1.supabase.from('subscriptions').upsert({
            user_id: userId,
            plan_type: planType,
            status: 'ACTIVE',
            jobs_visible: PLAN_MAP[planType],
            jobs_count: 0,
            cycle_start: new Date().toISOString(),
            cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        }).select().single();
        res.json({ message: 'Subscribed.', subscription: sub });
    }
    catch (error) {
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
            const expectedSignature = crypto_2.default.createHmac('sha256', webhookSecret).update(payloadString).digest('hex');
            if (signature !== expectedSignature) {
                return res.status(401).json({ error: 'Invalid webhook signature' });
            }
        }
        const { userId, planType, status } = req.body;
        if (status !== 'SUCCESS')
            return res.json({ message: 'Ignored non-success event' });
        const days = planType === 'WEEKLY' ? 7 : planType === 'MONTHLY' ? 30 : 60;
        const PLAN_MAP = { WEEKLY: 10, MONTHLY: 25, TWO_MONTH: 35 };
        await db_1.supabase.from('subscriptions').upsert({
            user_id: userId,
            plan_type: planType,
            jobs_visible: PLAN_MAP[planType] || 10,
            active_until: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        }, { onConflict: 'user_id' });
        await (0, db_1.logSystem)('SUCCESS', `Webhook: Upgraded user ${userId} to ${planType}`);
        res.json({ message: 'Webhook processed' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/logs', async (req, res) => {
    try {
        const { data: logs } = await db_1.supabase.from('system_logs').select('*').order('timestamp', { ascending: false }).limit(100);
        res.json(logs);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// AI Agent Networking Tools
app.post('/api/agent/find-hr', requireAuth, requirePremium, async (req, res) => {
    try {
        const userId = getUserId(req);
        const sub = await (0, subscriptionService_1.getOrCreateSubscription)(userId);
        if (sub.plan_type === 'WEEKLY') {
            return res.status(403).json({ error: 'HR Email Discovery is available on Monthly plan and above. Please upgrade!' });
        }
        const { companyName } = req.body;
        if (!companyName)
            return res.status(400).json({ error: 'Company name is required.' });
        const result = await (0, hrFinder_1.findHREmail)(companyName);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/agent/draft-cold-email', requireAuth, requirePremium, async (req, res) => {
    try {
        const userId = getUserId(req);
        // Check subscription plan limits
        const sub = await (0, subscriptionService_1.getOrCreateSubscription)(userId);
        if (sub.plan_type === 'WEEKLY' || sub.plan_type === 'MONTHLY') {
            return res.status(403).json({ error: 'AI Cold Email Drafting is locked on Weekly/Monthly Plans. Upgrade to Quarterly or VIP to unlock this feature!' });
        }
        const { jobTitle, companyName, hrEmail } = req.body;
        const { data: profile } = await db_1.supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
        const parsedProfile = profile ? {
            fullName: profile.full_name,
            skills: JSON.parse(profile.skills || '[]')
        } : {};
        const draft = await (0, emailGenerator_1.generateColdEmail)(jobTitle, companyName, hrEmail, parsedProfile);
        res.json({ draft });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Cosmofeed Webhook
app.post('/api/payments/cosmofeed/webhook', async (req, res) => {
    try {
        const { order_id, user_email, status, plan_type } = req.body;
        if (status === 'COMPLETED') {
            const { data: user } = await db_1.supabase.from('app_users').select('id').eq('email', user_email).single();
            if (user) {
                const days = plan_type === 'WEEKLY' ? 7 : plan_type === 'MONTHLY' ? 30 : plan_type === 'TWO_MONTH' ? 60 : 90;
                const quotas = {
                    WEEKLY: { r: 10, h: 10, o: 10 },
                    MONTHLY: { r: 15, h: 15, o: 15 },
                    TWO_MONTH: { r: 25, h: 25, o: 25 },
                    THREE_MONTH: { r: 35, h: 35, o: 35 }
                }[plan_type] || { r: 10, h: 10, o: 10 };
                await db_1.supabase.from('subscriptions').upsert({
                    user_id: user.id,
                    plan_type: plan_type,
                    status: 'ACTIVE',
                    cycle_start: new Date().toISOString(),
                    cycle_end: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
                    jobs_remote_count: quotas.r,
                    jobs_hybrid_count: quotas.h,
                    jobs_onsite_count: quotas.o
                });
                await (0, db_1.logSystem)('SUCCESS', `Payment verified for ${user_email}`);
            }
        }
        res.status(200).send('OK');
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ── Secure Payment Verification ───────────────────────────────
app.post('/api/payments/verify', requireAuth, async (req, res) => {
    try {
        const { transactionId } = req.body;
        const userId = getUserId(req);
        // 1. Anti-Replay Check: Ensure ID hasn't been used before
        const { data: existingPayment } = await db_1.supabase
            .from('payments')
            .select('id')
            .eq('razorpay_order_id', transactionId) // Using this field for Cosmofeed Order ID
            .maybeSingle();
        if (existingPayment)
            return res.status(400).json({ error: 'Transaction ID already used.' });
        // 2. Automated Verification via Scraper
        const verification = await (0, paymentVerifier_1.verifyCosmofeedPayment)(transactionId);
        if (verification.success && verification.plan) {
            const days = verification.plan === 'WEEKLY' ? 7 : verification.plan === 'MONTHLY' ? 30 : verification.plan === 'TWO_MONTH' ? 60 : 90;
            const quotas = {
                WEEKLY: { r: 10, h: 10, o: 10 },
                MONTHLY: { r: 15, h: 15, o: 15 },
                TWO_MONTH: { r: 25, h: 25, o: 25 },
                THREE_MONTH: { r: 35, h: 35, o: 35 }
            }[verification.plan] || { r: 10, h: 10, o: 10 };
            // Update Subscription
            await db_1.supabase.from('subscriptions').upsert({
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
            await db_1.supabase.from('payments').insert([{
                    user_id: userId,
                    amount: 0, // Recorded via scraper
                    plan_type: verification.plan,
                    razorpay_order_id: transactionId,
                    status: 'COMPLETED'
                }]);
            await (0, db_1.logSystem)('SUCCESS', `Verified payment for user ${userId} with transaction ${transactionId}`);
            res.json({ message: 'Subscription activated!' });
        }
        else {
            res.status(400).json({ error: 'Payment verification failed. Please check your Transaction ID.' });
        }
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(PORT, () => {
    console.log(`🚀  VANBA Job Hunter AI — Port ${PORT} (Cloud Data Enabled)`);
});
exports.default = app;
// Self-ping to keep Render awake
setInterval(() => {
    const url = 'https://job-hunter-ai-koe0.onrender.com/';
    fetch(url).then(res => console.log('Self-ping successful: ' + res.status)).catch(err => console.error('Self-ping failed:', err));
}, 10 * 60 * 1000);
