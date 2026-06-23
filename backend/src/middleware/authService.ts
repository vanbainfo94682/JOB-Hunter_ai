import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User as SupabaseUser } from '@supabase/supabase-js';

const SUPABASE_URL: string = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY: string = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY: string = process.env.SUPABASE_SERVICE_KEY || '';

type SignupInput = {
  email: string;
  password: string;
  metadata?: Record<string, any>;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthResult = { sbUser: SupabaseUser; accessToken: string };

export async function signupWithSupabase(input: SignupInput): Promise<AuthResult> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: input.metadata ?? {} },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('No user returned from signup');

  // Get fresh session token
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Failed to get session token after signup');

  return {
    sbUser: data.user as SupabaseUser,
    accessToken,
  };
}

export async function loginWithSupabase(input: LoginInput): Promise<AuthResult> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) throw new Error(error.message);
  if (!data.user || !data.session) throw new Error('Invalid credentials');

  return {
    sbUser: data.user as SupabaseUser,
    accessToken: data.session.access_token,
  };
}

export async function logoutCurrentSession(req: any): Promise<void> {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    await sb.auth.signOut({ scope: 'global' });
  }
}

export async function getCurrentUserFromToken(token: string): Promise<SupabaseUser | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user as SupabaseUser;
}
