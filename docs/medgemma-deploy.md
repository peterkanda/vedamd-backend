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
