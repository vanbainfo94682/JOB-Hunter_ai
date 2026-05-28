import { prisma, logSystem } from '../db';

/**
 * Standard utility to generate structured text from local Ollama Llama 3 model (llama3:8b).
 * Forces JSON output format using Ollama's native JSON formatting.
 */
export async function generateJSONResponse<T>(prompt: string, systemInstruction?: string): Promise<T> {
  const url = 'http://localhost:11434/api/chat';
  const messages: any[] = [];
  
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  console.log('INFO', `Sending structured JSON request to local Ollama (llama3:8b)...`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3:8b',
        messages,
        format: 'json',
        stream: false,
        options: {
          temperature: 0.1 // Low temperature for highly precise ATS evaluations
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama server returned status: ${response.status}`);
    }

    const data: any = await response.json();
    const rawText = data.message?.content || '';
    
    // Parse response cleanly
    return JSON.parse(rawText.trim()) as T;
  } catch (error: any) {
    console.log('ERROR', `Local Ollama JSON generation failed: ${error?.message || error}`);
    throw error;
  }
}

/**
 * Generates plain text cover letters or answers from local Ollama Llama 3 model (llama3:8b).
 */
export async function generateTextResponse(prompt: string, systemInstruction?: string): Promise<string> {
  const url = 'http://localhost:11434/api/chat';
  const messages: any[] = [];
  
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  console.log('INFO', `Sending text generation request to local Ollama (llama3:8b)...`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3:8b',
        messages,
        stream: false,
        options: {
          temperature: 0.7 // Higher temperature for high-quality, creative cover letters
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama server returned status: ${response.status}`);
    }

    const data: any = await response.json();
    return data.message?.content || '';
  } catch (error: any) {
    console.log('ERROR', `Local Ollama text generation failed: ${error?.message || error}`);
    throw error;
  }
}
