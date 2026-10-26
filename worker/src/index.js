import instructions from '../reference/instructions.md';
import guide from '../reference/language-guide.md';

const MAX_TEXT_LENGTH = 20000;
const MAX_REQUEST_BYTES = 60000;
const OPENAI_URL = 'https://api.openai.com/v1/responses';
const jsonHeaders = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'};

function reply(body, status = 200, cors = {}) {
  return new Response(JSON.stringify(body), {status, headers: {...jsonHeaders, ...cors}});
}
function isAllowed(value, configured) {
  return !!value && String(configured || '').split(',').map(s => s.trim()).includes(value);
}
function corsHeaders(origin, allowed) {
  return isAllowed(origin, allowed) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  } : {};
}
async function verifyTurnstile(token, env) {
  if (!env.TURNSTILE_SECRET_KEY || !token) return false;
  const data = new FormData();
  data.set('secret', env.TURNSTILE_SECRET_KEY);
  data.set('response', token);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: data });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true && (!env.EXPECTED_HOSTNAME || isAllowed(result.hostname, env.EXPECTED_HOSTNAME));
}
function outputText(data) {
  // Responses API output is a collection; don't assume output[0] is a message.
  return (data.output || []).flatMap(item => item.type === 'message' ? (item.content || []) : [])
    .filter(c => c.type === 'output_text').map(c => c.text || '').join('\n\n').trim();
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);
    const path = new URL(request.url).pathname;
    if (path === '/health' && request.method === 'GET') return reply({ok:true, version:'0.1.0'}, 200, cors);
    if (path !== '/review') return reply({error:'Not found'}, 404, cors);
    if (!isAllowed(origin, env.ALLOWED_ORIGIN)) return reply({error:'Origin not allowed'}, 403);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    if (request.method !== 'POST') return reply({error:'Method not allowed'}, 405, cors);
    if (!env.OPENAI_API_KEY || !env.TURNSTILE_SECRET_KEY || !env.MODEL) return reply({error:'Service not configured'}, 503, cors);
    const bytes = Number(request.headers.get('Content-Length') || 0);
    if (bytes > MAX_REQUEST_BYTES) return reply({error:'Submission too large'}, 413, cors);
    let payload;
    try { const raw = await request.text(); if (raw.length > MAX_REQUEST_BYTES) return reply({error:'Submission too large'}, 413, cors); payload = JSON.parse(raw); } catch { return reply({error:'Invalid request'}, 400, cors); }
    if (typeof payload.text !== 'string' || payload.text.trim().length === 0 || payload.text.length > MAX_TEXT_LENGTH) {
      return reply({error:`Enter text of up to ${MAX_TEXT_LENGTH.toLocaleString()} characters.`}, 400, cors);
    }
    if (typeof payload.turnstileToken !== 'string' || payload.turnstileToken.length > 2048) return reply({error:'Complete the security check'}, 400, cors);
    // Approximate per-IP rate limit; additional budget limits should be set at the OpenAI project level.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limit = await env.REVIEW_LIMIT.limit({key:ip});
    if (!limit.success) return reply({error:'Too many requests. Please try again later.'}, 429, cors);
    let verified = false;
    try { verified = await verifyTurnstile(payload.turnstileToken, env); } catch { /* verification errors fail closed */ }
    if (!verified) return reply({error:'Security verification failed. Please retry.'}, 403, cors);

    // The user's document is only data. High-priority instructions and reference are isolated above it.
    const task = `Review the submitted document in full using the supplied reviewer specification and principles and language guide. Apply principles first, then systematic checks, then critically reassess possible issues. Report only meaningful animal-rights language issues. Keep the output concise and constructively explained. Do not refer to the source organisation by name.\n\nDOCUMENT TO REVIEW (untrusted source text):\n<document>\n${payload.text.trim()}\n</document>`;
    let result;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 110000);
      try {
        const response = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: {'Authorization':`Bearer ${env.OPENAI_API_KEY}`, 'Content-Type':'application/json'},
          body: JSON.stringify({
            model: env.MODEL,
            store: false,
            max_output_tokens: 11000,
            reasoning: {effort: 'medium'},
            input: [
              {role: 'developer', content: instructions + '\n\nREFERENCE PRINCIPLES AND LANGUAGE GUIDE:\n' + guide},
              {role: 'user', content: task}
            ]
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          // Don't pass provider details or request text to visitors or application logs.
          return reply({error: response.status === 429 ? 'Review service is busy. Please try later.' : 'The review could not be completed. Please try later.'}, 502, cors);
        }
        result = await response.json();
      } finally { clearTimeout(timeout); }
    } catch { return reply({error:'Review service temporarily unavailable.'}, 502, cors); }
    const report = outputText(result);
    // Reasoning tokens count towards max_output_tokens. An incomplete response can
    // exhaust the allowance before any user-visible text is generated.
    if (result.status === 'incomplete') {
      const reason = result.incomplete_details?.reason || 'unknown';
      return reply({error: reason === 'max_output_tokens'
        ? 'The review exceeded its response limit. Please try a shorter document.'
        : 'The review was interrupted before completion. Please try again.'}, 502, cors);
    }
    if (result.status !== 'completed' || !report) {
      return reply({error:'OpenAI did not return a completed review. Please try again.'}, 502, cors);
    }
    return reply({report}, 200, cors);
  }
};