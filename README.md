# Animal rights language reviewer — website prototype

**Version:** 0.1 · 25 October 2026  
**Status:** Implemented prototype, **not deployed or live-tested against the OpenAI API**.

This project provides a GitHub Pages frontend and a Cloudflare Worker backend. The Worker sends one request per review to OpenAI's Responses API, using the complete reviewer instructions and principles/language guide as its reference context. The site is intended to provide *advisory* language reviews, not authoritative editorial decisions.

## What you need to do

You do not need to share any credentials with ChatGPT.

1. **GitHub:** Create a repository (e.g. `animal-rights-reviewer`) and upload the prepared repository files (`index.html`, `app.js`, `style.css`, `config.js`, `worker/` and `README.md`) to its root. In repository **Settings → Pages**, publish from the main branch/root. GitHub Pages sites are publicly reachable: an obscure URL is not secure private access. For testing, publish without advertising it; do not rely on URL secrecy.
2. **Cloudflare:** Create a free Cloudflare account if needed and a **Turnstile widget** restricted to the eventual GitHub Pages hostname (or custom hostname). Save its **site key** and **secret key** separately. Use the same hostname in `EXPECTED_HOSTNAME`.
3. **Worker:** Install Node.js and then, in the `worker` directory, run `npm install` and `npx wrangler login`. Edit `wrangler.jsonc` with the exact GitHub Pages **origin** (for example `https://vacmanager.github.io`), the expected hostname (`vacmanager.github.io`), and the actual OpenAI API model ID. Run `npm run deploy`. The sample `MODEL` is a placeholder baseline, **not a verified identity for AI1**.
4. **Secrets:** Run `npx wrangler secret put OPENAI_API_KEY` and `npx wrangler secret put TURNSTILE_SECRET_KEY` from the `worker` directory. Paste each key into the CLI prompt. **Never commit them to GitHub.** Set up an OpenAI API project, billing and low project usage/budget alerts before making the site public. A ChatGPT subscription does not automatically provide API credit.
5. **Link frontend:** Edit `site/config.js`: set the deployed Worker URL and the public Turnstile site key. Push the change to GitHub. The Worker must allow the same origin in `wrangler.jsonc`.
6. **Smoke test:** Open the GitHub Pages URL, paste a non-confidential test passage (at least 80 characters), complete Turnstile and request a review. Verify that the resulting report is readable and that no API keys appear in browser/network-visible source. Test a second input and the copy button.

The Worker must be deployed **before** the frontend can produce reviews. No API key is included with this package, and no paid API request was made during its creation.

## Short technical description for maintenance

### Architecture

```text
Browser (GitHub Pages: index.html, app.js, style.css, config.js)
    | POST /review { text, turnstileToken } HTTPS
    v
Cloudflare Worker (src/index.js)
    | -- validates CORS origin / size / Turnstile / rate limit
    | -- attaches instructions.md and language-guide.md from Worker bundle
    | -- POST /v1/responses with store:false
    v
OpenAI Responses API
    | -- plain-text review
    v
Worker JSON -> browser HTML-rendered report and copy function
```

### File responsibilities

| File | Function |
|---|---|
| `site/index.html` | Page layout, disclaimer and input controls |
| `site/style.css` | Responsive styling |
| `site/app.js` | Text uploads, Turnstile, API calls and safe minimal Markdown display |
| `site/config.js` | Public Worker URL and Turnstile **site** key (no secrets) |
| `worker/src/index.js` | API endpoint, security checks, prompt construction and response extraction |
| `worker/wrangler.jsonc` | Worker deployment configuration, permitted origin, model ID and approximate rate-limit binding |
| `worker/reference/instructions.md` | Reviewer version 2.3, organisation-neutral instructions |
| `worker/reference/language-guide.md` | Unmodified combined HTML-extracted reference guide |

### Updating and redeploying

- **Reviewer behaviour:** edit `worker/reference/instructions.md`, then run `npm run deploy` in `worker/` and rerun the known test documents. Keep a backup of the previous version and note what changed.
- **Reference guide:** update `worker/reference/language-guide.md`, preserving its meaning and checking against original sources. Redeploy the Worker. The original source guide is intentionally retained verbatim, including organisational names in source prose; these are reference data, **not instructions to mention the organisation**.
- **AI model:** change `MODEL` in `worker/wrangler.jsonc`, redeploy and test. The exact ChatGPT identity behind the previously tested “AI1” is not established by knowing only that it was accessed via OpenAI. Different API models may produce different results.
- **Frontend:** edit files under `site/` and commit/push to GitHub Pages. No Worker redeploy is necessary for CSS or HTML changes.
- **Secrets:** rotate using `npx wrangler secret put SECRET_NAME`. Never place them in site JavaScript or repository history.
- **Errors:** use Cloudflare Worker request analytics and the browser developer tools (Network tab). The Worker intentionally avoids logging user-supplied document bodies and detailed upstream errors.

### Security, privacy and operating limits

- The website supports pasted text, `.txt` and `.md` only; **no PDF or Word extraction yet**. Limit: **20,000 characters** per review and at least 80. A request-size limit also applies at the Worker.
- A Cloudflare Turnstile token must be **verified server-side** before contacting OpenAI. Site hostname is checked when configured. Client-origin filtering is not sufficient protection on its own.
- Worker rate limiting is **3 requests/minute per connecting IP per Cloudflare location**. It is approximate and can affect users sharing an IP. Turnstile and API project limits are additional controls, not guarantees against abuse or cost overruns.
- The Worker sends text to OpenAI and requests `store:false`. It does not intentionally persist submissions or generated reports. Third-party service processing, retention and security policies still apply; avoid claiming absolute confidentiality or zero retention.
- The model output is treated as untrusted text and HTML-escaped by the frontend before applying a small safe subset of Markdown formatting. Rich Markdown tables are not specially formatted yet.
- Model output is capped to **4,500 output tokens**; longer documents/reports may be truncated. Test latency and completeness with real submissions. The server-side upstream timeout is 110 seconds.
- The public GitHub repository necessarily exposes the frontend; the Worker bundle also contains the ethically oriented **reference content** (not the secret key). Do not include confidential materials as reference documents.

### Before a public launch

1. Confirm the **exact API model** to use; test consistency against the 65 passages and two representative full texts.
2. Set API billing limits/alerts, configure Turnstile for the live hostname, and conduct abuse/security and accessibility checks.
3. Draft a final privacy notice accurately describing external processing and retention. Decide whether a feedback link is wanted.
4. Perform end-to-end live tests. This package is an initial implementation, **not a claim of successful deployment**.

### Reference documentation

- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- Cloudflare Worker secrets: https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare Worker rate limiting: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Turnstile validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/