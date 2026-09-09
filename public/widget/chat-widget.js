/**
 * Frankev Digital Services - support chat widget
 * Embed with:
 *   <script src="chat-widget.js"
 *           data-endpoint="https://your-vercel-app.vercel.app/api/chat"
 *           data-store-id="fds"></script>
 *
 * data-store-id must match a row's `id` in the `stores` table (e.g. 'fds'
 * for frankevdigitalservices.com, 'frankev' for frankev.com).
 */
(function () {
  const scriptTag =
    document.currentScript || document.querySelector('script[src*="chat-widget.js"]');

  if (!scriptTag) {
    console.error('FDS chat widget: could not find its own <script> tag to read config from.');
    return;
  }

  const ENDPOINT = scriptTag.getAttribute('data-endpoint');
  const STORE_ID = scriptTag.getAttribute('data-store-id');
  const LEAD_ENDPOINT = ENDPOINT.replace(/\/api\/chat\/?$/, '/api/lead');

  if (!ENDPOINT || !STORE_ID) {
    console.error('FDS chat widget: missing data-endpoint or data-store-id attribute.');
    return;
  }
  const sessionId = 'fds-' + Math.random().toString(36).slice(2) + Date.now();
  const EMAIL_STORAGE_KEY = `fds_chat_email_${STORE_ID}`;

  const COLORS = {
    ink: '#122036',
    teal: '#0E9F6E',
    tealDark: '#0B7F58',
    paper: '#FFFFFF',
    mist: '#F4F6F8',
    border: '#DDE3E8',
  };

  const style = document.createElement('style');
  style.textContent = `
    #fds-chat-launcher {
      position: fixed; bottom: 92px; right: 20px; z-index: 999999;
      height: 52px; padding: 0 18px 0 16px; border-radius: 26px;
      background: ${COLORS.paper}; color: ${COLORS.ink};
      border: 1px solid ${COLORS.border}; cursor: pointer;
      box-shadow: 0 8px 24px rgba(18,32,54,0.18);
      display: flex; align-items: center; gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px; font-weight: 600; transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    #fds-chat-launcher svg { width: 22px; height: 22px; display: block; flex-shrink: 0; }
    #fds-chat-launcher:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(18,32,54,0.24); }
    #fds-chat-launcher:focus-visible { outline: 3px solid ${COLORS.teal}; outline-offset: 2px; }

    #fds-chat-panel {
      position: fixed; bottom: 156px; right: 20px; z-index: 999999;
      width: 340px; max-width: calc(100vw - 40px); height: 460px;
      background: ${COLORS.paper}; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(18,32,54,0.22);
      display: none; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid ${COLORS.border};
    }
    #fds-chat-panel.open { display: flex; }

    #fds-chat-header {
      background: ${COLORS.ink}; color: ${COLORS.paper};
      padding: 14px 16px; font-size: 14px; font-weight: 600;
      display: flex; justify-content: space-between; align-items: center;
    }
    #fds-chat-header span.sub { display:block; font-weight: 400; font-size: 12px; opacity: 0.75; margin-top: 2px; }
    #fds-chat-close { background: none; border: none; color: ${COLORS.paper}; cursor: pointer; line-height: 1; padding: 4px; display: flex; }
    #fds-chat-close svg { width: 16px; height: 16px; }

    #fds-chat-messages {
      flex: 1; overflow-y: auto; padding: 14px; background: ${COLORS.mist};
      display: flex; flex-direction: column; gap: 10px;
    }
    .fds-msg { max-width: 85%; padding: 9px 12px; border-radius: 12px; font-size: 13.5px; line-height: 1.4; }
    .fds-msg a { color: inherit; text-decoration: underline; }
    .fds-msg.user { align-self: flex-end; background: ${COLORS.teal}; color: #fff; border-bottom-right-radius: 4px; }
    .fds-msg.bot { align-self: flex-start; background: ${COLORS.paper}; color: ${COLORS.ink}; border: 1px solid ${COLORS.border}; border-bottom-left-radius: 4px; }
    .fds-msg.typing { align-self: flex-start; color: #6b7785; font-style: italic; font-size: 12.5px; }
    .fds-msg-time { font-size: 10.5px; color: #8b96a6; margin-top: 3px; }
    .fds-msg.user .fds-msg-time { text-align: right; color: rgba(255,255,255,0.75); }
    #fds-chat-start-time {
      align-self: center; font-size: 11px; color: #8b96a6; margin-bottom: 4px;
    }

    #fds-chat-form { display: flex; border-top: 1px solid ${COLORS.border}; }
    #fds-chat-input {
      flex: 1; border: none; padding: 12px 14px; font-size: 13.5px; outline: none;
    }
    #fds-chat-send {
      background: ${COLORS.teal}; color: #fff; border: none; padding: 0 16px;
      font-weight: 600; cursor: pointer; font-size: 13.5px;
    }
    #fds-chat-send:hover { background: ${COLORS.tealDark}; }

    #fds-chat-gate {
      flex: 1; display: flex; flex-direction: column; justify-content: center;
      padding: 24px 20px; background: ${COLORS.paper}; gap: 10px;
    }
    #fds-chat-gate p { margin: 0 0 4px; font-size: 13px; color: #435067; line-height: 1.5; }
    #fds-chat-gate input {
      border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 11px 12px;
      font-size: 13.5px; outline: none;
    }
    #fds-chat-gate input:focus { border-color: ${COLORS.teal}; }
    #fds-chat-gate button {
      background: ${COLORS.ink}; color: #fff; border: none; border-radius: 8px;
      padding: 11px; font-weight: 600; font-size: 13.5px; cursor: pointer; margin-top: 4px;
    }
    #fds-chat-gate button:hover { background: #0c1626; }
    #fds-chat-gate .fds-gate-error { color: #C1443C; font-size: 12px; display: none; }
  `;
  document.head.appendChild(style);

  const launcher = document.createElement('button');
  launcher.id = 'fds-chat-launcher';
  launcher.setAttribute('aria-label', 'Open support chat');
  launcher.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.6 3.45A.5.5 0 0 1 3 20.05V6a2 2 0 0 1 2-2z"
            fill="none" stroke="#122036" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="8.5" cy="10.5" r="1.1" fill="#122036"/>
      <circle cx="12.5" cy="10.5" r="1.1" fill="#122036"/>
      <circle cx="16.5" cy="10.5" r="1.1" fill="#122036"/>
    </svg>
    <span>Chat with us</span>
  `;

  const panel = document.createElement('div');
  panel.id = 'fds-chat-panel';
  panel.innerHTML = `
    <div id="fds-chat-header">
      <div>Frankev Support<span class="sub">Usually replies in a few seconds</span></div>
      <button id="fds-chat-close" aria-label="Close chat">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <div id="fds-chat-gate">
      <p><strong>Before we start</strong> - what's your email? We'll use it only to follow up if we get disconnected.</p>
      <input id="fds-gate-email" type="email" placeholder="you@email.com" autocomplete="email" />
      <div class="fds-gate-error" id="fds-gate-error">Please enter a valid email address.</div>
      <button id="fds-gate-submit" type="button">Start chatting</button>
    </div>
    <div id="fds-chat-messages" style="display:none"></div>
    <form id="fds-chat-form" style="display:none">
      <input id="fds-chat-input" type="text" placeholder="Ask about orders, pricing, services..." autocomplete="off" />
      <button id="fds-chat-send" type="submit">Send</button>
    </form>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const gateEl = panel.querySelector('#fds-chat-gate');
  const gateEmailEl = panel.querySelector('#fds-gate-email');
  const gateErrorEl = panel.querySelector('#fds-gate-error');
  const gateSubmitEl = panel.querySelector('#fds-gate-submit');
  const messagesEl = panel.querySelector('#fds-chat-messages');
  const formEl = panel.querySelector('#fds-chat-form');
  const inputEl = panel.querySelector('#fds-chat-input');

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Turns plain text from the bot (or the visitor) into safe, readable HTML:
  // escapes real HTML first, then re-introduces **bold**, clickable links,
  // and line breaks. Never trusts raw HTML from either side.
  function formatMessageHtml(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(
      /(https?:\/\/[^\s<]+)/g,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
    safe = safe.replace(/\n/g, '<br>');
    return safe;
  }

  function addMessage(text, role) {
    const el = document.createElement('div');
    el.className = `fds-msg ${role}`;
    el.innerHTML = formatMessageHtml(text);
    if (role === 'user' || role === 'bot') {
      const timeEl = document.createElement('div');
      timeEl.className = 'fds-msg-time';
      timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      el.appendChild(timeEl);
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function addChatStartMarker() {
    const el = document.createElement('div');
    el.id = 'fds-chat-start-time';
    el.textContent = 'Chat started ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messagesEl.appendChild(el);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function saveLead(email) {
    try {
      const res = await fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: STORE_ID, sessionId, email }),
      });
      return await res.json().catch(() => ({}));
    } catch (err) {
      console.warn('FDS chat widget: could not save lead email.', err);
      return {};
    }
  }

  function unlockChat(alreadyKnownEmail) {
    gateEl.style.display = 'none';
    messagesEl.style.display = 'flex';
    formEl.style.display = 'flex';
    addChatStartMarker();
    addMessage(
      alreadyKnownEmail
        ? "Welcome back! Ask me about orders, pricing, or our services."
        : "Thanks! Ask me about orders, pricing, or our services.",
      'bot'
    );
    inputEl.focus();
  }

  gateSubmitEl.addEventListener('click', async () => {
    const email = gateEmailEl.value.trim();
    if (!isValidEmail(email)) {
      gateErrorEl.style.display = 'block';
      return;
    }
    gateErrorEl.style.display = 'none';
    localStorage.setItem(EMAIL_STORAGE_KEY, email);
    const result = await saveLead(email);
    unlockChat(!!result.returning);
  });
  gateEmailEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gateSubmitEl.click();
  });

  let opened = false;
  launcher.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !opened) {
      opened = true;
      const knownEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
      if (knownEmail) {
        unlockChat(true);
      } else {
        gateEmailEl.focus();
      }
    }
  });
  panel.querySelector('#fds-chat-close').addEventListener('click', () => panel.classList.remove('open'));

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    inputEl.value = '';

    const typingEl = addMessage('Typing...', 'typing');

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, storeId: STORE_ID }),
      });
      const data = await res.json();
      typingEl.remove();
      addMessage(data.reply || "Sorry, I couldn't get a response - please try again.", 'bot');
    } catch (err) {
      typingEl.remove();
      addMessage('Something went wrong reaching support. Please try again shortly.', 'bot');
    }
  });
})();
