const OpenAI = require('openai');

let client = null;

// ---- SINGLE SOURCE OF TRUTH for AI model ----
const AI_MODEL = 'gpt-4o-mini';
const AI_MODEL_NAME = 'GPT-4o mini';
// Pricing per million tokens (USD)
const AI_PRICING = { input: 0.15, output: 0.60 };

function getClient(apiKey) {
  if (!apiKey) throw new Error('OpenAI API key not set. .env mein OPENAI_API_KEY daal dein.');
  if (!client || client._apiKey !== apiKey) {
    client = new OpenAI({ apiKey });
    client._apiKey = apiKey;
  }
  return client;
}

/**
 * Send messages to GPT-4o mini and get structured response
 */
async function chat(apiKey, systemPrompt, messages, options = {}) {
  const openai = getClient(apiKey);
  const startTime = Date.now();

  // Convert messages to OpenAI format (add system prompt as first message)
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: options.max_tokens || 400,
    messages: openaiMessages,
    response_format: { type: 'json_object' },
  });

  const responseMs = Date.now() - startTime;
  const rawText = response.choices[0]?.message?.content || '';

  // Parse JSON from response
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[1].trim()); } catch { /* fall through */ }
    }
    if (!parsed) {
      const objMatch = rawText.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { parsed = JSON.parse(objMatch[0]); } catch { /* fall through */ }
      }
    }
    if (!parsed) {
      parsed = { reply: rawText, state: 'UNKNOWN', collected: {}, needs_human: false };
    }
  }

  return {
    reply: parsed.reply || rawText,
    intent: parsed.intent || null,
    state: parsed.state || 'UNKNOWN',
    collected: parsed.collected || {},
    extracted: parsed.extracted || {},
    needs_human: parsed.needs_human || false,
    tokens_in: response.usage?.prompt_tokens || 0,
    tokens_out: response.usage?.completion_tokens || 0,
    response_ms: responseMs,
  };
}

/**
 * Chat with retry (1 retry after 2 sec)
 */
async function chatWithRetry(apiKey, systemPrompt, messages, options = {}) {
  try {
    return await chat(apiKey, systemPrompt, messages, options);
  } catch (err) {
    if (err.message.includes('API key')) throw err;
    console.error('OpenAI API error, retrying in 2s:', err.message);
    await new Promise(r => setTimeout(r, 2000));
    return await chat(apiKey, systemPrompt, messages, options);
  }
}

module.exports = { chat: chatWithRetry, AI_MODEL, AI_MODEL_NAME, AI_PRICING };
