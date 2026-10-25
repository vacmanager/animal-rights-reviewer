# Animal rights language reviewer — website prototype

**Version:** 0.1 · updated 26 October 2026  
**Status:** Deployed and successfully tested with OpenAI API; still under pre-launch evaluation.

This project provides a GitHub Pages frontend and a Cloudflare Worker backend. The Worker sends one request per review to OpenAI's Responses API, using the complete reviewer instructions and principles/language guide as its reference context. The site is intended to provide *advisory* language reviews, not authoritative editorial decisions.

## Deployment procedure (GitHub + Cloudflare dashboard)

The frontend is already committed at the **repository root** and published through GitHub Pages at https://vacmanager.github.io/animal-rights-reviewer/. GitHub Pages does not provide the protected API endpoint.

1. In Cloudflare **Workers & Pages → Create application → GitHub**, connect the repository `vacmanager/animal-rights-reviewer`. Configure the Worker **name** as `animal-rights-language-reviewer-api`, matching `worker/wrangler.jsonc`; **production branch** `main`; **root directory** `worker`; **deploy command** `npx wrangler deploy`. Keep the Worker code separate from GitHub Pages. Confirm the deployment succeeds and record its actual `https://....workers.dev` address. Cloudflare Workers Builds can deploy from GitHub automatically on subsequent commits.
2. In Cloudflare **Turnstile**, create a **Managed** widget named `Animal rights language reviewer`, restricted to hostname `vacmanager.github.io` (hostname only, without `https://` or repository path). Retain the public **site key** and private **secret key** separately.
3. In Cloudflare **Workers & Pages → your Worker → Settings → Variables and Secrets**, add two **Secret** values: `OPENAI_API_KEY` and `TURNSTILE_SECRET_KEY`. Create the OpenAI project/API key through https://platform.openai.com/ and configure billing, modest project budgets and alerts. The ChatGPT subscription is separate from API billing. Never store these secrets in GitHub or a message.
4. The Worker config is preconfigured for GitHub Pages origin `https://vacmanager.github.io`, expected Turnstile hostname `vacmanager.github.io` and model `gpt-6.1-sol` with medium reasoning effort. This API model is not necessarily identical to the model used in earlier AI1 experiments. To change models, edit `worker/wrangler.jsonc`, redeploy and test the benchmark.
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

- **Reviewer behaviour:** edit `worker/reference/instructions.md`; the connected GitHub deployment updates the Worker automatically when a commit reaches `main`. Verify deployment and rerun known test documents. Keep a backup of the previous version and note what changed.
- **Reference guide:** update `worker/reference/language-guide.md`, preserving its meaning and checking against original sources. Redeploy the Worker. The original source guide is intentionally retained verbatim, including organisational names in source prose; these are reference data, **not instructions to mention the organisation**.
- **AI model:** change `MODEL` in `worker/wrangler.jsonc`, redeploy and test. The exact ChatGPT identity behind the previously tested “AI1” is not established by knowing only that it was accessed via OpenAI. Different API models may produce different results.
- **Frontend:** edit `index.html`, `app.js`, `style.css` or `config.js` at the repository root and commit/push to GitHub Pages. No Worker redeploy is necessary for CSS or HTML changes.
- **Secrets:** rotate using `npx wrangler secret put SECRET_NAME`. Never place them in site JavaScript or repository history.
- **Errors:** use Cloudflare Worker request analytics and the browser developer tools (Network tab). The Worker intentionally avoids logging user-supplied document bodies and detailed upstream errors.

### Security, privacy and operating limits

- The website supports pasted text, `.txt` and `.md` only; **no PDF or Word extraction yet**. Limit: **20,000 characters** per review and at least 80. A request-size limit also applies at the Worker.
- A Cloudflare Turnstile token must be **verified server-side** before contacting OpenAI. Site hostname is checked when configured. Client-origin filtering is not sufficient protection on its own.
- Worker rate limiting is **3 requests/minute per connecting IP per Cloudflare location**. It is approximate and can affect users sharing an IP. Turnstile and API project limits are additional controls, not guarantees against abuse or cost overruns.
- The Worker sends text to OpenAI and requests `store:false`. It does not intentionally persist submissions or generated reports. Third-party service processing, retention and security policies still apply; avoid claiming absolute confidentiality or zero retention.
- The model output is treated as untrusted text and HTML-escaped by the frontend before applying a small safe subset of Markdown formatting. Rich Markdown tables are not specially formatted yet.
- Model output is capped to **11,000 output tokens**, including reasoning tokens; longer documents/reports may still be incomplete. Test latency and completeness with real submissions. The server-side upstream timeout is 110 seconds.
- The public GitHub repository necessarily exposes the frontend; the Worker bundle also contains the ethically oriented **reference content** (not the secret key). Do not include confidential materials as reference documents.


### Reviewer instruction revisions

- **26 October 2026 (v2.3 clarification):** In advocacy seeking to end a particular use of animals, distinguish abolition of that practice from the broader objective of ending all animal exploitation. Briefly note the narrower objective in the overall assessment when relevant, without making it an automatic language fault or requiring every focused article to argue for veganism. Test this with the Moruya rodeo campaign and unrelated news reporting.

### Live deployment and review feedback

- **Frontend:** https://vacmanager.github.io/animal-rights-reviewer/ (GitHub Pages, `main` branch, repository root).
- **Worker:** https://animal-rights-language-reviewer-api.white-voice-896d.workers.dev (Cloudflare Worker, source directory `worker/`). Cloudflare is connected to the GitHub `main` branch for automatic deployments.
- **API model:** `gpt-6.1-sol`, medium reasoning; this is a provisional tested configuration. Version 2.3 reviewer instructions and the combined reference guide are supplied separately on every request.
- **Feedback:** after a completed review, visitors can select **Helpful** or **Not helpful**, optionally add a comment (up to 1,200 characters), and click **Email feedback**. The browser requests a new tab for a pre-addressed email draft to `info@veganaustralia.org.au`. Browsers and installed mail handlers control how `mailto:` opens. Visitors must send the draft themselves; feedback is never sent or stored automatically by the website. **The document and generated review are not included in the draft.** Only the selected rating and optional comment are included. This deliberately simple mechanism can be replaced by a dedicated feedback service later.
- **Cost monitoring:** use the OpenAI project's Usage dashboard to track spend and per-model token counts. The first four requests cost US$0.22 (US$0.055/request on average). After seven requests, cumulative spend was US$0.35, an additional US$0.13 for three mixed-model requests (US$0.043/request). These averages are exploratory and are **not** a per-review measurement for GPT-6.1 Sol. Turnstile and approximate rate limiting reduce abuse but are not financial caps.

### Before a public launch

1. Confirm the **exact API model** to use; test consistency against the 65 passages and two representative full texts.
2. Set API billing limits/alerts, configure Turnstile for the live hostname, and conduct abuse/security and accessibility checks.
3. Draft a final privacy notice accurately describing external processing and retention. Verify that the feedback email opens correctly on common devices.
4. Perform end-to-end live tests. The prototype has been successfully deployed, but public-release checks remain.

### Reference documentation

- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- Cloudflare Worker secrets: https://developers.cloudflare.com/workers/configuration/environment-variables/
- Cloudflare Worker rate limiting: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Turnstile validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/