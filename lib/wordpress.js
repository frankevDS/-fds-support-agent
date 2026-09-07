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
};
