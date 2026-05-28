import { supabase } from '../db';

const PLAN_JOBS: Record<string, number> = {
  'WEEKLY':    10,
  'MONTHLY':   25,
  'TWO_MONTH': 35,
} as const;

import { randomUUID } from 'crypto';

/**
 * Returns or creates the agent settings for a given Supabase auth user UUID.
 */
export async function getOrCreateUserSettings(userId: string, fallbackKey?: string) {
  const { data: existing } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (!existing.openrouter_api_key && fallbackKey) {
      const { data: updated } = await supabase
        .from('agent_settings')
        .update({ openrouter_api_key: fallbackKey })
        .eq('user_id', userId)
        .select()
        .single();
      return updated;
    }
    return existing;
  }

  // Create new default settings row
  const { data: created, error: createError } = await supabase
    .from('agent_settings')
    .insert([{
      id: randomUUID(),
      user_id: userId,
      is_active: false,
      daily_limit: 10,
      remote_only: true,
      auto_apply_threshold: 75,
      openrouter_api_key: fallbackKey ?? null,
    }])
    .select()
    .single();

  if (createError) console.error('Error creating settings:', createError.message);
  return created;
}

/**
 * Returns or creates the active subscription for a given user.
 */
export async function getOrCreateSubscription(userId: string) {
  const { data: active } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('cycle_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active && new Date() > new Date(active.cycle_end)) {
    const { data: expired } = await supabase
      .from('subscriptions')
      .update({ status: 'EXPIRED', jobs_count: 0 })
      .eq('id', active.id)
      .select()
      .single();
    return expired;
  }

  if (active) return active;

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: created } = await supabase
    .from('subscriptions')
    .insert([{
      id: randomUUID(),
      user_id: userId,
      plan_type: 'WEEKLY',
      status: 'ACTIVE',
      jobs_visible: PLAN_JOBS['WEEKLY'],
      jobs_count: 0,
      cycle_start: now.toISOString(),
      cycle_end: end.toISOString(),
    }])
    .select()
    .single();

  return created;
}

/**
 * Returns plan limits by type.
 */
export function getPlanDetails(planType: string) {
  const planNames: Record<string, string> = {
    'WEEKLY':    'Weekly Plan',
    'MONTHLY':   'Monthly Plan',
    'TWO_MONTH': 'Quarterly Plan',
  };
  return {
    name: planNames[planType] || 'Standard Plan',
    priceINR: planType === 'WEEKLY' ? 50 : planType === 'MONTHLY' ? 190 : 399,
    jobs_visible: PLAN_JOBS[planType] || 10,
    durationDays: planType === 'WEEKLY' ? 7 : planType === 'MONTHLY' ? 30 : 60,
    features: planType === 'WEEKLY'
      ? ['10 curated jobs / week', 'Basic resume matching', 'Email support']
      : planType === 'MONTHLY'
        ? ['25 curated jobs / month', 'Advanced matching', 'Priority support', 'API key storage']
        : ['35 curated jobs / 2 months', 'AI cover letters', '24/7 daemon', 'Priority support', 'Unlimited API keys'],
  };
}

/**
 * Check if user has view quota remaining for the current cycle.
 */
export function hasViewQuota(sub: { jobs_count: number; jobs_visible: number }): boolean {
  return sub.jobs_count < sub.jobs_visible;
}
