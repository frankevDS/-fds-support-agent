// Content management - posts, pages, categories, and media.
// Requires the x-admin-key header (see lib/admin-auth.js). Never called
// from the customer-facing widget.
//
// Body shape: { storeId, resource, action, ...fields }
//   resource: 'post' | 'page' | 'category' | 'media'
//   action:   'list' | 'get' | 'create' | 'update' | 'delete' | 'upload'
//
// Examples:
//   { storeId:'fds', resource:'post', action:'create',
//     title:'New arrivals', content:'<p>...</p>', status:'draft' }
//   { storeId:'fds', resource:'post', action:'update', postId:12,
//     fields:{ status:'publish' } }
//   { storeId:'fds', resource:'media', action:'upload',
//     imageUrl:'https://...', filename:'cover.jpg' }
const { getStore } = require('../../lib/store');
const { requireAdmin } = require('../../lib/admin-auth');
const wp = require('../../lib/wordpress');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireAdmin(req, res)) return;

  try {
    const { storeId, resource, action } = req.body || {};
    if (!storeId || !resource || !action) {
      return res.status(400).json({ error: 'storeId, resource, and action are required' });
    }

    const store = await getStore(storeId);
    if (!store) return res.status(404).json({ error: `Unknown store: ${storeId}` });

    const result = await route(store, resource, action, req.body);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

async function route(store, resource, action, body) {
  if (resource === 'post') {
    if (action === 'list') return wp.listPosts(store, body);
    if (action === 'get') return wp.getPost(store, body.postId);
    if (action === 'create') return wp.createPost(store, body);
    if (action === 'update') return wp.updatePost(store, body.postId, body.fields || {});
    if (action === 'delete') return wp.deletePost(store, body.postId, body);
  }
  if (resource === 'page') {
    if (action === 'list') return wp.listPages(store, body);
    if (action === 'create') return wp.createPage(store, body);
    if (action === 'update') return wp.updatePage(store, body.pageId, body.fields || {});
    if (action === 'delete') return wp.deletePage(store, body.pageId, body);
  }
  if (resource === 'category') {
    if (action === 'list') return wp.listCategories(store);
    if (action === 'create') return wp.createCategory(store, body.name);
  }
  if (resource === 'media') {
    if (action === 'upload') return wp.uploadMediaFromUrl(store, body);
  }
  throw new Error(`Unsupported resource/action combination: ${resource}/${action}`);
}
