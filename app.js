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
      'error-callback': () => { token=''; ready(); setStatus('Security check failed. Reload this page and try again.',true); }
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
    const lines = md.replace(/\r\n/g,'\n').split('\n');
    const out = [];
    let list = false, quote = false;
    const close = () => { if(list){out.push('</ul>');list=false;} if(quote){out.push('</blockquote>');quote=false;} };
    for(const raw of lines){
      const line=raw.trim();
      if(!line){ close(); continue; }
      const heading=line.match(/^(#{1,4})\s+(.+)$/);
      if(heading){close(); const n=heading[1].length;out.push(`<h${n}>${inline(heading[2])}</h${n}>`);continue;}
      if(line.startsWith('> ')){if(list){out.push('</ul>');list=false;}if(!quote){out.push('<blockquote>');quote=true;}out.push(`<p>${inline(line.slice(2))}</p>`);continue;}
      if(quote){out.push('</blockquote>');quote=false;}
      const bullet=line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
      if(bullet){if(!list){out.push('<ul>');list=true;}out.push(`<li>${inline(bullet[1])}</li>`);continue;}
      if(list){out.push('</ul>');list=false;}
      out.push(`<p>${inline(line)}</p>`);
    }
    close();return out.join('\n');
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