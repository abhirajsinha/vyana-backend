# Vyana Complete Reference — Medical Research + Implementation Guide

> **Purpose**: Single permanent reference for building Vyana's Phase 1 insight engine. Combines deep medical/physiological research with implementation specs, data schema, change detection algorithms, UX principles, and sprint plan. Commit to repo alongside CLAUDE.md so Claude Code sessions can read it directly.

---

## 1. HORMONAL ARCHITECTURE — What's Actually Happening

### The Four Hormones That Drive Everything

| Hormone | Role | Peak Timing | User-Felt Impact |
|---------|------|-------------|-----------------|
| **FSH** (Follicle-Stimulating Hormone) | Stimulates follicle growth in ovaries | Early follicular (days 1–7) | Not directly felt; drives the "rebuilding" process |
| **Estrogen (Estradiol)** | Thickens uterine lining; affects brain serotonin, dopamine, glutamate | Two peaks: late follicular (day 10–14) + mid-luteal | Energy, mood, focus, confidence, skin quality, verbal ability |
| **LH** (Luteinizing Hormone) | Triggers ovulation via sudden surge | Day 12–14 (surge lasts ~24–48hrs) | Mild pelvic pain (mittelschmerz), libido spike, brief testosterone surge |
| **Progesterone** | Maintains uterine lining; calming via GABA stimulation; raises body temp | Mid-luteal (days 19–25 in 28-day cycle) | Drowsiness, warmth, calm early → irritability/anxiety as it drops |

### Key Hormonal Insights for Vyana

Estrogen and progesterone are **not synergistic** when both are high simultaneously — the brain shows lower overall response compared to when each acts alone or in natural sequence. This means the *transitions* between phases are where symptoms concentrate, not just the absolute levels.

**Critical for insight accuracy**: The luteal phase is relatively constant (~14 days ± 2). Cycle length variation comes almost entirely from the follicular phase (10–16 days). This means ovulation timing varies, but the time from ovulation to period is stable.

**Normal ranges (NHS/ACOG)**: Cycle length 21–35 days. Bleeding duration 3–7 days. Blood loss ~20–90mL (2–3 tbsp average). These are the deterministic thresholds for Vyana's cycle engine.

---

## 2. PHASE-BY-PHASE BREAKDOWN — What To Say And Why

### Phase A: Menstruation (Days 1–5 approx.)

**What's happening biologically:**
- Estrogen and progesterone are at their lowest point — this drop is what triggers the uterine lining to shed
- Prostaglandins (PGF2α and PGE2) are released from the endometrium, causing uterine muscle contractions
- PGF2α constricts blood vessels in the uterus → local oxygen deprivation (ischemia) → pain
- Prostaglandins can enter the bloodstream and cause: headaches, nausea, loose stools ("period poops"), dizziness
- FSH begins rising in the last days of this phase, starting the next cycle's follicle recruitment
- Iron is lost with blood — average loss ~30mL, but >80mL is clinically heavy

**What users actually feel (day by day):**
- **Day 1**: Heaviest bleeding typically begins. Cramps are usually worst on days 1–2 due to peak prostaglandin release. PMS symptoms (if present) often resolve once bleeding starts — many women feel emotional *relief*
- **Day 2**: Often the heaviest flow day. Cramps may persist. Fatigue is common — combination of blood loss, low hormones, and prostaglandin effects
- **Day 3**: Flow typically begins to lighten. Body is actively recovering. Energy is still low but the worst physical discomfort is usually passing
- **Day 4–5**: Bleeding winds down. Some women feel a subtle shift as the follicular phase machinery kicks in — FSH is rising, follicles are beginning to develop. Not a dramatic change, but the "heaviest phase is behind you" feeling is real

**What most apps get wrong:**
- They say "you may feel tired" — this is useless
- They don't explain *why* cramps happen (prostaglandins, not "your uterus is shedding")
- They ignore the emotional *relief* many women feel when bleeding starts (end of PMS tension)
- They don't mention iron loss and its cumulative effect across cycles

**What Vyana should say instead (insight principles for this phase):**
- Acknowledge the specific day within the phase ("Day 2 is often the heaviest — your body is doing real physical work right now")
- Explain prostaglandins in human terms ("The cramping is caused by chemical signals that help your uterus contract — they can also cause headaches or loose stools, which is completely normal")
- Reference the emotional shift ("If you felt tense or irritable before your period, you might notice that easing now — that's a real hormonal reset happening")
- Be specific about recovery ("Your iron stores dip during bleeding — if you feel more drained than usual, that's physiological, not just in your head")

---

### Phase B: Follicular Phase (Days 6–13 approx., post-bleeding)

**What's happening biologically:**
- Estrogen rises steadily as the dominant follicle matures
- Estrogen increases serotonin, dopamine, and glutamate (excitatory neurotransmitter) in the brain
- Estrogen *decreases* GABA (the calming/inhibitory neurotransmitter) — net effect is more energy, alertness, motivation
- Verbal processing and memory tend to improve (hippocampal activation increases with estrogen)
- Skin often improves — estrogen promotes collagen and reduces oil production
- Cervical mucus becomes clearer and more elastic as ovulation approaches
- Body temperature is at its baseline (lower than luteal phase)

**What users actually feel:**
- **Days 6–8**: The "rebuilding" days. Energy starts returning. Mood lifts. Often feels like emerging from a fog
- **Days 9–12**: This is often the "best" phase of the cycle. Rising estrogen brings higher confidence, better focus, more social energy. Skin looks clearer. Motivation peaks
- **Day 13**: Approaching ovulation. Estrogen is near its peak. LH is about to surge. Some women notice increased libido (partly driven by a brief testosterone spike that accompanies the LH surge)

**What most apps get wrong:**
- They treat this phase as filler between period and ovulation
- They don't tell users "this is your high-energy window — plan accordingly"
- They miss the cognitive improvements (verbal, memory, attention)

**What Vyana should say:**
- "Your estrogen is climbing — that's driving the uptick in energy and focus you might be noticing"
- "This is often a good window for mentally demanding tasks — your brain's processing speed tends to be at its sharpest"
- "If you're feeling more optimistic or socially energized, that's not random — rising estrogen boosts serotonin"

---

### Phase C: Ovulation (Day 14 ± 2 days)

**What's happening biologically:**
- LH surges dramatically (up to 10x baseline), triggering the release of the mature egg from the dominant follicle
- Estrogen peaks just before ovulation then drops sharply right after
- A brief testosterone surge accompanies the LH surge → libido spike
- The egg survives ~24 hours if unfertilized
- Some women feel mittelschmerz — a one-sided pelvic pain from the follicle rupturing
- Cervical mucus is at its most fertile (clear, stretchy, egg-white consistency)

**What users actually feel:**
- Brief energy/confidence peak
- Possible mild pelvic discomfort (one side)
- Increased libido
- Some women feel a brief dip in mood right after ovulation as estrogen drops suddenly before recovering

**What Vyana should say:**
- "Around this time, your body releases an egg — some women feel a brief pinch or dull ache on one side, which is normal"
- "You might notice a brief energy peak today — estrogen is at its highest point before it temporarily dips"
- "If you feel a slight mood dip in the next day or two, that's the post-ovulation estrogen drop. It typically stabilizes quickly"

---

### Phase D: Early-to-Mid Luteal (Days 15–24 approx.)

**What's happening biologically:**
- The empty follicle becomes the corpus luteum, which produces progesterone (and some estrogen)
- Progesterone rises to its peak around days 19–22
- Progesterone stimulates GABA production → calming, sedative effect
- Progesterone raises core body temperature by ~0.4°C → affects sleep architecture
- Sleep changes: more Stage 2 (light) sleep, higher sleep spindle activity, reduced REM sleep
- The body is essentially preparing for potential pregnancy
- If no pregnancy → corpus luteum begins to break down around days 22–24
- Estrogen has a second, smaller peak mid-luteal then declines alongside progesterone

**What users actually feel:**
- **Days 15–19**: Often a "calm but quieter" phase. Less outward energy than follicular, but not unpleasant. Progesterone's calming effect can feel like contentment or slightly lower motivation
- **Days 19–22**: Progesterone peaks. Sleep may feel less refreshing (reduced REM). Body temperature is elevated, which can cause night sweats or restless sleep. Appetite often increases (progesterone drives this). Bloating may begin
- **Days 22–24**: The "beginning of the end" — both progesterone and estrogen start declining. This is where PMS symptoms typically begin to emerge

**What most apps get wrong:**
- They lump the entire luteal phase together as "PMS zone"
- They don't distinguish early luteal (calm) from late luteal (symptomatic)
- They don't explain why sleep gets worse (body temperature, not just "hormones")

**What Vyana should say:**
- Early: "Progesterone is rising — you might feel more settled or introspective. That's a natural shift, not a loss of energy"
- Mid: "Your body temperature is slightly elevated right now, which can make sleep feel less refreshing — this is progesterone doing its job"
- "If your appetite has increased, that's common in this phase — your body's metabolic rate actually rises slightly during the luteal phase"

---

### Phase E: Late Luteal / PMS Window (Days 25–28 approx.)

**What's happening biologically:**
- Both progesterone and estrogen drop rapidly (no pregnancy → corpus luteum regresses)
- Serotonin declines with falling estrogen → mood vulnerability
- Prostaglandin production begins ramping up in the endometrium
- The decline in progesterone removes the GABA boost → anxiety, irritability
- Sleep is most disrupted here: ~70% of women with PMDD report sleep issues in this window
- Breast tenderness, bloating, headaches, acne can appear
- Some women experience increased pain sensitivity (prostaglandins lower pain thresholds)

**What users actually feel:**
- **Days 25–26**: Mood shifts begin. Irritability, anxiety, or sadness that feels disproportionate to circumstances. Bloating, breast tenderness
- **Days 27–28**: PMS symptoms often peak. Craving for sugar/carbs (but sugar spikes can worsen mood). Sleep disruption. Many women describe feeling "not like themselves"

**PMS vs PMDD — important distinction for Vyana:**
- PMS affects ~50% of reproductive-age women with mild-to-moderate symptoms
- PMDD (Premenstrual Dysphoric Disorder) affects 3–8% with severe, debilitating symptoms
- If a user consistently logs severe mood/distress in late luteal phase, Vyana should eventually surface a gentle flag

**What Vyana should say:**
- "Both estrogen and progesterone are dropping right now — that's the hormonal shift behind what you might be feeling"
- "If you're feeling more irritable or anxious than usual, this is one of the most common times in the cycle for that. It's not a personal failing — it's chemistry"
- "Your body's sleep quality tends to be lowest in this window. If rest feels harder, that's real, not imagined"
- "This phase passes — once bleeding begins, many women feel a noticeable emotional reset"

---

## 3. CROSS-CUTTING MEDICAL KNOWLEDGE — For Smarter Insights

### Iron & Fatigue

- Iron deficiency is the most common nutritional deficiency worldwide, disproportionately affecting menstruating women
- Women lose iron with every period; heavy periods (>80mL) significantly deplete stores
- Iron deficiency symptoms *even without anemia*: fatigue, brain fog, hair loss, restless legs, poor concentration, insomnia
- Iron therapy in menstruating women has been clinically shown to reduce fatigue and improve executive attention and working memory
- ~40% of adolescent girls and young women don't get enough iron
- Many women normalize their fatigue — "all the women in my family are like this"
- **Vyana opportunity**: After multiple cycles of low energy logging, suggest considering iron levels. Not a diagnosis — a conversation starter

### Sleep Architecture Changes

- Follicular phase: best sleep quality typically. Lower body temperature, normal REM
- Luteal phase: body temp rises ~0.4°C. REM sleep decreases. Stage 2 (lighter) sleep increases. Sleep spindle activity increases
- Late luteal: progesterone drops but temperature stays elevated → most fragmented sleep
- Menstruation: subjective sleep quality lowest (pain, discomfort), but objectively sleep structure often normalizes
- Poor sleep in late luteal phase is independently associated with reduced positive emotions the next day (not just hormones → mood; it's hormones → sleep → mood)
- **Vyana opportunity**: If a user logs poor sleep in late luteal, connect it to the hormonal mechanism. "Your sleep may feel less refreshing right now — progesterone's effect on body temperature can fragment sleep in this phase"

### Cognitive Changes

- Research shows measurable cognitive shifts across the cycle, though effect sizes are modest
- Follicular/pre-ovulatory (high estrogen): improved verbal processing, better memory encoding, faster processing speed, enhanced attention
- Luteal (high progesterone): possible slight advantages in visual-spatial processing
- Menstrual (low everything): better spatial reasoning in some studies
- The changes are real but not dramatic — the research suggests variations, not impairments
- **Vyana opportunity**: Frame these positively. "Your verbal fluency tends to be sharpest in this phase" rather than "you may have trouble focusing"

### Prostaglandins — The Underexplained Pain Driver

- Prostaglandins (PGF2α) are the primary cause of menstrual cramps — not just "shedding"
- They constrict blood vessels in the uterus → oxygen deprivation → pain
- Higher prostaglandin levels = more severe cramps (clinically proven correlation)
- Prostaglandins enter the bloodstream and cause systemic symptoms: headaches, nausea, diarrhea, dizziness, vomiting
- NSAIDs (ibuprofen) work specifically by inhibiting prostaglandin synthesis — that's *why* they help cramps
- Omega-3 fatty acids may help reduce prostaglandin production; omega-6 excess may increase it
- Magnesium (bisglycinate form) has been shown to be more effective than placebo in reducing prostaglandin-driven cramps
- **Vyana opportunity**: Explain cramp mechanism. "The cramping you feel is driven by prostaglandins — chemical signals that help your uterus contract but can also cause headaches and GI symptoms"

### Body Temperature

- Basal body temperature rises ~0.4°C after ovulation (progesterone-mediated)
- This elevated temperature persists throughout the luteal phase
- The nighttime temperature drop is blunted in the luteal phase — smaller amplitude of the circadian temperature rhythm
- This temperature change is consistent and measurable — it's how some fertility methods work
- Temperature drops back to baseline with menstruation
- **Vyana opportunity**: "Your body is running slightly warmer right now — that's normal post-ovulation. It can affect how comfortable you feel sleeping"

---

## 4. WHAT COMPETITORS DO (AND WHERE THEY FAIL)

### Flo
- 420M+ downloads, 67M monthly active users
- Strengths: huge content library (3000+ articles), AI chatbot ("Health Assistant"), pregnancy mode, community ("Secret Chats"), FSA/HSA eligible premium
- Premium ($50/year): AI health assistant, detailed cycle reports, PCOS/endometriosis risk alerts, expert video courses, personalized daily plans
- Weaknesses: aggressive monetization (constant premium prompts), FTC settlement for sharing data with Facebook (2021), $56M class action (2025), many features paywalled, insights feel promotional not personal
- Insight style: informational articles, daily tips. Broad, not personalized to the individual user

### Clue
- 100M+ downloads, 10M monthly active users, CE-marked Class 1 medical device
- Strengths: science-first approach, strong privacy (GDPR compliant, Berlin-based), research partnerships (Harvard, MIT, UC Berkeley), gender-inclusive language, 30+ trackable data points
- Plus (~$30–35/year): 12-month forecasts, cramp predictions with relief tips, cycle comparisons, custom tags, advanced pattern analysis, fertility/pregnancy modes
- Weaknesses: less engaging UI, smaller content library, less community feel
- Insight style: data visualization focused. Shows patterns over time but doesn't *explain* them in conversational language

### Where ALL competitors fail (Vyana's opening):
1. **Generic insights**: "You may feel tired" — no acknowledgment of individual patterns
2. **No reflection of logged data**: User logs low mood → gets same insight as someone who didn't log
3. **Phase-lumping**: Entire luteal phase treated as one block; no early/mid/late distinction
4. **Biology as decoration**: Hormones mentioned but not connected to experience
5. **No temporal anchoring**: "This is normal" without "compared to where you were 3 days ago"
6. **Product-centric CTAs**: "Log your symptoms!" instead of making the user feel understood
7. **No progressive intelligence**: Day 1 insight = Day 90 insight for the same phase

---

## 5. INSIGHT DESIGN PRINCIPLES — Derived from Medical Research

### Principle 1: Connect Hormones to Experience
**Wrong**: "Estrogen is rising"
**Right**: "The energy shift you might be feeling? That's estrogen climbing — it boosts serotonin, which lifts mood and sharpens focus"

### Principle 2: Be Specific About Days, Not Just Phases
**Wrong**: "During your period, you may feel fatigued"
**Right**: "Day 2 is often the heaviest flow day — fatigue today has a real physiological basis in blood loss and prostaglandin activity"

### Principle 3: Acknowledge What's Passing, Not Just What's Present
**Wrong**: "You may experience cramps"
**Right**: "If cramps were intense yesterday, they typically ease by day 3 as prostaglandin levels decline"

### Principle 4: Distinguish What's Normal From What Might Need Attention
**Wrong**: silence about abnormality
**Right**: "Cycle variability of a few days is normal — but if you're consistently seeing large shifts, that's worth tracking over the next couple of cycles"

### Principle 5: Translate Recovery, Don't Just Announce It
**Wrong**: "Your body is recovering"
**Right**: "Your body lost iron during bleeding and is now rebuilding its uterine lining — that takes real energy, even if it's invisible"

### Principle 6: Make the Next Phase Visible
**Wrong**: "The follicular phase is next"
**Right**: "In about 2 days, rising estrogen typically brings a noticeable energy shift — the rebuilding phase is starting"

### Principle 7: Frame Mood Changes as Chemistry, Not Character
**Wrong**: "Some women feel irritable before their period"
**Right**: "If things feel heavier emotionally right now, the drop in both estrogen and progesterone directly affects serotonin and GABA — this is neurochemistry, not weakness"

### Principle 8: Respect Individual Variation
**Wrong**: "You will feel X"
**Right**: "Many people notice X around this time — logging how you're feeling today can help us understand your specific pattern"

### Principle 9: Use Empowering Language (NHS Digital Guidelines)
**Wrong**: "Patient complaints include fatigue and mood swings"
**Right**: "You might notice fatigue or mood shifts — these are common experiences in this phase"
- Always use "you" language, never clinical third-person
- Replace "complaint" with "symptom" or "feeling" or "experience"
- Short, simple sentences. Inclusive language ("we"/"you")
- Avoid anxiety-provoking absolutes; use "can" and "may"
- If something *might* be concerning: "if you're experiencing [X], that can be normal, but feel free to consult a doctor if it's severe or unusual"

### Principle 10: Reflect Logged Data Explicitly
**Wrong**: User logs headache → insight doesn't mention it
**Right**: "We've noted your headache — yesterday you were fine, so your period symptoms may be intensifying as expected for this day"
- At least one sentence in every insight must visibly incorporate the latest log signals
- This is what creates the "it saw what I entered" perception

---

## 6. MEDICALLY-GROUNDED INSIGHT TEMPLATES BY DAY

These are **not** copy-paste outputs. They're templates showing the *type* of specificity and medical grounding each day's insight should have. VyanaContext should use these as guidance for prompt construction.

### Day 1 (Period Start)
- Physical: Cramps typically peak days 1–2 due to prostaglandin release. Heavy bleeding begins. Fatigue from hormonal drop + blood loss
- Mental: Many women feel emotional *relief* — PMS tension resolves as hormones reset to baseline
- Why: Estrogen and progesterone at lowest → endometrial lining can't be sustained → prostaglandins trigger shedding
- Action: NSAIDs work best if taken *before* cramps peak (they block prostaglandin synthesis). Iron-rich foods offset blood loss. Light movement can help cramps

### Days 2–3 (Peak Bleed → Tapering)
- Physical: Day 2 often heaviest. Day 3 typically lightens. Bloating may persist. Energy still low
- Mental: Fog from low hormones. Some women feel introspective
- Why: FSH is beginning to rise — your body is already recruiting follicles for the next cycle even while bleeding
- Action: Rest is productive right now, not lazy. Hydration and iron matter more than usual

### Days 4–5 (Bleeding Ends)
- Physical: Bleeding tapers. Energy begins gradual return
- Mental: Subtle shift as estrogen starts its climb
- Why: Follicular phase machinery is active — estrogen from developing follicles is beginning to rise
- Action: This is the transition. Tomorrow or the day after, you may notice a real difference

### Days 6–9 (Mid-Follicular)
- Physical: Energy returns noticeably. Skin improves. Stamina increases
- Mental: Clarity, motivation, verbal sharpness all benefit from rising estrogen/serotonin
- Why: Estrogen enhances glutamate (excitatory neurotransmitter) and decreases GABA (inhibitory) → more alert, more engaged
- Action: Good window for challenging mental work, creative projects, social activities

### Days 10–13 (Late Follicular → Pre-Ovulation)
- Physical: Often the "peak" phase. Estrogen near maximum. Physical performance strong
- Mental: Confidence, sociability, optimism tend to be highest. Verbal memory and attention at their sharpest
- Why: Estrogen peak enhances hippocampal activation (memory center), serotonin, and dopamine
- Action: Plan demanding tasks here if possible. This is your biological tailwind

### Day 14 (Ovulation ± 2 days)
- Physical: Possible mittelschmerz (one-sided pelvic ache). Cervical mucus changes. Libido may spike (testosterone surge with LH)
- Mental: Brief energy peak, then possible mild dip as estrogen drops post-ovulation
- Why: LH surge triggers egg release. Estrogen drops sharply. Progesterone begins rising
- Action: The transition to the next phase begins. If you notice a brief mood dip tomorrow, that's the post-ovulation hormone shift

### Days 15–19 (Early Luteal)
- Physical: Body temperature rises. Appetite may increase. Breast tenderness may begin
- Mental: Calmer, more settled feeling from progesterone's GABA-enhancing effect. Less outward energy but not unpleasant
- Why: Progesterone rising steadily. Body is preparing the uterine lining for potential implantation
- Action: This is a natural "inward" phase. Don't mistake lower social energy for something wrong

### Days 20–23 (Mid Luteal → Late Luteal Transition)
- Physical: Progesterone peaks then begins declining. Bloating, water retention common. Sleep quality drops (elevated temp + reduced REM)
- Mental: Mood may begin shifting. Increased sensitivity to stress. Sugar cravings (progesterone-driven, but sugar spikes can worsen mood)
- Why: The corpus luteum is beginning to break down. Both hormones are declining. Serotonin follows estrogen down
- Action: Protect sleep actively — earlier bedtimes, cooler room, lighter evening meals. Dark chocolate > sugar for cravings

### Days 24–28 (Late Luteal / PMS)
- Physical: PMS symptoms peak — cramps may begin before bleeding, breast tenderness, headaches, acne, bloating
- Mental: Irritability, anxiety, sadness. 50% of reproductive-age women experience some PMS. 3–8% experience severe PMDD
- Why: Rapid decline in both estrogen and progesterone. Loss of serotonergic support. Prostaglandins beginning to build in endometrium
- Action: This passes. Once bleeding starts, the hormonal reset typically brings relief within 1–2 days. Prioritize self-compassion — this is biochemistry, not failure

---

## 7. DATA SCHEMA & LOGGING REQUIREMENTS

### Per-Log Fields (Daily)

| Field | Type | Purpose |
|-------|------|---------|
| **Bleeding** | categorical (none/light/medium/heavy) | Period start/end detection, flow tracking |
| **Cramps** | 0–10 scale | Primary period symptom, prostaglandin severity indicator |
| **Headache** | yes/no or 0–10 scale | Common PMS/prostaglandin symptom |
| **Breast tenderness** | yes/no or 0–10 scale | Luteal phase/PMS indicator |
| **Mood** | 1–5 scale or labels (calm/irritable/anxious/sad/happy) | Mood fluctuation tracking across phases |
| **Energy** | 1–5 scale | Correlate with fatigue patterns, iron concerns |
| **Sleep quality** | hours + 1–5 quality | Factor into fatigue/mood causality chain |
| **Stress** | 1–5 scale | Contextual signal (progesterone converts to cortisol under stress) |

Research shows 100% of period apps include flow tracking, ~95% include pain/cramps, ~75% include mood and fatigue. Stress is tracked by only ~25% of apps — including it gives Vyana an edge.

### Per-Cycle Summary Fields (Auto-Computed)

| Field | Computation | Purpose |
|-------|-------------|---------|
| Cycle length | Days between period starts | Detect irregularity (normal: 21–35 days) |
| Period length | Days of bleeding | Detect heavy/prolonged periods (normal: 3–7 days) |
| Average symptom levels | Mean per symptom across cycle | Personal baseline for change detection |
| Typical symptom timing | First day of cramps, peak mood shift day | Pattern detection across cycles |
| Rolling averages | Mean of last 3 cycles per metric | Baseline for anomaly flagging |

### Latency Requirement

Insights must refresh **immediately** upon logging — within seconds, not on next app open. The Doherty Threshold (UX principle): users expect sub-400ms response or at minimum an optimistic update that acknowledges input. Implementation: show "Got it — updating your insights..." immediately, then async-regenerate the insight with the new log data incorporated.

---

## 8. INSIGHT ENGINE ARCHITECTURE — The Core Logic Layer

This section defines the architectural logic between raw data and GPT-generated insight. This is the layer that makes Vyana's insights feel intelligent rather than templated.

### 8.1 Signal Priority Hierarchy

The insight engine must be **signal-first, not phase-first**. Phase is context, not the driver.

```
Priority 1: latestLogSignals     → what user just told us today
Priority 2: recentTrend          → last 2–3 days trajectory  
Priority 3: personalBaseline     → deviation from their rolling norm
Priority 4: cyclePhase           → hormonal context for this day
Priority 5: populationPattern    → what's typical for this phase generally
```

**Hard rule**: If Priority 1 contradicts Priority 4, the insight MUST lead with Priority 1 and explain why the phase expectation doesn't apply today. This is the highest-trust moment in the product.

**Example of the rule in action**:
- User logs: Day 9 (follicular), energy = LOW, sleep = BAD, stress = HIGH
- Phase says: "estrogen rising, energy should improve"
- **Wrong output**: "Your estrogen is rising — energy should be improving"
- **Correct output**: "Even though this phase usually brings higher energy, your poor sleep and high stress today can override that effect — which is likely why you're feeling drained."

### 8.2 Narrative Selector

Before generating any text, the engine must decide **what the insight is about**. This prevents GPT from mixing everything and diluting the message.

```
primaryNarrative = 
    IF any symptom severity >= 7        → "severe_symptom"
    ELSE IF signals contradict phase    → "conflict"
    ELSE IF strong signal change vs yesterday → "signal_change"
    ELSE IF baseline deviation detected → "pattern_shift"
    ELSE IF red flag threshold met      → "escalation"
    ELSE                                → "phase"
```

**Rules**:
- Each insight has exactly ONE primary narrative
- Everything else is secondary/supporting context
- GPT prompt must specify: "This insight is primarily about [primaryNarrative]. All other information is secondary context."

**Example**:
- User logs: cramps = 8, stress = low, sleep = ok, Day 2
- primaryNarrative = "severe_symptom" (cramps >= 7)
- Insight leads with pain, uses phase as explanation: "Your cramps are intense today — Day 2 is typically when prostaglandin levels peak, causing the strongest contractions. This usually eases by tomorrow."

### 8.3 Conflict Detection (First-Class Concept)

Signal-phase conflicts are not edge cases — they're the most important moments in the product. They must have a dedicated handling path.

**Conflict detection rules**:

| Signal | Phase Expectation | Conflict Trigger |
|--------|------------------|-----------------|
| Energy LOW | Follicular (days 6–13) | Energy should be rising with estrogen |
| Mood HIGH | Late luteal (days 25–28) | Mood typically drops with hormone withdrawal |
| Sleep BAD | Early luteal (days 15–19) | Progesterone should be promoting GABA/calm |
| Cramps HIGH | Mid-follicular (days 8–12) | No prostaglandin activity expected |
| Energy HIGH | Menstruation (days 1–3) | Hormones at lowest, fatigue expected |

**When conflict detected**:
1. Lead with the user's actual experience (signal)
2. Acknowledge the phase expectation
3. Explain the override mechanism
4. Reassure

**Template**: "[Acknowledge signal]. Even though [phase expectation], [override explanation] — which is likely why [connect to experience]."

### 8.4 Trend Computation

Don't just compare to yesterday — compute a trajectory from the last 2–3 days.

**Trend states**:
```
trend = 
    IF today > yesterday > day_before    → "worsening"
    IF today < yesterday < day_before    → "improving"  
    IF |today - yesterday| < threshold   → "stable"
    ELSE                                 → "fluctuating"
```

**Usage in insights**:
- "worsening": "Your cramps have been building over the last two days — this often peaks around Day 2"
- "improving": "Your energy has been climbing since yesterday — that's the follicular phase kicking in"
- "stable": "Your mood has been steady the last few days — that consistency is a good sign"
- "fluctuating": "Your sleep has been up and down — tracking this over the next few days can help identify what's driving it"

**Required VyanaContext field**: `recentTrend` object containing trend state per metric for the last 2–3 logged days.

### 8.5 Interaction Rules (Deterministic)

These hardcoded rules capture multi-signal interactions without requiring a causal graph engine. They give 80% intelligence for 20% complexity.

```
// Sleep-fatigue override (strongest predictor of next-day energy)
IF sleep_quality <= 2 AND phase = any
    → prioritize sleep-fatigue explanation over hormonal context
    → "Your low sleep is likely the biggest factor in how you're feeling today"

// Stress-luteal amplification  
IF stress >= 4 AND phase = luteal
    → amplify mood sensitivity messaging
    → "High stress during the luteal phase can intensify mood shifts — progesterone converts to cortisol under stress"

// Pain escalation trajectory
IF cramps_today > cramps_yesterday AND cycleDay <= 2
    → "prostaglandin peaking" narrative
    → "Cramps often build through Day 1–2 as prostaglandin levels peak"

// Energy-phase conflict
IF energy <= 2 AND phase = follicular (days 6+)
    → flag conflict, explain override
    → check sleep and stress first as likely causes

// Positive reinforcement
IF energy >= 4 AND phase = follicular
    → reinforce: "The energy you're feeling is real — rising estrogen is doing its job"

// Cumulative fatigue pattern
IF energy <= 2 for 3+ consecutive days AND bleeding active
    → surface iron awareness: "Persistent low energy during your period can sometimes relate to iron — worth noting if this is a recurring pattern"
```

### 8.6 Mechanism Chain — When To Use It

The biological explanation chain (Signal → Mechanism → Experience → Reassurance) is powerful but should be **selective, not automatic**.

**USE mechanism when**:
- Explaining pain or physical symptoms ("Prostaglandins constrict blood vessels → ischemia → cramping")
- Explaining unexpected states / conflicts ("Progesterone raises body temp → fragments sleep → next-day fatigue")
- Building trust moments with new users ("Here's *why* this happens...")
- Red flag contexts ("Consistently heavy bleeding can deplete iron stores, which affects energy even without anemia")

**SKIP mechanism when**:
- Stating trajectory ("Your energy is improving compared to yesterday")
- Simple reassurance ("This phase passes — relief typically comes within 1–2 days")
- Reflecting logged data ("We've noted your headache today")
- The user has heard the mechanism before (repeat users on same phase)

Over-explaining is just as bad as under-explaining. The mechanism chain is a trust tool, not a default format.

### 8.7 The Production Insight Formula

Every generated insight must follow this structure, in this order:

```
1. Primary Narrative  → what this insight is ABOUT (from Narrative Selector)
2. Signal Reflection   → acknowledge today's logged data
3. Trend Context       → trajectory vs yesterday / recent days
4. Mechanism (if needed) → biological explanation chain
5. Temporal Anchor     → comparison to past OR projection to future
6. Phase Context       → hormonal backdrop (light, not dominant)
7. Personalization     → baseline comparison (if 2+ cycles available)
```

**Order matters more than completeness.** Not every insight needs all 7 layers. But the order must never be violated — signals always before phase, trends always before population patterns.

### 8.8 VyanaContext v2 — Required Fields

The VyanaContext object passed to GPT must include:

```typescript
interface VyanaContextV2 {
  // User state
  cycleDay: number;
  phase: string;               // menstrual | follicular | ovulation | early_luteal | mid_luteal | late_luteal
  isNewUser: boolean;
  cyclesTracked: number;
  
  // Today's signals (Priority 1)
  latestLogSignals: {
    mood?: number;
    energy?: number;
    sleep?: number;
    stress?: number;
    cramps?: number;
    bleeding?: string;
    headache?: boolean;
    breastTenderness?: boolean;
  };
  
  // Trend (Priority 2)  
  recentTrend: {
    mood?: 'improving' | 'worsening' | 'stable' | 'fluctuating';
    energy?: 'improving' | 'worsening' | 'stable' | 'fluctuating';
    cramps?: 'improving' | 'worsening' | 'stable' | 'fluctuating';
    sleep?: 'improving' | 'worsening' | 'stable' | 'fluctuating';
  };
  
  // Previous day (for trajectory sentences)
  previousDaySignals: {
    mood?: number;
    energy?: number;
    cramps?: number;
    sleep?: number;
  };
  
  // Personal baseline (Priority 3) — null if < 2 cycles
  personalBaseline: {
    avgCrampsSameDay?: number;
    avgEnergySameDay?: number;
    avgMoodSameDay?: number;
    deviations?: string[];      // e.g. ["cramps +2σ above baseline"]
  } | null;
  
  // Narrative control
  primaryNarrative: 'severe_symptom' | 'conflict' | 'signal_change' | 'pattern_shift' | 'escalation' | 'phase';
  conflictDetected: boolean;
  conflictDescription?: string;  // e.g. "Low energy during follicular phase — sleep and stress override"
  
  // Confidence
  confidenceLevel: 'low' | 'medium' | 'high';
  
  // Phase context (Priority 4–5)
  phaseExpectations: string;     // what this phase typically brings
  hormoneState: string;          // human-readable hormone context
  
  // Existing fields
  progress: object;
  isPeriodDelayed: boolean;
  isIrregular: boolean;
  // ... other existing VyanaContext fields
}
```

### 8.9 Prompt Contract — Hard Rules for GPT

This is the enforcement layer that prevents GPT from drifting. These rules are injected into the system prompt and are non-negotiable.

```
HARD RULES — VIOLATING ANY OF THESE REQUIRES REGENERATION:

1. SIGNAL-FIRST: The insight MUST NOT begin with phase/hormone context.
   It must begin with the user's actual state (logged signals or trend).

2. NARRATIVE LOCK: This insight is primarily about: {primaryNarrative}.
   Do NOT introduce unrelated themes. All other information must 
   support this primary narrative.

3. REFLECTION REQUIRED: The output MUST reference at least one specific
   value from latestLogSignals. If the user logged mood=2 and cramps=7,
   those numbers or their meaning must appear in the output.

4. TEMPORAL ANCHOR REQUIRED: Every insight MUST include at least one of:
   - comparison to yesterday or recent days
   - projection of what to expect next (tomorrow / next 1-2 days)
   Insights without temporal context are static and feel generic.

5. SHARPNESS: Maximum ONE primary idea per insight. Maximum 3-4 
   supporting sentences. No redundant phrasing. No filler.
   Total output: 3-6 sentences maximum.

6. BANNED PHRASES (instant regeneration trigger):
   - "Many people find..."
   - "It's common to..."
   - "The body is..."  (use "Your body is...")
   - "Some women experience..."
   - Any sentence that could apply to ANY user on this cycle day

7. CONFLICT MODE: If conflictDetected = true, the insight MUST:
   - Lead with the user's actual experience
   - Explicitly acknowledge what the phase would normally predict
   - Explain WHY the override is happening (sleep, stress, etc.)
   - This is not optional. Ignoring conflict = trust destruction.

8. MECHANISM SELECTIVITY: Include biological mechanism chains ONLY when:
   - Explaining pain or physical symptoms
   - Explaining unexpected states (conflicts)
   - User is new (first 1-2 cycles, building trust)
   Do NOT explain mechanisms for simple trajectory statements or 
   reassurance.

9. CONFIDENCE LANGUAGE: Match language to data strength:
   - Low (new user, <2 cycles): "You might notice..." / "Around this time..."
   - Medium (2-3 cycles): "Your logs suggest..." / "Based on what you've shared..."
   - High (3+ cycles): "Your pattern shows..." / "Across your cycles..."
   Never use high-confidence language with low data.

10. NO HALLUCINATION: Only reference symptoms the user has logged.
    Do not invent patterns not supported by the data passed in context.
    Do not claim the user "usually" does something without baseline data.
```

### 8.10 Insight Validator Layer

A post-generation validation step that runs before the insight is shown to the user. If any check fails, the insight is regenerated.

```typescript
function validateInsight(output: string, context: VyanaContextV2): ValidationResult {
  const checks = {
    
    // HARD CHECKS — failure = regenerate
    reflectsLogSignals: checkLogReflection(output, context.latestLogSignals),
    followsNarrative: checkNarrativeAlignment(output, context.primaryNarrative),
    hasTemporalAnchor: checkTemporalReference(output),
    notPhaseFirst: !output.match(/^(Your estrogen|Your progesterone|In the .* phase|During this phase)/i),
    noBannedPhrases: !output.match(/many people find|it's common to|some women|the body is/i),
    withinLength: output.split('.').filter(s => s.trim()).length <= 6,
    
    // SOFT CHECKS — log warning, don't regenerate
    hasForwardProjection: output.match(/tomorrow|next .* days|typically eases|coming days/i) !== null,
    matchesConfidence: checkConfidenceLanguage(output, context.confidenceLevel),
    acknowledgesConflict: context.conflictDetected ? 
      output.match(/even though|despite|usually|normally|override/i) !== null : true,
  };
  
  const hardFails = ['reflectsLogSignals', 'followsNarrative', 'hasTemporalAnchor', 
                     'notPhaseFirst', 'noBannedPhrases', 'withinLength'];
  
  const mustRegenerate = hardFails.some(check => !checks[check]);
  
  return { 
    valid: !mustRegenerate, 
    checks, 
    failedHard: hardFails.filter(c => !checks[c]),
    failedSoft: Object.keys(checks).filter(c => !hardFails.includes(c) && !checks[c])
  };
}

// Regeneration loop (max 2 retries)
async function generateValidInsight(context: VyanaContextV2): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const output = await callGPT(context);
    const validation = validateInsight(output, context);
    if (validation.valid) return output;
    // On retry, append failed checks to prompt as additional constraints
    context._retryHints = validation.failedHard;
  }
  // Fallback: return a safe, pre-written template-based insight
  return getFallbackInsight(context);
}
```

### 8.11 Narrative Weighting

To prevent phase context from creeping back into dominance, assign explicit weights to each signal layer. These weights determine how much of the insight's content should come from each source.

```
Signal Layer          | Weight | What it controls
--------------------- | ------ | ----------------
Today's logged signals | 0.40   | Lead sentences, primary acknowledgment
Recent trend (2-3 days)| 0.20   | Trajectory framing ("building", "easing")
Personal baseline      | 0.15   | Deviation language ("more than your usual")
Phase/hormones         | 0.15   | Mechanism + context (secondary, not lead)
Population patterns    | 0.10   | Fallback only when no personal data exists
```

**Enforcement**: In the GPT prompt, translate these weights into structural instructions:
- "Approximately half of this insight should address the user's logged signals today"
- "Phase and hormone context should appear as supporting explanation, not as the opening or primary point"
- "Population-level statements ('many people...') should only appear if no personal data is available"

When `isNewUser = true` and no logs exist, the weights shift:
- Phase/hormones: 0.40 (primary, since no signals exist)
- Population patterns: 0.35
- Forward projection: 0.25 ("logging will help us personalize")

---

## 9. CHANGE DETECTION & ALGORITHMS

### Phase 1: Deterministic Rules (Launch)

Use clinical heuristics — no ML required:
- Period typically days 1–5, cramps worst days 1–2 (from dysmenorrhea guidelines)
- Normal cycle: 21–35 days (ACOG/NHS)
- Normal bleed: 3–7 days
- If cycle day > user's average + 7 days → flag as "period may be late"
- If bleeding > 7 days → surface gentle heavy bleeding message

### Phase 1.5: Statistical Change Detection (After 2–3 Cycles)

Compare current cycle metrics against personal rolling baseline:

**Method**: For each logged metric (cramps, mood, energy, sleep), compute:
- Personal mean (μ) and standard deviation (σ) from previous cycles for the same cycle day
- Current value Z-score: `z = (current_value - μ) / σ`
- If `|z| > 2.0` (>2 standard deviations from personal norm) → flag as a change

**Safeguards**:
- Require minimum 2–3 complete cycles before activating change detection
- If data is sparse, down-weight unusual readings ("likely within normal variation")
- Require sustained change (2+ consecutive days anomalous) before surfacing
- Very rare flags (e.g., suspect dysmenorrhea) require multiple corroborating logs

**Change detection language**:
- **Don't say**: "Your cramps are abnormal"
- **Do say**: "Your cramps seem more intense than your usual pattern for this day — worth tracking to see if this continues next cycle"

### Phase 2+: Pattern Mining

- Compute correlations: stress ↔ cramp severity, sleep quality ↔ next-day mood, cycle length trend over 6+ cycles
- Cross-cycle comparison: "Your fatigue started 2 days earlier this cycle compared to your last 3"
- Monthly health reports with trend visualization

### Constraining LLM Output

To prevent hallucination in GPT-generated insights:
- Always pass concrete signals from the deterministic engine into the prompt (cycle day, phase, logged values, baseline comparisons, confidence level)
- Include explicit constraints: "Only reference symptoms the user has logged. Do not invent patterns not supported by the data."
- Use confidence-to-language mapping: low confidence → "many people notice...", medium → "your logs suggest...", high → "your pattern shows..."
- Include disclaimer framing: "We usually expect [user's pattern] in this phase, so this shift could be worth tracking" rather than generating entirely new claims

---

## 10. RED FLAGS — Clinical Thresholds for Escalation

These are patterns that, after 3+ cycles, may warrant a gentle suggestion to consult a healthcare provider:

| Red Flag | Clinical Threshold | Possible Conditions |
|----------|-------------------|-------------------|
| **Short/long cycles** | Consistently <21 or >35 days | Anovulation, thyroid issues, PCOS |
| **Prolonged bleeding** | >7 days per period | Fibroids, endometriosis, bleeding disorder |
| **Heavy bleeding** | Soaking a pad/tampon every 1–2 hours for several hours, or clots >2.5cm | Fibroids, adenomyosis, von Willebrand disease |
| **Severe cramps** | Don't respond to NSAIDs, progressively worsening cycle over cycle | Endometriosis, adenomyosis |
| **Severe late-luteal mood** | Consistent severe mood/functional impairment in late luteal across 2+ cycles | PMDD (treatable, often underdiagnosed) |
| **Persistent fatigue** | Low energy logged across multiple cycles despite adequate sleep | Iron deficiency (very common, very underdiagnosed) |
| **Irregular + acne + weight** | Combined pattern across cycles | PCOS |
| **Absent periods** | >90 days without period (not pregnant) | Hypothalamic amenorrhea, thyroid, PCOS |

**How Vyana handles these**: Never diagnose. Never alarm. Language template: "Your logs show [specific pattern] across [N] cycles. This is something worth mentioning to a healthcare provider — they can run specific tests to understand what's going on."

---

## 11. UX & INTERACTION DESIGN

### Instant Feedback Loop

The single most important UX requirement: when a user logs, the insight must visibly change to reflect what they just entered.

**Implementation pattern**:
1. User taps "Save" on log entry
2. UI immediately shows optimistic update: "Got it — your insights are updating"
3. Backend triggers insight regeneration with `latestLogSignals` injected into VyanaContext
4. New insight renders within 2–5 seconds
5. At least one sentence in the new insight must reference the logged data

**Example flow**:
- User logs: mood = low, stress = high on Day 2
- **Bad response**: "Focus can feel lower around this time — the body is prioritizing recovery"
- **Good response**: "With your stress high and mood low today, it makes sense if things feel heavier than usual. This is a common combination during early menstruation as hormones are at their lowest."

### Tone Consistency

- Use a fixed persona/voice in all prompts — audit outputs over multiple days to eliminate tonal drift
- GPT can produce wildly different outputs across calls; VyanaContext pre-humanization constrains this
- Always present a "Today's insight" header for layout consistency
- Use positive framing: "Your period is easing, so your energy may start to return tomorrow" instead of "Low energy detected"

### Language Rules

| Do | Don't |
|----|-------|
| "You might notice..." | "Many people find..." |
| "Your body is..." | "The body is..." |
| Short, direct sentences | Long clinical explanations |
| "experience" / "feeling" / "symptom" | "complaint" / "problem" |
| "This is common at this point" | "This is normal" (feels dismissive) |
| "That's real, not imagined" | "Don't worry about it" |
| Explain *why* something happens | State that it happens |

### New User Path (Zero Logs)

New users can't get personalized insights yet, but the experience must still feel attentive:
- Acknowledge the journey: "This is your first cycle with Vyana. Over the next few days, even small logs will start shaping how your insights work."
- Use observational language: "You might notice..." rather than broadcast language: "Many people find..."
- Show the `nextUnlock` progression naturally: "Logging how you're feeling today helps us understand your specific pattern — after a few entries, your insights will start reflecting *you*"

---

## 12. IMPLEMENTATION CHECKLIST — Prioritized Sprint Plan

| # | Change | Effort | Impact | Before → After |
|---|--------|--------|--------|----------------|
| 1 | **Immediate log feedback** | Low | High (retention) | *Before*: Logging "Headache: yes" doesn't change today's insight. *After*: "We've noted your headache — yesterday you were fine, so your period symptoms may be intensifying as expected." |
| 2 | **Add `latestLogSignals` to VyanaContext** | Low | High (perception) | *Before*: Insight ignores what user just logged. *After*: At least one sentence reflects the specific log entry. |
| 3 | **Kill generic phrasing** | Low | High (trust) | *Before*: "Many people find that their body is doing real work to recover." *After*: "You might notice your body isn't as drained as the first couple of days — even though bleeding may still be present, your system is already shifting toward recovery." |
| 4 | **Fix truncation bug** | Low | High (credibility) | *Before*: "FSH is beginning its gradual rise to start" (cut off). *After*: Complete, readable output every time. |
| 5 | **Refine VyanaContext prompts** | Low–Med | High (quality) | Apply all 10 design principles from Section 5. Observational tone, day-specific language, hormone-to-experience connections. |
| 6 | **Add change detection logic** | Med | High (personalization) | *Before*: "Your period length is X." *After*: "This period is 2 days longer than your usual — worth watching, but likely within normal variation with only 2 cycles tracked." |
| 7 | **Red flag escalation messaging** | Med | High (safety) | *Before*: No mention of heavy bleeding. *After*: "You've been bleeding for 8 days — that's longer than the typical 3–7 day range. If this is unusual for you, consider mentioning it to a doctor." |
| 8 | **Confidence-based tone mapping** | Med | Med | *Before*: Overconfident "You have X." *After*: "Given your logs, you may have X pattern — if it concerns you, a doctor can help clarify." |
| 9 | **Phase 2 premium triggers** | Med | Med | *Before*: No mention of upcoming features. *After*: "Complete 3 cycles to unlock deeper pattern analysis and personalized cycle comparisons." Natural, trust-based timing (e.g., as period ends and energy returns). |

### Sprint Timeline

**Week 1–2 (UX/Frontend)**:
- Implement immediate log feedback (optimistic UI update + async insight regen)
- Prompt & tone refinement across VyanaContext
- Fix output bugs (truncation, incomplete sentences)

**Week 2–3 (Analysis/Backend)**:
- Design change detection data model (per-cycle summary storage)
- Implement rolling baseline computation (mean, SD per metric per cycle day)
- Build Z-score anomaly flagging with 2σ threshold

**Week 3–4 (Safety + Monetization)**:
- Red flag logic and alert messaging with clinical thresholds
- Premium feature gating and trigger placement
- User testing and polish

---

## 13. MONETIZATION — FREE VS PREMIUM BOUNDARY

### Free (Phase 1) — Builds Trust

- Period tracking and phase detection
- Daily insights (phase-based, with log reflection)
- Basic calendar view
- Smart reminders
- `nextUnlock` progression messaging

### Premium (Phase 2) — Delivers Decisions

- **Pattern detection across cycles**: "Your fatigue has started 2 days earlier each of the last 3 cycles"
- **Monthly health reports**: Cycle-over-cycle trends, symptom trajectory, what's improving/worsening
- **Predictive symptom timelines**: "Based on your pattern, expect an energy dip around day 22"
- **"Should you worry?" layer**: "This variation is within normal range" vs "This pattern might be worth tracking more closely"
- **Doctor-ready structured summaries**: Exportable report with symptom history and patterns
- **Daily decision engine** (gated behind 3-cycle data threshold): "Best today: lighter schedule, protect sleep"
- **Cycle-based lifestyle guidance**: Exercise, nutrition, productivity aligned to phase

### Pricing Context (India market)
- ₹99–₹299/month or ₹999/year
- Flo Premium: ~₹2,500–₹3,300/year equivalent
- Clue Plus: ~₹2,500–₹2,900/year equivalent
- Vyana can undercut significantly while offering more personalized insights

### Conversion Trigger Timing
- After 3 cycles of consistent logging (trust is established)
- As period ends and energy returns (positive emotional state)
- When change detection surfaces something interesting ("Want to see how this compares to your last 3 cycles? Unlock with Premium")

---

## 14. SOURCES

### Clinical/Peer-Reviewed
- NCBI Bookshelf: "The Normal Menstrual Cycle and the Control of Ovulation" (Reed & Carr, Endotext, 2018)
- StatPearls: "Physiology, Menstrual Cycle" (2024)
- StatPearls: "Premenstrual Syndrome" (NCBI Bookshelf NBK560698)
- AAFP: "Diagnosis and Initial Management of Dysmenorrhea" (2014)
- PMC: "Tracking mood symptoms across the menstrual cycle in women with depression" (2024)
- PMC: "Psychiatric Symptoms Across the Menstrual Cycle in Adult Women: A Comprehensive Review" (2022)
- PMC: "Inflammatory Markers in Dysmenorrhea and Therapeutic Options" (2020)
- PMC: "Distinct cognitive effects of estrogen and progesterone in menopausal women" (2015)
- PMC: "Menstrual Cycle Phase Influences Cognitive Performance in Women" (2025)
- PMC: "Iron Deficiency in Menstruating Adult Women: Much More than Anemia" (2020)
- PMC: "Unsupervised detection and analysis of changes in everyday physical activity data" (2024) — change detection methodology
- PMC: "Characterizing physiological and symptomatic variation in menstrual cycles using self-tracked mobile-health data" (2020)
- PMC: "The real-world applications of symptom tracking functionality in menstrual health apps" (2021)
- AJOG: "The relationship between heavy menstrual bleeding, iron deficiency, and iron deficiency anemia" (2023)
- ScienceDirect: "The Menstrual Cycle Effects on Sleep" (2008)
- ScienceDirect: "Circadian rhythms, sleep, and the menstrual cycle" (2007)
- ScienceDirect: "Objective sleep interruption and reproductive hormone dynamics in the menstrual cycle" (2014)
- VA Houston / Journal of Sleep Research: "Interaction of Sleep and Emotion Across the Menstrual Cycle" (2024)

### Clinical Guidelines & Medical References
- Cleveland Clinic: "Menstrual Cycle (Normal Menstruation): Overview & Phases"
- Cleveland Clinic: "Prostaglandins"
- Mayo Clinic: "Menstrual Cramps — Symptoms & Causes"
- Mayo Clinic: "Iron Deficiency Anemia — Symptoms & Causes"
- NHS: "Heavy Periods"
- NHS Digital: Content Style Guide — Creating Content (language/tone guidance)
- Yale Medicine: "Are You Iron Deficient? 8 Things Women Should Know"
- FACTS About Fertility: "Hormonal Balance and the Female Brain: A Review"
- NewYork-Presbyterian/Columbia: "Cycle Syncing: How to Understand Your Menstrual Cycle" (2025)
- Kaiser Permanente: "4 phases of the menstrual cycle: How to feel your best" (2025)

### UX & Implementation
- LogRocket: "Designing for instant feedback: The Doherty Threshold in UX"
- PMC: "Presenting complaint: use of language that disempowers patients" (2022) — empowering language principles

### Market & Competitor
- Healthline: "All About Flo: A Review of the Period Tracker App"
- Clue Support: "What's included in Clue Plus?"
- Samphire Neuroscience: "Best Period Tracking Apps to Try in 2026"
- Go Go Gaia: "Best Period Tracker App 2026: Clue vs Flo vs Ovia (6 Apps Compared)"

---

*Last updated: April 2026 | For Vyana backend insight engine development | Commit to repo as VYANA_COMPLETE_REFERENCE.md*