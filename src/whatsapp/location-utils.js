/**
 * Location utilities — reverse geocoding + nearby landmarks
 * Primary: Google Maps screenshot + GPT-4o mini vision (best results)
 * Fallback: OpenStreetMap Overpass API (if screenshot fails)
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

function fetchBuffer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Screenshot timeout')), timeout);
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
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
 * PRIMARY: Google Maps screenshot + GPT-4o mini vision
 */
async function findNearbyGoogleMaps(lat, lng, apiKey) {
  // Step 1: Screenshot via thum.io (free, 45s timeout for first-time renders)
  const mapsUrl = `https://www.google.com/maps/@${lat},${lng},18z`;
  const screenshotUrl = `https://image.thum.io/get/width/1280/crop/900/${mapsUrl}`;

  console.log('[Location] Taking Google Maps screenshot...');
  const imageBuffer = await fetchBuffer(screenshotUrl, 45000);

  if (!imageBuffer || imageBuffer.length < 10000) {
    throw new Error('Screenshot too small: ' + (imageBuffer?.length || 0) + ' bytes');
  }
  console.log('[Location] Screenshot OK:', imageBuffer.length, 'bytes');

  // Step 2: GPT-4o mini vision analysis
  if (!apiKey) throw new Error('No API key');

  const base64Image = imageBuffer.toString('base64');
  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'This is a Google Maps screenshot. List ALL visible place names — every shop, mosque, masjid, restaurant, bakery, sweets, clinic, hospital, school, park, salon, petrol pump, bank, pharmacy, office, store, hotel, and any other labeled business or landmark. Return ONLY a JSON array: [{"name":"Place Name","type":"shop/mosque/restaurant/bakery/clinic/hospital/park/school/salon/petrol_pump/bank/pharmacy/other"}]. No explanation, just valid JSON array.'
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

  // Parse AI response
  const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const places = JSON.parse(cleaned);
  if (!Array.isArray(places)) return [];

  console.log('[Location] Google Maps places found:', places.length);
  return places.map(p => ({
    name: p.name || '',
    type: p.type || 'place',
    distance: 0,
  })).filter(p => p.name.length > 1);
}

/**
 * FALLBACK: OpenStreetMap Overpass API
 */
async function findNearbyOSM(lat, lng) {
  const query = `[out:json][timeout:10];(
    node(around:500,${lat},${lng})["amenity"];
    node(around:500,${lat},${lng})["shop"];
    node(around:500,${lat},${lng})["name"]["building"];
    way(around:500,${lat},${lng})["amenity"];
    way(around:500,${lat},${lng})["shop"];
  );out center 20;`;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const data = await fetchJSON(url, 12000);
  if (!data || !data.elements || data.elements.length === 0) return [];

  const toRad = (deg) => deg * Math.PI / 180;
  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  return data.elements
    .filter(e => e.tags && e.tags.name)
    .map(e => {
      const eLat = e.lat || e.center?.lat;
      const eLon = e.lon || e.center?.lon;
      if (!eLat || !eLon) return null;
      return {
        name: e.tags.name,
        type: e.tags.amenity || e.tags.shop || 'place',
        distance: Math.round(haversine(lat, lng, eLat, eLon)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);
}

/**
 * Find nearby landmarks — tries Google Maps first, falls back to OSM
 */
async function findNearbyLandmarks(lat, lng, apiKey) {
  // Try Google Maps screenshot approach first
  try {
    const gmapsResults = await findNearbyGoogleMaps(lat, lng, apiKey);
    if (gmapsResults.length > 0) return gmapsResults;
  } catch (e) {
    console.warn('[Location] Google Maps screenshot failed:', e.message, '— falling back to OSM');
  }

  // Fallback to OSM Overpass
  try {
    return await findNearbyOSM(lat, lng);
  } catch (e) {
    console.error('[Location] OSM fallback also failed:', e.message);
    return [];
  }
}

/**
 * Full location analysis — reverse geocode + nearby landmarks
 */
async function analyzeLocation(lat, lng, apiKey) {
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

  // Determine city
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
      mosque: '🕌', place_of_worship: '🕌', school: '🏫', hospital: '🏥',
      clinic: '🏥', pharmacy: '💊', restaurant: '🍽️', fast_food: '🍔',
      bakery: '🍞', sweets: '🍰', park: '🌳', salon: '💇', shop: '🏪',
      fuel: '⛽', petrol_pump: '⛽', bank: '🏦', supermarket: '🛒', other: '📍',
    };
    for (const lm of landmarks.slice(0, 6)) {
      const icon = typeIcons[lm.type] || '📍';
      const dist = lm.distance ? ` (~${lm.distance}m)` : '';
      msg += `${icon} ${lm.name}${dist}\n`;
    }
  }

  msg += `\n🗺️ Map: ${result.googleMapsLink}`;
  msg += `\n\nApna ghar/shop number aur qareeb ki koi mashoor jagah bata dein — taake rider asaani se pohonch sake 🚚`;

  result.customerMessage = msg;
  return result;
}

module.exports = { reverseGeocode, findNearbyLandmarks, analyzeLocation };
