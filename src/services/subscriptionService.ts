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
  const { data: existing, error: fetchError } = await supabase
    .from('agent_settings')
    .select('*')
    .eq('userId', userId)
    .single();

  if (existing) {
    if (!existing.openrouterApiKey && fallbackKey) {
      const { data: updated } = await supabase
        .from('agent_settings')
        .update({ openrouterApiKey: fallbackKey })
        .eq('userId', userId)
        .select()
        .single();
      return updated;
    }
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from('agent_settings')
    .insert([{
      id: randomUUID(),
      userId: userId,
      isActive: false,
      dailyLimit: 10,
      remoteOnly: true,
      autoApplyThreshold: 75,
      openrouterApiKey: fallbackKey ?? null,
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
  const { data: active, error: fetchError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('userId', userId)
    .eq('status', 'ACTIVE')
    .order('cycleStart', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active && new Date() > new Date(active.cycleEnd)) {
    const { data: expired } = await supabase
      .from('subscriptions')
      .update({ status: 'EXPIRED', jobsCount: 0 })
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
      userId: userId,
      planType: 'WEEKLY',
      status: 'ACTIVE',
      jobsVisible: PLAN_JOBS['WEEKLY'],
      jobsCount: 0,
      cycleStart: now.toISOString(),
      cycleEnd: end.toISOString(),
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
    jobsVisible: PLAN_JOBS[planType] || 10,
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
export function hasViewQuota(sub: { jobsCount: number; jobsVisible: number }): boolean {
  return sub.jobsCount < sub.jobsVisible;
}
