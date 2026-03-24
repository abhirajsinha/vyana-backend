# Vyana Insights System

This document explains how Vyana generates daily health insights and near-term forecasts.

It covers:

- data inputs
- deterministic reasoning pipeline
- personalization logic
- AI integration boundaries
- fallback behavior for new users
- forecast generation
- API contracts

Authentication for protected insight routes (Bearer JWT) is documented in `readme.md` and `SYSTEM_DESIGN.md` (`/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/refresh`).

---

## 1) System Goals

The insights system is designed to be:

- **Accurate**: core reasoning is rule-based and explainable.
- **Personalized**: compares current signals against user baseline.
- **Safe**: AI never does diagnosis and is constrained by structured context.
- **Progressive**: works for users with 0 logs and improves as data grows.
- **Actionable**: every insight includes cause + solution.

---

## 2) High-Level Architecture

Primary flow:

`Logs -> Signals -> Trends -> Context -> Priority Resolution -> Insights -> AI Interpretation (optional)`

Forecast flow:

`Current Context -> Trend Continuation + Variability + Confidence -> Tomorrow Outlook + Next-Phase Preview`

### Deterministic vs AI responsibilities

- **Deterministic engine (source of truth)**
  - maps raw logs to normalized states
  - detects trends, variability, interactions, deviations
  - resolves priority drivers
  - creates fallback-safe draft insights
- **AI layer (optional enhancement)**
  - uses structured context + priority metadata
  - rewrites/interprets insight output into polished language
  - must return strict JSON format
  - falls back to deterministic output on any failure

---

## 3) Data Inputs

From `DailyLog` and user profile:

- mood
- energy
- sleep
- stress
- diet
- exercise
- activity
- symptoms[]
- pain
- cravings
- fatigue
- padsChanged
- cycle data (`lastPeriodStart`, `cycleLength`)

---

## 4) Signal Layer

Raw values are normalized to states:

- **Sleep**: poor / moderate / optimal / unknown
- **Stress**: calm / moderate / elevated / unknown
- **Mood**: low / neutral / positive / unknown
- **Exercise**: sedentary / light / active / unknown
- **Bleeding load** (from `padsChanged`): light / moderate / heavy / unknown

### Multi-day weighting (anti latest-log bias)

Signals are computed with weighted recent history (up to 5 logs), where newer logs have higher weight.

---

## 5) Trend + Variability Layer

For recent logs (up to 5):

- trend: increasing / decreasing / stable / insufficient
  - sleep
  - stress
  - mood
- variability: low / moderate / high / insufficient
  - sleep variability
  - mood variability

Variability captures instability that plain start/end trend misses.

---

## 6) Cross-Signal Interaction Layer

The system detects interaction flags, for example:

- `sleep_stress_amplification`
- `mood_stress_coupling`
- `sedentary_strain`

These flags directly influence physical/mental/emotional insight text and recommendations.

---

## 7) Phase-Aware Personalization

Baseline comparison behavior:

- use **phase baseline** when same-phase history has enough logs (`>=7`)
- otherwise fallback to **global baseline** (`>=7`)
- otherwise baseline scope is `none`

This prevents biologically misleading comparisons across different cycle phases.

Returned as:

- `baselineScope`: `phase | global | none`
- `baselineDeviation`: e.g.
  - `sleep_below_personal_baseline`
  - `stress_above_personal_baseline`

---

## 8) Priority Resolution Engine

When multiple issues trigger together, the system resolves a deterministic priority list.

Examples of drivers:

- `sleep_variability_high`
- `sleep_below_baseline`
- `stress_above_baseline`
- `bleeding_heavy`
- `sleep_stress_amplification`
- `mood_stress_coupling`
- `sedentary_strain`
- `phase_deviation`
- `high_strain`

`priorityDrivers[0]` is the primary driver and governs recommendation priority.

---

## 9) Insight Generation Contract

Each response includes:

- `physicalInsight`
- `mentalInsight`
- `emotionalInsight`
- `whyThisIsHappening`
- `solution`
- `recommendation` (kept for compatibility; mirrors solution strategy)

Behavior highlights:

- low confidence softens claims
- high variability shapes both explanations and suggestions
- baseline deviation can override generic advice

---

## 10) New User / Onboarding Logic

The API exposes onboarding readiness explicitly:

- `isNewUser`: true when logs are fewer than 3
- `progress`:
  - `logsCount`
  - `nextMilestone` (3 -> 7 -> 14 -> 30)
  - `logsToNextMilestone`

Fallback behavior:

- insights still generated using phase-based reasoning
- confidence usually low
- guidance nudges users to keep logging

---

## 11) AI Interpretation Layer

AI endpoint usage is optional (`OPENAI_API_KEY`).

The model receives:

- full structured context
- primary + secondary priority drivers
- priority reason
- deterministic draft fallback

Prompt constraints enforce:

- concise output
- no diagnosis
- no filler
- strict JSON schema
- fallback-aware language when `mode = fallback`

If parsing/validation fails, deterministic insight output is returned.

---

## 12) Forecast Layer (`/api/insights/forecast`)

Forecast is deterministic and grounded in current context.

Output includes:

- tomorrow outlook (trend and priority aware)
- next-phase preview (`inDays`, message)
- confidence block:
  - `level`
  - `score`
  - `message`

Forecast logic uses:

- primary drivers
- trend continuation cues (e.g. stress increasing + sleep decreasing)
- variability impact (adds uncertainty language)
- confidence-aware messaging

---

## 12.5) Authentication

`GET /api/insights` and `GET /api/insights/forecast` require `Authorization: Bearer <access_token>`. Obtain tokens by registering or logging in via `POST /api/auth/register`, `POST /api/auth/login`, or `POST /api/auth/google` (see `readme.md`).

---

## 13) Main API Responses

### `GET /api/insights`

Top-level:

- `isNewUser`
- `progress`
- `mode`
- `confidence`
- `aiEnhanced`
- `basedOn`
- `insights`

`basedOn` includes explainability fields:

- phase
- recent logs count
- confidence score
- baseline scope and deviations
- priority drivers
- interaction flags
- trends
- reasoning

### `GET /api/insights/forecast`

Top-level:

- `isNewUser`
- `progress`
- `today`
- `forecast` (`tomorrow`, `nextPhase`, `confidence`)

---

## 14) Reliability and Safety

- deterministic core prevents hallucinated reasoning
- AI is constrained to expression/interpretation
- strong fallback paths for:
  - no logs
  - low data density
  - AI errors
  - empty priority set

---

## 15) Current Maturity and Next Steps

Current system maturity:

- production-grade deterministic insight engine
- explainability-ready response model
- constrained AI interpretation
- predictive near-term forecast

Recommended next upgrades:

1. cross-cycle memory layer (recurring pattern detection)
2. multi-day predictive modeling (2-5 day outlook)
3. adaptive priority weights per user sensitivity
4. richer UX around onboarding progress and confidence

