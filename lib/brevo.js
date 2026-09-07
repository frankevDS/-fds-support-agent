// Brevo transactional/marketing email. Docs: developers.brevo.com
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

async function sendEmail(store, { to, subject, htmlContent }) {
  if (!store.brevo_api_key) throw new Error('Store has no Brevo API key');

  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': store.brevo_api_key,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: store.name, email: `no-reply@${store.domain}` },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) throw new Error(`Brevo send failed (${res.status})`);
  return res.json();
}

module.exports = { sendEmail };
