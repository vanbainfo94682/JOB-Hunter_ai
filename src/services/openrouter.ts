import { supabase, logSystem } from '../db';
import crypto from 'crypto';

/**
 * All 26 free / free-preview OpenRouter models available to the user.
 * Add, remove, or reorder this list at any time — the round-robin engine
 * will always cycle through whatever is here.
 */
export const OPENROUTER_MODELS: readonly string[] = [
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
let modelRotationState: {
  idx: number;               // next model to try (round-robin cursor)
  failedModels: Set<string>; // models that threw errors this cycle
  activeModels: string[];    // current working model pool
} | null = null;

// ---------------------------------------------------------------------------
// In-Memory AI Cache — saves tokens on duplicate prompts
// ---------------------------------------------------------------------------
interface CacheEntry {
  response: string;
  expiresAt: number;
}
const aiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(prompt: string, systemPrompt?: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(prompt);
  if (systemPrompt) hash.update(systemPrompt);
  return hash.digest('hex');
}

/**
 * Load per-user rotation state from the DB. Called on every AI request.
 * @param userId Supabase auth UUID — we join to AgentSettings by appUserId
 */
async function loadRotationState(userId?: string) {
  let query = supabase.from('agent_settings').select('*');
  if (userId) query = query.eq('user_id', userId);
  const { data: settings } = await query.limit(1).maybeSingle();
  
  const aiProvider = settings?.ai_provider || 'OPENROUTER';
  
  // Return early if Gemini is selected
  if (aiProvider === 'GEMINI') {
    if (!settings?.gemini_api_key && !process.env.GEMINI_API_KEY) {
      console.log('ERROR', 'Gemini API key not configured.');
      throw new Error('Gemini API key not configured');
    }
    return { aiProvider, geminiApiKey: settings?.gemini_api_key || process.env.GEMINI_API_KEY, apiKey: null, models: null };
  }

  // OpenRouter flow — treat empty string same as missing
  const userKey = settings?.openrouter_api_key?.trim();
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  const apiKey = userKey || envKey;

  if (!apiKey) {
    console.log('ERROR', 'OpenRouter API key not configured. Add it in Settings.');
    throw new Error('OpenRouter API key not configured. Please add your OpenRouter API key in Settings.');
  }

  let savedModels: string[];
  try {
    const modelsStr = settings?.openrouter_models?.trim();
    savedModels = modelsStr ? JSON.parse(modelsStr) as string[] : [...OPENROUTER_MODELS];
  } catch (e) {
    savedModels = [...OPENROUTER_MODELS];
  }

  if (savedModels.length === 0) {
    savedModels = [...OPENROUTER_MODELS];
  }

  if (!modelRotationState || modelRotationState.activeModels.length !== savedModels.length) {
    modelRotationState = {
      idx: 0,
      failedModels: new Set(),
      activeModels: savedModels,
    };
  } else {
    modelRotationState.activeModels = savedModels;
  }

  return { aiProvider, apiKey, models: modelRotationState, geminiApiKey: null };
}

/**
 * Round-robin: returns the next model, cycles back to 0 idx
 * when all models have been tried in this rotation window.
 */
function pickNextModel(models: string[]): { model: string; idx: number } {
  // Reset on fresh cycle
  if (modelRotationState!.failedModels.size >= models.length) {
    console.log('INFO', `All ${models.length} models exhausted this cycle. Resetting rotation to 0.`);
    modelRotationState!.failedModels.clear();
    modelRotationState!.idx = 0;
  }

  // If cursor is past end, wrap back
  if (modelRotationState!.idx >= models.length) {
    modelRotationState!.idx = 0;
  }

  const idx = modelRotationState!.idx;
  const model = models[idx];
  modelRotationState!.idx = idx + 1; // advance cursor for the next call
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
async function callAI({
  prompt,
  systemPrompt,
  temperature = 0,
  maxTokens,
  userId,
  retries,
}: {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  retries?: number;
}): Promise<string> {
  const cacheKey = getCacheKey(prompt, systemPrompt);
  const cached = aiCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log('INFO', '[AI Cache] Cache hit! Saving API tokens.');
    return cached.response;
  }

  const { aiProvider, models, apiKey, geminiApiKey } = await loadRotationState(userId);

  if (aiProvider === 'GEMINI') {
    console.log('INFO', '[Gemini API] Dispatching request to gemini-2.5-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    
    let parts = [];
    if (systemPrompt) parts.push({ text: `System Instruction: ${systemPrompt}` });
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

    const data: any = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Gemini returned empty response');
    
    // Clean any markdown fences that some models wrap around JSON
    const finalContent = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    aiCache.set(cacheKey, { response: finalContent, expiresAt: Date.now() + CACHE_TTL_MS });
    return finalContent;
  }

  // OpenRouter Flow
  let lastError: any = null;
  const attempts = retries ?? (models?.activeModels.length ?? OPENROUTER_MODELS.length);

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!models) throw new Error('Model rotation state not initialized');
    const { model, idx } = pickNextModel(models.activeModels);

    if (modelRotationState!.failedModels.has(model)) {
      attempt--; 
      continue;
    }

    console.log('INFO', `[OpenRouter] Model #${idx + 1}/${modelRotationState!.activeModels.length}: ${model}`);

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
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

      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) throw new Error('OpenRouter returned empty content');

      console.log('SUCCESS', `[OpenRouter] Model #${idx + 1} responded: ${content.length} chars`);

      const cleaned = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      modelRotationState!.failedModels.clear();
      
      aiCache.set(cacheKey, { response: cleaned, expiresAt: Date.now() + CACHE_TTL_MS });
      return cleaned;

    } catch (error: any) {
      lastError = error;
      modelRotationState!.failedModels.add(model);
      console.log('WARNING', `[OpenRouter] Model #${idx + 1} (${model}) failed. Next...`);
    }
  }

  console.log('ERROR', `[OpenRouter] All ${attempts} models failed. Last error: ${lastError?.message}`);
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
export async function generateJSONResponse<T>(prompt: string, systemInstruction?: string, userId?: string): Promise<T> {
  console.log('INFO', 'Sending structured JSON request to AI Provider...');
  const raw = await callAI({
    prompt,
    systemPrompt: systemInstruction,
    temperature: 0,
    maxTokens: 4096,
    userId,
  });
  return JSON.parse(raw) as T;
}

/**
 * Plain-text response (cover letters, freeform answers) using OpenRouter.
 * Uses temperature 0.7 for natural, creative prose.
 * userId is optional — when provided the per-user settings/API-key slot is used.
 */
export async function generateTextResponse(prompt: string, systemInstruction?: string, userId?: string): Promise<string> {
  console.log('INFO', 'Sending text generation request to AI Provider...');
  return callAI({
    prompt,
    systemPrompt: systemInstruction,
    temperature: 0.7,
    maxTokens: 2048,
    userId,
  });
}
