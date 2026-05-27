"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsSchema = exports.ApplySchema = exports.SignupSchema = exports.LoginSchema = void 0;
const zod_1 = require("zod");
// Schema for Authentication
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.SignupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    fullName: zod_1.z.string().min(2),
});
// Schema for Job Application
exports.ApplySchema = zod_1.z.object({
    dryRun: zod_1.z.boolean().optional(),
});
// Schema for Settings
exports.SettingsSchema = zod_1.z.object({
    isActive: zod_1.z.boolean().optional(),
    dailyLimit: zod_1.z.number().int().min(1).max(100).optional(),
    includeInternships: zod_1.z.boolean().optional(),
    autoApplyThreshold: zod_1.z.number().int().min(0).max(100).optional(),
    openrouterApiKey: zod_1.z.string().optional(),
    targetField: zod_1.z.string().optional(),
    experienceLevel: zod_1.z.string().optional(),
});
