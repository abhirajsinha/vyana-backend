# Vyana — Layered Insights Specification

**Status:** Draft v1.0
**Owner:** Abhiraj
**Scope:** Defines how Vyana generates, layers, and surfaces insights for both zero-log users and users who check in with symptoms. This document supersedes any prior insight architecture notes.

---

## 1. The core principle

Every other cycle app on the market treats logging as input that earns insight later. Vyana collapses that distance: **the act of checking in is the moment the user receives the insight, in real time, shaped by what she just told it.**

This is the differentiator. The check-in is not a precursor to value — it *is* the value. Every architectural decision in this document serves that principle.

There is one rule that governs everything else:

> **Acknowledgment is always immediate. Interpretation is always earned.**

The system always responds to a check-in. What changes across users, days, and cycles is *how much* the system claims. A first-time logger gets phase truth, framed as a response to her tap. A user with three cycles of consistent pattern gets honest, specific interpretation. The progression from one to the other is the entire emotional arc of using Vyana.

---

## 2. The three layers

Vyana's insight system has exactly three layers. Each layer is allowed to make claims of a specific kind, and never more.

### Layer 1 — Phase truth

Layer 1 is the baseline. It is what every user sees regardless of whether they have logged anything. It contains general, medically-grounded observations about what her current phase looks like for bodies in general.

The Layer 1 content already exists: it is the six-variant pool (A through F) in `tier1_insights_phaseday.json`, keyed by phase and phase-day. Layer 1 is the only thing a zero-log user ever sees. It is also the substrate that Layers 2 and 3 wrap around.

**Layer 1 claims are about the phase, never about her.** "Day 18 is when progesterone is doing the talking" is a Layer 1 claim. "Your day 18 is when progesterone is doing the talking" is not — that's a Layer 3 claim, and it requires evidence.

```rule
LAYER 1 (PHASE_TRUTH)
  When: Always present in every insight response.
  Source: tier1_insights_phaseday.json, keyed by (phase, phaseDay).
  Variant selection: rotates across cycles for the same user, weighted by angle.
  Allowed claims: general claims about the phase, body, or hormones.
  Forbidden claims: anything specific to this user's pattern.
```

### Layer 2 — Log mirror

Layer 2 only exists when the user has logged something. It is a small, quiet wrapper around Layer 1 that *acknowledges what she logged* without making any claim about her body's pattern.

The function of Layer 2 is to close the loop. The moment she taps "cramps," the screen reflects it. The reflection is honest because it doesn't claim anything more than "I see what you said, and here is what this looks like in the phase you're in."

**Layer 2 fires on n=1.** This is the layer that makes the check-in feel responsive. Without Layer 2, logging on day 1 produces the same screen as not logging on day 1 — and that is the failure mode that has trained millions of women across other apps not to bother.

Layer 2 is structurally a *framing wrapper*, not new content. The same Layer 1 insight is delivered with a new opening clause that ties it to her log. A user who logs nothing on day 2 sees: *"Day 2. Flow is usually heaviest on day one or two."* A user who logs cramps on day 2 sees: *"Day 2 — cramps and the body doing real work. Flow is usually heaviest on day one or two."* Same biological truth, three extra words. Those three words are the entire trick.

```rule
LAYER 2 (LOG_MIRROR)
  When: User has logged ≥1 symptom in the current check-in.
  Function: Acknowledge the log by reframing the Layer 1 opening.
  Allowed claims: phase-level claims that match the symptom logged.
  Forbidden claims: cross-cycle pattern claims, claims about her body's tendencies, mismatch flags.
  Threshold: n=1. Fires immediately on every relevant log.
```

### Layer 3 — Interpretation

Layer 3 is where the system makes claims about *her* — her pattern, her body, her tendencies. This is the layer no other app does well, and it is also the layer that does the most harm when overclaimed.

Layer 3 is the only layer allowed to use words like "your pattern," "your body tends to," "you have," "this is your third cycle in a row." It is also the only layer allowed to flag mismatch — to say *this doesn't usually happen in this phase, something else may be going on*.

Layer 3 only fires when the data has earned it. The threshold rules are in Section 4. Every word of a Layer 3 claim must be backed by data the system actually has. If the system cannot point to specific logs that support a Layer 3 claim, it must not make the claim.

```rule
LAYER 3 (INTERPRETATION)
  When: Symptom-specific threshold met (see Section 4).
  Function: Claim a pattern in *her* body, with specific data supporting the claim.
  Allowed claims: alignment ("this matches what your phase usually looks like"),
                  mismatch ("this isn't what we usually see in this phase"),
                  cross-cycle continuity ("third cycle in a row"),
                  trend ("this has increased over the last week").
  Forbidden claims: any claim not directly supported by the log data.
  Hard rule: every Layer 3 sentence must be traceable to specific logs.
```

---

## 3. The symptom typology

Not all symptoms behave the same way biologically, and they cannot be windowed or interpreted with the same rules. Vyana classifies its 12 tracked items into three types plus one habit field. The type determines the windowing rule and which kinds of claims are allowed.

### Type A — Phase-bound symptoms

These symptoms are biologically tied to a specific phase. Their absence outside that phase is expected; their presence outside it is potentially clinically meaningful and should be handled with extra care.

| Symptom | Bound to |
|---|---|
| Flow | Menstrual |
| Cramps | Menstrual |
| Bloating | Luteal |
| Breast tenderness | Luteal |
| Back pain | Menstrual + late luteal |

**Window for Type A:** Same symptom, same phase, current cycle. Threshold of 2 logs to enter Layer 2 mirror; 3+ logs across 2-3 cycles to enter Layer 3 interpretation.

**Special handling:** A Type A symptom appearing significantly outside its bound phase is a slow signal worth noting eventually, never a fast one to react to. The system should accumulate evidence across cycles before saying anything, and even then should frame it as "this is unusual and worth knowing about your own body" rather than "something is wrong."

### Type B — Phase-modulated symptoms

These are influenced by phase but not bound to it. The phase shifts the baseline expectation but the symptom can occur in any phase. This is where most of Layer 3's interpretive work happens, because both alignment and mismatch are meaningful.

| Symptom | Phase tendency |
|---|---|
| Energy | Higher in follicular, lower in luteal |
| Mood | Steadier in follicular, more variable in late luteal |
| Sleep quality | Often better in mid-follicular, worse in late luteal |
| Headache | Often around ovulation and just before menses |
| Acne / skin | Often clearer in follicular, more reactive in late luteal |

**Window for Type B:** Same symptom, same phase, across the most recent 2 cycles. Threshold of 2 logs in current phase for Layer 2 mirror; 3+ logs in same phase across 2 cycles for Layer 3 interpretation.

**Mismatch is allowed for Type B.** This is where the honest "this doesn't usually match this phase" line earns its place. A follicular user with three logs of low energy across two cycles has a real pattern that deserves the honest response.

### Type C — Phase-independent symptoms

There is exactly one Type C symptom: **stress.**

Stress is influenced by phase (the late luteal amplifies what's already there) but caused by life. Phase windowing for stress will produce wrong inferences constantly — a user under work pressure will have her real stress pattern misattributed to her cycle, and a user whose late-luteal anxiety is hormonal will have it dismissed as "just life."

**Window for Type C:** Rolling 7 days, regardless of phase. Threshold of 3-4 logs in 7 days for Layer 2 mirror; 5+ logs across 14 days for Layer 3 interpretation.

**Hard rule for Type C:** Stress claims are never about the cycle causing stress. The system can note phase context as a soft observation ("the late luteal often amplifies what's already there") but the primary claim is always temporal, not phase-causal. Mismatch is forbidden for Type C.

```rule
STRESS_EXCEPTION
  Stress is the only symptom in Vyana that:
  - Uses rolling time windows instead of phase windows.
  - Cannot trigger mismatch interpretation.
  - Cannot be claimed as "caused by" the user's cycle phase.
  Phase context may be added as a soft note, but the primary claim is temporal.
```

### Habit field — Water

Water is not a symptom. It is a behavior. It does not flow through the Type A/B/C logic at all.

Water values can be referenced inside insights when clinically grounded ("hydration tends to ease late-luteal headaches") but they do not trigger thresholds, do not generate Layer 2 mirrors, and do not produce Layer 3 interpretation. Vyana never claims that any phase requires more water than any other phase, because the evidence does not support it.

---

## 4. Threshold rules

The rule that handles every edge case is this:

> **Acknowledgment fires at n=1. Pattern mirroring fires at n=2-3 in the right window. Pattern interpretation fires at n=3+ across cycles.**

The "right window" is determined by the symptom's type, defined in Section 3. In full:

```rule
THRESHOLD_TABLE

Type A (phase-bound):
  n=1, in-phase     → Layer 2 mirror (in-cycle)
  n=2+, in-phase    → Layer 2 mirror with continuity language
  n=3+ across 2-3 cycles, same phase → Layer 3 interpretation
  Out-of-phase log  → no immediate claim; accumulate silently

Type B (phase-modulated):
  n=1, any phase    → Layer 2 mirror
  n=2+, same phase, current cycle → Layer 2 mirror with continuity
  n=3+, same phase, across last 2 cycles → Layer 3 interpretation
  Layer 3 may be alignment or mismatch.

Type C (stress only):
  n=1               → Layer 2 mirror, temporal framing
  n=3-4 in 7 days   → Layer 2 mirror with rolling pattern language
  n=5+ in 14 days   → Layer 3 interpretation, temporal only
  Mismatch is forbidden. Phase causation is forbidden.

Habit field (water):
  No thresholds. May be referenced as context inside other insights.
```

The threshold values above are the launch defaults. They should be revisited after the first three months of real usage data. The rules of the system — what each layer can claim, what each type means, the stress exception — should not change. Only the numbers.

---

## 5. The check-in flow

The check-in is the central act of using Vyana. Every other screen serves it. The flow is short, satisfying, and ends in something that feels like being heard.

The flow is exactly three steps:

**Step 1.** User opens Vyana. The home surface invites her to check in. Copy: *"how are you today?"* Not "log symptoms," not "track today." The framing is expressive, not bureaucratic.

**Step 2.** She taps her core symptoms — Tier 1 visible, Tier 2 one tap away. Each tap is a single gesture. Sub-flags (anxious / irritable on mood) appear inline only when relevant. Total time for an average check-in: 8-12 seconds.

**Step 3.** The next screen — same flow, no navigation — is the insight. The insight is shaped by what she just told the system, at whatever depth the threshold rules allow. The screen does not say "thanks for logging." It says the insight. The insight *is* the response.

If she has logged nothing, Step 2 is skipped and she lands directly on the insight screen, which shows pure Layer 1.

The whole flow is one continuous moment. There is no waiting, no chart, no badge, no streak counter. There is only: how are you, here is what we see, and here is what this means as best we can honestly tell.

```rule
CHECKIN_FLOW
  Surface 1: Greeting + invite to check in.
  Surface 2: Symptom selection (Tier 1 visible, Tier 2 expandable).
  Surface 3: Insight screen, shaped by surface 2's data.
  Total surfaces: 3. No interstitials. No confirmations. No streaks.
```

### What the insight screen shows

The insight screen has the following elements, in order:

1. **Orientation line.** Quiet, one row. Example: *"Day 18 · Mid-luteal · 10 days to next period."*
2. **Main insight.** Layer 1 + Layer 2 wrapper if applicable + Layer 3 sentence if earned. Single block of prose, large type.
3. **Body note.** The shorter italic line that pairs with the main insight. Comes from the same variant.
4. **Quick re-log row.** 5 small affordances for the Tier 1 symptoms, in case she wants to update or add. Persistent, low-emphasis.

That is the entire screen. No food module. No activity module. No tip carousel. The empty space is the design choice that tells her *this matters, sit with it*.

---

## 6. Worked examples

The following examples walk through the system's behavior on edge cases that came up during design. Each example shows what the user sees and why.

### Example 1 — Zero-log user, day 18

She has never logged anything. She opens Vyana on her cycle day 18.

> Day 18 · Mid-luteal · 10 days to next period
>
> **Mid-luteal. Progesterone is doing most of the talking now, and it softens the edges of energy.**
>
> *Slower workouts often feel more sustainable than intense ones this week.*

This is pure Layer 1 (variant A, day 18). No log mirror, no interpretation. The orientation line gives her context. The insight is general.

### Example 2 — First-time logger, day 2 of menses

She logs cramps=moderate and energy=low for the first time.

> Day 2 · Menstrual · early flow
>
> **Day 2 — cramps and low energy, the body in the thick of it. Flow is usually heaviest on day one or two, and the cramps come from the uterus doing real work.**
>
> *Heat on the lower belly tends to help more than most things.*

The opening clause is the Layer 2 mirror — three words that acknowledge what she just tapped. The rest is Layer 1 variant A day 2 content, lightly woven. **No claim is made about her specifically.** Both cramps and energy are addressed because she logged both. She feels seen because the screen responded to her actual taps.

### Example 3 — Three-day period user, her day 4

Her period only lasted 3 days. The engine recognizes this from her flow logs and advances her to follicular phaseDay 1 on her cycle day 4.

> Cycle day 4 · Early follicular · day 1 of new energy
>
> **Estrogen is beginning its climb. This is the phase the body uses to rebuild, not just recover.**
>
> *Skin, mood, and focus often feel like they're waking up over the next few days.*

This is Layer 1 follicular phaseDay 1 content — *not* the day 4 menstrual content from a textbook 28-day cycle. The phase-day remapping handles this automatically. Kushal's edge case is resolved at the data layer, not in the insight logic.

### Example 4 — Stress on the last day of cycle, then again on day 1

Cycle day 28: she logs stress=high. Cycle day 1 of next cycle: she logs stress=high again.

Day 28 view:

> Day 28 · Late luteal · cycle ending
>
> **Stress today, on the last day before your hormones reset. The late luteal often amplifies what's already there — small things can land harder this week.**
>
> *Hours away from day one. The drop is already in motion.*

Day 1 view:

> Day 1 · Menstrual · new cycle beginning
>
> **Stress again today, day one of a new cycle. The body is doing the work of menstruating, which can make stress feel heavier than it would otherwise.**
>
> *Slow is not lazy on day one. It's accurate.*

Two important things to notice. First: **the system never claims her cycle is causing the stress.** It only notes that the body's other work can make stress feel heavier — a general claim about how bodies work, not a specific claim about hers. Second: **the rolling 7-day window for stress crosses the cycle boundary cleanly.** There is no jarring shift in interpretation when her period starts, because stress was never being interpreted as a cycle phenomenon in the first place.

If she logs stress for 4 more days, the rolling threshold (n=3-4 in 7 days) crosses and Layer 2 begins to mirror the trend: *"stress has shown up most days this week."* Still no phase causation. Still no claim about her body specifically.

### Example 5 — Three cycles of consistent day-2 cramps

Three consecutive cycles, she logs cramps=moderate on cycle day 2. The Type A threshold is met.

> Day 2 · Menstrual · early flow
>
> **Cramps on day 2 — this is the third cycle in a row your body has done this on this exact day. It's a pattern, and the pattern is yours. Day 2-3 is usually when prostaglandins peak.**
>
> *Heat helps. So does knowing that this part is predictable now.*

This is Layer 3. The first sentence is a specific claim about *her*. The system can make it because the data supports it — three cycles, same phase, same phaseDay. **This is the sentence no other cycle app has ever written to a woman.** It earned its place by waiting until it was true.

### Example 6 — Mid-follicular headache, single log

She logs a headache on day 8. She has never logged a headache before.

> Day 8 · Mid-follicular · estrogen rising
>
> **Headache today. Hormones are climbing this week — sometimes the body reacts to the shifts.**
>
> *Hydration matters more than usual on rising-estrogen days.*

The Layer 2 mirror acknowledges the log honestly without overclaiming. The claim "sometimes the body reacts to the shifts" is general, not specific to her. No mismatch flag, even though headache is not a strong follicular expectation — n=1 is not enough to flag mismatch on a Type B symptom.

### Example 7 — Mid-follicular headaches across three cycles

Three cycles in a row, she logs headaches in days 7-9. Type B threshold met.

> Day 8 · Mid-follicular · estrogen rising
>
> **Mid-follicular headaches have shown up in your last three cycles around this time. This is sometimes the body's reaction to rising estrogen — it's worth knowing about your own pattern.**
>
> *If this becomes more severe or starts disrupting your day, it's worth mentioning to a doctor.*

Layer 3 interpretation. The pattern is real, the claim is specific to her, and the body note opens a soft door to medical care without alarm.

### Example 8 — Follicular low energy, three logs across two cycles

Type B mismatch case. She has logged energy=low three times in mid-follicular across the last two cycles.

> Day 9 · Mid-follicular · estrogen rising
>
> **Low energy again this week. The follicular phase usually brings more energy, not less, so this isn't what we'd expect to see — but that doesn't make it wrong. It just means something else might be shaping how you feel this week. Sleep, stress, iron, or anything else going on in your life.**
>
> *Steady is its own kind of shine, even when it's quieter than expected.*

This is the honest mismatch sentence. It does not say "something is wrong with your hormones." It does not say "your follicular phase is broken." It says: *we noticed, this isn't what's expected, and we're not going to pretend to know why.* The list at the end is soft and non-prescriptive. This is the kind of insight that, when a woman reads it, makes her feel like the app is talking *to* her instead of *at* her.

---

## 7. Implementation notes for the engine

A few engineering observations that fall out of this specification.

**The check-in flow needs to be a single React Native flow, not three separate screens.** Step 2 and Step 3 in particular must feel like one continuous moment. Any latency, navigation transition, or loading state between her last tap and the insight will break the magic.

**Layer 2 wrappers should be templated per (symptom × phase) combination, not generated per check-in.** Pre-write the opening clauses for each combination once and store them. Generating them on the fly is unnecessary cost and risks tonal drift.

**Layer 3 sentences should be generated from a small set of templates with inline data substitution**, not freely written by GPT each time. The data ("third cycle in a row," "days 7, 8, and 9") goes into a template ("[symptom] on [phase] has shown up in your last [n] cycles around [days]"). This keeps Layer 3 honest and traceable.

**The threshold counters should run nightly as a background job**, not in real time during the check-in. The check-in just reads the current "what layer is she at for each symptom" state from a precomputed cache. This keeps the check-in flow fast and the threshold logic auditable.

**Stress windowing is the only one that requires its own counter logic.** Every other symptom uses phase-windowed counts that the existing cycle-day math can produce. Stress needs a 7-day rolling counter, separately maintained.

**The orientation line ("Day 18 · Mid-luteal · 10 days to next period") is computed from her actual cycle data**, not from a textbook calendar. The cycle-day display is hers, not an abstract counter.

---

## 8. What this spec deliberately does not include

This is a launch specification. Several things that may eventually live in Vyana are not in this document because they should not be in v1.

- **Notifications and reminders.** No push to log. No nudge if she misses a day. The check-in has to earn its own usage by being satisfying. If it cannot, no reminder will save it.
- **Streaks, badges, charts, gamification.** Explicitly excluded. The whole point of the architecture is that the value is in the moment, not in retention mechanics.
- **Food, activity, or wellness modules.** Excluded for the reasons in the design conversation. Practical tips live *inside* insights when clinically grounded (variant E content already does this), not as separate modules.
- **Sex / libido tracking.** Out at launch. Can be added later as opt-in.
- **Weight tracking.** Out at launch. Contradicts Vyana's editorial voice.
- **AI-generated freeform insights.** Layer 3 uses templates with data substitution. There is no path where a free-form GPT call writes a claim about the user's body. The system either has data to support a claim or it does not say it.

---

## 9. The one rule that overrides all others

If at any point the system is about to say something to a user that it cannot back up with specific data she has actually given it, **the system should say less instead**.

Vyana's whole differentiator is that it does not overclaim. Every other cycle app earns its mediocrity by trying to seem smarter than its data. Vyana earns its trust by sometimes saying nothing at all.

When in doubt, fall back a layer. When falling back, be honest about what the system knows and does not know. The user will notice the restraint, and the restraint is the point.

---

*End of v1.0. Next revision expected after first three months of real usage data.*