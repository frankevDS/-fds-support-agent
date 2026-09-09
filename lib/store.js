const { getSupabase } = require('./supabase');

const cache = new Map();
const phoneIdCache = new Map();

// Looks up a store by its slug (e.g. 'fds') or by domain (e.g. 'frankevdigitalservices.com').
async function getStore(idOrDomain) {
  if (cache.has(idOrDomain)) return cache.get(idOrDomain);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .or(`id.eq.${idOrDomain},domain.eq.${idOrDomain}`)
    .maybeSingle();

  if (error) {
    console.error('Store lookup error:', error.message);
    return null;
  }
  if (data) cache.set(idOrDomain, data);
  return data;
}

// Looks up a store by its WhatsApp Business phone_number_id, used by the
// webhook to figure out which store an incoming WhatsApp message is for.
async function getStoreByWhatsAppPhoneId(phoneNumberId) {
  if (phoneIdCache.has(phoneNumberId)) return phoneIdCache.get(phoneNumberId);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error('Store lookup by WhatsApp phone ID error:', error.message);
    return null;
  }
  if (data) phoneIdCache.set(phoneNumberId, data);
  return data;
}

module.exports = { getStore, getStoreByWhatsAppPhoneId };
