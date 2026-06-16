# Score Audit — roles the role-family gate may be burying at 0

Generated: 2026-06-16 02:37:24 UTC
Read-only diagnostic: scores recomputed live (stored `fit_score` ignored).

**Current profile**
- Role families: Backend, Security, Fullstack
- Stack: TypeScript, NestJS, Node.js, Python, Django, Go, Rust, PostgreSQL, MongoDB, AWS, Terraform, Kafka, Solidity
- Seniorities: Senior, Staff, Lead
- Location types: remote

## Totals (recomputed)

| Metric | Count |
|--------|-------|
| Jobs total | 5768 |
| Scoring > 0 | 1719 |
| Scoring 0 | 4049 |

## Buckets (a row can land in several)

| Bucket | Meaning | Count |
|--------|---------|-------|
| A | Watchlist board (greenhouse/lever/ashby) | 2261 |
| B | Generic engineering title the family phrases miss | 51 |
| C (raw) | Stack-implied, ≥2 terms in title+desc+tags | 384 |
| C (structured) | Stack-implied, ≥2 terms in title+tags only | 22 |

> **Precision note on Bucket C.** The raw count (title+desc+tags) is
> inflated by the English word "go" matching the "Go" stack term inside
> long HTML descriptions (and "Python"/"AWS" appearing in boilerplate).
> The **structured** count (title+tags only) is the trustworthy soft-gate
> signal and is the one the verdict relies on.

## Bucket A — watchlist board — 2261 rows

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

## Bucket B — generic engineering title — 51 rows

- Principal Engineer, Agent Infrastructure & Memory Architecture @ OKX [greenhouse]
- Principal / Staff Engineer - Compliance @ OKX [greenhouse]
- Senior Staff Engineer, AI Platform @ OKX [greenhouse]
- Senior Staff Engineer, AI Platform and Infrastructure @ OKX [greenhouse]
- Senior/Staff Engineer, Liquidity Platform, Private Data Engineer @ OKX [greenhouse]
- Senior/Staff Engineer, Liquidity Platform, Trading Service @ OKX [greenhouse]
- Staff/Senior Staff Engineer, Kubernetes @ OKX [greenhouse]
- Staff Engineer, Distributed Storage and HPC & AI Infrastructure @ Together AI [greenhouse]
- Staff Engineer, Account Engineering @ Stripe [greenhouse]
- Staff Engineer - Production Eng @ Stripe [greenhouse]

## Bucket C (raw) — stack-implied, title+desc+tags — 384 rows

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

1674 rows are 0-scored and unbucketed. Random sample to confirm
they're genuinely non-relevant:

- Crypto Quantitative Researcher @ Alexander Chapman [web3career]
- Lead Business Analyst @ Exadel [himalayas]
- Director Account Management @ Pharmacy Data Management, Inc. [himalayas]
- Accounts Payable Clerk @ Remote Recruitment [himalayas]
- Investment Expert - Fully Remote @ mercor [himalayas]
- Associate Manager, CX Incident Response @ Coinbase [hireweb3]
- Assamese Language Expert - Fully Remote | Upto $20/hr Part-time @ mercor [himalayas]
- Web Developer (Remote) @ thehivecareers.co [weworkremotely]
- Admissions Representative @ South University [himalayas]
- Clinical Project Manager- IVD @ Lifelancer [himalayas]

## Verdict — title gaps

Bucket B holds 51 real engineering roles with generic titles the family phrases miss (Staff/Principal/Founding/Senior Engineer, Member of Technical Staff). Recommend adding these title patterns to the taxonomy rather than softening the gate. Bucket A (2261) is mostly genuine non-eng roles at watchlist companies (Controller, BD, Customer Success) — correctly 0. Bucket C raw is 384 but its structured (title+tags) signal is only 22: the raw count is inflated by the English word "go" matching the "Go" stack term in HTML descriptions, so it is NOT reliable soft-gate evidence.

### Suggested title patterns (do not implement here)

- `staff engineer`
- `staff software engineer`
- `senior staff engineer`
- `principal engineer`
- `senior engineer`
- `founding engineer`
- `lead engineer`
- `member of technical staff`
- `mts`
