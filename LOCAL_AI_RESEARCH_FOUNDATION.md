# NEXUSFLOW V4.0 — LOCAL AI RESEARCH & INTEGRATION FOUNDATION

> **STATUS**: RESEARCH & INTEGRATION FOUNDATION ONLY  
> **POLICY**: STRICT $0 PRODUCTION ROUTING REMAINS ACTIVE (`Gemini -> Groq -> OpenRouter -> Graceful Failure`).  
> **DECISION**: NO FINAL LOCAL MODEL SELECTED; NO LARGE MODEL BINARIES DOWNLOADED.

---

## 1. Executive Overview

NexusFlow V4.0 currently routes AI Copilot and assistant queries across Google Gemini (Free Tier), Groq (Free Tier), and OpenRouter (`:free` whitelisted routes). While this delivers zero operating cost and high capability, network dependencies, cloud latency, and student privacy considerations justify establishing the software abstractions for future local model execution.

This document establishes the evaluation framework, runtime candidates, quantization profiles, and architectural boundaries for local model integration.

---

## 2. Candidate Model Classes

| Model Candidate | Parameters | Primary Strengths | Recommended Quantization | Context Window | License | Target Hardware |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Llama 3.2 3B Instruct** | 3.21B | Lightweight, edge reasoning, low RAM | GGUF Q4_K_M (~2.2 GB) | 128K | Llama 3.2 Community | Student Laptops (8GB RAM, CPU-only) |
| **Qwen 2.5 Coder 7B Instruct** | 7.61B | Code synthesis, task breakdown, structured JSON | GGUF Q4_K_M (~4.7 GB) | 32K | Apache 2.0 | Dev Workstations (16GB RAM / 6GB VRAM) |
| **DeepSeek R1 Distill Qwen 7B** | 7.6B | Chain-of-thought mathematical & DAA reasoning | GGUF Q4_K_M (~4.8 GB) | 64K | MIT | Dev Workstations (16GB RAM / 8GB VRAM) |
| **Phi 3.5 Mini Instruct** | 3.82B | Dense reasoning, low power consumption | INT4 / GGUF Q4 (~2.5 GB) | 128K | MIT | Student Laptops & Edge Servers |

---

## 3. Runtime & Execution Engines

1. **llama.cpp / Ollama**:
   - *Strengths*: Exceptional cross-platform portability (CPU AVX2, Apple Silicon Metal, CUDA, ROCm, Vulkan); simple HTTP REST API on `localhost:11434`.
   - *Suitability*: Ideal for student workstation self-hosting.
2. **vLLM**:
   - *Strengths*: PagedAttention, continuous batching, high concurrency.
   - *Suitability*: Ideal for centralized lab / institutional university server hosting.
3. **ONNX Runtime (DirectML / WebGPU)**:
   - *Strengths*: In-browser execution via WebAssembly / WebGPU for client-side zero-install inference.
   - *Suitability*: Lightweight text tokenization and embedding generation.

---

## 4. Quantization Trade-offs

- **Q4_K_M (4-bit Medium)**: The recommended baseline. Preserves >98% of FP16 perplexity with a ~70% reduction in memory footprint.
- **Q5_K_M (5-bit Medium)**: Negligible quality loss; recommended when 6GB+ VRAM is available.
- **Q8_0 (8-bit)**: Near-lossless precision; recommended for code parsing and strict JSON schema output.

---

## 5. Architectural Boundary & Safety Invariants

1. **Zero Secret Leakage**:
   - Local model endpoints operate strictly on user loopback (`localhost`) or private LAN. No API keys, credentials, or student identities are transmitted or stored in telemetry logs.
2. **DAA Independence**:
   - All process mining, conformance checking, Knapsack scheduling, and academic evidence evaluation remain strictly deterministic. Local AI, like cloud AI, is strictly advisory.
3. **No Automatic Activation**:
   - Local model provider implementations must remain disabled by default in production, requiring explicit user/admin configuration flags before handling queries.
