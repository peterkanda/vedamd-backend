# Deploying MedGemma (and turning on validation)

MedGemma is a Google **open** medical model — it is **not** on OpenRouter's
hosted catalogue, so you self-host it behind an **OpenAI-compatible** endpoint
and point VedaMD at it. The same endpoint then powers (a) the cloud assistant,
(b) the agentic CDS, and (c) the `validate:medgemma` content review.

## 1. Serve MedGemma (OpenAI-compatible)

Pick one. All expose `POST /v1/chat/completions`.

### Option A — vLLM (self-hosted GPU; best for PHI / control)
`deploy/medgemma/docker-compose.yml` in this repo runs MedGemma 27B text on vLLM:

```bash
export HF_TOKEN=...            # Hugging Face token with MedGemma access accepted
export MEDGEMMA_API_KEY=...    # a key YOU choose; vLLM enforces it
docker compose -f deploy/medgemma/docker-compose.yml up -d
# serves http://<host>:8000/v1   (model id: google/medgemma-27b-text-it)
```
Needs a GPU with enough VRAM (27B ≈ 1×A100-40GB or 2×L4; use the 4B model on
smaller GPUs by changing `--model google/medgemma-4b-it`).

### Option B — Hugging Face Inference Endpoints
Deploy `google/medgemma-27b-text-it` as a dedicated endpoint with the
"Text Generation Inference" (OpenAI-compatible) container. Base URL is the
endpoint URL + `/v1`; key is your HF endpoint token.

### Option C — Google Vertex AI (Model Garden)
One-click deploy MedGemma in Vertex Model Garden; front it with the
OpenAI-compatible path (or a small proxy). Best fit if you're already on GCP.

## 2. Point VedaMD at it

Set on the backend (and the same secrets in GitHub Actions for validation):

| Env | Value |
|---|---|
| `OPENROUTER_API_KEY` | your endpoint's key |
| `AGENTIC_OPENROUTER_BASE_URL` | e.g. `https://<host>:8000/v1` |
| `AGENTIC_OPENROUTER_MODEL` | e.g. `google/medgemma-27b-text-it` |

`GET /api/v1/agentic/capabilities` then shows the live `model`, and every chat
response reports the model that actually answered — so you can confirm it's
MedGemma (and see any fallback).

> **PHI:** with self-hosting (Option A) the request body never leaves your
> infrastructure — the right posture for patient context. Hosted options (B/C)
> need a contractual zero-retention arrangement before real PHI flows.

## 3. Run validation

Once the endpoint is live:

```bash
# locally
OPENROUTER_API_KEY=... AGENTIC_OPENROUTER_BASE_URL=.../v1 \
  npm run validate:medgemma -- --all          # writes content/validation/medgemma-review.md

# in CI: the "medgemma content validation" workflow runs nightly + on demand,
# guarded by the MEDGEMMA_* repo secrets, and fails on 'error' verdicts.
```

This is the step that lets us clear the dose-safety worklist
(`content/safety/perkg-dose-review.md`) and verify the national first-line
choices with a medical model — the validation we deferred until the endpoint
exists. Remember it is a **screen, not approval**: a flag means "a human should
look".

## 4. After every model change

Whenever `AGENTIC_OPENROUTER_MODEL` (or another clinical provider's model)
changes, check that the new model is at least as safe as the old one, and that
clinicians aren't trusting it more than it has earned. Clinicians have been
shown to follow wrong AI advice far more often than right advice (Agweyu et al.,
*Nature Health* 2026), so a change in how they respond matters as much as a
change in the model's accuracy.

1. **Before switching**, run the offline safety eval against the current model:

   ```bash
   VEDAMD_API_KEY=... ANTHROPIC_API_KEY=... npm run eval:llm-safety
   ```

   It sends the synthetic cases in `content/evals/llm-safety/cases.json` to the
   running API, applies each case's checks, has Claude score the answers with
   the study's rubric, and writes a report to `content/evals/llm-safety/results/`.
2. **After switching**, run it again and compare the two reports. Read every
   case that fails a check or is scored unsafe; don't rely on the rates alone.
3. **Once clinicians are using it**, open *CDS card feedback → AI suggestions by
   model* in the developer console (`GET /v1/cds-feedback/models`). Compare the
   new model with the previous one once each has 30 feedback responses. A
   lower override rate or more critical AI cards accepted is flagged; review a
   sample of those cards before concluding the new model is better.

This covers the server-side model behind `/v1/agentic/evaluate`. The on-device
MedGemma build in the mobile app is not measured this way: the eval calls the
API, and the app doesn't yet collect accept/override feedback.
