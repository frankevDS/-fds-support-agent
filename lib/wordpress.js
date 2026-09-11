// WordPress content management via the REST API + an Application Password.
// Create one at: WP Admin > Users > Profile > Application Passwords.
// This module is only ever called from admin-authenticated endpoints
// (api/admin/content.js) - never from the customer-facing chat.

function authHeader(store) {
  const token = Buffer.from(`${store.wp_username}:${store.wp_app_password}`).toString('base64');
  return `Basic ${token}`;
}

function hasWordPress(store) {
  return !!(store.wp_url && store.wp_username && store.wp_app_password);
}

function assertWordPress(store) {
  if (!hasWordPress(store)) throw new Error('Store has no WordPress credentials');
}

function base(store) {
  return store.wp_url.replace(/\/$/, '');
}

async function wpRequest(store, path, options = {}) {
  assertWordPress(store);
  const res = await fetch(`${base(store)}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(store),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WordPress request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

function jsonBody(fields) {
  return {
    method: undefined, // set by caller
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  };
}

// --- Posts ---

async function listPosts(store, { search, status = 'publish', perPage = 10 } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage), status });
  if (search) params.set('search', search);
  return wpRequest(store, `/wp-json/wp/v2/posts?${params}`);
}

async function getPost(store, postId) {
  return wpRequest(store, `/wp-json/wp/v2/posts/${postId}`);
}

async function createPost(store, { title, content, status = 'draft', categories, featuredMediaId }) {
  return wpRequest(store, '/wp-json/wp/v2/posts', {
    ...jsonBody({
      title,
      content,
      status,
      ...(categories ? { categories } : {}),
      ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
    }),
    method: 'POST',
  });
}

async function updatePost(store, postId, fields) {
  return wpRequest(store, `/wp-json/wp/v2/posts/${postId}`, {
    ...jsonBody(fields),
    method: 'POST', // WP REST API uses POST for partial updates too
  });
}

async function deletePost(store, postId, { force = false } = {}) {
  return wpRequest(store, `/wp-json/wp/v2/posts/${postId}?force=${force}`, { method: 'DELETE' });
}

// --- Pages ---

async function listPages(store, { search, status = 'publish', perPage = 10 } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage), status });
  if (search) params.set('search', search);
  return wpRequest(store, `/wp-json/wp/v2/pages?${params}`);
}

async function createPage(store, { title, content, status = 'draft' }) {
  return wpRequest(store, '/wp-json/wp/v2/pages', {
    ...jsonBody({ title, content, status }),
    method: 'POST',
  });
}

async function updatePage(store, pageId, fields) {
  return wpRequest(store, `/wp-json/wp/v2/pages/${pageId}`, {
    ...jsonBody(fields),
    method: 'POST',
  });
}

async function deletePage(store, pageId, { force = false } = {}) {
  return wpRequest(store, `/wp-json/wp/v2/pages/${pageId}?force=${force}`, { method: 'DELETE' });
}

// --- Categories ---

async function listCategories(store) {
  return wpRequest(store, '/wp-json/wp/v2/categories?per_page=100');
}

async function createCategory(store, name) {
  return wpRequest(store, '/wp-json/wp/v2/categories', {
    ...jsonBody({ name }),
    method: 'POST',
  });
}

// --- Media (e.g. for setting a featured image) ---
// imageUrl must point to a publicly reachable image; WordPress fetches
// image bytes itself only via direct upload, so we fetch it here and
// forward the raw bytes.

async function uploadMediaFromUrl(store, { imageUrl, filename }) {
  assertWordPress(store);
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Could not fetch image from ${imageUrl}`);
  const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await imageRes.arrayBuffer());

  const res = await fetch(`${base(store)}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(store),
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename || 'image.jpg'}"`,
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WordPress media upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

function siteBase(store) {
  return (store.wp_url || `https://${store.domain}`).replace(/\/$/, '');
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').trim();
}

function scoreAndRank(items, query, limit) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return items.slice(0, limit);
  return items
    .map((item) => {
      const haystack = `${item.title} ${item.excerpt}`.toLowerCase();
      const score = words.reduce((sum, w) => sum + (haystack.includes(w) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}

// Public, unauthenticated search over published pages/posts - WordPress's
// REST API exposes published content by default with no credentials
// needed, so this works even for a store that hasn't set up a WP
// application password (that's only required for the content-management
// write actions above). Used by the customer-facing support agent to
// find real pages/posts relevant to a question, with real links.
//
// Tries WordPress's own ?search= first; if that comes back empty (some
// themes/security plugins quietly weaken native search), falls back to
// pulling a broader list and ranking it client-side, same approach as the
// knowledge base search.
async function searchPublicContent(store, resource, query, perPage = 3) {
  const url = `${siteBase(store)}/wp-json/wp/v2/${resource}`;

  try {
    const searchParams = new URLSearchParams({ search: query, status: 'publish', per_page: String(perPage) });
    const res = await fetch(`${url}?${searchParams}`);
    if (res.ok) {
      const items = (await res.json()).map((item) => ({
        title: stripHtml(item.title?.rendered),
        link: item.link,
        excerpt: stripHtml(item.excerpt?.rendered).slice(0, 200),
      }));
      if (items.length > 0) return items;
    }
  } catch (err) {
    console.warn(`WordPress search (${resource}) request failed:`, err.message);
  }

  // Fallback: broader unfiltered pull, ranked client-side.
  try {
    const listParams = new URLSearchParams({ status: 'publish', per_page: '100', orderby: 'modified' });
    const res = await fetch(`${url}?${listParams}`);
    if (!res.ok) return [];
    const items = (await res.json()).map((item) => ({
      title: stripHtml(item.title?.rendered),
      link: item.link,
      excerpt: stripHtml(item.excerpt?.rendered).slice(0, 200),
    }));
    return scoreAndRank(items, query, perPage);
  } catch (err) {
    console.warn(`WordPress fallback list (${resource}) failed:`, err.message);
    return [];
  }
}

async function searchPublicPosts(store, query, perPage = 3) {
  return searchPublicContent(store, 'posts', query, perPage);
}

async function searchPublicPages(store, query, perPage = 3) {
  return searchPublicContent(store, 'pages', query, perPage);
}

// Diagnostic - shows exactly what's happening at each step, so a silent
// empty result can actually be debugged instead of guessed at. Not used
// in the live chat path; wired into api/admin/debug-search.js.
async function diagnoseSiteSearch(store, query) {
  const result = { siteBase: siteBase(store), rootApi: null, pages: null, posts: null };

  try {
    const rootRes = await fetch(`${siteBase(store)}/wp-json/`);
    result.rootApi = { status: rootRes.status, ok: rootRes.ok };
    if (!rootRes.ok) result.rootApi.bodySnippet = (await rootRes.text()).slice(0, 300);
  } catch (err) {
    result.rootApi = { error: err.message };
  }

  for (const resource of ['pages', 'posts']) {
    try {
      const searchParams = new URLSearchParams({ search: query, status: 'publish', per_page: '5' });
      const res = await fetch(`${siteBase(store)}/wp-json/wp/v2/${resource}?${searchParams}`);
      const bodyText = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        parsed = null;
      }
      result[resource] = {
        status: res.status,
        ok: res.ok,
        searchResultCount: Array.isArray(parsed) ? parsed.length : null,
        bodySnippetIfNotArray: Array.isArray(parsed) ? undefined : bodyText.slice(0, 300),
        titles: Array.isArray(parsed) ? parsed.map((p) => stripHtml(p.title?.rendered)) : undefined,
      };
    } catch (err) {
      result[resource] = { error: err.message };
    }
  }

  return result;
}

module.exports = {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  listPages,
  createPage,
  updatePage,
  deletePage,
  listCategories,
  createCategory,
  uploadMediaFromUrl,
  searchPublicPosts,
  searchPublicPages,
  diagnoseSiteSearch,
};
