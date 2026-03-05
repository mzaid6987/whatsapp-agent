const OpenAI = require('openai');

let client = null;

// ---- MODEL OPTIONS ----
const MODEL_OPTIONS = {
  'gpt-4o-mini':   { name: 'GPT-4o mini',   input: 0.15,  output: 0.60 },
  'gpt-4o':        { name: 'GPT-4o',         input: 2.50,  output: 10.00 },
  'gpt-4.1-mini':  { name: 'GPT-4.1 mini',  input: 0.40,  output: 1.60 },
  'gpt-4.1-nano':  { name: 'GPT-4.1 nano',  input: 0.10,  output: 0.40 },
};

const DEFAULT_MODEL = 'gpt-4o-mini';

function getActiveModel() {
  try {
    const settingsModel = require('../db/models/settings');
    const saved = settingsModel.get('ai_chat_model', DEFAULT_MODEL);
    if (MODEL_OPTIONS[saved]) return saved;
  } catch (e) {}
  return DEFAULT_MODEL;
}

function getModelInfo(modelId) {
  const info = MODEL_OPTIONS[modelId] || MODEL_OPTIONS[DEFAULT_MODEL];
  return info;
}

// Export dynamic getters
const AI_MODEL = DEFAULT_MODEL;
const AI_MODEL_NAME = MODEL_OPTIONS[DEFAULT_MODEL].name;
const AI_PRICING = { input: MODEL_OPTIONS[DEFAULT_MODEL].input, output: MODEL_OPTIONS[DEFAULT_MODEL].output };

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
  const activeModel = getActiveModel();
  const modelInfo = getModelInfo(activeModel);

  // Convert messages to OpenAI format (add system prompt as first message)
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const response = await openai.chat.completions.create({
    model: activeModel,
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

module.exports = { chat: chatWithRetry, AI_MODEL, AI_MODEL_NAME, AI_PRICING, MODEL_OPTIONS, getActiveModel, getModelInfo };
