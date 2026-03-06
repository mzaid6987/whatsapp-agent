/**
 * WhatsApp Media Handler
 *
 * Handles voice messages (via OpenAI Whisper) and images (via GPT-4o mini Vision).
 * Downloads media from WhatsApp Cloud API, processes it, and returns text.
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const sharp = require('sharp');

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Temp directory for media files
const TEMP_DIR = path.join(__dirname, '../../temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

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

  // Save to temp file (Node < 20 doesn't have global File, so we use createReadStream)
  const tempFile = path.join(TEMP_DIR, `voice_${Date.now()}.${ext}`);
  fs.writeFileSync(tempFile, buffer);

  try {
    const startTime = Date.now();
    console.log(`[Media] Voice: calling Whisper API with ${tempFile}...`);
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
      prompt: 'Roman Urdu transcript in English letters. Pakistani customer ordering products. haan ji nahi order krna chahiye delivery kab address name phone number ghar mohalla gali COD cash on delivery kitne ka hai price sasta mehenga theek hai bhej do confirm Lahore Karachi Islamabad Rawalpindi Faisalabad Peshawar trimmer remover nebulizer',
    });
    let whisperMs = Date.now() - startTime;
    console.log(`[Media] Voice: Whisper returned in ${whisperMs}ms`);

    // Whisper cost: $0.006 per minute of audio
    const estimatedSec = Math.max(1, buffer.length / 12000);
    let costUsd = (estimatedSec / 60) * 0.006;

    let text = transcription.text;
    console.log(`[Media] Whisper raw: "${text}"`);

    // Post-process: Clean up Whisper output with GPT-4o mini
    // Whisper often garbles Roman Urdu (e.g. "telemetry" instead of "trimmer")
    // Also handles non-Latin script (Urdu/Arabic) → Roman Urdu conversion
    try {
      const cleanStart = Date.now();
      const cleanResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 300,
        messages: [
          { role: 'system', content: `You are a Pakistani WhatsApp voice message interpreter. The text below is a Whisper transcription of a Pakistani customer speaking Roman Urdu (or Urdu). Whisper often mishears Roman Urdu words.

TASK: Fix the transcription to what the customer ACTUALLY said. Convert to Roman Urdu (English letters).

Common Whisper mistakes for this store's context:
- "telemetry/telemetery" → "trimmer"
- "grade star/great star" → "order karna"
- "black hat/black head" → "blackhead remover"
- "nebula/nebulae" → "nebulizer"
- "vegetable Qatar/cater" → "vegetable cutter"
- "facial hair mover" → "facial hair remover"
- "red Easter/red duster/Easter" → "duster" (Duster Kit product)
- "knee sleep/knee sleeve" → "knee sleeve"
- "ear wax/ear works" → "ear wax kit"
- "oil spray/always pray" → "oil spray"
- "cutting board/cutting bored" → "cutting board"
- "grey duster/gray duster" → "duster kit"
- "cheese/chees" → "cheez" (thing/product)
- "even/Ivan/heaven" near "cheez/product/quality" → "A1" (meaning good quality)
- "receive car/receive car" → "receive kar" (will receive)
- Any English-sounding word that doesn't make sense in Pakistani shopping context → find the closest Roman Urdu/product match
- IMPORTANT: If customer mentions a color + random English word near "order" → likely a product name. Match to closest product.
- IMPORTANT: "A1" or "number 1" means excellent quality in Pakistani slang. Keep as-is.

Products sold: T9 Trimmer, Blackhead Remover, Cutting Board, Oil Spray, Ear Wax Kit, Vegetable Cutter, Facial Hair Remover, Nebulizer, Knee Sleeve, Duster Kit

Cities: Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, Peshawar, Sukkur, Multan, Hyderabad, Quetta, Sialkot, Gujranwala

Output ONLY the corrected Roman Urdu text. Nothing else. If the text is already correct, return it as-is.` },
          { role: 'user', content: text }
        ],
      });
      const cleanText = cleanResponse.choices[0]?.message?.content?.trim();
      if (cleanText && cleanText.length > 0 && cleanText !== text) {
        console.log(`[Media] Cleaned: "${text}" → "${cleanText}"`);
        text = cleanText;
      }
      const cleanTokensIn = cleanResponse.usage?.prompt_tokens || 0;
      const cleanTokensOut = cleanResponse.usage?.completion_tokens || 0;
      costUsd += (cleanTokensIn * 0.15 + cleanTokensOut * 0.60) / 1000000;
      whisperMs += (Date.now() - cleanStart);
    } catch (e) {
      console.warn('[Media] Voice cleanup failed, using raw:', e.message);
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
  } finally {
    try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
  }
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
