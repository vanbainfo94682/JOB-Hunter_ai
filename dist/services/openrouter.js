"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENROUTER_MODELS = void 0;
exports.generateJSONResponse = generateJSONResponse;
exports.generateTextResponse = generateTextResponse;
const db_1 = require("../db");
const crypto_1 = __importDefault(require("crypto"));
/**
 * All 26 free / free-preview OpenRouter models available to the user.
 * Add, remove, or reorder this list at any time — the round-robin engine
 * will always cycle through whatever is here.
 */
exports.OPENROUTER_MODELS = [
    'baidu/cobuddy:free',
    'openrouter/owl-alpha',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'poolside/laguna-xs.2:free',
    'poolside/laguna-m.1:free',
    'arcee-ai/trinity-large-thinking:free',
    'google/gemma-4-26b-a4b-it:free',
    'deepseek/deepseek-v4-flash:free',
    'google/gemma-4-31b-it:free',
    'minimax/minimax-m2.5:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'google/lyria-3-pro-preview',
    'google/lyria-3-clip-preview',
    'liquid/lfm-2.5-1.2b-thinking:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'nvidia/nemotron-3-nano-30b-a3b:free',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'nvidia/nemotron-nano-9b-v2:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'z-ai/glm-4.5-air:free',
    'qwen/qwen3-coder:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free',
];
// ---------------------------------------------------------------------------
// In-memory rotation state — survives across calls until the process restarts.
// Persisted to DB inside pickNextModel for crash-safe recovery on next boot.
// ---------------------------------------------------------------------------
let modelRotationState = null;
const aiCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
function getCacheKey(prompt, systemPrompt) {
    const hash = crypto_1.default.createHash('sha256');
    hash.update(prompt);
    if (systemPrompt)
        hash.update(systemPrompt);
    return hash.digest('hex');
}
/**
 * Load per-user rotation state from the DB. Called on every AI request.
 * @param userId Supabase auth UUID — we join to AgentSettings by appUserId
 */
async function loadRotationState(userId) {
    const whereClause = userId ? { userId } : {};
    const settings = await db_1.prisma.agentSettings.findFirst({ where: whereClause });
    const aiProvider = settings?.aiProvider || 'OPENROUTER';
    // Return early if Gemini is selected
    if (aiProvider === 'GEMINI') {
        if (!settings?.geminiApiKey && !process.env.GEMINI_API_KEY) {
            (0, db_1.logSystem)('ERROR', 'Gemini API key not configured.');
            throw new Error('Gemini API key not configured');
        }
        return { aiProvider, geminiApiKey: settings?.geminiApiKey || process.env.GEMINI_API_KEY, apiKey: null, models: null };
    }
    // OpenRouter flow
    if (!settings?.openrouterApiKey) {
        if (process.env.OPENROUTER_API_KEY)
            return { aiProvider, apiKey: process.env.OPENROUTER_API_KEY, models: modelRotationState };
        (0, db_1.logSystem)('ERROR', 'OpenRouter API key not configured. Add it in Settings.');
        throw new Error('OpenRouter API key not configured');
    }
    let savedModels;
    try {
        savedModels = (settings.openrouterModels || '') ? JSON.parse(settings.openrouterModels) : [...exports.OPENROUTER_MODELS];
    }
    catch (e) {
        savedModels = [...exports.OPENROUTER_MODELS];
    }
    if (savedModels.length === 0) {
        throw new Error('No OpenRouter models configured. Select at least one model in Settings.');
    }
    if (!modelRotationState || modelRotationState.activeModels.length !== savedModels.length) {
        const savedIdx = settings._rotationIdx;
        modelRotationState = {
            idx: savedIdx ?? 0,
            failedModels: new Set(),
            activeModels: savedModels,
        };
    }
    else {
        modelRotationState.activeModels = savedModels;
    }
    return { aiProvider, apiKey: settings.openrouterApiKey, models: modelRotationState, geminiApiKey: null };
}
/**
 * Round-robin: returns the next model, cycles back to 0 idx
 * when all models have been tried in this rotation window.
 */
function pickNextModel(models) {
    // Reset on fresh cycle
    if (modelRotationState.failedModels.size >= models.length) {
        (0, db_1.logSystem)('INFO', `All ${models.length} models exhausted this cycle. Resetting rotation to 0.`);
        modelRotationState.failedModels.clear();
        modelRotationState.idx = 0;
    }
    // If cursor is past end, wrap back
    if (modelRotationState.idx >= models.length) {
        modelRotationState.idx = 0;
    }
    const idx = modelRotationState.idx;
    const model = models[idx];
    modelRotationState.idx = idx + 1; // advance cursor for the next call
    return { model, idx };
}
/**
 * Fetch state helper — calls OpenRouter /api/v1/chat/completions.
 *
 * @param prompt         User prompt text
 * @param systemPrompt   Optional system instruction
 * @param temperature    Sampling temperature (use 0 for exact / 0.1 for precise JSON)
 * @param maxTokens      Max output tokens (optional)
 * @param retries        Max total attempts across all models this cycle (default = all models)
 */
async function callAI({ prompt, systemPrompt, temperature = 0, maxTokens, userId, retries, }) {
    const cacheKey = getCacheKey(prompt, systemPrompt);
    const cached = aiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        (0, db_1.logSystem)('INFO', '[AI Cache] Cache hit! Saving API tokens.');
        return cached.response;
    }
    const { aiProvider, models, apiKey, geminiApiKey } = await loadRotationState(userId);
    if (aiProvider === 'GEMINI') {
        (0, db_1.logSystem)('INFO', '[Gemini API] Dispatching request to gemini-2.5-flash');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        let parts = [];
        if (systemPrompt)
            parts.push({ text: `System Instruction: ${systemPrompt}` });
        parts.push({ text: prompt });
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { temperature, maxOutputTokens: maxTokens }
            })
        });
        if (!response.ok) {
            const err = await response.text().catch(() => 'unknown');
            throw new Error(`Gemini Error ${response.status}: ${err.slice(0, 150)}`);
        }
        const data = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content)
            throw new Error('Gemini returned empty response');
        // Clean any markdown fences that some models wrap around JSON
        const finalContent = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
        aiCache.set(cacheKey, { response: finalContent, expiresAt: Date.now() + CACHE_TTL_MS });
        return finalContent;
    }
    // OpenRouter Flow
    let lastError = null;
    const attempts = retries ?? (models?.activeModels.length ?? exports.OPENROUTER_MODELS.length);
    for (let attempt = 0; attempt < attempts; attempt++) {
        if (!models)
            throw new Error('Model rotation state not initialized');
        const { model, idx } = pickNextModel(models.activeModels);
        if (modelRotationState.failedModels.has(model)) {
            attempt--;
            continue;
        }
        (0, db_1.logSystem)('INFO', `[OpenRouter] Model #${idx + 1}/${modelRotationState.activeModels.length}: ${model}`);
        const messages = [];
        if (systemPrompt)
            messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream: false,
                    include_reasoning: false,
                }),
            });
            if (!response.ok) {
                const errText = await response.text().catch(() => 'unknown error');
                throw new Error(`OpenRouter returned ${response.status}: ${errText.slice(0, 120)}`);
            }
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            if (!content)
                throw new Error('OpenRouter returned empty content');
            (0, db_1.logSystem)('SUCCESS', `[OpenRouter] Model #${idx + 1} responded: ${content.length} chars`);
            const cleaned = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
            modelRotationState.failedModels.clear();
            aiCache.set(cacheKey, { response: cleaned, expiresAt: Date.now() + CACHE_TTL_MS });
            return cleaned;
        }
        catch (error) {
            lastError = error;
            modelRotationState.failedModels.add(model);
            (0, db_1.logSystem)('WARNING', `[OpenRouter] Model #${idx + 1} (${model}) failed. Next...`);
        }
    }
    (0, db_1.logSystem)('ERROR', `[OpenRouter] All ${attempts} models failed. Last error: ${lastError?.message}`);
    throw lastError || new Error('All OpenRouter models failed after exhausting the pool');
}
// ---------------------------------------------------------------------------
// Public API — mirrors the old gemini.ts interface so no other code changes
// ---------------------------------------------------------------------------
/**
 * Structured JSON response using OpenRouter.
 * Uses temperature 0 for precise, reproducible JSON structure.
 * userId is optional — when provided the per-user settings/API-key slot is used.
 */
async function generateJSONResponse(prompt, systemInstruction, userId) {
    (0, db_1.logSystem)('INFO', 'Sending structured JSON request to AI Provider...');
    const raw = await callAI({
        prompt,
        systemPrompt: systemInstruction,
        temperature: 0,
        maxTokens: 4096,
        userId,
    });
    return JSON.parse(raw);
}
/**
 * Plain-text response (cover letters, freeform answers) using OpenRouter.
 * Uses temperature 0.7 for natural, creative prose.
 * userId is optional — when provided the per-user settings/API-key slot is used.
 */
async function generateTextResponse(prompt, systemInstruction, userId) {
    (0, db_1.logSystem)('INFO', 'Sending text generation request to AI Provider...');
    return callAI({
        prompt,
        systemPrompt: systemInstruction,
        temperature: 0.7,
        maxTokens: 2048,
        userId,
    });
}
