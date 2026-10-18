# Sustainability

Voidcat is local-first: the heavy work (reading, filing, answering) happens on a computer you already own, and the
cloud only runs when you ask it to. This page measures what that costs in carbon, using the Green Software
Foundation's **Software Carbon Intensity** (SCI, ISO/IEC 21031:2024):

> **SCI = (E × I + M) per R**
> E = energy used, I = carbon intensity of that energy, M = embodied emissions of the hardware, R = the functional unit.

**Functional unit R: one document read and filed** (title, type, folder and facts). Measured on 18 October 2026.

## What we measured

| Measurement | Value | How |
|---|---|---|
| Local filing, warm (Apple M5, `qwen3.5:9b` in Ollama) | **24 s** per document (16–31 s) | 5 runs on the invented demo documents, Ollama's own timings |
| Local filing, cold (model not loaded yet) | 36 s | first run of the day |
| Text sent to the model per document | 500–734 prompt tokens, 300–555 output tokens | Ollama token counts |
| CI for the whole hackathon so far | **7.5 runner-hours** over 61 pipelines | GitLab API, sum of job durations |
| Rust tests with the cache vs without | **260 s** median vs **466 s** cold (−44%) | 53 `rust-test` runs |
| Longest-running deploy jobs | 85 s (web), 96 s (API) | 5 and 4 runs |

We tried to measure the Mac's power from its battery without admin rights; the readings update too slowly for a 25-second
job, so power is an assumption below. To measure it yourself during a filing run:
`sudo powermetrics --samplers cpu_power,gpu_power -i 1000 -n 60`.

## SCI per document

| | Local (on your Mac) | Read now (cloud) |
|---|---|---|
| E | 20 W × 30 s = **0.17 Wh** (assumed 20 W for Apple-silicon GPU inference, range 10–30 W; 30 s = measured 24 s plus the shorter folder step) | **~0.24 Wh**: Google's published median for a Gemini text prompt (Aug 2025); our prompts are short, text only |
| I | 150 gCO₂e/kWh (assumed for Spain's grid; check today's value on Electricity Maps) | Google's figure already includes it |
| E × I | **0.025 g** | **~0.03 g** (Google's published median) |
| M | ~0.036 g (assumed: 150 kg of a laptop's manufacturing emissions spread over 4 years of use, for the 30 s Voidcat uses it) | included in Google's figure only in part |
| **SCI** | **≈ 0.06 gCO₂e per document** | **≈ 0.03 g + network and storage** |

Both are hundredths of a gram per document: a whole library of 100 papers is a few grams either way. The local path
needs no data centre, no network transfer and no server kept warm for you, and it runs on hardware you already have.

## Choices that keep it small

- **Local by default.** Reading, filing, facts and Ask run on the Mac. The cloud runs only when you click Read now or ask in a browser.
- **Text, never images, to the cloud.** Scans are read by OCR on your own device (Apple Vision on the Mac, Tesseract in the browser); Gemini gets a few hundred tokens of masked text instead of page images.
- **No thinking tokens for filing.** The cloud filing call runs Gemini with thinking turned off and a fixed JSON shape.
- **Nothing idles.** Both Cloud Run services scale to zero between requests and are capped at 3 instances.
- **A low-carbon region.** Everything runs in Google Cloud `europe-west1` (Belgium), which Google marks as a low-CO₂ region.
- **Hard limits.** 300 cloud reads and 1,000 cloud questions per person per month cap the worst case.
- **Cached CI.** Rust builds and `node_modules` are cached between pipelines; the longest job runs 44% faster with its cache.
- **Small models.** The default local model is 9B parameters; Voidcat suggests 2B for 8 GB Macs and only offers 27B where it fits.

## The CI's footprint

7.5 runner-hours on GitLab's small Linux runners (2 vCPU, 8 GB). With the Cloud Carbon Footprint coefficients for
Google Cloud (≈2.5 W per vCPU at average load plus ≈0.4 W per GB of memory, PUE 1.1), that's about **9 W per job**,
or **≈ 67 Wh for the whole hackathon** so far: under 30 gCO₂e at an assumed 400 g/kWh grid.

## Next

- Measure the Mac's power with `powermetrics` and replace the 20 W assumption.
- Show each document's energy in the app, and the month's total in Settings.
- Run CI only for the parts a change touches (Rust tests only when `src-tauri/` changes).
