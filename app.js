(() => {
  'use strict';
  const cfg = window.REVIEWER_CONFIG || {};
  const area = document.getElementById('document');
  const file = document.getElementById('file');
  const button = document.getElementById('review');
  const clearButton = document.getElementById('clear');
  const detailedReview = document.getElementById('detailed-review');
  const status = document.getElementById('status');
  const securityStatus = document.getElementById('security-status');
  const challenge = document.getElementById('challenge');
  const results = document.getElementById('results');
  const report = document.getElementById('report');
  const counter = document.getElementById('count');
  const copyButton = document.getElementById('copy');
  const copyStatus = document.getElementById('copy-status');
  const feedbackButtons = document.querySelectorAll('.feedback-choice');
  const feedbackComment = document.getElementById('feedback-comment');
  const feedbackSend = document.getElementById('feedback-send');
  const feedbackStatus = document.getElementById('feedback-status');
  let feedbackRating = '';
  let widgetId = null;
  let token = '';
  let tokenIssuedAt = 0;
  let lastReport = '';
  const MAX = 20000;
  function ready() {
    counter.textContent = `${area.value.length.toLocaleString()} / ${MAX.toLocaleString()} characters`;
    button.disabled = !token || area.value.trim().length === 0 || area.value.length > MAX || !cfg.apiBase?.startsWith('https://');
  }
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#a32626' : '';
  }
  function setRetryStatus() {
    setStatus('The security check was refreshed because it was getting old. ');
    const emphasis = document.createElement('strong');
    emphasis.className = 'retry-instruction';
    emphasis.textContent = 'Please click Review text again when verification finishes.';
    status.appendChild(emphasis);
  }
  function initTurnstile() {
    if (!cfg.turnstileSiteKey || cfg.turnstileSiteKey.startsWith('YOUR_')) {
      setStatus('Site setup is incomplete: configure the public Turnstile site key.', true); return;
    }
    if (!window.turnstile) { setTimeout(initTurnstile, 250); return; }
    widgetId = window.turnstile.render('#challenge', {
      sitekey: cfg.turnstileSiteKey,
      appearance: 'interaction-only',
      callback: t => { token = t; tokenIssuedAt = Date.now(); challenge.classList.add('verified'); securityStatus.textContent = 'Security check complete'; ready(); },
      'expired-callback': () => { token=''; tokenIssuedAt=0; challenge.classList.remove('verified'); securityStatus.textContent = 'Refreshing browser security check…'; ready(); },
      'timeout-callback': () => {
        token = ''; tokenIssuedAt = 0;
        challenge.classList.remove('verified');
        securityStatus.textContent = 'Security check timed out; refreshing…';
        ready();
      },
      'error-callback': (errorCode) => {
        token = ''; tokenIssuedAt = 0;
        challenge.classList.remove('verified');
        ready();
        const code = String(errorCode || '');
        // Cloudflare automatically retries transient 300*/600* failures.
        // Do not turn a background retry into a permanent-looking red form error.
        const configurationError = ['110100','110110','110200','400020','400021','400070'].includes(code);
        if (configurationError) {
          securityStatus.textContent = 'Security setup needs attention';
          setStatus(`Security configuration error (Cloudflare code: ${code}). Please contact Vegan Australia.`, true);
        } else {
          securityStatus.textContent = 'Security check interrupted; Cloudflare is retrying…';
        }
        return true;
      }
    });
  }
  function resetChallenge() {
    token = '';
    tokenIssuedAt = 0;
    challenge.classList.remove('verified');
    securityStatus.textContent = 'Refreshing browser security check…';
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    ready();
  }
  // Text-only, minimal Markdown rendering: escape all original text before markup.
  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function inline(s) { return escapeHtml(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>'); }
  function renderMarkdown(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    // Preserve indentation so Markdown sub-bullets remain inside their parent items.
    const lists = [];
    let quote = false;
    function closeLists() {
      while (lists.length) {
        const current = lists.pop();
        if (current.itemOpen) out.push('</li>');
        out.push('</' + current.type + '>');
      }
    }
    function closeQuote() {
      if (quote) { out.push('</blockquote>'); quote = false; }
    }
    function openList(type, indent, firstNumber = 1) {
      out.push(type === 'ol' ? '<ol start="' + firstNumber + '">' : '<ul>');
      lists.push({type, indent, itemOpen: false});
    }
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeLists(); closeQuote();
        const n = heading[1].length;
        out.push('<h' + n + '>' + inline(heading[2]) + '</h' + n + '>');
        continue;
      }
      if (line.startsWith('> ')) {
        closeLists();
        if (!quote) { out.push('<blockquote>'); quote = true; }
        out.push('<p>' + inline(line.slice(2)) + '</p>');
        continue;
      }
      closeQuote();
      const match = raw.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (match) {
        // Tabs are equivalent to four spaces for indentation.
        const indent = match[1].replace(/\t/g, '    ').length;
        const type = /^\d/.test(match[2]) ? 'ol' : 'ul';
        const number = type === 'ol' ? Number.parseInt(match[2], 10) : 1;
        while (lists.length && (indent < lists[lists.length - 1].indent ||
          (indent === lists[lists.length - 1].indent && type !== lists[lists.length - 1].type))) {
          const old = lists.pop();
          if (old.itemOpen) out.push('</li>');
          out.push('</' + old.type + '>');
        }
        if (!lists.length) {
          openList(type, indent, number);
        } else if (indent > lists[lists.length - 1].indent) {
          openList(type, indent);
        }
        const current = lists[lists.length - 1];
        if (current.itemOpen) out.push('</li>');
        out.push(type === 'ol' ? '<li value="' + number + '">' + inline(match[3]) : '<li>' + inline(match[3]));
        current.itemOpen = true;
        continue;
      }
      closeLists();
      out.push('<p>' + inline(line) + '</p>');
    }
    closeLists(); closeQuote();
    return out.join('\n');
  }
  clearButton.addEventListener('click', () => {
    area.value = '';
    file.value = '';
    lastReport = '';
    report.textContent = '';
    results.hidden = true;
    status.classList.remove('loading');
    setStatus('');
    copyButton.textContent = 'Copy review';
    copyStatus.textContent = '';
    feedbackRating = '';
    feedbackComment.value = '';
    feedbackStatus.textContent = '';
    feedbackSend.disabled = true;
    feedbackButtons.forEach(b => b.setAttribute('aria-pressed', 'false'));
    ready();
    area.focus();
  });
  area.addEventListener('input', ready);
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; if(!selected) return;
    if(!/\.(txt|md)$/i.test(selected.name) || selected.size > 80000){setStatus('Please select a .txt or .md file under 80 KB.',true);return;}
    area.value = await selected.text(); ready(); setStatus(`Loaded ${selected.name}.`);
  });
  button.addEventListener('click', async () => {
    if(button.disabled) return;
    // Refresh before sending an ageing five-minute, one-use Turnstile token.
    // Do not submit until the replacement check has actually succeeded.
    if (!tokenIssuedAt || Date.now() - tokenIssuedAt > 240000) {
      resetChallenge();
      setRetryStatus();
      return;
    }
    button.disabled=true;clearButton.disabled=true;results.hidden=true;
    copyButton.textContent = 'Copy review';
    copyStatus.textContent = '';
    feedbackRating = '';
    feedbackComment.value = '';
    feedbackStatus.textContent = '';
    feedbackSend.disabled = true;
    feedbackButtons.forEach(b => b.setAttribute('aria-pressed', 'false'));
    status.classList.add('loading');
    setStatus('Reviewing your text… This may take a minute or two.');
    try{
      const response=await fetch(`${cfg.apiBase.replace(/\/$/,'')}/review`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:area.value,turnstileToken:token,reviewMode:detailedReview.checked ? 'detailed' : 'standard'})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'Review unavailable');
      lastReport=body.report;report.innerHTML=renderMarkdown(lastReport);results.hidden=false;
      setStatus('Review complete. The suggestions are advisory.');
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){setStatus(error.message || 'Unable to review. Try again later.',true);}
    finally{status.classList.remove('loading');clearButton.disabled=false;resetChallenge();}
  });
  copyButton.addEventListener('click',async()=>{
    try {
      await navigator.clipboard.writeText(lastReport);
      copyButton.textContent = 'Copied!';
      copyStatus.textContent = 'Review copied to clipboard.';
    } catch {
      copyStatus.textContent = 'Unable to copy. Please select and copy the review manually.';
    }
  });
  feedbackButtons.forEach(b => b.addEventListener('click', () => {
    feedbackRating = b.dataset.rating;
    feedbackButtons.forEach(other => other.setAttribute('aria-pressed', String(other === b)));
    feedbackSend.disabled = false;
    feedbackStatus.textContent = '';
  }));
  feedbackSend.addEventListener('click', () => {
    if (!feedbackRating) return;
    const message = 'Rating: ' + feedbackRating +
      (feedbackComment.value.trim() ? '\n\nComment: ' + feedbackComment.value.trim() : '') +
      '\n\nThe submitted document and review are not included.';
    const href = 'mailto:info@veganaustralia.org.au?subject=' +
      encodeURIComponent('Animal rights language reviewer feedback') +
      '&body=' + encodeURIComponent(message);
    // Request a separate tab. Browser and email-handler settings determine
    // whether the draft opens there or in the visitor's email application.
    window.open(href, '_blank', 'noopener');
    feedbackStatus.textContent = 'Email draft requested. Please review and send it yourself. If nothing opens, check your browser’s email settings.';
  });
  ready(); initTurnstile();
})();