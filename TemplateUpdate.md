# VYANA TEMPLATE REFACTOR — FINAL EXECUTION FILE

## 🎯 Objective

Rewrite all existing templates into **strict Vyana voice**, while preserving product/system fields by separating them into a different layer.

Vyana does not coach.
Vyana does not explain.
Vyana does not guide.

Vyana:
**notices → reflects → allows**

---

# 🧱 RESPONSE STRUCTURE (CRITICAL)

Do NOT delete any fields.

Instead, split output into **two layers**:

---

## 1. `vyana` (user-facing voice)

Contains ONLY:

* physical
* mental
* emotional
* orientation
* allowance

This is the **only part the user reads as insight**.

---

## 2. `system` (product / UI layer)

Contains:

* recommendation
* nextUnlock
* progress
* confidenceLabel
* insightBasis
* tomorrowPreview

This is **NOT Vyana voice**.

---

## 🧾 FINAL OUTPUT FORMAT

```json
{
  "vyana": {
    "physical": "",
    "mental": "",
    "emotional": "",
    "orientation": "",
    "allowance": ""
  },
  "system": {
    "recommendation": "",
    "nextUnlock": {},
    "progress": {},
    "confidenceLabel": "",
    "insightBasis": "",
    "tomorrowPreview": ""
  }
}
```

---

# 🔒 VYANA VOICE RULES (NON-NEGOTIABLE)

## ❌ NEVER INCLUDE

* Advice or suggestions
* Instructional verbs:

  * try, keep, use, start, focus on, plan, schedule, lean into
* Productivity framing
* Biological explanations
* Cause-effect:

  * because, which is why, this means
* System/app language:

  * log, track, data, pattern, learning, we will
* Future optimization
* Reassurance completion
* “your body is…”
* “many people…”
* “good time to…”
* “peak”, “window”

---

## ✅ MUST FOLLOW

* One idea per sentence
* Short sentences
* No explanation
* No interpretation
* No abstraction
* Stop early
* Slight incompleteness is correct

---

# 🧠 WRITING MODEL

### 1. Observation

What is being felt

### 2. Reflection

What that experience is like

### 3. Allowance

Permission — NOT action

---

# 🧠 CONFIDENCE RULES

### ZERO

* “can feel”, “often”
* no personalization

### MEDIUM

* “you’ve noticed…”
* “showing up again”

### HIGH

* “for you…”
* “consistently…”
* “it’s here again”
* no authority tone

---

# 🚨 CRITICAL CHECK

Before ANY sentence:

> Does this tell the user what to do?

If YES → DELETE

---

# ⚠️ SYSTEM LAYER RULES

System layer is functional — NOT emotional.

---

## recommendation

* Keep short
* Can suggest logging or actions
* Must NOT sound like Vyana

---

## nextUnlock

* Keep structured
* No narrative tone

---

## tomorrowPreview

* Rewrite in **soft Vyana tone**
* No certainty
* No optimization

Example:

```json
"tomorrowPreview": "Things may feel similar tomorrow. A shift can come in a few days."
```

---

## insightBasis / confidenceLabel

* Keep factual
* No emotional tone
* No “we are learning about you”

---

# 🔒 STRICT SEPARATION RULE

* NEVER mix system language into `vyana`
* NEVER make `system` sound like Vyana

---

### Mental model:

* `vyana` = human
* `system` = functional

---

# 🔁 TRANSFORMATION RULES

Convert:

❌ “Keep things light today”
→
✅ “Energy can feel lower here”

---

❌ “Your body is rebuilding”
→
✅ “You’re a few days past your period”

---

❌ “Use this time”
→
✅ “Things can feel easier here”

---

❌ “This is a good time to…”
→
✅ Remove

---

# 🧪 GOLD STANDARD

```json
{
  "vyana": {
    "physical": "Energy can feel heavier here. Movement takes more effort.",
    "mental": "Thoughts can drift. Focus can be harder to hold.",
    "emotional": "Small things can land harder. Emotions can feel closer to the surface.",
    "orientation": "This is the start of your period.",
    "allowance": "Slower can feel more natural today."
  },
  "system": {
    "recommendation": "Log how you feel today.",
    "nextUnlock": {
      "logsNeeded": 1
    },
    "progress": {},
    "confidenceLabel": "Phase-based",
    "insightBasis": "Cycle phase",
    "tomorrowPreview": "Things may feel similar tomorrow."
  }
}
```

---

# ⚙️ TASK

Rewrite all templates to:

* Follow exact structure
* Fully comply with Vyana voice
* Preserve system fields in system layer
* Remove all violations

---

# 🚫 IMPORTANT

* Do NOT add new ideas
* Do NOT expand content
* Only transform
* Remove violations

---

# ✅ FINAL VALIDATION CHECKLIST

Each output MUST:

* [ ] No advice in vyana
* [ ] No explanation in vyana
* [ ] No system language in vyana
* [ ] No productivity tone
* [ ] Natural spoken language
* [ ] Stops early
* [ ] Feels like noticing

---

# 💬 FINAL RULE

If it helps → it’s wrong
If it notices → it’s correct

---

# ▶️ EXECUTE

Rewrite all templates now.
