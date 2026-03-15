/**
 * Location utilities — reverse geocoding + nearby landmarks
 * Uses OpenStreetMap Nominatim (free) + Overpass API (free)
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
 * Find nearby landmarks (mosques, schools, shops, hospitals, etc.) within radius
 * Uses Overpass API (OpenStreetMap)
 */
async function findNearbyLandmarks(lat, lng, radiusMeters = 50) {
  try {
    // Overpass query: find amenities, shops, and named buildings within radius
    // Include both nodes AND ways (many shops/buildings are mapped as ways in OSM)
    const query = `[out:json][timeout:10];(
      node(around:${radiusMeters},${lat},${lng})["amenity"];
      node(around:${radiusMeters},${lat},${lng})["shop"];
      node(around:${radiusMeters},${lat},${lng})["name"]["building"];
      node(around:${radiusMeters},${lat},${lng})["name"]["office"];
      node(around:${radiusMeters},${lat},${lng})["name"]["leisure"];
      way(around:${radiusMeters},${lat},${lng})["amenity"];
      way(around:${radiusMeters},${lat},${lng})["shop"];
      way(around:${radiusMeters},${lat},${lng})["name"]["building"];
    );out center 20;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const data = await fetchJSON(url, 10000);

    if (!data || !data.elements || data.elements.length === 0) return [];

    // Calculate distance and sort by proximity
    const toRad = (deg) => deg * Math.PI / 180;
    const haversine = (lat1, lon1, lat2, lon2) => {
      const R = 6371000; // meters
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const landmarks = data.elements
      .filter(e => e.tags && e.tags.name)
      .map(e => {
        // Ways use center coordinates (from "out center"), nodes use direct lat/lon
        const eLat = e.lat || e.center?.lat;
        const eLon = e.lon || e.center?.lon;
        if (!eLat || !eLon) return null;
        return {
          name: e.tags.name,
          type: e.tags.amenity || e.tags.shop || e.tags.building || e.tags.office || e.tags.leisure || 'place',
          distance: Math.round(haversine(lat, lng, eLat, eLon)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10); // Top 10 nearest

    return landmarks;
  } catch (e) {
    console.error('[Location] Nearby landmarks failed:', e.message);
    return [];
  }
}

/**
 * Full location analysis — reverse geocode + nearby landmarks
 * Returns a formatted message for the customer
 */
async function analyzeLocation(lat, lng) {
  // Run reverse geocode + nearby landmarks in parallel
  // Use 500m radius to get enough results (OSM Pakistan data is sparse)
  // Sort by distance so closest ones show first
  const [geo, landmarks] = await Promise.all([
    reverseGeocode(lat, lng),
    findNearbyLandmarks(lat, lng, 500),
  ]);

  const result = {
    lat, lng,
    area: geo?.area || '',
    road: geo?.road || '',
    city: '',
    landmarks: landmarks || [],
    formattedAddress: '',
    customerMessage: '',
  };

  // Determine city (clean up Urdu script)
  if (geo) {
    // Extract English city name from display_name or town/city fields
    const cityRaw = geo.town || geo.city || '';
    // Common Karachi divisions show as "کراچی ڈویژن" — map to Karachi
    if (/karachi|کراچی/i.test(cityRaw) || /karachi|کراچی/i.test(geo.displayName)) {
      result.city = 'Karachi';
    } else if (/lahore|لاہور/i.test(cityRaw) || /lahore|لاہور/i.test(geo.displayName)) {
      result.city = 'Lahore';
    } else if (/islamabad|اسلام/i.test(cityRaw) || /islamabad|اسلام/i.test(geo.displayName)) {
      result.city = 'Islamabad';
    } else if (/rawalpindi|راولپنڈی/i.test(cityRaw) || /rawalpindi|راولپنڈی/i.test(geo.displayName)) {
      result.city = 'Rawalpindi';
    } else {
      // Try to extract city from display_name (format: "..., CityName, ...")
      const parts = (geo.displayName || '').split(',').map(p => p.trim());
      // Find first part that looks like an English city name
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
      clinic: '🏥', pharmacy: '💊', bank: '🏦', fuel: '⛽',
      restaurant: '🍽️', fast_food: '🍔', supermarket: '🛒',
    };
    for (const lm of landmarks.slice(0, 5)) {
      const icon = typeIcons[lm.type] || '📍';
      msg += `${icon} ${lm.name} (~${lm.distance}m)\n`;
    }
  }

  msg += `\nApna ghar/shop number aur qareeb ki koi mashoor jagah bata dein — taake rider asaani se pohonch sake 🚚`;

  result.customerMessage = msg;
  return result;
}

module.exports = { reverseGeocode, findNearbyLandmarks, analyzeLocation };
