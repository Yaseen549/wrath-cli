import {
  AI_PROVIDER,
  ANTHROPIC_API_URL,
  ANTHROPIC_MODEL,
  ANTHROPIC_API_VERSION,
  OPENAI_API_URL,
  OPENAI_MODEL,
  GEMINI_API_URL, 
  GEMINI_MODEL,
  GROK_API_URL,   
  GROK_MODEL,
  MISTRAL_API_URL,
  MISTRAL_MODEL,
  COHERE_API_URL,  
  COHERE_MODEL,
} from '../config.js';

/**
 * Sends a message to the configured AI provider and returns the text response.
 */
export async function callAI(systemPrompt, userMessage, options = {}) {
  const { maxTokens = 8192, expectJson = false } = options;
  const provider = AI_PROVIDER.toLowerCase();

  let responseText;

  switch (provider) {
    case 'anthropic':
      responseText = await callAnthropic(systemPrompt, userMessage, maxTokens);
      break;
    case 'openai':
      responseText = await callOpenAI(systemPrompt, userMessage, maxTokens);
      break;
    case 'gemini':
      responseText = await callGemini(systemPrompt, userMessage, maxTokens);
      break;
    case 'grok':
      responseText = await callGrok(systemPrompt, userMessage, maxTokens);
      break;
    case 'mistral':
      responseText = await callMistral(systemPrompt, userMessage, maxTokens);
      break;
    case 'cohere':
      responseText = await callCohere(systemPrompt, userMessage, maxTokens);
      break;
    case 'together':
      responseText = await callTogether(systemPrompt, userMessage, maxTokens);
      break;
    default:
      throw new Error(`Unknown AI_PROVIDER: "${AI_PROVIDER}". Supported providers: anthropic, openai, gemini, grok, mistral, cohere, together.`);
  }

  if (expectJson) {
    return stripJsonFences(responseText);
  }
  return responseText;
}

// ── Anthropic ──────────────────────────────────────────────────────────────

async function callAnthropic(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY in environment.');

  const body = {
    model: ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  const res = await fetch(ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION || '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.content || !data.content[0]) throw new Error('Unexpected Anthropic response structure.');
  return data.content[0].text;
}

// ── OpenAI ─────────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY in environment.');

  const body = {
    model: OPENAI_MODEL || 'gpt-4o',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };

  const res = await fetch(OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0]) throw new Error('Unexpected OpenAI response structure.');
  return data.choices[0].message.content;
}

// ── Google Gemini ──────────────────────────────────────────────────────────

async function callGemini(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY in environment.');

  const baseUrl = GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/';
  const model = GEMINI_MODEL || 'gemini-1.5-pro';
  const url = `${baseUrl}${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      { role: 'user', parts: [{ text: userMessage }] }
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.candidates || !data.candidates[0]?.content?.parts[0]) {
    throw new Error('Unexpected Gemini response structure: ' + JSON.stringify(data));
  }
  
  return data.candidates[0].content.parts[0].text;
}

// ── Grok (xAI) ─────────────────────────────────────────────────────────────

async function callGrok(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) throw new Error('Missing GROK_API_KEY in environment.');

  const body = {
    model: GROK_MODEL || 'grok-beta',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };

  const res = await fetch(GROK_API_URL || 'https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Grok API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0]) throw new Error('Unexpected Grok response structure.');
  return data.choices[0].message.content;
}

// ── Mistral AI ─────────────────────────────────────────────────────────────

async function callMistral(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Missing MISTRAL_API_KEY in environment.');

  const body = {
    model: MISTRAL_MODEL || 'mistral-large-latest',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };

  const res = await fetch(MISTRAL_API_URL || 'https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Mistral API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0]) throw new Error('Unexpected Mistral response structure.');
  return data.choices[0].message.content;
}

// ── Cohere ─────────────────────────────────────────────────────────────────

async function callCohere(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) throw new Error('Missing COHERE_API_KEY in environment.');

  const body = {
    model: COHERE_MODEL || 'command-r-plus',
    message: userMessage,
    preamble: systemPrompt,
    max_tokens: maxTokens,
  };

  const res = await fetch(COHERE_API_URL || 'https://api.cohere.com/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cohere API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.text) throw new Error('Unexpected Cohere response structure.');
  return data.text;
}

// ── Together AI ────────────────────────────────────────────────────────────

async function callTogether(systemPrompt, userMessage, maxTokens) {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error('Missing TOGETHER_API_KEY in environment.');

  const body = {
    model: process.env.TOGETHER_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  };

  const res = await fetch(process.env.TOGETHER_API_URL || 'https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Together API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0]) throw new Error('Unexpected Together response structure.');
  return data.choices[0].message.content;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripJsonFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}


// How to use the new models
// To switch between them, just update your `.env` file in the root of your project:

// ```env
// # Change this to: openai, anthropic, gemini, together, or grok
// AI_PROVIDER=gemini

// # API Keys
// OPENAI_API_KEY=sk-proj-...
// ANTHROPIC_API_KEY=sk-ant-...
// GEMINI_API_KEY=AIzaSy...
// TOGETHER_API_KEY=...
// GROK_API_KEY=xai-...

// # (Optional) Override the default models
// # GEMINI_MODEL=gemini-2.5-pro
// # TOGETHER_MODEL=meta-llama/Llama-3-70b-chat-hf