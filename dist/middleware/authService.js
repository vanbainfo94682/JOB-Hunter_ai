"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signupWithSupabase = signupWithSupabase;
exports.loginWithSupabase = loginWithSupabase;
exports.logoutCurrentSession = logoutCurrentSession;
exports.getCurrentUserFromToken = getCurrentUserFromToken;
const supabase_js_1 = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
async function signupWithSupabase(input) {
    const sb = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb.auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: input.metadata ?? {} },
    });
    if (error)
        throw new Error(error.message);
    if (!data.user)
        throw new Error('No user returned from signup');
    // Get fresh session token
    const { data: sessionData } = await sb.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken)
        throw new Error('Failed to get session token after signup');
    return {
        sbUser: data.user,
        accessToken,
    };
}
async function loginWithSupabase(input) {
    const sb = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb.auth.signInWithPassword({
        email: input.email,
        password: input.password,
    });
    if (error)
        throw new Error(error.message);
    if (!data.user || !data.session)
        throw new Error('Invalid credentials');
    return {
        sbUser: data.user,
        accessToken: data.session.access_token,
    };
}
async function logoutCurrentSession(req) {
    const token = req.headers.authorization?.slice(7);
    if (token) {
        const sb = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
        await sb.auth.signOut({ scope: 'global' });
    }
}
async function getCurrentUserFromToken(token) {
    const sb = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user)
        return null;
    return data.user;
}
