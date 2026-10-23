# Douyin Favorites Brief

> **Portfolio edition** · A local pipeline that turns a messy "save for later" folder into a daily brief and actionable knowledge cards.

`Saved → evidence → structured judgment → daily brief → action`

[简体中文](README.md) | [English](README.en.md)

> **This is not a public scraper or a one-click reproduction kit.** The repository publishes the product definition, architecture, prompt, renderer, and synthetic examples. The collection/login layer depends on a personal session and platform pages, and is intentionally not included.

## What it produces

Each saved video becomes a five-field card:

| Field | Question it answers |
| --- | --- |
| What it says | The core idea or method |
| Hook | The moment (with timestamp when available) that earns attention |
| Verdict | Watch fully / first half only / entertainment / skip |
| Actions | 1–3 concrete, verb-first next steps |
| Follow-up | Yes / no / later, with a reason |

See [sample card](examples/sample-card.md), [sample daily brief](examples/sample-daily.md), and [sample analysis JSON](examples/sample-analysis.json). All examples are synthetic.

## The problem

Saving is cheap; revisiting is expensive. A saved video creates the illusion of ownership, but it rarely enters a working knowledge base. Most tools ask for another app, another login, and another subscription. The missing piece is a maintainable local pipeline with clear failure states and a real output surface.

## What I built

- **Product definition:** a state machine and acceptance criteria for collection, extraction, analysis, rendering, and notification.
- **Private collection layer:** Playwright with a dedicated Chrome profile, de-duplication by `aweme_id`, video download, frame extraction, and OCR.
- **Model-agnostic analysis:** the collector only produces an evidence pack; a host model follows [prompts/analyze.md](prompts/analyze.md) and returns strict JSON.
- **Public renderer:** Node.js turns the JSON into Obsidian source notes, cards, a daily brief, and an index.
- **Failure handling:** login expiry, per-item failures, missing analysis, and renderer validation all have explicit states.

## Run the demo

No login, network, or npm dependencies required; Node.js >= 20.11 only (no `npm install`):

```bash
git clone https://github.com/Ryankiinovo/douyin-favorites-brief.git
cd douyin-favorites-brief
npm run demo
```

The output is written to `demo/out/抖音收藏/`. The renderer reads only local JSON/Markdown and never calls a model or the network.

## Public vs. private

| Layer | Public? | Why |
| --- | --- | --- |
| Product, architecture, decisions | Yes | Shows problem framing and trade-offs |
| Prompt, JSON contract, renderer | Yes | Reviewable and runnable without credentials |
| Synthetic examples, demo | Yes | No real account or network |
| Collector, login, OCR binary | No | Depends on a personal session and local environment |
| Cookies, raw videos, real cards, logs | No | Privacy and copyright boundaries |

The boundary is itself a product decision: **the value of the full pipeline does not require publishing the collector.** The public layer shows how the system is defined, judged, rendered, and maintained.

## Results

| Milestone | Status | Evidence |
| --- | --- | --- |
| M1 single-item loop | Done | One video produced a source note, card, and daily entry |
| M2 batch + de-duplication | Done with `--limit 10` | 9 successes, 1 ffmpeg timeout; same-day reruns merge |
| M3 scheduled run + notification | Landed | Daily 08:00 Asia/Shanghai task; final reply is the digest |
| M4 history backfill | Not started | Stabilize daily increments first |

The failed item is visible in the brief's "failed / pending" section instead of being hidden behind a 100% success claim.

## Repository map

```text
docs/product.md        product definition (public edition)
docs/architecture.md   full system and public boundary
docs/case-study.md     portfolio narrative
docs/decisions.md      key decisions
docs/privacy.md        privacy and threat model
prompts/analyze.md     structured extraction prompt
examples/              synthetic outputs
demo/                  local renderer demo
scripts/render.mjs     Obsidian renderer
```

## License

MIT. See [LICENSE](LICENSE).

---

For portfolio review, start with the [case study](docs/case-study.md). Please do not use this repository to submit real account data.
