const { getSupabase } = require('./supabase');

const cache = new Map();

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

module.exports = { getStore };
