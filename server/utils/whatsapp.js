const https = require('https');

function sendWhatsApp(phone, apikey, message) {
  if (!phone || !apikey || !message) return;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apikey)}`;
  https.get(url, res => { res.resume(); }).on('error', e => {
    console.error('[WhatsApp]', e.message);
  });
}

module.exports = { sendWhatsApp };
