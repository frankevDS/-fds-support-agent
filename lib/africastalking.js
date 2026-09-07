// Africa's Talking SMS. Docs: developers.africastalking.com/docs/sms/overview
const AT_ENDPOINT = 'https://api.africastalking.com/version1/messaging';

async function sendSms(store, { to, message }) {
  if (!store.africastalking_api_key) throw new Error('Store has no Africa\'s Talking API key');

  const body = new URLSearchParams({
    username: store.africastalking_username,
    to: to.join(','),
    message,
  });

  const res = await fetch(AT_ENDPOINT, {
    method: 'POST',
    headers: {
      apiKey: store.africastalking_api_key,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  if (!res.ok) throw new Error(`Africa's Talking send failed (${res.status})`);
  return res.json();
}

module.exports = { sendSms };
