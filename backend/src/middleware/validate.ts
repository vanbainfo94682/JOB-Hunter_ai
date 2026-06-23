import { z } from 'zod';

// Schema for Authentication
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
});

// Schema for Job Application
export const ApplySchema = z.object({
  dryRun: z.boolean().optional(),
});

// Schema for Settings
export const SettingsSchema = z.object({
  isActive: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(100).optional(),
  includeInternships: z.boolean().optional(),
  autoApplyThreshold: z.number().int().min(0).max(100).optional(),
  openrouterApiKey: z.string().optional(),
  targetField: z.string().optional(),
  experienceLevel: z.string().optional(),
});
