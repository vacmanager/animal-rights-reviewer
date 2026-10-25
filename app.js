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
    function openList(type, indent) {
      out.push('<' + type + '>');
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
        while (lists.length && (indent < lists[lists.length - 1].indent ||
          (indent === lists[lists.length - 1].indent && type !== lists[lists.length - 1].type))) {
          const old = lists.pop();
          if (old.itemOpen) out.push('</li>');
          out.push('</' + old.type + '>');
        }
        if (!lists.length) {
          openList(type, indent);
        } else if (indent > lists[lists.length - 1].indent) {
          openList(type, indent);
        }
        const current = lists[lists.length - 1];
        if (current.itemOpen) out.push('</li>');
        out.push('<li>' + inline(match[3]));
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
    button.disabled=true;results.hidden=true;setStatus('Reviewing your text…');
    try{
      const response=await fetch(`${cfg.apiBase.replace(/\/$/,'')}/review`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({text:area.value,turnstileToken:token})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'Review unavailable');
      lastReport=body.report;report.innerHTML=renderMarkdown(lastReport);results.hidden=false;
      setStatus('Review complete. The suggestions are advisory.');
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){setStatus(error.message || 'Unable to review. Try again later.',true);}
    finally{resetChallenge();}
  });
  document.getElementById('copy').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(lastReport);setStatus('Review copied.');}
    catch{setStatus('Copy unavailable in this browser.',true);}
  });
  ready(); initTurnstile();
})();