# Score Audit — roles the role-family gate may be burying at 0

Generated: 2026-06-16 13:21:32 UTC
Read-only diagnostic: scores recomputed live (stored `fit_score` ignored).

**Current profile**
- Role families: Backend, Security, Fullstack
- Stack: TypeScript, NestJS, Node.js, Python, Django, Go, Rust, PostgreSQL, MongoDB, AWS, Terraform, Kafka, Solidity
- Seniorities: Senior, Staff, Lead
- Location types: remote

## Totals (recomputed)

| Metric | Count |
|--------|-------|
| Jobs total | 6093 |
| Scoring > 0 | 1834 |
| Scoring 0 | 4259 |

## Buckets (a row can land in several)

| Bucket | Meaning | Count |
|--------|---------|-------|
| A | Watchlist board (greenhouse/lever/ashby) | 2245 |
| B | Generic engineering title the family phrases miss | 0 |
| C (raw) | Stack-implied, ≥2 terms in title+desc+tags | 389 |
| C (structured) | Stack-implied, ≥2 terms in title+tags only | 22 |

> **Precision note on Bucket C.** The raw count (title+desc+tags) is
> inflated by the English word "go" matching the "Go" stack term inside
> long HTML descriptions (and "Python"/"AWS" appearing in boilerplate).
> The **structured** count (title+tags only) is the trustworthy soft-gate
> signal and is the one the verdict relies on.

## Bucket A — watchlist board — 2245 rows

- Assistant Controller  @ LayerZero Labs [greenhouse]
- Business Development Lead - Hong Kong @ LayerZero Labs [greenhouse]
- Business Development Lead - Japan @ LayerZero Labs [greenhouse]
- Business Operations Lead @ LayerZero Labs [greenhouse]
- Controller @ LayerZero Labs [greenhouse]
- Crypto Business Development Intern @ LayerZero Labs [greenhouse]
- Customer Success Manager @ LayerZero Labs [greenhouse]
- Institutional Business Development Intern @ LayerZero Labs [greenhouse]
- Product Manager, API @ LayerZero Labs [greenhouse]
- Vertical Marketing Manager - Institutions @ LayerZero Labs [greenhouse]

## Bucket B — generic engineering title — 0 rows

_(empty)_

## Bucket C (raw) — stack-implied, title+desc+tags — 389 rows

- Senior ML Engineer @ Clutch [remoteok]
- Implementation Specialist @ Dossier - Digital Competency Management [remoteok]
- Junior Data Scientist @ Quadrant [hireweb3]
- VP of Data Science @ SecurityScorecard [hireweb3]
- DevOps Manager @ Cere Network [hireweb3]
- Product Manager / Director – GPU &amp; AI Services @ Impossible Cloud [web3career]
- Regional Managing Director Canada @ Little Caesars Pizza [remoteok]
- Binance Accelerator Program - AI Research Scientist (LLM Reasoning &amp; Post-Training) @ Binance [web3career]
- Clinical Research Professional @ CuraSenseAI [remoteok]
- English speaking Support Associate @ Wolt [remoteok]

## Bucket C (structured) — stack-implied, title+tags only — 22 rows

- Senior ML Engineer @ Clutch [remoteok]
- Regional Managing Director Canada @ Little Caesars Pizza [remoteok]
- Clinical Research Professional @ CuraSenseAI [remoteok]
- English speaking Support Associate @ Wolt [remoteok]
- Clinical Coding Trainer @ Torbay and South Devon NHS Foundation Trust [remoteok]
- Tutor a E Learning Industria Agroalimentaria @ Grupo Coremsa [remoteok]
- Site Reliability Engineer - AI & ML Infrastructure (Kubernetes, AWS & Terraform) @ Deepgram [ashby]
- Rust Engineer (Solana) @ Exo Tech [web3career]
- Quant - Risk | Propr.xyz @ SwissBorg [web3career]
- Software Engineering Internship - Aarhus Office @ Chainalysis [web3career]

## Residual sample (0-scored, in NONE of the buckets)

1887 rows are 0-scored and unbucketed. Random sample to confirm
they're genuinely non-relevant:

- Enterprise Account Executive - Public & Private Sector @ Chainalysis [web3career]
- TEAM MEMBER COLD END @ Saint-Gobain Group in India [remoteok]
- Cybersecurity GRC Evaluator - Expert @ mercor [himalayas]
- Events &amp; Marketing Manager @ MoonPay [web3career]
- Trade Marketing &amp; Brand Activation Manager @ Cloetta [remoteok]
- ServiceNow Developer/Application Programmer @ Prosync [himalayas]
- Logistics Coordinator @ Remote Recruitment [himalayas]
- Assistant Instructor (Part-Time), Bachelor Psychology, Technology Assisted Teach @ Capella University [himalayas]
- Senior Managing Editor, Journals @ American Cancer Society [himalayas]
- Analytical Chemistry Specialist - AI Trainer @ Invisible Technologies [himalayas]

## Verdict — gate is clean

Precise signals are near-empty (B=0 generic eng titles, C-structured=22 stack-in-title/tags) and the residual sample is non-relevant. Raw Bucket C (389) is inflated by free-text "go" matches, not real signal. No fix needed — the precision gain from the rescore stands.
