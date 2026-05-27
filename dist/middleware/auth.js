"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const supabase_js_1 = require("@supabase/supabase-js");
let supabaseGlobal = null;
function getSupabase() {
    if (supabaseGlobal)
        return supabaseGlobal;
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_ANON_KEY || '';
    supabaseGlobal = (0, supabase_js_1.createClient)(url, key);
    return supabaseGlobal;
}
/**
 * Verifies the Authorization: Bearer <token> header using Supabase Auth.
 * Sets req.user on success.
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const token = authHeader.slice(7);
    const supabase = getSupabase();
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
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
