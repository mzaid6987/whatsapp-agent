const path = require('path');
const { initDb } = require('./src/db');

async function main() {
  await initDb(path.join(__dirname, 'data', 'store.db'));

  const { sendVideo, toInternational } = require('./src/whatsapp/sender');
  const settingsModel = require('./src/db/models/settings');

  const accessToken = settingsModel.get('meta_whatsapp_token', '');
  const phoneNumberId = settingsModel.get('meta_phone_number_id', '');
  const phone = toInternational('03030553555');
  const videoUrl = 'https://wa.nuvenza.shop/media/p6_1772973131581.mp4';

  console.log('Sending video to', phone);
  const r = await sendVideo(phone, videoUrl, '4 in 1 Electric Vegetable Cutter ✅ One button operation, USB rechargeable, 4 blades included. Order confirm karein?', phoneNumberId, accessToken);
  console.log('Result:', JSON.stringify(r));
}
main().catch(e => console.error(e));
