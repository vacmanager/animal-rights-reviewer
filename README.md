# Animal rights language reviewer — website prototype

**Version:** 0.1 · 25 October 2026  
**Status:** Implemented prototype, **not deployed or live-tested against the OpenAI API**.

This project provides a GitHub Pages frontend and a Cloudflare Worker backend. The Worker sends one request per review to OpenAI's Responses API, using the complete reviewer instructions and principles/language guide as its reference context. The site is intended to provide *advisory* language reviews, not authoritative editorial decisions.

## Deployment procedure (GitHub + Cloudflare dashboard)

The frontend is already committed at the **repository root** and published through GitHub Pages at https://vacmanager.github.io/animal-rights-reviewer/. GitHub Pages does not provide the protected API endpoint.

1. In Cloudflare **Workers & Pages → Create application → GitHub**, connect the repository `vacmanager/animal-rights-reviewer`. Configure the Worker **name** as `animal-rights-language-reviewer-api`, matching `worker/wrangler.jsonc`; **production branch** `main`; **root directory** `worker`; **deploy command** `npx wrangler deploy`. Keep the Worker code separate from GitHub Pages. Confirm the deployment succeeds and record its actual `https://....workers.dev` address. Cloudflare Workers Builds can deploy from GitHub automatically on subsequent commits.
2. In Cloudflare **Turnstile**, create a **Managed** widget named `Animal rights language reviewer`, restricted to hostname `vacmanager.github.io` (hostname only, without `https://` or repository path). Retain the public **site key** and private **secret key** separately.
3. In Cloudflare **Workers & Pages → your Worker → Settings → Variables and Secrets**, add two **Secret** values: `OPENAI_API_KEY` and `TURNSTILE_SECRET_KEY`. Create the OpenAI project/API key through https://platform.openai.com/ and configure billing, modest project budgets and alerts. The ChatGPT subscription is separate from API billing. Never store these secrets in GitHub or a message.
4. The Worker config is preconfigured for GitHub Pages origin `https://vacmanager.github.io`, expected Turnstile hostname `vacmanager.github.io` and sample model `gpt-5`. **This model has not been established as identical to the model used in the earlier AI1 experiments**. To change models, edit `worker/wrangler.jsonc`, redeploy and test the benchmark.
5. After the Worker is deployed and the Turnstile widget exists, edit the root-level `config.js` on GitHub. Set `apiBase` to the **actual** Worker URL and `turnstileSiteKey` to the **public** site key. These two values are safe to store in GitHub. They must not be confused with the secret API key or Turnstile secret.
6. Smoke test the GitHub Pages site with non-confidential material, including a short passage and representative full documents. Verify the browser console/network response, copies of reviews and limits. Until the secrets and public config are complete, the form intentionally remains disabled. Do not announce the site for public use until security, costs and privacy text are checked.

For a fallback command-line deployment, install Node.js and run `npm install`, `npx wrangler login`, and `npm run deploy` within `worker/`. Secrets may alternatively be added using `npx wrangler secret put OPENAI_API_KEY` and `npx wrangler secret put TURNSTILE_SECRET_KEY`.

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
| `index.html` | Page layout, disclaimer and input controls |
| `style.css` | Responsive styling |
| `app.js` | Text uploads, Turnstile, API calls and safe minimal Markdown display |
| `config.js` | Public Worker URL and Turnstile **site** key (no secrets) |
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