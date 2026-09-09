# Store Operator Agent (MVP) - multi-tenant

An AI agent that can run customer support, store management, and marketing
for WordPress/WooCommerce stores. Built for your own two sites first
(frankev.com and frankevdigitalservices.com), designed so a third-party
store can be onboarded later without rebuilding anything.

## How multi-tenancy works
Every site is a row in the `stores` table in Supabase, holding its own
WooCommerce keys, WordPress credentials, and marketing API keys. The same
backend and widget code serves every store - only the `storeId` passed in
each request changes.

## Modules
1. **Support** (`api/chat.js`) - customer-facing, read-only. Answers from
   a per-store knowledge base, looks up real orders and products. This is
   the only module the public widget can reach.
2. **Store management** (`api/admin/update-product.js`) - updates stock and
   pricing in WooCommerce. Admin-only.
3. **Marketing** (`api/admin/send-campaign.js`) - sends email (Brevo) or
   SMS (Africa's Talking) campaigns. Admin-only.
4. **Content management** (`api/admin/content.js`) - creates/updates/lists
   posts, pages, and categories, and uploads media for featured images,
   via `lib/wordpress.js`. Admin-only. New posts/pages default to
   `draft` so nothing goes live without a manual publish step.
5. **Admin dashboard** (`public/admin/index.html`) - a single-page UI over
   modules 2-4, so you're not hand-writing `curl` commands day to day.

Modules 2 and 3 require an `x-admin-key` header matching `ADMIN_API_KEY` in
your environment - nothing a customer types in the chat widget can ever
reach them.

## 1. Set up Supabase
1. Create a project at supabase.com
2. Run `sql/schema.sql` in the SQL editor - creates `stores`,
   `knowledge_base`, and `conversations`, and seeds two store rows:
   `frankev` and `fds`
3. Open the `stores` table and fill in each site's real WooCommerce keys,
   WordPress application password, Brevo key, and Africa's Talking
   credentials (only fill in what that site actually uses)
4. Run `sql/knowledge_base_seed.sql` (edit the `[ADD: ...]` placeholders
   first) to give the `fds` store its FAQ content - duplicate the block
   with `store_id = 'frankev'` for the other site
5. Copy your Project URL and `service_role` key into `.env`

## 2. Get WooCommerce API keys (per store)
WooCommerce > Settings > Advanced > REST API > Add key, on each site.
Read-only is enough for support; the management module needs Read/Write.

## 3. Get a WordPress application password (per store, optional)
WP Admin > Users > Profile > Application Passwords - only needed if you
want the content-management helper (`lib/wordpress.js`) to create or edit
posts on that site.

## 4. Get a Groq API key
console.groq.com. You do NOT need to manually track which model to use -
`lib/groq.js` checks `GET /openai/v1/models` against your account and
automatically picks the best available model from a preference-ordered
list, re-checking every 10 minutes. If you want to pin a specific model
anyway, set `GROQ_MODEL`.
- `GET /api/admin/model-health` (admin-key protected) shows what's
  currently auto-selected, what's configured, and everything available on
  your account - worth checking whenever you get a deprecation email.

## Lead capture
Before a visitor can send their first chat message, the widget asks for
their email (skipped on repeat visits via the browser's local storage) and
saves it to the `leads` table via the public `/api/lead` endpoint. If that
email has been seen before for this store (even from a different device),
the agent greets them as a returning visitor. View captured emails,
visit counts, and first/last-seen dates in the dashboard's **Leads** tab.

## Knowledge base links
Add an optional `url` to any `knowledge_base` row (see
`sql/knowledge_base_seed.sql`) pointing at a blog post or page with more
detail. When the agent uses that row to answer, it appends the link to its
reply so the visitor can read further - it only ever uses a URL you
actually provided, never one it invents.

## WhatsApp (via Meta's WhatsApp Business Cloud API)
1. Create a Meta App at developers.facebook.com, add the WhatsApp product,
   and get a phone number connected to it (a test number works for
   development; you'll need a real verified number to message anyone
   outside your test list).
2. In the store's row in Supabase, fill in `whatsapp_phone_number_id`
   (from the Meta App's WhatsApp setup page), `whatsapp_access_token`
   (a permanent token - generate one via a System User in Meta Business
   Settings, not the 24-hour temporary token), and `whatsapp_verify_token`
   (any string you make up yourself).
3. In the Meta App's WhatsApp > Configuration page, set the Webhook URL to
   `https://YOUR-VERCEL-URL.vercel.app/api/whatsapp/webhook` and the
   Verify Token to the same value you put in `whatsapp_verify_token`.
   Meta will call this URL once to confirm it - if it fails, double check
   the token matches exactly.
4. Subscribe the webhook to the `messages` field.
5. Message the connected WhatsApp number from your own phone - it runs
   through the exact same knowledge base, order lookups, and Groq model as
   the website widget (they share `lib/support-agent.js`), so anything you
   teach the agent via the knowledge base works on both channels
   automatically.

This is a first version: it replies to plain text messages. It doesn't
yet send images/buttons, handle voice notes, or proactively message
customers (e.g. abandoned cart follow-ups) - those are natural next steps
once basic two-way messaging is confirmed working.

## 5. Deploy to Vercel
```bash
npm install -g vercel
cd fds-support-agent
vercel
```
Add all variables from `.env.example` in the Vercel dashboard, then
redeploy.

## 6. Add the widget to each site
On frankevdigitalservices.com:
```html
<script src="https://YOUR-VERCEL-URL.vercel.app/widget/chat-widget.js"
        data-endpoint="https://YOUR-VERCEL-URL.vercel.app/api/chat"
        data-store-id="fds"></script>
```
On frankev.com, same script, but `data-store-id="frankev"`.

## 7. Using the admin endpoints

**Stock/price update:**
```bash
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/admin/update-product \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"fds","productId":123,"stockQuantity":10}'
```

**Marketing send** (`channel` is `"email"` or `"sms"`):
```bash
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/admin/send-campaign \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"fds","channel":"email","to":["a@b.com"],"subject":"...","htmlContent":"..."}'
```

**Content management** (`resource` is `post`/`page`/`category`/`media`,
`action` is `list`/`get`/`create`/`update`/`delete`/`upload`):
```bash
# Create a draft blog post
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/admin/content \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"fds","resource":"post","action":"create","title":"New arrivals","content":"<p>...</p>","status":"draft"}'

# Publish it once you've reviewed it (postId comes back from the create call)
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/admin/content \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"fds","resource":"post","action":"update","postId":42,"fields":{"status":"publish"}}'

# Upload an image and use it as a post's featured image
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/admin/content \
  -H "x-admin-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"storeId":"fds","resource":"media","action":"upload","imageUrl":"https://example.com/cover.jpg","filename":"cover.jpg"}'
```
The content module always defaults new posts/pages to `status: "draft"`
unless you explicitly pass `"publish"` - so an agent-driven content flow
naturally lands in review, not straight to the live site.

## 8. Using the admin dashboard
Once deployed, visit `https://YOUR-VERCEL-URL.vercel.app/admin/` in a
browser. Enter your Vercel URL and `ADMIN_API_KEY` once - it's saved in
your browser's local storage so you won't need to re-enter it each visit.
From there you can search and edit products, draft and publish posts/pages,
send a campaign, and view recent orders, all without the command line.

Anyone with the admin key has full access, so treat it like a password -
don't share the dashboard link with the key pre-filled, and rotate the key
if you ever suspect it's leaked.

## Suggested rollout order
1. Get support working well on both your sites (this is the safest module -
   read-only, can't break anything)
2. Once you trust the knowledge base and order lookups, try the management
   endpoints manually (via curl or Postman) before wiring them into any
   automated trigger
3. Add marketing sends last, and always test with a small `to[]` list first
4. Only after all three are solid on your own two sites would it make sense
   to onboard an outside store owner - at that point, move credentials out
   of plain Supabase columns and into Supabase Vault, and add real
   per-user login instead of the shared `ADMIN_API_KEY`
