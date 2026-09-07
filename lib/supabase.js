const { createClient } = require('@supabase/supabase-js');

let client;

function getSupabase() {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return client;
}

// Very simple keyword search over the knowledge_base table, scoped to one store.
// Good enough to start with; swap for pgvector similarity search once
// a store has more than ~50 entries.
async function searchKnowledgeBase(storeId, query, limit = 4) {
  const supabase = getSupabase();
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);

  if (words.length === 0) return [];

  const orFilter = words
    .map((w) => `content.ilike.%${w}%,title.ilike.%${w}%`)
    .join(',');

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('title, content')
    .eq('store_id', storeId)
    .or(orFilter)
    .limit(limit);

  if (error) {
    console.error('Supabase KB search error:', error.message);
    return [];
  }
  return data || [];
}

async function logConversation({ storeId, sessionId, role, content }) {
  const supabase = getSupabase();
  const { error } = await supabase.from('conversations').insert({
    store_id: storeId,
    session_id: sessionId,
    role,
    content,
  });
  if (error) console.error('Supabase log error:', error.message);
}

module.exports = { getSupabase, searchKnowledgeBase, logConversation };
