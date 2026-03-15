/**
 * Location utilities — reverse geocoding + nearby landmarks
 * Primary: Google Maps screenshot + GPT-4o mini vision (best results)
 * Fallback: OpenStreetMap Overpass API (if screenshot fails)
 */

const https = require('https');
const http = require('http');

// Debug: store last location analysis details
const _debugLog = [];
function logDebug(msg) {
  _debugLog.push({ t: new Date().toISOString(), msg });
  if (_debugLog.length > 50) _debugLog.shift();
}
function getDebugLog() { return _debugLog; }

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
async function analyzeScreenshot(imageBuffer, apiKey) {
  const base64Image = imageBuffer.toString('base64');
  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'This is a Google Maps screenshot with a red pin marker. List ALL visible place names — every shop, mosque, masjid, restaurant, bakery, sweets, clinic, hospital, school, college, academy, campus, university, park, salon, petrol pump, bank, pharmacy, office, store, hotel, and any other labeled business or landmark. IMPORTANT: Sort by proximity to the red pin — places CLOSEST to the pin marker first, farthest last. Schools/colleges/academies/campuses must use type "school". Return ONLY a JSON array: [{"name":"Place Name","type":"shop/mosque/restaurant/bakery/clinic/hospital/park/school/salon/petrol_pump/bank/pharmacy/other"}]. No explanation, just valid JSON array.'
        },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + base64Image } }
      ]
    }],
    max_tokens: 1000,
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

  logDebug(`GPT raw response: ${result.substring(0, 300)}`);
  const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    const places = JSON.parse(cleaned);
    logDebug(`GPT parsed ${Array.isArray(places) ? places.length : 0} places`);
    return Array.isArray(places) ? places : [];
  } catch (e) {
    logDebug(`GPT parse FAILED: ${cleaned.substring(0, 200)}`);
    return [];
  }
}

async function findNearbyGoogleMaps(lat, lng, apiKey) {
  if (!apiKey) throw new Error('No API key');

  // Take 2 screenshots at different zoom levels in parallel:
  // 18z = area view (bigger landmarks, mosques, hospitals, schools)
  // 20z = close-up (small shops, bakeries, salons visible at higher zoom)
  const baseUrl = `https://image.thum.io/get/width/1280/crop/900`;
  const url18 = `${baseUrl}/https://www.google.com/maps/search/?api=1&query=${lat},${lng}&zoom=18`;
  const url20 = `${baseUrl}/https://www.google.com/maps/search/?api=1&query=${lat},${lng}&zoom=20`;

  logDebug(`Starting screenshots for ${lat},${lng}`);
  console.log('[Location] Taking Google Maps screenshots (18z + 20z)...');
  const [buf18, buf20] = await Promise.all([
    fetchBuffer(url18, 45000).catch(e => { logDebug(`18z fetch FAILED: ${e.message}`); return null; }),
    fetchBuffer(url20, 45000).catch(e => { logDebug(`20z fetch FAILED: ${e.message}`); return null; }),
  ]);

  logDebug(`Screenshots done: 18z=${buf18?.length || 0}b, 20z=${buf20?.length || 0}b`);

  // Analyze both screenshots in parallel
  const analyses = [];
  if (buf18 && buf18.length > 10000) {
    analyses.push(analyzeScreenshot(buf18, apiKey).catch(e => { logDebug(`18z GPT FAILED: ${e.message}`); return []; }));
  } else {
    logDebug(`18z too small or null: ${buf18?.length || 0}b`);
  }
  if (buf20 && buf20.length > 10000) {
    analyses.push(analyzeScreenshot(buf20, apiKey).catch(e => { logDebug(`20z GPT FAILED: ${e.message}`); return []; }));
  } else {
    logDebug(`20z too small or null: ${buf20?.length || 0}b`);
  }

  if (analyses.length === 0) {
    logDebug('No valid screenshots — throwing');
    throw new Error('No screenshots available');
  }

  const results = await Promise.all(analyses);

  // Merge + deduplicate (by name, case-insensitive)
  const seen = new Set();
  const merged = [];
  for (const places of results) {
    for (const p of places) {
      const key = (p.name || '').toLowerCase().trim();
      if (key.length > 1 && !seen.has(key)) {
        seen.add(key);
        merged.push({ name: p.name, type: p.type || 'place', distance: 0 });
      }
    }
  }

  logDebug(`Google Maps total unique places: ${merged.length}`);
  console.log('[Location] Google Maps total unique places:', merged.length);
  return merged;
}

/**
 * FALLBACK: OpenStreetMap Overpass API
 */
async function findNearbyOSM(lat, lng) {
  const query = `[out:json][timeout:10];(
    node(around:200,${lat},${lng})["amenity"];
    node(around:200,${lat},${lng})["shop"];
    node(around:200,${lat},${lng})["name"]["building"];
    way(around:200,${lat},${lng})["amenity"];
    way(around:200,${lat},${lng})["shop"];
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
 * Get nearest key landmarks (school, hospital, mosque) from OSM
 */
async function getNearestKeyPlaces(lat, lng) {
  try {
    const query = `[out:json][timeout:10];(
      node(around:500,${lat},${lng})["amenity"="school"];
      way(around:500,${lat},${lng})["amenity"="school"];
      node(around:500,${lat},${lng})["amenity"="hospital"];
      way(around:500,${lat},${lng})["amenity"="hospital"];
      node(around:500,${lat},${lng})["amenity"="place_of_worship"];
      way(around:500,${lat},${lng})["amenity"="place_of_worship"];
    );out center;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const data = await fetchJSON(url, 10000);
    if (!data || !data.elements) return [];

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
          type: e.tags.amenity || 'place',
          distance: Math.round(haversine(lat, lng, eLat, eLon)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
  } catch (e) {
    return [];
  }
}

/**
 * Find nearby landmarks — Google Maps + OSM key places supplement
 */
async function findNearbyLandmarks(lat, lng, apiKey) {
  // Run Google Maps screenshots + OSM key places in parallel
  const [gmapsResults, keyPlaces] = await Promise.all([
    (async () => {
      try {
        const r = await findNearbyGoogleMaps(lat, lng, apiKey);
        console.log('[Location] Google Maps results:', r.length, 'places');
        return r;
      } catch (e) {
        console.warn('[Location] Google Maps screenshot failed:', e.message);
        return [];
      }
    })(),
    getNearestKeyPlaces(lat, lng).catch(() => []),
  ]);

  // Hybrid: OSM nearest school/mosque/hospital + Google Maps shops/restaurants/salons
  if (gmapsResults.length > 0 || keyPlaces.length > 0) {
    const combined = [];
    const usedNames = new Set();

    // 1) Add nearest school, mosque, hospital from OSM (accurate distance)
    const osmTypes = ['school', 'place_of_worship', 'hospital'];
    for (const osmType of osmTypes) {
      const nearest = keyPlaces.find(kp => kp.type === osmType && !usedNames.has(kp.name.toLowerCase().trim()));
      if (nearest) {
        const displayType = osmType === 'place_of_worship' ? 'mosque' : osmType;
        combined.push({ name: nearest.name, type: displayType, distance: nearest.distance });
        usedNames.add(nearest.name.toLowerCase().trim());
        logDebug(`OSM nearest ${displayType}: ${nearest.name} (${nearest.distance}m)`);
      }
    }

    // 2) Add ALL Google Maps places (including schools not in OSM)
    for (const gp of gmapsResults) {
      const key = gp.name.toLowerCase().trim();
      if (!usedNames.has(key)) {
        combined.push(gp);
        usedNames.add(key);
      }
    }

    logDebug(`Combined: ${combined.length} places (${combined.filter(c=>c.distance>0).length} from OSM)`);
    return combined;
  }

  // Fallback to full OSM if Google Maps failed
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
    // Pick diverse types — prioritize key landmarks, allow 2 schools/mosques
    const picked = [];
    const usedNames = new Set();
    const pickOne = (type) => {
      const match = landmarks.find(l => l.type === type && !usedNames.has(l.name));
      if (match) { picked.push(match); usedNames.add(match.name); }
    };
    // Key landmarks first (nearest from OSM come first in list)
    pickOne('mosque'); pickOne('school'); pickOne('hospital');
    // Second school (Google Maps one, different from OSM)
    pickOne('school');
    // Other types
    const otherTypes = ['bakery', 'park', 'restaurant', 'fast_food', 'salon', 'clinic', 'bank', 'petrol_pump', 'fuel', 'pharmacy', 'shop', 'supermarket', 'sweets', 'place_of_worship', 'other'];
    for (const t of otherTypes) {
      if (picked.length >= 8) break;
      pickOne(t);
    }
    // Fill remaining up to 8
    for (const lm of landmarks) {
      if (picked.length >= 8) break;
      if (!usedNames.has(lm.name)) { picked.push(lm); usedNames.add(lm.name); }
    }
    for (const lm of picked) {
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

module.exports = { reverseGeocode, findNearbyLandmarks, analyzeLocation, getDebugLog };
