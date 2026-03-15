/**
 * Location utilities — reverse geocoding + nearby landmarks
 * Uses OpenStreetMap Nominatim (free) + Google Maps screenshot + GPT-4o mini
 */

const https = require('https');
const http = require('http');

function fetchJSON(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'NurevaBot/1.0 (delivery-address)' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

function fetchBuffer(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Screenshot timeout')), timeout);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        return fetchBuffer(res.headers.location, timeout).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Reverse geocode coordinates → area, city, road
 */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const data = await fetchJSON(url);
    if (!data || !data.address) return null;

    const addr = data.address;
    return {
      area: addr.neighbourhood || addr.suburb || addr.quarter || '',
      road: addr.road || '',
      town: addr.town || addr.city || addr.village || '',
      city: addr.city || addr.town || addr.village || addr.state || '',
      district: addr.city_district || '',
      postcode: addr.postcode || '',
      displayName: data.display_name || '',
    };
  } catch (e) {
    console.error('[Location] Reverse geocode failed:', e.message);
    return null;
  }
}

/**
 * Find nearby landmarks using Google Maps screenshot + GPT-4o mini vision
 * Takes screenshot of Google Maps at coordinates, then AI reads place names
 */
async function findNearbyLandmarks(lat, lng, apiKey) {
  try {
    // Step 1: Take screenshot of Google Maps via free screenshot service
    const mapsUrl = `https://www.google.com/maps/@${lat},${lng},18z`;
    const screenshotUrl = `https://image.thum.io/get/width/1280/crop/900/${mapsUrl}`;

    console.log('[Location] Taking Google Maps screenshot for', lat, lng);
    const imageBuffer = await fetchBuffer(screenshotUrl, 25000);

    if (!imageBuffer || imageBuffer.length < 10000) {
      console.warn('[Location] Screenshot too small:', imageBuffer?.length, 'bytes');
      return [];
    }

    console.log('[Location] Screenshot received:', imageBuffer.length, 'bytes');

    // Step 2: Send to GPT-4o mini for place extraction
    apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      console.error('[Location] No OpenAI API key for vision analysis');
      return [];
    }

    const base64Image = imageBuffer.toString('base64');
    const payload = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'This is a Google Maps screenshot. List ALL visible place names (shops, mosques, restaurants, clinics, schools, parks, salons, etc). Return ONLY a JSON array: [{"name":"Place Name","type":"shop/mosque/restaurant/clinic/park/school/salon/other"}]. No explanation, just valid JSON array.'
          },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + base64Image } }
        ]
      }],
      max_tokens: 500,
      temperature: 0.1,
    });

    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.choices?.[0]?.message?.content || '[]');
          } catch (e) { resolve('[]'); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    // Step 3: Parse AI response
    let places = [];
    try {
      // Remove markdown code block if present
      const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      places = JSON.parse(cleaned);
    } catch (e) {
      console.error('[Location] Failed to parse AI response:', result.substring(0, 200));
      return [];
    }

    if (!Array.isArray(places)) return [];

    console.log('[Location] Google Maps places found:', places.length);
    return places.map(p => ({
      name: p.name || '',
      type: p.type || 'place',
      distance: 0, // Distance not available from screenshot
    })).filter(p => p.name.length > 1);

  } catch (e) {
    console.error('[Location] Google Maps screenshot analysis failed:', e.message);
    return [];
  }
}

/**
 * Full location analysis — reverse geocode + Google Maps nearby places
 * Returns a formatted message for the customer
 */
async function analyzeLocation(lat, lng, apiKey) {
  // Run reverse geocode + Google Maps screenshot in parallel
  const [geo, landmarks] = await Promise.all([
    reverseGeocode(lat, lng),
    findNearbyLandmarks(lat, lng, apiKey),
  ]);

  const result = {
    lat, lng,
    area: geo?.area || '',
    road: geo?.road || '',
    city: '',
    landmarks: landmarks || [],
    formattedAddress: '',
    customerMessage: '',
    googleMapsLink: `https://maps.google.com/?q=${lat},${lng}`,
  };

  // Determine city (clean up Urdu script)
  if (geo) {
    const cityRaw = geo.town || geo.city || '';
    if (/karachi|کراچی/i.test(cityRaw) || /karachi|کراچی/i.test(geo.displayName)) {
      result.city = 'Karachi';
    } else if (/lahore|لاہور/i.test(cityRaw) || /lahore|لاہور/i.test(geo.displayName)) {
      result.city = 'Lahore';
    } else if (/islamabad|اسلام/i.test(cityRaw) || /islamabad|اسلام/i.test(geo.displayName)) {
      result.city = 'Islamabad';
    } else if (/rawalpindi|راولپنڈی/i.test(cityRaw) || /rawalpindi|راولپنڈی/i.test(geo.displayName)) {
      result.city = 'Rawalpindi';
    } else {
      const parts = (geo.displayName || '').split(',').map(p => p.trim());
      for (const p of parts) {
        if (/^[A-Z][a-z]/.test(p) && p.length >= 4 && p.length <= 30) {
          result.city = p;
          break;
        }
      }
      if (!result.city) result.city = cityRaw;
    }
  }

  // Build formatted address
  const addrParts = [];
  if (result.area) addrParts.push(result.area);
  if (result.road && result.road !== result.area) addrParts.push(result.road);
  result.formattedAddress = addrParts.join(', ');

  // Build customer-facing message
  let msg = `📍 Aapki location detect hui:\n`;
  if (result.area) msg += `📌 Area: ${result.area}`;
  if (result.city) msg += `, ${result.city}`;
  msg += '\n';

  if (landmarks.length > 0) {
    msg += '\nQareeb ki jagahein:\n';
    const typeIcons = {
      mosque: '🕌', school: '🏫', hospital: '🏥', clinic: '🏥',
      pharmacy: '💊', restaurant: '🍽️', park: '🌳', salon: '💇',
      shop: '🏪', other: '📍',
    };
    for (const lm of landmarks.slice(0, 6)) {
      const icon = typeIcons[lm.type] || '📍';
      msg += `${icon} ${lm.name}\n`;
    }
  }

  msg += `\n🗺️ Map: ${result.googleMapsLink}`;
  msg += `\n\nApna ghar/shop number aur qareeb ki koi mashoor jagah bata dein — taake rider asaani se pohonch sake 🚚`;

  result.customerMessage = msg;
  return result;
}

module.exports = { reverseGeocode, findNearbyLandmarks, analyzeLocation };
