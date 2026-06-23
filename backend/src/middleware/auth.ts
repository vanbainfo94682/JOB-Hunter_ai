import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { prisma } from '../db';

let supabaseGlobal: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (supabaseGlobal) return supabaseGlobal;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  supabaseGlobal = createClient(url, key);
  return supabaseGlobal;
}

/**
 * Extended Request type with Supabase user
 */
export interface AuthRequest extends Request {
  user?: SupabaseUser;
}

/**
 * Verifies the Authorization: Bearer <token> header using Supabase Auth.
 * Sets req.user on success.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
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
  } catch (err: any) {
    return res.status(401).json({ error: `Auth verification failed: ${err.message}` });
  }
}
