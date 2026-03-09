/**
 * WhatsApp Cloud API — Message Sender
 *
 * Sends text messages back to WhatsApp users via Meta Graph API.
 * Also handles marking messages as "read" (blue ticks).
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Send a text message to a WhatsApp number.
 * @param {string} to — Recipient phone (international format: 923001234567)
 * @param {string} text — Message body
 * @param {string} phoneNumberId — WhatsApp Business phone number ID
 * @param {string} accessToken — Meta access token
 */
async function sendMessage(to, text, phoneNumberId, accessToken) {
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[WA Send] Error:', data.error?.message || JSON.stringify(data));
      return { success: false, error: data.error?.message || 'Unknown error' };
    }

    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WA Send] Network error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Mark a message as read (blue ticks).
 * @param {string} messageId — WhatsApp message ID (wamid.xxx)
 * @param {string} phoneNumberId — WhatsApp Business phone number ID
 * @param {string} accessToken — Meta access token
 */
async function markAsRead(messageId, phoneNumberId, accessToken) {
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch (err) {
    // Non-critical — don't crash if read receipt fails
    console.error('[WA Read] Error:', err.message);
  }
}

/**
 * Convert local Pakistani phone (03001234567) to international format (923001234567).
 */
function toInternational(phone) {
  if (!phone) return phone;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '92' + digits.slice(1);
  if (!digits.startsWith('92')) digits = '92' + digits;
  return digits;
}

/**
 * Send an image message via URL.
 * @param {string} to — Recipient phone (international format)
 * @param {string} imageUrl — Public URL of the image
 * @param {string} caption — Optional caption text
 * @param {string} phoneNumberId — WhatsApp Business phone number ID
 * @param {string} accessToken — Meta access token
 */
async function sendImage(to, imageUrl, caption, phoneNumberId, accessToken) {
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;
  try {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: { link: imageUrl },
    };
    if (caption) body.image.caption = caption;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[WA SendImage] Error:', data.error?.message || JSON.stringify(data));
      return { success: false, error: data.error?.message || 'Unknown error' };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WA SendImage] Network error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a video message via URL.
 * @param {string} to — Recipient phone (international format)
 * @param {string} videoUrl — Public URL of the video
 * @param {string} caption — Optional caption text
 * @param {string} phoneNumberId — WhatsApp Business phone number ID
 * @param {string} accessToken — Meta access token
 */
async function sendVideo(to, videoUrl, caption, phoneNumberId, accessToken) {
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;
  try {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { link: videoUrl },
    };
    if (caption) body.video.caption = caption;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[WA SendVideo] Error:', data.error?.message || JSON.stringify(data));
      return { success: false, error: data.error?.message || 'Unknown error' };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WA SendVideo] Network error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send an audio message via URL (plays as voice note in WhatsApp).
 * @param {string} to — Recipient phone (international format)
 * @param {string} audioUrl — Public URL of the audio file (mp3/ogg)
 * @param {string} phoneNumberId — WhatsApp Business phone number ID
 * @param {string} accessToken — Meta access token
 */
async function sendAudio(to, audioUrl, phoneNumberId, accessToken) {
  const url = `${GRAPH_API}/${phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'audio',
        audio: { link: audioUrl },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[WA SendAudio] Error:', data.error?.message || JSON.stringify(data));
      return { success: false, error: data.error?.message || 'Unknown error' };
    }
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    console.error('[WA SendAudio] Network error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendMessage, sendImage, sendVideo, sendAudio, markAsRead, toInternational };
