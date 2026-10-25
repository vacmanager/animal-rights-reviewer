(() => {
  'use strict';
  const cfg = window.REVIEWER_CONFIG || {};
  const area = document.getElementById('document');
  const file = document.getElementById('file');
  const button = document.getElementById('review');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const report = document.getElementById('report');
  const counter = document.getElementById('count');
  const copyButton = document.getElementById('copy');
  const copyStatus = document.getElementById('copy-status');
  const feedbackButtons = document.querySelectorAll('.feedback-choice');
  const feedbackComment = document.getElementById('feedback-comment');
  const feedbackSend = document.getElementById('feedback-send');
  const feedbackStatus = document.getElementById('feedback-status');
  const feedbackIncludeText = document.getElementById('feedback-include-text');
  let reviewedDocument = '';
  let feedbackRating = '';
  let widgetId = null;
  let token = '';
  let lastReport = '';
  const MAX = 20000;
  function ready() {
    counter.textContent = `${area.value.length.toLocaleString()} / ${MAX.toLocaleString()} characters`;
    button.disabled = !token || area.value.trim().length < 80 || area.value.length > MAX || !cfg.apiBase?.startsWith('https://');
  }
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? '#a32626' : '';
  }
  function initTurnstile() {
    if (!cfg.turnstileSiteKey || cfg.turnstileSiteKey.startsWith('YOUR_')) {
      setStatus('Site setup is incomplete: configure the public Turnstile site key.', true); return;
    }
    if (!window.turnstile) { setTimeout(initTurnstile, 250); return; }
    widgetId = window.turnstile.render('#challenge', {
      sitekey: cfg.turnstileSiteKey,
      callback: t => { token = t; ready(); },
      'expired-callback': () => { token=''; ready(); },
      'error-callback': (errorCode) => { token=''; ready(); setStatus(`Security check failed (Cloudflare code: ${errorCode || 'unknown'}). Please verify the site key and authorised hostname.`,true); }
    });
  }
  function resetChallenge() {
    token = '';
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
  area.addEventListener('input', ready);
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; if(!selected) return;
    if(!/\.(txt|md)$/i.test(selected.name) || selected.size > 80000){setStatus('Please select a .txt or .md file under 80 KB.',true);return;}
    area.value = await selected.text(); ready(); setStatus(`Loaded ${selected.name}.`);
  });
  button.addEventListener('click', async () => {
    if(button.disabled) return;
    const submittedDocument = area.value;
    button.disabled=true;results.hidden=true;
    copyButton.textContent = 'Copy review';
    copyStatus.textContent = '';
    feedbackRating = '';
    feedbackComment.value = '';
    feedbackIncludeText.checked = false;
    reviewedDocument = '';
    feedbackStatus.textContent = '';
    feedbackSend.disabled = true;
    feedbackButtons.forEach(b => b.setAttribute('aria-pressed', 'false'));
    status.classList.add('loading');
    setStatus('Reviewing your text… This may take a minute or two.');
    try{
      const response=await fetch(`${cfg.apiBase.replace(/\/$/,'')}/review`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:area.value,turnstileToken:token})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'Review unavailable');
      lastReport=body.report;reviewedDocument=submittedDocument;report.innerHTML=renderMarkdown(lastReport);results.hidden=false;
      setStatus('Review complete. The suggestions are advisory.');
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){setStatus(error.message || 'Unable to review. Try again later.',true);}
    finally{status.classList.remove('loading');resetChallenge();}
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
  feedbackSend.addEventListener('click', async () => {
    if (!feedbackRating) return;
    const includeText = feedbackIncludeText.checked;
    const header = 'Rating: ' + feedbackRating +
      (feedbackComment.value.trim() ? '\n\nComment: ' + feedbackComment.value.trim() : '');
    const includedText = '\n\n--- Submitted document ---\n' + reviewedDocument +
      '\n\n--- Generated review ---\n' + lastReport;
    const message = header + (includeText ? includedText :
      '\n\nThe submitted document and review were not included.');
    const subject = 'Animal rights language reviewer feedback';
    const encodedBody = encodeURIComponent(message);
    // Email clients have inconsistent limits on mailto URL length. For lengthy
    // submissions, place the complete content on the clipboard instead.
    const large = includeText && encodedBody.length > 6000;
    const mailBody = large
      ? header + '\n\nI opted to include my document and review. The complete feedback text has been copied to my clipboard. I will paste it below before sending:\n\n'
      : message;
    const href = 'mailto:info@veganaustralia.org.au?subject=' +
      encodeURIComponent(subject) + '&body=' + encodeURIComponent(mailBody);
    // Attempt to open the email handler in a separate tab from the click event.
    // Browser/email-handler settings ultimately determine where it opens.
    const draftWindow = window.open(href, '_blank', 'noopener');
    const opened = !!draftWindow;
    if (large) {
      try {
        await navigator.clipboard.writeText(includedText);
        feedbackStatus.textContent = 'Email draft requested. The full document and review are copied to your clipboard: paste them into the draft before sending.' +
          (opened ? '' : ' If no draft opened, please open your email application manually.');
      } catch {
        feedbackStatus.textContent = 'The document is too long to add automatically, and clipboard copying failed. Please copy the document and review manually into your email draft before sending.';
      }
    } else {
      feedbackStatus.textContent = 'Email draft requested in a new tab. Please review and send it yourself.' +
        (opened ? '' : ' If no draft appears, check whether your browser has an email application configured.');
    }
  });
  ready(); initTurnstile();
})();