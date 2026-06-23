import { supabase, logSystem } from '../db';
import crypto from 'crypto';
import { execFile } from 'child_process';
import path from 'path';

/**
 * All 26 free / free-preview OpenRouter models available to the user.
 * Add, remove, or reorder this list at any time — the round-robin engine
 * will always cycle through whatever is here.
 */
export const OPENROUTER_MODELS: readonly string[] = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-26b-a4b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'liquid/lfm-2.5-1.2b-thinking:free',
  'qwen/qwen3-coder:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'poolside/laguna-m.1:free',
  'poolside/laguna-xs.2:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'cohere/north-mini-code:free',
];

// ---------------------------------------------------------------------------
// In-memory rotation state — survives across calls until the process restarts.
// Persisted to DB inside pickNextModel for crash-safe recovery on next boot.
// ---------------------------------------------------------------------------
let modelRotationState: {
  idx: number;                 // next model to try (round-robin cursor)
  cooldowns: Map<string, number>; // models that hit 429 -> expiry timestamp
  activeModels: string[];      // current working model pool
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
      console.log('WARNING', 'Gemini API key not configured. Falling back to OpenRouter.');
      // If missing, we will change aiProvider to OPENROUTER dynamically so it falls through below
    } else {
      // Proceed with Gemini
      const userKey = settings?.openrouter_api_key?.trim();
      const envKey = process.env.OPENROUTER_API_KEY?.trim();
      const apiKey = userKey || envKey || '';
      
      let savedModels: string[];
      try {
        const modelsStr = settings?.openrouter_models?.trim();
        savedModels = modelsStr ? JSON.parse(modelsStr) as string[] : [...OPENROUTER_MODELS];
      } catch (e) {
        savedModels = [...OPENROUTER_MODELS];
      }

      if (!modelRotationState || modelRotationState.activeModels.length !== savedModels.length) {
        modelRotationState = { idx: 0, cooldowns: new Map(), activeModels: savedModels };
      } else {
        modelRotationState.activeModels = savedModels;
      }
      return { aiProvider: 'GEMINI', geminiApiKey: settings?.gemini_api_key || process.env.GEMINI_API_KEY, apiKey, models: modelRotationState };
    }
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
      cooldowns: new Map(),
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
  const now = Date.now();
  
  // Clear expired cooldowns
  for (const [model, expiry] of modelRotationState!.cooldowns.entries()) {
    if (now > expiry) {
      modelRotationState!.cooldowns.delete(model);
    }
  }

  // Find next available model starting from current idx
  for (let i = 0; i < models.length; i++) {
    const tryIdx = (modelRotationState!.idx + i) % models.length;
    const model = models[tryIdx];
    
    // If not on cooldown, pick it and advance cursor
    if (!modelRotationState!.cooldowns.has(model)) {
      modelRotationState!.idx = (tryIdx + 1) % models.length;
      return { model, idx: tryIdx };
    }
  }

  // Fallback: If ALL models are exhausted/cooldown, just return the next one anyway.
  // It might fail, but it's better than crashing the loop, and the API might have recovered.
  console.log('WARNING', 'All OpenRouter models are currently on cooldown (429 Rate Limit). Attempting fallback...');
  const fallbackIdx = modelRotationState!.idx % models.length;
  modelRotationState!.idx = (fallbackIdx + 1) % models.length;
  return { model: models[fallbackIdx], idx: fallbackIdx };
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
    console.log('INFO', '[Gemini API] Dispatching request to gemini-1.5-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
    
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
      console.log('WARNING', `[Gemini API] Error ${response.status}: ${err.slice(0, 150)}. Falling back to OpenRouter...`);
      // Fall through to OpenRouter instead of throwing
    } else {
      const data: any = await response.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        console.log('WARNING', '[Gemini API] Returned empty response. Falling back to OpenRouter...');
      } else {
        // Clean any markdown fences that some models wrap around JSON
        const finalContent = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
        aiCache.set(cacheKey, { response: finalContent, expiresAt: Date.now() + CACHE_TTL_MS });
        return finalContent;
      }
    }
  }

  // OpenRouter Flow (Used if selected explicitly OR if Gemini failed)
  let lastError: any = null;
  const attempts = retries ?? (models?.activeModels.length ?? OPENROUTER_MODELS.length);

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!models) throw new Error('Model rotation state not initialized');
    const { model, idx } = pickNextModel(models.activeModels);

    console.log('INFO', `[OpenRouter] Model #${idx + 1}/${modelRotationState!.activeModels.length}: ${model}`);

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
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
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown error');
        throw new Error(`${response.status}: ${errText.slice(0, 120)}`);
      }

      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) throw new Error('OpenRouter returned empty content');

      console.log('SUCCESS', `[OpenRouter] Model #${idx + 1} responded: ${content.length} chars`);

      const cleaned = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      
      aiCache.set(cacheKey, { response: cleaned, expiresAt: Date.now() + CACHE_TTL_MS });
      return cleaned;

    } catch (error: any) {
      lastError = error;
      const errMsg = error.message || '';
      
      // If 429 Too Many Requests, put model on 60 second cooldown (20 requests/min limit)
      if (errMsg.includes('429')) {
        modelRotationState!.cooldowns.set(model, Date.now() + 60000);
        console.log('WARNING', `[OpenRouter] Model #${idx + 1} (${model}) hit rate limit (429). Placed on 60s cooldown.`);
      } else {
        // For other errors (500, 400), put on shorter 10s cooldown
        modelRotationState!.cooldowns.set(model, Date.now() + 10000);
        console.log('WARNING', `[OpenRouter] Model #${idx + 1} (${model}) failed. Next...`);
      }
    }
  }

  console.log('WARNING', `[OpenRouter] All ${attempts} models failed. Falling back to ai4free Python bridge...`);
  
  // ---------------------------------------------------------------------------
  // TIER 3 FALLBACK: ai4free Python Bridge — completely unlimited, zero cost
  // ---------------------------------------------------------------------------
  try {
    const ai4freeResponse = await new Promise<string>((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'src', 'services', 'agent', 'ai_evaluator.py');
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      
      const child = execFile(pythonCmd, [scriptPath], {
        timeout: 45000, // 45 second max
        maxBuffer: 5 * 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (stderr) console.log('INFO', `[ai4free] ${stderr.trim()}`);
        if (error) {
          reject(new Error(`ai4free process error: ${error.message}`));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          if (result.success && result.response) {
            console.log('SUCCESS', `[ai4free] Provider "${result.provider}" responded: ${result.response.length} chars`);
            // Cache the response
            aiCache.set(cacheKey, { response: result.response, expiresAt: Date.now() + CACHE_TTL_MS });
            resolve(result.response);
          } else {
            reject(new Error(result.error || 'ai4free returned no response'));
          }
        } catch (parseErr) {
          reject(new Error(`ai4free output parse error: ${stdout.slice(0, 200)}`));
        }
      });
      
      // Send the prompt via stdin
      const inputPayload = JSON.stringify({ prompt, systemPrompt });
      child.stdin?.write(inputPayload);
      child.stdin?.end();
    });
    
    return ai4freeResponse;
  } catch (ai4freeError: any) {
    console.log('ERROR', `[ai4free] Final fallback also failed: ${ai4freeError.message}`);
  }
  
  throw lastError || new Error('All AI providers exhausted (Gemini + OpenRouter + ai4free)');
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
  let jsonStr = raw.trim();
  
  // Robust JSON extraction: find the outermost curly braces
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }
  
  // Fix common AI JSON errors: trailing commas
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(jsonStr) as T;
  } catch (error: any) {
    console.log('ERROR', `Failed to parse JSON response: ${error?.message || error}`);
    console.log('RAW OUTPUT:', raw);
    throw new Error('AI returned invalid JSON format');
  }
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
