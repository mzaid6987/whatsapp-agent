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
- "tez" near "achi/quality/hai na" → "cheez" (Whisper hears "cheez to achi hai na" as "tez to achi hai na")
- "even/Ivan/heaven" near "cheez/product/quality" → "A1" (meaning good quality)
- "receive car/receive car" → "receive kar" (will receive)
- "Wa Alaikum Assalam" at START of message → "Assalamu Alaikum" (Whisper sometimes reverses the greeting — customer is initiating, not responding)
- "beech/beach" + number near address context → "B" + number (e.g. "beech 38" → "B 36"). Customer saying house/block letter in Urdu pronunciation.
- "Ginna/Gina/Jinna" near "Square/colony/road" → "Jinnah" (Jinnah Square, Jinnah Colony etc.)
- "Griyaanay/Giriyanay/Griana/Gariyana" near "shop/dukan/store" → "kiryana" (kiryana = grocery store in Urdu)
- IMPORTANT: Urdu number words MUST be converted to digits in address/gali/street/house context:
  ek=1, do=2, teen=3, char=4, panch=5, che/chhe=6, saat=7, aath=8, nau=9, das=10,
  gyarah=11, barah=12, terah=13, chaudah/chauda=14, pandrah/pandra=15, solah=16,
  satrah=17, atharah=18, unees=19, bees=20, ikkees=21, bais=22, tees=30, chalis=40, pachas=50
  Example: "gali number chaudah" → "gali number 14", "house number aath" → "house number 8"
- When customer says a price/number that gets split by Whisper (e.g. "13 199" or "1 399") → combine into single number if near price/rupay/rs context (e.g. "13 199" → "1399", "1 399" → "1399")
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
          text: 'This image is from a WhatsApp customer of a Pakistani ecommerce store.\n\nFIRST check: Is this a courier/parcel/package/shipping label/delivery slip? If YES, extract ANY visible info: name, phone number, address, city. Reply format: "[Parcel Info] Name: X, Phone: Y, Address: Z, City: W" (skip fields not visible).\n\nIf NOT a parcel/label, identify which product this matches. Our products:\n1. T9 Trimmer - gold metal hair trimmer with guide combs\n2. Blackhead Remover - white vacuum suction device with heads\n3. Cutting Board - STAINLESS STEEL flat sheet (silver metal), used for chopping food on it\n4. Oil Spray - glass bottle with spray nozzle\n5. Ear Wax Kit - set of small steel tools\n6. Vegetable Cutter - electric chopper with blades\n7. Facial Hair Remover - pink/rose gold small device\n8. Nebulizer - white medical breathing device with mask\n9. Knee Sleeve - black fabric knee support\n10. Duster Kit - extendable cleaning brush\n\nIMPORTANT: Look at ALL objects in the image, not just the most obvious one. If food/ingredients are ON a steel/metal surface, that surface is likely our Cutting Board. Reply in 1 short sentence in Roman Urdu. If there is text, mention it.'
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
