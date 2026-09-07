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

  if (!ENDPOINT || !STORE_ID) {
    console.error('FDS chat widget: missing data-endpoint or data-store-id attribute.');
    return;
  }
  const sessionId = 'fds-' + Math.random().toString(36).slice(2) + Date.now();

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
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${COLORS.ink}; color: ${COLORS.paper};
      border: none; cursor: pointer; box-shadow: 0 6px 20px rgba(18,32,54,0.25);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; transition: transform 0.15s ease;
    }
    #fds-chat-launcher:hover { transform: scale(1.05); }
    #fds-chat-launcher:focus-visible { outline: 3px solid ${COLORS.teal}; outline-offset: 2px; }

    #fds-chat-panel {
      position: fixed; bottom: 88px; right: 20px; z-index: 999999;
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
    #fds-chat-close { background: none; border: none; color: ${COLORS.paper}; font-size: 18px; cursor: pointer; line-height: 1; }

    #fds-chat-messages {
      flex: 1; overflow-y: auto; padding: 14px; background: ${COLORS.mist};
      display: flex; flex-direction: column; gap: 10px;
    }
    .fds-msg { max-width: 85%; padding: 9px 12px; border-radius: 12px; font-size: 13.5px; line-height: 1.4; }
    .fds-msg.user { align-self: flex-end; background: ${COLORS.teal}; color: #fff; border-bottom-right-radius: 4px; }
    .fds-msg.bot { align-self: flex-start; background: ${COLORS.paper}; color: ${COLORS.ink}; border: 1px solid ${COLORS.border}; border-bottom-left-radius: 4px; }
    .fds-msg.typing { align-self: flex-start; color: #6b7785; font-style: italic; font-size: 12.5px; }

    #fds-chat-form { display: flex; border-top: 1px solid ${COLORS.border}; }
    #fds-chat-input {
      flex: 1; border: none; padding: 12px 14px; font-size: 13.5px; outline: none;
    }
    #fds-chat-send {
      background: ${COLORS.teal}; color: #fff; border: none; padding: 0 16px;
      font-weight: 600; cursor: pointer; font-size: 13.5px;
    }
    #fds-chat-send:hover { background: ${COLORS.tealDark}; }
  `;
  document.head.appendChild(style);

  const launcher = document.createElement('button');
  launcher.id = 'fds-chat-launcher';
  launcher.setAttribute('aria-label', 'Open support chat');
  launcher.textContent = '💬';

  const panel = document.createElement('div');
  panel.id = 'fds-chat-panel';
  panel.innerHTML = `
    <div id="fds-chat-header">
      <div>Frankev Support<span class="sub">Usually replies in a few seconds</span></div>
      <button id="fds-chat-close" aria-label="Close chat">✕</button>
    </div>
    <div id="fds-chat-messages"></div>
    <form id="fds-chat-form">
      <input id="fds-chat-input" type="text" placeholder="Ask about orders, pricing, services..." autocomplete="off" />
      <button id="fds-chat-send" type="submit">Send</button>
    </form>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#fds-chat-messages');
  const formEl = panel.querySelector('#fds-chat-form');
  const inputEl = panel.querySelector('#fds-chat-input');

  function addMessage(text, role) {
    const el = document.createElement('div');
    el.className = `fds-msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  let greeted = false;
  launcher.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && !greeted) {
      greeted = true;
      addMessage("Hi! I'm the Frankev support assistant. Ask me about orders, pricing, or our services.", 'bot');
      inputEl.focus();
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
