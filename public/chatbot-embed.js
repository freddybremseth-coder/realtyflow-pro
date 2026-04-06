/**
 * ChatGenius Embeddable Widget
 *
 * Usage: Add this to any website:
 * <script src="https://realtyflow.chatgenius.pro/chatbot-embed.js"
 *   data-brand="soleada"
 *   data-color="#0891b2"
 *   data-title="Chat med oss"
 *   data-welcome="Hei! Hvordan kan vi hjelpe?">
 * </script>
 */
(function() {
  'use strict';

  var script = document.currentScript;
  var config = {
    apiUrl: script.getAttribute('data-api') || 'https://realtyflow.chatgenius.pro/api/chatbot',
    brandId: script.getAttribute('data-brand') || 'general',
    color: script.getAttribute('data-color') || '#0891b2',
    title: script.getAttribute('data-title') || 'Chat',
    subtitle: script.getAttribute('data-subtitle') || 'Vi svarer umiddelbart',
    welcome: script.getAttribute('data-welcome') || 'Hei! Hvordan kan jeg hjelpe deg?',
    placeholder: script.getAttribute('data-placeholder') || 'Skriv en melding...',
    position: script.getAttribute('data-position') || 'bottom-right',
  };

  var sessionId = 'cg_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  var messages = [{ role: 'assistant', content: config.welcome }];
  var isOpen = false;
  var isLoading = false;

  // Inject styles
  var style = document.createElement('style');
  style.textContent = [
    '.cg-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;box-sizing:border-box}',
    '.cg-widget *{box-sizing:border-box;margin:0;padding:0}',
    '.cg-btn{position:fixed;bottom:24px;' + (config.position === 'bottom-left' ? 'left' : 'right') + ':24px;z-index:99999;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.3);transition:transform .2s}',
    '.cg-btn:hover{transform:scale(1.1)}',
    '.cg-btn svg{width:24px;height:24px;fill:white}',
    '.cg-badge{position:absolute;top:-4px;right:-4px;width:20px;height:20px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;border-radius:50%;display:flex;align-items:center;justify-content:center}',
    '.cg-window{position:fixed;bottom:24px;' + (config.position === 'bottom-left' ? 'left' : 'right') + ':24px;z-index:99999;width:380px;max-width:calc(100vw - 2rem);display:flex;flex-direction:column;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08)}',
    '.cg-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer}',
    '.cg-header-info{display:flex;align-items:center;gap:12px}',
    '.cg-avatar{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}',
    '.cg-avatar svg{width:18px;height:18px;fill:white}',
    '.cg-header h3{font-size:14px;font-weight:600;color:white}',
    '.cg-header p{font-size:10px;color:rgba(255,255,255,.7)}',
    '.cg-close{background:none;border:none;padding:6px;border-radius:8px;cursor:pointer;color:white;display:flex}',
    '.cg-close:hover{background:rgba(255,255,255,.2)}',
    '.cg-close svg{width:14px;height:14px;fill:currentColor}',
    '.cg-messages{flex:1;overflow-y:auto;padding:16px;min-height:300px;max-height:400px;background:#0f172a;display:flex;flex-direction:column;gap:12px}',
    '.cg-msg{display:flex;gap:8px;max-width:85%}',
    '.cg-msg.user{flex-direction:row-reverse;margin-left:auto}',
    '.cg-msg-icon{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.cg-msg-icon svg{width:14px;height:14px}',
    '.cg-msg-bubble{padding:10px 14px;border-radius:16px;font-size:13px;line-height:1.5}',
    '.cg-msg.user .cg-msg-bubble{background:#334155;color:#f1f5f9;border-top-right-radius:4px}',
    '.cg-msg.assistant .cg-msg-bubble{background:#1e293b;color:#e2e8f0;border-top-left-radius:4px;border:1px solid rgba(255,255,255,.05)}',
    '.cg-dots{display:flex;gap:4px;padding:12px 14px}',
    '.cg-dot{width:6px;height:6px;border-radius:50%;background:#64748b;animation:cg-bounce .6s infinite alternate}',
    '.cg-dot:nth-child(2){animation-delay:.15s}',
    '.cg-dot:nth-child(3){animation-delay:.3s}',
    '@keyframes cg-bounce{to{transform:translateY(-6px);opacity:.5}}',
    '.cg-input-wrap{background:#1e293b;border-top:1px solid #334155;padding:12px}',
    '.cg-form{display:flex;gap:8px}',
    '.cg-input{flex:1;background:#0f172a;border:1px solid #475569;border-radius:12px;padding:10px 14px;font-size:13px;color:#f1f5f9;outline:none;transition:border-color .2s}',
    '.cg-input:focus{border-color:' + config.color + '}',
    '.cg-input::placeholder{color:#64748b}',
    '.cg-send{width:40px;height:40px;border-radius:12px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .2s}',
    '.cg-send:disabled{opacity:.3;cursor:default}',
    '.cg-send svg{width:16px;height:16px;fill:white}',
    '.cg-powered{text-align:center;font-size:9px;color:#475569;margin-top:6px}',
    '.cg-powered a{color:#64748b;text-decoration:none}',
  ].join('\n');
  document.head.appendChild(style);

  // SVG icons
  var icons = {
    chat: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-11 11" stroke="white" stroke-width="1" fill="none"/></svg>',
    bot: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  };

  // Create container
  var container = document.createElement('div');
  container.className = 'cg-widget';
  document.body.appendChild(container);

  var unread = 0;

  function render() {
    if (!isOpen) {
      container.innerHTML = '<button class="cg-btn" style="background:' + config.color + '">' + icons.chat + (unread > 0 ? '<span class="cg-badge">' + unread + '</span>' : '') + '</button>';
      container.querySelector('.cg-btn').onclick = function() { isOpen = true; unread = 0; render(); };
      return;
    }

    var html = '<div class="cg-window">';
    // Header
    html += '<div class="cg-header" style="background:' + config.color + '">';
    html += '<div class="cg-header-info"><div class="cg-avatar">' + icons.bot + '</div><div><h3>' + config.title + '</h3><p>' + config.subtitle + '</p></div></div>';
    html += '<button class="cg-close">' + icons.close + '</button></div>';
    // Messages
    html += '<div class="cg-messages" id="cg-msgs">';
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var iconBg = m.role === 'user' ? 'background:#334155' : 'background:' + config.color + '30';
      var iconSvg = m.role === 'user' ? '<svg viewBox="0 0 24 24" style="fill:#94a3b8">' + icons.user.replace(/<svg[^>]*>/, '').replace('</svg>', '') + '</svg>' : '<svg viewBox="0 0 24 24" style="fill:' + config.color + '">' + icons.bot.replace(/<svg[^>]*>/, '').replace('</svg>', '') + '</svg>';
      html += '<div class="cg-msg ' + m.role + '"><div class="cg-msg-icon" style="' + iconBg + '">' + iconSvg + '</div><div class="cg-msg-bubble">' + escapeHtml(m.content) + '</div></div>';
    }
    if (isLoading) {
      html += '<div class="cg-msg assistant"><div class="cg-msg-icon" style="background:' + config.color + '30">' + icons.bot + '</div><div class="cg-msg-bubble"><div class="cg-dots"><div class="cg-dot"></div><div class="cg-dot"></div><div class="cg-dot"></div></div></div></div>';
    }
    html += '</div>';
    // Input
    html += '<div class="cg-input-wrap"><form class="cg-form"><input class="cg-input" placeholder="' + config.placeholder + '" maxlength="2000"' + (isLoading ? ' disabled' : '') + '><button type="submit" class="cg-send" style="background:' + config.color + '"' + (isLoading ? ' disabled' : '') + '>' + icons.send + '</button></form>';
    html += '<p class="cg-powered">Powered by <a href="https://chatgenius.pro" target="_blank">ChatGenius.pro</a></p></div>';
    html += '</div>';

    container.innerHTML = html;

    // Scroll to bottom
    var msgsEl = document.getElementById('cg-msgs');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // Event listeners
    container.querySelector('.cg-close').onclick = function() { isOpen = false; render(); };
    var form = container.querySelector('.cg-form');
    var input = container.querySelector('.cg-input');
    if (input) input.focus();
    form.onsubmit = function(e) {
      e.preventDefault();
      var val = input.value.trim();
      if (!val || isLoading) return;
      input.value = '';
      sendMsg(val);
    };
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sendMsg(text) {
    messages.push({ role: 'user', content: text });
    isLoading = true;
    render();

    var xhr = new XMLHttpRequest();
    xhr.open('POST', config.apiUrl);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      isLoading = false;
      try {
        var data = JSON.parse(xhr.responseText);
        messages.push({ role: 'assistant', content: data.response || 'Beklager, prøv igjen.' });
      } catch(e) {
        messages.push({ role: 'assistant', content: 'Beklager, noe gikk galt.' });
      }
      render();
    };
    xhr.onerror = function() {
      isLoading = false;
      messages.push({ role: 'assistant', content: 'Kunne ikke koble til. Prøv igjen.' });
      render();
    };
    xhr.send(JSON.stringify({
      message: text,
      conversation: messages.slice(0, -1).map(function(m) { return { role: m.role, content: m.content }; }),
      brandId: config.brandId,
      sessionId: sessionId,
      visitorInfo: { page: window.location.href },
    }));
  }

  render();
})();
