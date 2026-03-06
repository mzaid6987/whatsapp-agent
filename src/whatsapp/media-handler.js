/**
 * WhatsApp Media Handler
 *
 * Handles voice messages (via OpenAI Whisper) and images (via GPT-4o mini Vision).
 * Downloads media from WhatsApp Cloud API, processes it, and returns text.
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { toFile } = require('openai');
const sharp = require('sharp');

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Shared OpenAI client
let _openai = null;
let _lastKey = null;
function getOpenAI(apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set — check Settings or .env');
  // Recreate client if key changed
  if (!_openai || key !== _lastKey) {
    _openai = new OpenAI({ apiKey: key });
    _lastKey = key;
  }
  return _openai;
}

/**
 * Download media from WhatsApp Cloud API
 * Step 1: Get media URL from media ID
 * Step 2: Download the actual file
 */
async function downloadMedia(mediaId, accessToken) {
  // Step 1: Get media URL
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const metaData = await metaRes.json();
  if (!metaData.url) throw new Error('Media URL not found: ' + JSON.stringify(metaData));

  // Step 2: Download the file
  const fileRes = await fetch(metaData.url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const mimeType = metaData.mime_type || 'application/octet-stream';

  return { buffer, mimeType };
}

/**
 * Transcribe voice message using OpenAI Whisper
 * Returns the transcribed text
 */
async function transcribeVoice(mediaId, accessToken, openaiApiKey) {
  const openai = getOpenAI(openaiApiKey);
  console.log(`[Media] Voice: downloading media ${mediaId}...`);
  const { buffer, mimeType } = await downloadMedia(mediaId, accessToken);
  console.log(`[Media] Voice: downloaded ${buffer.length} bytes, mime: ${mimeType}`);

  // Determine file extension from mime type (strip codec info like "audio/ogg; codecs=opus")
  const baseMime = mimeType.split(';')[0].trim();
  const extMap = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/amr': 'amr', 'audio/aac': 'aac' };
  const ext = extMap[baseMime] || 'ogg';

  // Use OpenAI toFile helper — avoids temp file system issues on shared hosting
  const file = await toFile(buffer, `voice.${ext}`, { type: baseMime });

  const startTime = Date.now();
  console.log(`[Media] Voice: calling Whisper API...`);
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    prompt: 'Roman Urdu transcript in English letters. Pakistani customer ordering products. haan ji nahi order krna chahiye delivery kab address name phone number ghar mohalla gali COD cash on delivery kitne ka hai price sasta mehenga theek hai bhej do confirm Lahore Karachi Islamabad Rawalpindi Faisalabad Peshawar trimmer remover nebulizer',
  });
  let whisperMs = Date.now() - startTime;
  console.log(`[Media] Voice: Whisper returned in ${whisperMs}ms`);

  // Whisper cost: $0.006 per minute of audio
  const estimatedSec = Math.max(1, buffer.length / 12000);
  let costUsd = (estimatedSec / 60) * 0.006;

  let text = transcription.text;

  // Post-process: If Whisper returned non-Latin script, transliterate to Roman Urdu
  const hasNonLatin = /[\u0600-\u06FF\u0900-\u097F\u0980-\u09FF]/.test(text);
  if (hasNonLatin) {
    console.log(`[Media] Whisper returned non-Latin script, transliterating: "${text}"`);
    try {
      const tlStart = Date.now();
      const tlResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        messages: [
          { role: 'system', content: 'Convert the following text to Roman Urdu (English letters). Keep the meaning exactly same. Output ONLY the transliterated text, nothing else.' },
          { role: 'user', content: text }
        ],
      });
      const tlText = tlResponse.choices[0]?.message?.content?.trim();
      if (tlText && tlText.length > 0) {
        console.log(`[Media] Transliterated: "${text}" → "${tlText}"`);
        text = tlText;
      }
      const tlTokensIn = tlResponse.usage?.prompt_tokens || 0;
      const tlTokensOut = tlResponse.usage?.completion_tokens || 0;
      costUsd += (tlTokensIn * 0.15 + tlTokensOut * 0.60) / 1000000;
      whisperMs += (Date.now() - tlStart);
    } catch (e) {
      console.warn('[Media] Transliteration failed, using original:', e.message);
    }
  }

  const costRs = costUsd * 300;
  console.log(`[Media] Voice transcribed (${estimatedSec.toFixed(0)}s, Rs.${costRs.toFixed(2)}): "${text}"`);
  return {
    text,
    cost_rs: costRs,
    duration_sec: estimatedSec,
    response_ms: whisperMs,
    model: 'Whisper',
  };
}

/**
 * Analyze image using GPT-4o mini Vision
 * Returns description of what's in the image
 */
async function analyzeImage(mediaId, accessToken, openaiApiKey) {
  const openai = getOpenAI(openaiApiKey);
  const { buffer, mimeType } = await downloadMedia(mediaId, accessToken);

  // Resize image to max 512px — keeps cost low (~Rs.0.03-0.05) while recognizing products
  const MAX_IMG_PX = 512;
  let resizedBuffer;
  try {
    resizedBuffer = await sharp(buffer)
      .resize(MAX_IMG_PX, MAX_IMG_PX, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (e) {
    console.warn('[Media] Image resize failed, using original:', e.message);
    resizedBuffer = buffer;
  }
  const mediaType = 'image/jpeg';
  const base64 = resizedBuffer.toString('base64');

  const startTime = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mediaType};base64,${base64}` }
        },
        {
          type: 'text',
          text: 'This image is from a WhatsApp customer of a Pakistani ecommerce store. Our products: T9 Trimmer (gold metal hair trimmer), Blackhead Remover, Cutting Board, Oil Spray bottle, Ear Wax Kit, Vegetable Cutter, Facial Hair Remover (pink/rose gold), Nebulizer, Knee Sleeve, Duster Kit. Identify which product this is if possible. Reply in 1 short sentence in Roman Urdu. If there is text, mention it.'
        }
      ]
    }]
  });
  const responseMs = Date.now() - startTime;

  const description = response.choices[0]?.message?.content || 'Image received';
  const tokensIn = response.usage?.prompt_tokens || 0;
  const tokensOut = response.usage?.completion_tokens || 0;
  // GPT-4o mini pricing: $0.15/1M input, $0.60/1M output
  const costUsd = (tokensIn * 0.15 + tokensOut * 0.60) / 1000000;
  const costRs = costUsd * 300;

  console.log(`[Media] Image analyzed (${tokensIn}+${tokensOut} tokens, Rs.${costRs.toFixed(2)}): "${description}"`);
  return {
    text: description,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_rs: costRs,
    response_ms: responseMs,
    model: 'GPT-4o mini Vision',
  };
}

module.exports = { transcribeVoice, analyzeImage, downloadMedia };
