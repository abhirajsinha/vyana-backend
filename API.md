# Vyana Backend — API Reference

Base URL: `http://localhost:3000` (or deployed host)

**New to the repo?** Start with [`readme.md`](./readme.md) (onboarding, endpoint index, caching, GPT behavior), then use this file for request/response detail.

All protected endpoints require the header:

```
Authorization: Bearer <access_token>
```

Missing token returns `401 { "error": "Missing auth token" }`.
Invalid/expired token returns `401 { "error": "Invalid or expired token" }`.

---

## Health Check

### `GET /health`

**Auth:** None

**Response** `200`

```json
{
  "ok": true,
  "service": "vyana-backend"
}
```

---

## Auth

### `POST /api/auth/register`

**Auth:** None

**Request Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Must be a valid email |
| `password` | string | Yes | Minimum 8 characters |
| `name` | string | Yes | |
| `age` | number | Yes | |
| `height` | number | Yes | |
| `weight` | number | Yes | |
| `lastPeriodStart` | string (ISO date) | Yes | Required for natural cycle users. Hormonal users default to today if omitted. |
| `cycleLength` | number | No | Default `28`. Must be 21–45 |
| `contraceptiveMethod` | string | No | |
| `cycleRegularity` | string | No | |

**Response** `201`

```json
{
  "user": {
    "id": "string",
    "email": "string",
    "googleId": null,
    "name": "string",
    "age": 28,
    "height": 165,
    "weight": 60,
    "cycleLength": 28,
    "lastPeriodStart": "2026-03-01T00:00:00.000Z",
    "contraceptiveMethod": null,
    "cycleRegularity": null,
    "cycleMode": "natural",
    "fcmToken": null,
    "contraceptionChangedAt": null,
    "createdAt": "2026-03-28T00:00:00.000Z",
    "updatedAt": "2026-03-28T00:00:00.000Z"
  },
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `email is required` |
| `400` | `password is required` |
| `400` | `password must be at least 8 characters` |
| `400` | `Missing required fields` |
| `400` | `Invalid email` |
| `400` | `Cycle length must be between 21 and 45 days` |
| `400` | `age must be between 10 and 100` |
| `400` | `height must be between 50 and 300 cm` |
| `400` | `weight must be between 20 and 500 kg` |
| `400` | `lastPeriodStart cannot be in the future` |
| `409` | `An account with this email already exists` |

---

### `POST /api/auth/login`

**Auth:** None

**Request Body**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `password` | string | Yes |

**Response** `200`

```json
{
  "user": { /* PublicUser (same shape as register) */ },
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `email is required` / `password is required` |
| `401` | `Invalid email or password` |

---

### `POST /api/auth/google`

**Auth:** None

**Request Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `idToken` | string | Yes | Google OAuth ID token |
| `age` | number | Yes | |
| `height` | number | Yes | |
| `weight` | number | Yes | |
| `lastPeriodStart` | string (ISO date) | Yes | |
| `name` | string | No | Falls back to Google profile name |
| `cycleLength` | number | No | Default `28`. Must be 21–45 |
| `contraceptiveMethod` | string | No | |
| `cycleRegularity` | string | No | |

**Response** `200` (existing user) or `201` (new user)

```json
{
  "user": { /* PublicUser */ },
  "tokens": {
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `idToken is required` |
| `400` | `Missing required profile fields` |
| `400` | `Cycle length must be between 21 and 45 days` |
| `400` | `age must be between 10 and 100` |
| `400` | `height must be between 50 and 300 cm` |
| `400` | `weight must be between 20 and 500 kg` |
| `400` | `lastPeriodStart cannot be in the future` |
| `400` | `Google email must be verified` |
| `400` | `Invalid email from Google token` |
| `401` | `Invalid Google token` |
| `409` | `An account with this email already exists. Sign in with email and password.` |
| `503` | `Google sign-in is not configured on the server` |

---

### `POST /api/auth/refresh`

**Auth:** None

**Request Body**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | string | Yes |

**Response** `200`

```json
{
  "accessToken": "string"
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `refreshToken is required` |
| `401` | `Invalid refresh token` / `Invalid refresh token type` / `Refresh token expired or revoked` |

---

## User

### `GET /api/user/me`

**Auth:** Required

**Response** `200`

```json
{
  "id": "string",
  "email": "string",
  "googleId": "string | null",
  "name": "string",
  "age": 28,
  "height": 165,
  "weight": 60,
  "cycleLength": 28,
  "lastPeriodStart": "2026-03-01T00:00:00.000Z",
  "contraceptiveMethod": null,
  "cycleRegularity": null,
  "cycleMode": "natural",
  "fcmToken": null,
  "contraceptionChangedAt": null,
  "createdAt": "2026-03-28T00:00:00.000Z",
  "updatedAt": "2026-03-28T00:00:00.000Z"
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

### `PUT /api/user/profile`

**Auth:** Required

Partial update: include only fields to change. Changing **`contraceptiveMethod`** runs contraception transition handling (cache invalidation, optional baseline / period-start reset) and may return **`contraceptionTransition`** in the response.

**Request body (all optional)**

| Field | Type | Notes |
|-------|------|--------|
| `name` | string | Non-empty after trim |
| `age` | number | |
| `height` | number | |
| `weight` | number | |
| `cycleLength` | number | 21–45 |
| `cycleRegularity` | string | `regular`, `irregular`, or `not_sure` |
| `contraceptiveMethod` | string \| null | Triggers transition when value differs from stored |
| `lastPeriodStart` | string (ISO / `YYYY-MM-DD`) | |

**Response** `200`

```json
{
  "user": { /* same shape as GET /api/user/me */ }
}
```

When contraception method changed:

```json
{
  "user": { },
  "contraceptionTransition": {
    "transitionType": "string",
    "previousMethod": "string | null",
    "newMethod": "string | null",
    "previousCycleMode": "string",
    "newCycleMode": "string",
    "contextMessage": "string | null",
    "baselineReset": true,
    "periodStartReset": true
  }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `No valid fields to update` |
| `400` | `Cycle length must be between 21 and 45 days` |
| `400` | `Invalid lastPeriodStart date` |
| `400` | `cycleRegularity must be one of: ...` |
| `404` | `User not found` |

---

### `PUT /api/user/fcm-token`

**Auth:** Required

Update the user's FCM push notification token.

**Request Body**

| Field | Type | Required |
|-------|------|----------|
| `fcmToken` | string | Yes |

**Response** `200`

```json
{
  "success": true
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `fcmToken is required` |

---

## Cycle

### `GET /api/cycle/current`

**Auth:** Required

**Response** `200`

```json
{
  "currentDay": 14,
  "phase": "ovulation",
  "phaseDay": 1,
  "daysUntilNextPhase": 3,
  "daysUntilNextPeriod": 15,
  "cycleLength": 28,
  "cycleMode": "natural",
  "isCyclePredictionReliable": true,
  "nextPeriodDate": "2026-04-12T00:00:00.000Z",
  "insight": "You're in your ovulation window — energy and confidence may peak.",
  "suggestedLogFields": ["mood", "energy", "social", "confidence"]
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

### `POST /api/cycle/period-started`

**Auth:** Required

`GET` on this path is not supported (opening the URL in a browser returns `405` with a hint to use `POST`). Use a client or `curl` as below.

**Request Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | string | Yes | `YYYY-MM-DD` or ISO format |

**Response** `201`

```json
{
  "success": true,
  "startDate": "2026-03-28T00:00:00.000Z",
  "cycleDay": 1,
  "phase": "menstrual",
  "cycleMode": "natural",
  "healthPatternCheck": null
}
```

When health alerts exist:

```json
{
  "success": true,
  "startDate": "2026-03-28T00:00:00.000Z",
  "cycleDay": 1,
  "phase": "menstrual",
  "cycleMode": "natural",
  "healthPatternCheck": {
    "hasAlerts": true,
    "alertCount": 2,
    "message": "We noticed some patterns worth flagging."
  }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `date is required (YYYY-MM-DD or ISO)` |
| `400` | `Invalid date` |
| `400` | `Period start date cannot be in the future` |
| `404` | `User not found` |
| `409` | `Period already logged for this date` |

---

### `DELETE /api/cycle/period-started/:id`

**Auth:** Required

Undoes a period-started entry. Deletes the CycleHistory entry, reopens the previous cycle, restores `lastPeriodStart`, and clears caches.

**Response** `200`

```json
{
  "success": true,
  "restoredLastPeriodStart": "2026-03-01T00:00:00.000Z",
  "cycleDay": 28,
  "phase": "luteal",
  "cycleMode": "natural"
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `Cycle history ID is required` |
| `403` | `Not authorized` |
| `404` | `Cycle history entry not found` |

---

## Logs

### `POST /api/logs`

**Auth:** Required

**Request Body**

| Field | Type | Required |
|-------|------|----------|
| `mood` | string | No |
| `energy` | string | No |
| `stress` | string | No |
| `sleep` | number | No |
| `diet` | string | No |
| `exercise` | string | No |
| `activity` | string | No |
| `symptoms` | string[] | No |
| `focus` | string | No |
| `motivation` | string | No |
| `pain` | string | No |
| `social` | string | No |
| `cravings` | string | No |
| `fatigue` | string | No |
| `padsChanged` | number | No |

**Response** `201`

```json
{
  "success": true,
  "log": {
    "id": "string",
    "userId": "string",
    "date": "2026-03-28T00:00:00.000Z",
    "mood": "good",
    "energy": "high",
    "stress": "low",
    "sleep": 7.5,
    "diet": null,
    "exercise": null,
    "activity": null,
    "symptoms": [],
    "focus": null,
    "motivation": null,
    "pain": null,
    "social": null,
    "cravings": null,
    "fatigue": null,
    "padsChanged": null,
    "createdAt": "2026-03-28T12:00:00.000Z"
  }
}
```

If a log already exists for today, it is updated (upsert behavior).

**Errors**

| Status | Message |
|--------|---------|
| `400` | `sleep must be between 0 and 24` |
| `400` | `padsChanged must be between 0 and 50` |
| `400` | `Invalid mood value: <value>` |
| `400` | `Invalid energy value: <value>` |
| `400` | `Invalid stress value: <value>` |

---

### `GET /api/logs`

**Auth:** Required

**Query Parameters**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | string | No | `YYYY-MM-DD` — filters to that day. Without it, returns last 30 logs. |

**Response** `200`

```json
[
  {
    "id": "string",
    "userId": "string",
    "date": "2026-03-28T00:00:00.000Z",
    "mood": "good",
    "energy": "high",
    "stress": "low",
    "sleep": 7.5,
    "symptoms": [],
    "padsChanged": null
  }
]
```

---

### `PUT /api/logs/:id`

**Auth:** Required

Edit an existing log. Only provided fields are updated.

**Request Body** — same fields as POST /api/logs, all optional.

**Response** `200`

```json
{
  "success": true,
  "log": { /* updated DailyLog */ }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `Log ID is required` |
| `400` | `No fields to update` |
| `400` | `sleep must be between 0 and 24` |
| `400` | `padsChanged must be between 0 and 50` |
| `400` | `Invalid mood/energy/stress value` |
| `403` | `Not authorized to edit this log` |
| `404` | `Log not found` |

---

### `POST /api/logs/quick-check-in`

**Auth:** Required

Partial log upsert — accepts any subset of mood, energy, sleep, stress, pain, fatigue.

**Request Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `mood` | string | No | |
| `energy` | string | No | |
| `sleep` | number | No | 0-24 |
| `stress` | string | No | |
| `pain` | string | No | |
| `fatigue` | string | No | |

At least one field must be provided.

**Response** `201`

```json
{
  "success": true,
  "fieldsLogged": ["mood", "sleep"],
  "log": { /* created/updated DailyLog */ }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `At least one field is required` |
| `400` | `sleep must be between 0 and 24` |
| `400` | `Invalid mood/energy/stress value` |

---

### `GET /api/logs/quick-log-config`

**Auth:** Required

**Response** `200`

```json
{
  "phase": "ovulation",
  "phaseLabel": "Ovulation",
  "dayPhaseLabel": "Day 14 · Ovulation",
  "title": "Peak energy window",
  "subtitle": "You might feel confident and social today",
  "fields": [
    { "key": "mood", "label": "Mood", "type": "emoji_mood", "options": ["😔", "😐", "🙂", "😄"] },
    { "key": "energy", "label": "Energy", "type": "chips", "options": ["Low", "Medium", "High"] },
    { "key": "social", "label": "Social energy", "type": "chips", "options": ["Withdrawn", "Neutral", "Engaged"] },
    { "key": "motivation", "label": "Confidence", "type": "chips", "options": ["Low", "Medium", "High"] }
  ],
  "submitLabel": "Log your day",
  "hasLoggedToday": false,
  "todayLogId": null
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

## Insights

### `GET /api/insights`

**Auth:** Required

Returns the daily insight payload for the current user. Cached per UTC day.

**Response** `200`

```json
{
  "cycleDay": 14,
  "isNewUser": false,
  "progress": {
    "logsCount": 15,
    "nextMilestone": 21,
    "logsToNextMilestone": 6
  },
  "confidence": "high",
  "isPeriodDelayed": false,
  "daysOverdue": 0,
  "isIrregular": false,
  "insights": {
    "physicalInsight": "Your body feels energised today...",
    "mentalInsight": "Focus may feel sharper than usual...",
    "emotionalInsight": "Mood has been affected by rising stress...",
    "whyThisIsHappening": "Stress has been building over the last few days...",
    "solution": "Take short breaks to manage stress load...",
    "recommendation": "Use this energy window — but pace yourself...",
    "tomorrowPreview": "If stress eases, tomorrow should feel lighter..."
  },
  "view": {
    "primaryInsight": "Stress is elevated — but your energy is still strong.",
    "supportingInsights": [
      "Mood has been dipping with stress",
      "Sleep is holding steady"
    ],
    "action": "Take breaks between demanding tasks",
    "recommendation": "Use this energy window — but pace yourself.",
    "tomorrowPreview": "If stress eases, tomorrow should feel lighter.",
    "confidenceLabel": "Based on 15 days of data"
  },
  "aiEnhanced": true
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

### `GET /api/insights/context`

**Auth:** Required

Returns detailed context data for today's insights (cycle, hormones, signals, memory, debug info). Requires `GET /api/insights` to have been called first for the current UTC day.

**Response** `200`

```json
{
  "cycleDay": 14,
  "mode": "personalized",
  "aiDebug": "accepted",
  "correlationPattern": "ovulation_energy_blocked",
  "basedOn": {
    "phase": "ovulation",
    "recentLogsCount": 7,
    "confidenceScore": 0.92,
    "baselineDeviation": ["stress_above_personal_baseline"],
    "baselineScope": "global",
    "priorityDrivers": ["stress_above_baseline", "stress_trend_spiking"],
    "interactionFlags": ["mood_stress_coupling"],
    "trends": ["Stress increasing", "Mood decreasing"],
    "reasoning": ["Phase is ovulation", "Stress rising over 3 days"]
  },
  "cycleContext": {
    "cycleMode": "natural",
    "cyclePredictionConfidence": "global",
    "nextPeriodEstimate": "2026-04-12",
    "nextPeriodRange": { "earliest": "2026-04-10", "latest": "2026-04-14" },
    "isIrregular": false,
    "isPeriodDelayed": false,
    "daysOverdue": 0
  },
  "hormoneContext": {
    "estrogen": "high",
    "progesterone": "low",
    "lh": "surging",
    "fsh": "low",
    "confidence": "moderate",
    "narrativeContext": "Estrogen is peaking around ovulation..."
  },
  "contraceptionContext": {
    "type": "none",
    "contextMessage": null,
    "insightTone": "cycle-based",
    "showPhaseInsights": true
  },
  "numericSummary": {
    "recentSleepAvg": 7.2,
    "baselineSleepAvg": 7.0,
    "sleepDelta": 0.2,
    "recentStressLabel": "moderate",
    "recentMoodLabel": "positive"
  },
  "crossCycleNarrative": {
    "matchingCycles": 2,
    "totalCyclesAnalyzed": 3,
    "narrativeStatement": "Your past cycles show a similar pattern.",
    "trend": "consistent"
  },
  "memoryContext": {
    "driver": "stress_above_baseline",
    "count": 3,
    "narrative": "This is the third time stress has been elevated this cycle.",
    "severity": "moderate"
  },
  "pmsWarning": null
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `No insights generated yet today. Call GET /api/insights first.` |

---

### `GET /api/insights/forecast`

**Auth:** Required

**Response** `200` — Two shapes depending on data availability:

**Warmup (insufficient data)**

```json
{
  "available": false,
  "isNewUser": true,
  "forecastLocked": true,
  "reason": "We need at least 5 days of logs to generate a forecast.",
  "warmupMessage": "Keep logging — your forecast unlocks soon.",
  "progressPercent": 40,
  "progress": {
    "logsCount": 2,
    "nextMilestone": 5,
    "logsToNextMilestone": 3,
    "logSpanDays": 2,
    "logSpanNeeded": 5
  },
  "contraceptionContext": {
    "type": "none",
    "contextMessage": null
  }
}
```

**Full forecast**

```json
{
  "available": true,
  "isNewUser": false,
  "progress": {
    "logsCount": 15,
    "nextMilestone": 21,
    "logsToNextMilestone": 6
  },
  "today": {
    "phase": "ovulation",
    "currentDay": 14,
    "confidenceScore": 0.92,
    "priorityDrivers": ["stress_above_baseline"]
  },
  "forecast": {
    "tomorrow": {
      "date": "2026-03-29",
      "phase": "ovulation",
      "outlook": "Energy may remain high, but watch stress levels."
    },
    "nextPhase": {
      "phase": "luteal",
      "startsIn": 3,
      "preview": "A phase shift may be approaching in about 3 days..."
    },
    "confidence": {
      "level": "high",
      "score": 0.92,
      "label": "Based on 15 days of data",
      "message": "Your forecast is reliable — patterns are well established."
    }
  },
  "pmsSymptomForecast": null,
  "numericSummary": {
    "recentSleepAvg": 7.2,
    "baselineSleepAvg": 7.0,
    "sleepDelta": 0.2,
    "recentStressLabel": "moderate",
    "recentMoodLabel": "positive"
  },
  "crossCycleNarrative": null,
  "cyclesCompleted": 3,
  "contraceptionContext": {
    "type": "none",
    "contextMessage": null
  }
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

## Chat

### `POST /api/chat`

**Auth:** Required

**Request Body**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `message` | string | Yes | The user's question |
| `history` | array | No | Previous messages: `[{ "role": "user" \| "assistant", "content": "string" }]` |

**Response** `200`

```json
{
  "reply": "Based on your recent logs, your sleep has been steady around 7h..."
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `message is required` |
| `400` | `Message too long (max 2000 characters)` |
| `404` | `User not found` |

---

### `GET /api/chat/history`

**Auth:** Required

**Response** `200`

```json
[
  {
    "id": "string",
    "userId": "string",
    "role": "user",
    "content": "How am I sleeping?",
    "createdAt": "2026-03-28T10:00:00.000Z"
  },
  {
    "id": "string",
    "userId": "string",
    "role": "assistant",
    "content": "Your sleep has averaged 7.2h over the last week...",
    "createdAt": "2026-03-28T10:00:01.000Z"
  }
]
```

Returns up to 100 messages, sorted by `createdAt` ascending.

---

## Home

### `GET /api/home`

**Auth:** Required

**Response** `200`

```json
{
  "title": "Ovulation day",
  "subtitle": "High chance of pregnancy today",
  "cardHeadline": "You might feel confident and energised",
  "dayPhaseLabel": "Day 14 · Ovulation",
  "reassurance": "This is your peak energy window.",
  "ctaText": "Make the most of today →",
  "ctaLogPhase": "ovulation",
  "phase": "ovulation",
  "cycleDay": 14,
  "cycleLength": 28,
  "isPeriodDelayed": false,
  "daysOverdue": 0,
  "cyclePredictionConfidence": "global",
  "isIrregular": false,
  "quickLogFields": [
    { "key": "mood", "label": "Mood", "type": "emoji_mood", "options": ["😔", "😐", "🙂", "😄"] },
    { "key": "energy", "label": "Energy", "type": "chips", "options": ["Low", "Medium", "High"] },
    { "key": "social", "label": "Social energy", "type": "chips", "options": ["Withdrawn", "Neutral", "Engaged"] },
    { "key": "motivation", "label": "Confidence", "type": "chips", "options": ["Low", "Medium", "High"] }
  ],
  "contraceptionNote": null
}
```

Content adapts to phase, cycle day, delayed period, irregular cycles, and hormonal contraception.

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

## Calendar

### `GET /api/calendar`

**Auth:** Required

**Query Parameters**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `month` | string | Yes | Format: `YYYY-MM` |

**Response** `200`

```json
{
  "month": "2026-03",
  "cycleLength": 28,
  "cycleMode": "natural",
  "cyclePredictionConfidence": "global",
  "isIrregular": false,
  "isPeriodDelayed": false,
  "daysOverdue": 0,
  "showPhaseInsights": true,
  "currentPhase": "ovulation",
  "nextPeriodEstimate": "2026-04-12",
  "calendar": [
    {
      "date": "2026-03-01",
      "cycleDay": 1,
      "phase": "menstrual",
      "phaseDay": 1,
      "isToday": false,
      "isFuture": false,
      "isPast": true,
      "hasLog": true,
      "isPeriodDay": true,
      "isOvulationDay": false,
      "isPredicted": false,
      "isPeriodDelayed": false,
      "logSummary": {
        "mood": "low",
        "energy": "low",
        "sleep": 5.5,
        "stress": "moderate"
      },
      "phaseColor": "#E8514A"
    }
  ],
  "todayInsightCard": {
    "date": "2026-03-28",
    "dayLabel": "Today",
    "dayPhaseLabel": "Day 14 · Ovulation",
    "cardHeadline": "You might feel confident and energised",
    "reassurance": "This is your peak energy window.",
    "ctaText": "Make the most of today →",
    "ctaPhase": "ovulation",
    "phase": "ovulation",
    "isToday": true,
    "isPeriodDelayed": false,
    "daysOverdue": 0
  },
  "phaseTimeline": [
    { "phase": "menstrual", "label": "Period", "color": "#E8514A", "startPercent": 0, "endPercent": 17.86 },
    { "phase": "follicular", "label": "Follicular", "color": "#F5A623", "startPercent": 17.86, "endPercent": 46.43 },
    { "phase": "ovulation", "label": "Ovulation", "color": "#F5A623", "startPercent": 46.43, "endPercent": 57.14 },
    { "phase": "luteal", "label": "Luteal", "color": "#9B59B6", "startPercent": 57.14, "endPercent": 100 }
  ]
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `month must be in YYYY-MM format` |
| `404` | `User not found` |

---

### `GET /api/calendar/day-insight`

**Auth:** Required

**Query Parameters**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | string | Yes | Format: `YYYY-MM-DD` |

**Response** `200`

```json
{
  "date": "2026-03-28",
  "dayLabel": "Today",
  "dayPhaseLabel": "Day 14 · Ovulation",
  "cardHeadline": "You might feel confident and energised",
  "reassurance": "This is your peak energy window.",
  "ctaText": "Make the most of today →",
  "ctaPhase": "ovulation",
  "phase": "ovulation",
  "isToday": true,
  "isPeriodDelayed": false,
  "daysOverdue": 0
}
```

**Errors**

| Status | Message |
|--------|---------|
| `400` | `date must be YYYY-MM-DD` |
| `404` | `User not found` |

---

## Health Patterns

### `GET /api/health/patterns`

**Auth:** Required

**Response** `200`

```json
{
  "hasAlerts": true,
  "alerts": [
    {
      "type": "short_cycles",
      "message": "Your last 3 cycles have been under 21 days.",
      "severity": "moderate",
      "detectedAt": "2026-03-28T00:00:00.000Z"
    }
  ],
  "watching": [
    {
      "type": "sleep_trend",
      "message": "Sleep has been trending downward over 2 weeks.",
      "since": "2026-03-14T00:00:00.000Z"
    }
  ],
  "lastChecked": "2026-03-28T12:00:00.000Z",
  "message": "We noticed some patterns worth flagging."
}
```

When no alerts:

```json
{
  "hasAlerts": false,
  "alerts": [],
  "watching": [],
  "lastChecked": "2026-03-28T12:00:00.000Z"
}
```

**Errors**

| Status | Message |
|--------|---------|
| `404` | `User not found` |

---

## Admin

### `POST /api/admin/send-notifications`

**Auth:** API key via `X-API-Key` header (must match `ADMIN_API_KEY` env var)

Triggers a batch of phase-aware push notifications to all eligible users.

**Response** `200`

```json
{
  "sent": 15,
  "failed": 2,
  "total": 17
}
```

**Errors**

| Status | Message |
|--------|---------|
| `401` | `Unauthorized` |

---

## Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| General API (`/api/*`) | 120 req | 1 min |
| Auth login/register | 30 req | 15 min |
| Google auth | 20 req | 15 min |
| Insights (`/api/insights`, `/api/insights/forecast`) | 10 req | 1 min |
| Log operations (POST/PUT) | 30 req | 1 min |
| Chat | 60 req | 1 min |

Exceeding a limit returns `429` with `{ "error": "Too many requests, please slow down." }`.

---

## Global Error Responses

| Status | When | Body |
|--------|------|------|
| `401` | Missing auth header | `{ "error": "Missing auth token" }` |
| `401` | Invalid/expired token | `{ "error": "Invalid or expired token" }` |
| `404` | Unknown route | `{ "error": "Route not found" }` |
| `429` | Rate limit exceeded | `{ "error": "Too many requests, please slow down." }` |
| `500` | Unhandled server error | `{ "error": "Internal server error" }` |
