import type { CycleMode, Phase } from "./cycleEngine";

// ─── New Layered Insight Types (6-variant A-F) ─────────────────────────────

export type VariantKey = "A" | "B" | "C" | "D" | "E" | "F";

export interface VariantContent {
  insight: string;
  body_note: string;
}

export interface PhaseDayEntry {
  phaseDay: number;
  variants: Record<VariantKey, VariantContent>;
}

/** @deprecated Use PhaseDayEntry instead. */
export type DayEntry = PhaseDayEntry & { phase: Phase };

export interface ResolvedDayInsight {
  insight: string;
  body_note: string;
  energyLevel: EnergyLevel;
  focusLevel: FocusLevel;
}

type EnergyLevel =
  | "very_low"
  | "low"
  | "moderate"
  | "rising"
  | "high"
  | "declining";
type FocusLevel = "poor" | "moderate" | "good" | "sharp";

// ─── Variant Selection (weighted rotation per LAYERED_INSIGHTS_RULES §13) ──

const VARIANT_WEIGHTS: Record<VariantKey, number> = {
  A: 0.2,
  B: 0.2,
  E: 0.25,
  D: 0.2,
  C: 0.075,
  F: 0.075,
};

/** Simple deterministic hash for stable variant selection. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Select a variant using weighted rotation with special rules:
 * - Late luteal (phaseDay 10-14): boost D weight to 0.35
 * - Day 1 of new cycle: prefer A or B
 * - Never repeat same variant for same user on consecutive cycles for same phaseDay
 */
export function selectVariant(
  userId: string,
  cycleNumber: number,
  cycleDay: number,
  phase: Phase,
  phaseDay: number,
): VariantKey {
  const weights = { ...VARIANT_WEIGHTS };

  // Late luteal: boost D (reframing matters most here)
  if (phase === "luteal" && phaseDay >= 10) {
    const dBoost = 0.35 - weights.D;
    weights.D = 0.35;
    // Redistribute from others proportionally
    const others: VariantKey[] = ["A", "B", "E", "C", "F"];
    const othersTotal = others.reduce((s, k) => s + weights[k], 0);
    for (const k of others) {
      weights[k] -= (weights[k] / othersTotal) * dBoost;
    }
  }

  // Day 1 of new cycle: heavily prefer A or B
  if (cycleDay === 1) {
    const abWeight = 0.85;
    weights.A = abWeight / 2;
    weights.B = abWeight / 2;
    const remaining = 1 - abWeight;
    const otherKeys: VariantKey[] = ["C", "D", "E", "F"];
    for (const k of otherKeys) weights[k] = remaining / otherKeys.length;
  }

  // Compute previous cycle's variant for same day to avoid repeats
  const prevSeed = simpleHash(`${userId}-${cycleNumber - 1}-${cycleDay}`);
  const prevVariant = pickFromWeights(VARIANT_WEIGHTS, prevSeed);

  // Exclude previous variant and redistribute
  if (weights[prevVariant] > 0) {
    const excluded = weights[prevVariant];
    weights[prevVariant] = 0;
    const remaining = Object.entries(weights).filter(([, w]) => w > 0);
    const total = remaining.reduce((s, [, w]) => s + w, 0);
    for (const [k] of remaining) {
      weights[k as VariantKey] += (weights[k as VariantKey] / total) * excluded;
    }
  }

  const seed = simpleHash(`${userId}-${cycleNumber}-${cycleDay}`);
  return pickFromWeights(weights, seed);
}

function pickFromWeights(
  weights: Record<VariantKey, number>,
  seed: number,
): VariantKey {
  const keys: VariantKey[] = ["A", "B", "E", "D", "C", "F"];
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = ((seed % 10000) / 10000) * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[0];
}

// ─── Energy/Focus Lookup (keyed by phase + phaseDay) ──────────────────────

export const PHASE_ENERGY_MAP: Record<
  Phase,
  Array<{ energyLevel: EnergyLevel; focusLevel: FocusLevel }>
> = {
  menstrual: [
    { energyLevel: "very_low", focusLevel: "poor" }, // phaseDay 1
    { energyLevel: "very_low", focusLevel: "poor" }, // phaseDay 2
    { energyLevel: "low", focusLevel: "poor" }, // phaseDay 3
    { energyLevel: "low", focusLevel: "moderate" }, // phaseDay 4
    { energyLevel: "low", focusLevel: "moderate" }, // phaseDay 5
  ],
  follicular: [
    { energyLevel: "rising", focusLevel: "moderate" }, // phaseDay 1
    { energyLevel: "rising", focusLevel: "moderate" }, // phaseDay 2
    { energyLevel: "rising", focusLevel: "good" }, // phaseDay 3
    { energyLevel: "high", focusLevel: "good" }, // phaseDay 4
    { energyLevel: "high", focusLevel: "sharp" }, // phaseDay 5
    { energyLevel: "high", focusLevel: "sharp" }, // phaseDay 6
    { energyLevel: "high", focusLevel: "sharp" }, // phaseDay 7
    { energyLevel: "high", focusLevel: "sharp" }, // phaseDay 8
  ],
  ovulation: [
    { energyLevel: "high", focusLevel: "sharp" }, // phaseDay 1
  ],
  luteal: [
    { energyLevel: "moderate", focusLevel: "good" }, // phaseDay 1
    { energyLevel: "moderate", focusLevel: "good" }, // phaseDay 2
    { energyLevel: "moderate", focusLevel: "good" }, // phaseDay 3
    { energyLevel: "moderate", focusLevel: "moderate" }, // phaseDay 4
    { energyLevel: "moderate", focusLevel: "moderate" }, // phaseDay 5
    { energyLevel: "moderate", focusLevel: "moderate" }, // phaseDay 6
    { energyLevel: "declining", focusLevel: "moderate" }, // phaseDay 7
    { energyLevel: "declining", focusLevel: "moderate" }, // phaseDay 8
    { energyLevel: "declining", focusLevel: "moderate" }, // phaseDay 9
    { energyLevel: "declining", focusLevel: "poor" }, // phaseDay 10
    { energyLevel: "declining", focusLevel: "poor" }, // phaseDay 11
    { energyLevel: "low", focusLevel: "poor" }, // phaseDay 12
    { energyLevel: "low", focusLevel: "poor" }, // phaseDay 13
    { energyLevel: "very_low", focusLevel: "poor" }, // phaseDay 14
  ],
};

/** @deprecated Use PHASE_ENERGY_MAP instead. */
export const DAY_ENERGY_MAP = PHASE_ENERGY_MAP;

// ─── CONTRACEPTION TEMPLATES ────────────────────────────────────────────────

export interface ContraceptionInsightTemplate {
  insight: string;
  body_note: string;
}

export const HORMONAL_CONTRACEPTION_TEMPLATE: ContraceptionInsightTemplate = {
  insight:
    "Energy shifts can still happen. On contraception, they tend to follow sleep and stress more than your cycle.",
  body_note: "What shows up is still real — just driven by different factors.",
};

export const POST_IPILL_TEMPLATE: ContraceptionInsightTemplate = {
  insight:
    "Things can feel unpredictable for a little while. Energy can shift without a clear rhythm.",
  body_note: "Things are recalibrating. That's a normal response.",
};

export const POST_BC_STOP_TEMPLATE: ContraceptionInsightTemplate = {
  insight:
    "Things can feel unpredictable for a few cycles as your natural rhythm returns.",
  body_note: "This is a transition. The body finds its way.",
};

// ─── PHASE × PHASEDAY × 6-VARIANT TEMPLATE LIBRARY ─────────────────────────

const library: Record<Phase, PhaseDayEntry[]> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // MENSTRUAL PHASE (phaseDays 1–5)
  // ═══════════════════════════════════════════════════════════════════════════
  menstrual: [
    {
      phaseDay: 1,
      variants: {
        A: {
          insight:
            "The lining is shedding. Estrogen and progesterone are at their lowest — the body is quiet on purpose today.",
          body_note:
            "Iron stores take a small hit. Warm food sits better than cold.",
        },
        B: {
          insight:
            "A new cycle is starting, even though it doesn't feel like a beginning. Hormones are at floor — everything else builds from here.",
          body_note: "Slow is not lazy on day one. It's accurate.",
        },
        C: {
          insight:
            "Heaviness low in the belly, a pull toward the ground. The body asking for less, not more.",
          body_note:
            "The body is asking for less. That is information, not weakness.",
        },
        D: {
          insight:
            "Slowing down today isn't falling behind. It's the only day of the month the body asks this directly — the rest of the time it asks quietly and gets ignored.",
          body_note:
            "Estrogen and progesterone are both at floor today. The tiredness is chemistry.",
        },
        E: {
          insight:
            "A hot water bottle on the lower belly for twenty minutes does more for day-one cramps than most painkillers, and it does it faster.",
          body_note:
            "Heat relaxes uterine muscle directly — it's not a distraction, it's a treatment.",
        },
        F: {
          insight:
            "A tide going out. Nothing is lost — the moon will turn, and it will come back in.",
          body_note: "The tide knows the way.",
        },
      },
    },
    {
      phaseDay: 2,
      variants: {
        A: {
          insight:
            "Flow is usually heaviest on day one or two. Cramps come from the uterus doing real work, not from weakness.",
          body_note:
            "Heat on the lower belly eases prostaglandin cramps more reliably than most things.",
        },
        B: {
          insight:
            "The uterus is contracting to shed tissue. That's what cramps actually are — muscle doing work, not the body misbehaving.",
          body_note:
            "Magnesium-rich food sometimes takes the edge off. Sometimes only heat does.",
        },
        C: {
          insight:
            "A tightness that comes in waves. Between the waves, a kind of quiet the rest of the month doesn't have.",
          body_note:
            "Between contractions, there is actual rest. Catch it when you can.",
        },
        D: {
          insight:
            "Cramps aren't the body being dramatic. Prostaglandins are doing real chemistry, and you are not weak for feeling them.",
          body_note:
            "Prostaglandins cause real uterine contractions. This is documented, not imagined.",
        },
        E: {
          insight:
            "Warm, cooked food sits better than cold or raw today. The gut is a little slower during bleeding — meet it where it is.",
          body_note:
            "Digestion slows slightly during bleeding. Cooked food asks the gut to do less work.",
        },
        F: {
          insight:
            "The body is a small weather system today. Storms pass through bodies too.",
          body_note: "Weather passes. Bodies are weather.",
        },
      },
    },
    {
      phaseDay: 3,
      variants: {
        A: {
          insight:
            "The worst of the flow often begins to ease around now. Energy is still low — that's accurate, not avoidant.",
          body_note:
            "Hydration matters more than people expect during bleeding days.",
        },
        B: {
          insight:
            "Bleeding is real blood loss, even when it looks small. The tiredness today is a physiological fact, not a mood.",
          body_note:
            "Iron from food absorbs better alongside vitamin C than on its own.",
        },
        C: {
          insight:
            "Limbs feel a little further away than usual. That's the body running on low fuel, not detachment.",
          body_note:
            "Low iron shows up as distance before it shows up as tiredness.",
        },
        D: {
          insight:
            "Being tired on a bleeding day is not a productivity problem. It's a blood-loss problem. Different thing entirely.",
          body_note:
            "Day 2–3 bleeding can account for real iron loss. The fatigue has a cause.",
        },
        E: {
          insight:
            "Pair iron-rich food with something acidic — lemon, tomato, amla. Iron absorbs two to three times better in the presence of vitamin C.",
          body_note:
            "Vitamin C converts non-heme iron to a more absorbable form in the gut.",
        },
        F: {
          insight:
            "A room with the lights dimmed. Not empty, just quieter than usual.",
          body_note: "The dimmer is not broken.",
        },
      },
    },
    {
      phaseDay: 4,
      variants: {
        A: {
          insight:
            "FSH is starting to rise quietly in the background. A new follicle cohort is being recruited even while bleeding continues.",
          body_note:
            "Light movement tends to feel better than stillness by now.",
        },
        B: {
          insight:
            "The body is already looking forward. FSH is rising in the background and a new batch of follicles is waking up inside the ovaries.",
          body_note: "The worst of the flow is usually behind you by now.",
        },
        C: {
          insight:
            "Something is loosening. The lower back begins to let go before the belly does.",
          body_note:
            "The back loosens first. Then the belly. Then the shoulders.",
        },
        D: {
          insight:
            "Wanting more food today isn't a failure of discipline. The body is in recovery and recovery needs fuel.",
          body_note:
            "Resting metabolic rate rises in both the luteal phase and during bleeding days.",
        },
        E: {
          insight:
            "A short walk today will feel disproportionately good. Ten minutes is enough — this isn't about exercise, it's about circulation.",
          body_note:
            "Movement increases pelvic blood flow, which is what actually eases period cramping.",
        },
        F: {
          insight:
            "Underground, roots are already moving toward the next season. The surface is the last to know.",
          body_note: "The roots know before the leaves do.",
        },
      },
    },
    {
      phaseDay: 5,
      variants: {
        A: {
          insight:
            "Bleeding is usually tapering. The body is turning a corner toward the follicular phase.",
          body_note: "Appetite often shifts back toward normal today.",
        },
        B: {
          insight:
            "The menstrual phase is winding down. Estrogen has quietly begun its climb — the next phase is already underway.",
          body_note: "Energy often returns before the bleeding fully stops.",
        },
        C: {
          insight:
            "The first day the body feels like it's facing forward again. Subtle, but real.",
          body_note:
            "Estrogen has started rising. The body is already turning.",
        },
        D: {
          insight:
            "Feeling flat on the last period day isn't 'still in a funk'. It's the in-between before estrogen has fully taken over.",
          body_note:
            "Estrogen has started climbing but has not taken over yet. It's an in-between.",
        },
        E: {
          insight:
            "If energy is returning, this is a good day to clear something small that's been sitting — one email, one errand, one drawer.",
          body_note:
            "Energy is coming back because estrogen is climbing. The body can handle more now.",
        },
        F: {
          insight: "The hinge of the door. Not out yet, not in anymore.",
          body_note: "Both sides of the hinge are part of the door.",
        },
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLICULAR PHASE (phaseDays 1–8, was absolute days 6–13)
  // ═══════════════════════════════════════════════════════════════════════════
  follicular: [
    {
      phaseDay: 1,
      variants: {
        A: {
          insight:
            "Estrogen is beginning its climb. This is the phase the body uses to rebuild, not just recover.",
          body_note:
            "Skin, mood, and focus often feel like they're waking up over the next few days.",
        },
        B: {
          insight:
            "Early follicular. The body is in rebuild mode — lining, mood, metabolism, all resetting under rising estrogen.",
          body_note:
            "Cold foods and cold weather feel less harsh from here on out.",
        },
        C: {
          insight:
            "A cleaner feeling in the chest. Breath finds a little more room.",
          body_note: "Cortisol tends to settle earlier in the day now.",
        },
        D: {
          insight:
            "Feeling better isn't performing wellness. It's what the body does when hormones lift, and it doesn't need to be earned.",
          body_note:
            "Hormones do this on their own. You don't have to earn the lift.",
        },
        E: {
          insight:
            "This is a good week to start things, not finish them. Save the closing-out work for the luteal phase — it handles detail better.",
          body_note:
            "The follicular phase is when the brain is most receptive to novelty and initiation.",
        },
        F: {
          insight: "Something green opening. Small, but unmistakably forward.",
          body_note: "Green things don't apologize for unfolding.",
        },
      },
    },
    {
      phaseDay: 2,
      variants: {
        A: {
          insight:
            "A dominant follicle is emerging in one ovary. The others will step back — this is how the cycle decides.",
          body_note:
            "Energy usually has more room today than earlier in the week.",
        },
        B: {
          insight:
            "Inside one ovary, a single follicle is beginning to outgrow the others. The cycle is narrowing down to one.",
          body_note:
            "Skin tends to look clearer in this part of the cycle than any other.",
        },
        C: {
          insight:
            "Skin feels closer to itself. Water goes down easier, food tastes a little sharper.",
          body_note:
            "The skin holds water differently in the follicular phase — it shows.",
        },
        D: {
          insight:
            "Liking your face in the mirror this week isn't vanity. Estrogen is literally changing your skin.",
          body_note:
            "Estrogen improves skin hydration, elasticity, and collagen. Literally.",
        },
        E: {
          insight:
            "The follicular phase is when strength training tends to feel most rewarding. If you lift, this is the week to push the numbers.",
          body_note:
            "Muscle protein synthesis tracks estrogen. This is when strength gains stick.",
        },
        F: {
          insight:
            "The sound of a kettle starting to sing. Warmth arriving on its own schedule.",
          body_note: "The kettle was always going to sing.",
        },
      },
    },
    {
      phaseDay: 3,
      variants: {
        A: {
          insight:
            "Estrogen is rising steadily. Many people notice their mood settles into something steadier around now.",
          body_note: "Strength and stamina tend to respond well this week.",
        },
        B: {
          insight:
            "Estrogen is shaping more than reproduction right now — it also touches mood, memory, and pain tolerance.",
          body_note:
            "Learning and focus often come easier this week. It's not willpower, it's chemistry.",
        },
        C: {
          insight:
            "The day has more hours in it than it did last week. That's not the clock — it's the body.",
          body_note:
            "Verbal recall is measurably sharper under rising estrogen.",
        },
        D: {
          insight:
            "Having a sharper week isn't 'finally getting your act together'. You're not broken the rest of the month — you're just in a different phase.",
          body_note:
            "Verbal fluency, working memory, and mood all track estrogen. All of you is real.",
        },
        E: {
          insight:
            "Learning sticks better this week than in the luteal phase. If there's something you've been putting off studying, now is the window.",
          body_note:
            "Estrogen supports memory consolidation and verbal learning. The window is real.",
        },
        F: {
          insight:
            "A window thrown open after a long winter. The room is the same, the air is not.",
          body_note: "The air was waiting for the window.",
        },
      },
    },
    {
      phaseDay: 4,
      variants: {
        A: {
          insight:
            "The uterine lining is rebuilding under estrogen's influence. Quiet biological work, no symptoms required.",
          body_note: "Sleep often deepens in the mid-follicular days.",
        },
        B: {
          insight:
            "The endometrium is thickening day by day. Invisible work, the kind the body does without asking permission.",
          body_note:
            "Hunger tends to be steadier in the mid-follicular than in any other phase.",
        },
        C: {
          insight:
            "A steadiness under the ribs. Nothing loud, nothing missing.",
          body_note: "This is the steadiest the gut gets all month.",
        },
        D: {
          insight:
            "A good week is not evidence that other weeks were your fault. Cycles are not a moral performance.",
          body_note: "The follicular phase is not a performance. It's a phase.",
        },
        E: {
          insight:
            "Schedule the hard conversation this week, not next. Estrogen supports both verbal fluency and a steadier nervous system.",
          body_note:
            "Estrogen stabilizes the amygdala's stress response. Hard conversations cost less now.",
        },
        F: {
          insight:
            "Steady light. The kind you don't notice until you try to remember what the last week felt like.",
          body_note: "Steady is its own kind of shine.",
        },
      },
    },
    {
      phaseDay: 5,
      variants: {
        A: {
          insight:
            "Cervical mucus is starting to shift. The body is beginning to prepare for ovulation, days in advance.",
          body_note:
            "Confidence and verbal fluency often peak around this window for many people.",
        },
        B: {
          insight:
            "Estrogen is high enough now to start shifting how the body feels from the inside. Lighter. More forward-leaning.",
          body_note:
            "Cervical mucus becomes more fertile-feeling around now — wetter, stretchier.",
        },
        C: {
          insight:
            "Something warm and curious in the lower belly. The body leaning toward, instead of away.",
          body_note:
            "Cervical mucus shifts wetter. The body is reading the calendar.",
        },
        D: {
          insight:
            "Higher libido this week isn't something to hide or explain. It's hormonal. It's on schedule.",
          body_note:
            "Testosterone rises alongside estrogen around ovulation. Libido is on schedule.",
        },
        E: {
          insight:
            "If you're planning something important — a pitch, an interview, a first date — days 10 to 13 are when the cycle is most on your side.",
          body_note:
            "Cognitive, verbal, and social capacities all peak in the late follicular phase.",
        },
        F: {
          insight: "A pull forward. The body leaning toward whatever is next.",
          body_note: "The body knows which direction is forward.",
        },
      },
    },
    {
      phaseDay: 6,
      variants: {
        A: {
          insight:
            "Estrogen is approaching its pre-ovulatory peak. This is often the phase that feels most like 'yourself'.",
          body_note:
            "Workouts often feel easier than the effort suggests they should.",
        },
        B: {
          insight:
            "Late follicular. Testosterone also rises slightly around this window — part of why libido often climbs.",
          body_note:
            "Social energy tends to feel less expensive than it did last week.",
        },
        C: {
          insight:
            "Movement feels like it belongs to you today, not like you're negotiating with it.",
          body_note:
            "Heart rate variability is often at its cycle-high this week.",
        },
        D: {
          insight:
            "Feeling more social isn't the 'real you finally showing up'. The quieter you in the luteal phase is also real.",
          body_note:
            "The quieter luteal self is running on progesterone. Also real. Also you.",
        },
        E: {
          insight:
            "Social battery is highest in the late follicular. Say yes to the thing you'd usually say no to — next week will be quieter.",
          body_note:
            "Estrogen-driven energy is physical, not just a mood. Use it while it's here.",
        },
        F: {
          insight:
            "Bright water. Moving, reflective, carrying more light than it should.",
          body_note: "Even water carries light.",
        },
      },
    },
    {
      phaseDay: 7,
      variants: {
        A: {
          insight:
            "The LH surge is building. Ovulation is usually one to two days away in a 28-day cycle.",
          body_note:
            "Some people notice a faint one-sided pelvic twinge — mittelschmerz. It's normal.",
        },
        B: {
          insight:
            "The dominant follicle is at full size now. Everything is queued up for the LH surge.",
          body_note:
            "A light ache on one side of the lower belly is common and not concerning.",
        },
        C: {
          insight: "A small brightness behind the eyes. The body is gathering.",
          body_note:
            "Mittelschmerz can feel like this — a small, one-sided twinge.",
        },
        D: {
          insight:
            "Taking up space this week isn't being too much. The body is built to take up more space in this phase.",
          body_note:
            "Estrogen is near its peak. The body is physically taking up more space.",
        },
        E: {
          insight:
            "High-intensity workouts land best in this window. Heart rate recovery is faster when estrogen is high.",
          body_note:
            "Heart rate recovery improves measurably in the late follicular. Hard workouts are easier.",
        },
        F: {
          insight:
            "A held breath, in the good way. Everything gathering for a single moment.",
          body_note: "Gathering is not holding back.",
        },
      },
    },
    {
      phaseDay: 8,
      variants: {
        A: {
          insight:
            "Estrogen is at or near its highest point of the cycle. The body is primed.",
          body_note:
            "Cervical mucus is often clearest and most stretchy around now.",
        },
        B: {
          insight:
            "The pre-ovulatory window. Estrogen is peaking — this is as 'lifted' as the cycle chemistry gets.",
          body_note:
            "Sleep sometimes gets lighter right before ovulation, even when the day felt good.",
        },
        C: {
          insight:
            "Alert without being wired. This is a rare setting — the cycle only holds it for a couple of days.",
          body_note:
            "Basal body temperature has not risen yet. That comes tomorrow.",
        },
        D: {
          insight:
            "Feeling powerful the day before ovulation isn't ego. It's estrogen at its highest point of the month.",
          body_note:
            "Estrogen peaks the day before ovulation. This is as high as it gets.",
        },
        E: {
          insight:
            "Drink more water than you think you need today and tomorrow. Estrogen peaks can cause subtle fluid shifts that show up as headaches if you're behind.",
          body_note:
            "High estrogen can cause slight water shifts — mild dehydration turns into headaches fast.",
        },
        F: {
          insight:
            "The last note before the chord resolves. All tension, no trouble.",
          body_note: "Tension is the shape of readiness.",
        },
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // OVULATION (phaseDay 1, was absolute day 14)
  // ═══════════════════════════════════════════════════════════════════════════
  ovulation: [
    {
      phaseDay: 1,
      variants: {
        A: {
          insight:
            "Ovulation day. The dominant follicle releases its egg — a 24-hour window, then the luteal phase begins.",
          body_note:
            "A small temperature rise follows ovulation by a day. Nothing dramatic, just a shift.",
        },
        B: {
          insight:
            "The LH surge triggers the release. Within 24 hours the egg is gone and the hormonal script rewrites itself.",
          body_note:
            "Basal body temperature rises by 0.3 to 0.6°C after ovulation and stays there through the luteal phase.",
        },
        C: {
          insight:
            "A tiny release somewhere low. Maybe you notice, maybe you don't. Either is normal.",
          body_note: "A 24-hour window. Then the script changes.",
        },
        D: {
          insight:
            "Ovulation isn't only about fertility. It's a peak the body builds toward whether conception is on the table or not.",
          body_note:
            "Ovulation has physiological effects whether or not conception is the goal.",
        },
        E: {
          insight:
            "If you track anything about your cycle, today is the day worth logging. Temperature, cervical mucus, a one-line mood note — ovulation day is the anchor everything else references.",
          body_note:
            "Ovulation is the most biologically distinctive day of the cycle. One data point goes far.",
        },
        F: {
          insight:
            "A small bell ringing once in an empty room. The body keeps the echo.",
          body_note: "One note. The room remembers.",
        },
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // LUTEAL PHASE (phaseDays 1–14, was absolute days 15–28)
  // ═══════════════════════════════════════════════════════════════════════════
  luteal: [
    {
      phaseDay: 1,
      variants: {
        A: {
          insight:
            "The corpus luteum has formed and progesterone is starting to rise. The body's tempo is changing.",
          body_note:
            "Sleep may feel heavier over the next week — progesterone has a sedating quality.",
        },
        B: {
          insight:
            "The follicle that released the egg has become the corpus luteum. It has one job now: make progesterone.",
          body_note:
            "Energy for intense exercise often dips slightly from here. Volume over intensity works better.",
        },
        C: {
          insight:
            "A softer gravity. The body wants to sit a beat longer before it moves.",
          body_note:
            "Core temperature rises 0.3–0.6°C and stays up through the luteal.",
        },
        D: {
          insight:
            "The drop after ovulation isn't a crash. It's a gear change, and the new gear has its own kind of capability.",
          body_note:
            "Progesterone has different capabilities than estrogen. Different, not less.",
        },
        E: {
          insight:
            "Shift workout style from intensity to volume. Longer walks, easier runs, lighter weights with more reps — the body handles this better now than sprints or PRs.",
          body_note:
            "The hormonal shift post-ovulation changes which workout styles your body responds to.",
        },
        F: {
          insight:
            "Afternoon light in a quiet house. Different from morning, not less.",
          body_note: "Afternoon is not a lesser morning.",
        },
      },
    },
    {
      phaseDay: 2,
      variants: {
        A: {
          insight:
            "Progesterone is climbing. Appetite often rises with it — this is hormonal, not lack of discipline.",
          body_note:
            "Body temperature stays slightly elevated through the luteal phase.",
        },
        B: {
          insight:
            "Progesterone is warm chemistry — literally. It raises core temperature and slows things down on purpose.",
          body_note:
            "Sleep sometimes feels heavier but less refreshing in the early luteal.",
        },
        C: {
          insight:
            "Warmer than yesterday from the inside. Not a fever, just a different temperature to live at.",
          body_note:
            "Progesterone slows gut motility slightly — warmer food sits better.",
        },
        D: {
          insight:
            "Wanting more food in the luteal phase isn't overeating. Resting metabolic rate actually rises in this phase — the body needs more.",
          body_note:
            "Luteal-phase RMR is measurably higher. The body needs more fuel.",
        },
        E: {
          insight:
            "Eat slightly more than you did last week. Resting metabolic rate genuinely rises in the luteal phase — the extra hunger is a bill, not a craving.",
          body_note:
            "Studies show RMR rises 2.5–11.5% in the luteal phase. The hunger is a real bill.",
        },
        F: {
          insight: "A slow river. The same water, moving at a different tempo.",
          body_note: "Slower water is still the river.",
        },
      },
    },
    {
      phaseDay: 3,
      variants: {
        A: {
          insight:
            "The uterine lining is maturing, preparing either for implantation or for its eventual shed.",
          body_note: "Breast tenderness can begin around here for some people.",
        },
        B: {
          insight:
            "The uterine lining is being quietly finished — glands, blood supply, everything an embryo would need if one arrived.",
          body_note:
            "Breasts can feel fuller or heavier from around here. Progesterone does that.",
        },
        C: {
          insight:
            "A fullness in the chest that wasn't there last week. The body holding more of itself.",
          body_note:
            "Breast tissue holds more fluid under progesterone. This is that.",
        },
        D: {
          insight:
            "Not wanting to do the workout you crushed last week isn't losing fitness. It's your body running on different fuel.",
          body_note:
            "Performance capacity shifts with the hormonal mix. Fitness hasn't gone anywhere.",
        },
        E: {
          insight:
            "Magnesium in the evening — food or supplement — tends to help luteal-phase sleep. Pumpkin seeds, dark chocolate, and leafy greens are the easiest food routes.",
          body_note:
            "Magnesium supports GABA function — the same pathway progesterone was working on.",
        },
        F: {
          insight:
            "Something being kept warm. A hand around a cup, a blanket over a lamp.",
          body_note: "Warmth kept is warmth still.",
        },
      },
    },
    {
      phaseDay: 4,
      variants: {
        A: {
          insight:
            "Mid-luteal. Progesterone is doing most of the talking now, and it softens the edges of energy.",
          body_note:
            "Slower workouts often feel more sustainable than intense ones this week.",
        },
        B: {
          insight:
            "Mid-luteal. The hormonal mix is completely different from the follicular phase — more inward, more settled, less sharp.",
          body_note:
            "Carb cravings in this window are partly a serotonin story, not just appetite.",
        },
        C: {
          insight:
            "Sounds feel slightly louder. Light feels slightly sharper. The nervous system is running a little closer to the surface.",
          body_note:
            "The auditory cortex is genuinely more reactive in the luteal phase.",
        },
        D: {
          insight:
            "Feeling more sensitive isn't weakness leaking through. Progesterone shifts how the nervous system processes everything.",
          body_note:
            "Progesterone changes how the nervous system processes input. All input.",
        },
        E: {
          insight:
            "This is the phase where detail work outperforms big-picture work. Edit the draft, don't write a new one. Organize the spreadsheet, don't start the new project.",
          body_note:
            "Executive function handles detail-work well in the luteal. Big-picture work, less so.",
        },
        F: {
          insight:
            "Honey thickening in the jar as the air cools. Still sweet, just slower.",
          body_note: "Sweetness slows but stays.",
        },
      },
    },
    {
      phaseDay: 5,
      variants: {
        A: {
          insight:
            "Progesterone typically peaks around seven to eight days after ovulation. That's roughly now.",
          body_note:
            "Cravings for denser, warmer food are common and physiologically reasonable.",
        },
        B: {
          insight:
            "Progesterone is near its highest. If an embryo had implanted, this is the hormone keeping things stable.",
          body_note:
            "Body temperature is usually at its steady luteal elevation around now.",
        },
        C: {
          insight:
            "Heavy-eyed in the afternoon in a way that isn't about sleep. This is just the hormone's weight.",
          body_note:
            "Progesterone is near its peak. This is the weight you are feeling.",
        },
        D: {
          insight:
            "Needing more sleep this week isn't laziness. Progesterone acts on the same receptors as some sedatives.",
          body_note:
            "Progesterone is GABA-ergic — it acts on the same receptors as sedatives.",
        },
        E: {
          insight:
            "Caffeine after noon hits the late luteal harder than any other phase. If sleep is fragile this week, that cup at 3pm is probably part of the reason.",
          body_note:
            "Progesterone's sedation is wearing off, so caffeine's half-life matters more now.",
        },
        F: {
          insight: "The hour before evening. Full light, softer angles.",
          body_note: "Soft angles are still full light.",
        },
      },
    },
    {
      phaseDay: 6,
      variants: {
        A: {
          insight:
            "The body is running on a hormonal mix that's different from the follicular phase. Different is not worse.",
          body_note:
            "Focus may feel more diffuse — estrogen's clarity has stepped back.",
        },
        B: {
          insight:
            "The body is in maintenance mode. No ramp-up, no ramp-down — just holding steady.",
          body_note:
            "Motivation often dips in this window. It's not apathy, it's a different hormonal tempo.",
        },
        C: {
          insight:
            "A pulled-in feeling. Less appetite for big rooms, more for small ones.",
          body_note:
            "Social battery is running on a different circuit this week.",
        },
        D: {
          insight:
            "The motivation dip isn't a character flaw. The follicular-phase drive was chemical too — so is its absence.",
          body_note:
            "The follicular drive is hormonal. Its absence now is too.",
        },
        E: {
          insight:
            "Protein at breakfast stabilizes luteal-phase mood more than carbs do. Eggs, curd, paneer, dal — whichever fits the morning.",
          body_note:
            "Protein stabilizes blood sugar, which stabilizes luteal mood more than carbs do.",
        },
        F: {
          insight:
            "A book you've been reading all week. You know where you are, and there's still a way to go.",
          body_note: "The story is still moving.",
        },
      },
    },
    {
      phaseDay: 7,
      variants: {
        A: {
          insight:
            "If no implantation has happened, the corpus luteum is beginning its slow wind-down.",
          body_note:
            "Mood can start to feel weightier from here. It's the hormonal shift, not a personal failing.",
        },
        B: {
          insight:
            "Without implantation, the corpus luteum has started shrinking. It was always going to — this was its design.",
          body_note:
            "This is usually where PMS symptoms start to surface for those who get them.",
        },
        C: {
          insight:
            "Small things feel bigger. The volume on everything has been nudged up a notch.",
          body_note:
            "Amygdala reactivity rises in the late luteal. Small things land harder.",
        },
        D: {
          insight:
            "PMS starting now isn't you 'letting it get to you'. It's the corpus luteum winding down exactly on schedule.",
          body_note:
            "The corpus luteum has a 10–14 day lifespan by design. This is it winding down.",
        },
        E: {
          insight:
            "Start protecting sleep now, not when PMS arrives. Dark room, consistent bedtime, screens away thirty minutes earlier than usual.",
          body_note:
            "Sleep architecture degrades in the late luteal. Early protection pays off.",
        },
        F: {
          insight:
            "Dusk arriving earlier than it did last week. Not wrong, just earlier.",
          body_note: "Dusk has its own hour.",
        },
      },
    },
    {
      phaseDay: 8,
      variants: {
        A: {
          insight:
            "Progesterone is starting to drop. Many of the symptoms called 'PMS' begin in this quiet decline.",
          body_note: "Bloating and water retention often show up around now.",
        },
        B: {
          insight:
            "Progesterone is now falling. The stability it brought starts to thin — mood can feel less anchored.",
          body_note:
            "Water retention peaks for many people in this window. It passes.",
        },
        C: {
          insight:
            "A tightness under the collarbones. Breath sits higher than it did mid-cycle.",
          body_note:
            "Shallow breathing in the late luteal is common. Notice it, lengthen it.",
        },
        D: {
          insight:
            "Bloating this week isn't weight gain. It's water, and water leaves the way it came.",
          body_note:
            "Water retention in the late luteal is aldosterone-driven. It passes.",
        },
        E: {
          insight:
            "Reduce salt slightly this week. Bloating in the late luteal is partly sodium-sensitive — small change, noticeable difference.",
          body_note:
            "Aldosterone activity shifts in the late luteal, making sodium sensitivity spike.",
        },
        F: {
          insight:
            "Low clouds that haven't decided yet. The sky holding two weathers at once.",
          body_note: "Two weathers is still weather.",
        },
      },
    },
    {
      phaseDay: 9,
      variants: {
        A: {
          insight:
            "Late luteal. Estrogen and progesterone are both easing downward — the body can feel the change before the calendar does.",
          body_note:
            "Sleep quality often dips slightly in the final luteal stretch.",
        },
        B: {
          insight:
            "Late luteal. GABA receptors have been soaking in progesterone's calming effect — as it drops, the calm drops with it.",
          body_note:
            "Anxiety that shows up this week is often a withdrawal effect, not a new problem.",
        },
        C: {
          insight:
            "The body feels like it's bracing for something. Even the jaw holds on a little tighter.",
          body_note:
            "The jaw is one of the first places the body stores late-luteal tension.",
        },
        D: {
          insight:
            "The late-luteal anxiety isn't a new problem. It's a withdrawal effect. It has an end date.",
          body_note:
            "Anxiety in the late luteal is often progesterone withdrawal, not a new condition.",
        },
        E: {
          insight:
            "This is a bad week to make big decisions you don't have to make. Write them down, decide in the follicular phase.",
          body_note:
            "Risk assessment and impulse control shift in the late luteal. Future-you will be clearer.",
        },
        F: {
          insight: "A tight thread. Still holding, but you can feel it.",
          body_note: "The thread is still holding.",
        },
      },
    },
    {
      phaseDay: 10,
      variants: {
        A: {
          insight:
            "Serotonin is sensitive to falling estrogen. Low mood in this window is chemistry, not character.",
          body_note:
            "Skin may feel more reactive than usual over these next few days.",
        },
        B: {
          insight:
            "Estrogen is falling alongside progesterone. Serotonin dips with it — this is the biology of premenstrual mood.",
          body_note:
            "Skin can break out here even if the rest of the cycle was clear.",
        },
        C: {
          insight:
            "A thin-skinned feeling. Not fragile — just more permeable to everything coming in.",
          body_note:
            "Pain and sensory thresholds both drop before the period starts.",
        },
        D: {
          insight:
            "Crying easier isn't being unstable. Falling estrogen directly affects serotonin — this is chemistry, not collapse.",
          body_note:
            "Estrogen-serotonin coupling is a measurable, documented effect.",
        },
        E: {
          insight:
            "A warm shower before bed helps more than it should in the late luteal. The body drops temperature faster afterward, which is what sleep needs.",
          body_note:
            "Core temperature is elevated; warm-then-cool helps the body drop into sleep faster.",
        },
        F: {
          insight:
            "Rain on a window at night. Everything slightly blurred, slightly amplified.",
          body_note: "Blurred is not broken.",
        },
      },
    },
    {
      phaseDay: 11,
      variants: {
        A: {
          insight:
            "Cramping signals and breast heaviness can begin now. The body is moving toward the next menses.",
          body_note:
            "Caffeine tends to hit harder in the late luteal — it's not your imagination.",
        },
        B: {
          insight:
            "Prostaglandins are starting to build in the endometrium. They're what will drive the cramping once bleeding begins.",
          body_note:
            "Sleep disturbance is common in the last few luteal days. Progesterone's sedation is wearing off.",
        },
        C: {
          insight:
            "Heaviness low again, but different from period heaviness. This one is expectant, not emptied.",
          body_note:
            "Prostaglandins are starting to build in the uterine lining.",
        },
        D: {
          insight:
            "Not recognizing yourself this week isn't the 'real you' showing up either. This is also a phase, and it also passes.",
          body_note:
            "Late-luteal mood doesn't predict anything. It passes within hours of bleeding.",
        },
        E: {
          insight:
            "Gentle movement beats no movement and rest beats hard workouts. Yoga, a walk, stretching — the body will thank you, the scale will not punish you.",
          body_note:
            "High-intensity workouts in the late luteal raise cortisol more than earlier phases.",
        },
        F: {
          insight:
            "The last hour before a train leaves. Too soon to relax, too late to start something new.",
          body_note: "The train leaves on its own time.",
        },
      },
    },
    {
      phaseDay: 12,
      variants: {
        A: {
          insight:
            "The endometrium is at its thickest. Hormones are low and still falling.",
          body_note:
            "Headaches in this window are often estrogen-withdrawal related.",
        },
        B: {
          insight:
            "The body is preparing to let go of the lining it spent a month building. Cycles are, above all, about release.",
          body_note: "Cravings can spike right now — chemistry, not choice.",
        },
        C: {
          insight:
            "A kind of static under the skin. The body is almost ready to let go.",
          body_note: "The endometrium is at its thickest. Release is close.",
        },
        D: {
          insight:
            "Feeling like everything is harder isn't weakness. Pain thresholds genuinely lower in the late luteal.",
          body_note:
            "Pain thresholds genuinely drop in the late luteal phase. It's not you.",
        },
        E: {
          insight:
            "Stock the things you'll want on day one — painkillers, pads or the cup, a snack that won't need thinking about. Future-you will be grateful.",
          body_note:
            "Day-one fatigue is predictable. Stocking ahead is not anxiety, it's planning.",
        },
        F: {
          insight:
            "A kettle nearly at the boil. So close you can hear it in the metal.",
          body_note: "Almost is its own kind of sound.",
        },
      },
    },
    {
      phaseDay: 13,
      variants: {
        A: {
          insight:
            "Premenstrual. The corpus luteum has nearly finished its work. One or two days to go in most 28-day cycles.",
          body_note:
            "Emotional intensity often peaks just before flow begins. It tends to ease within hours of bleeding.",
        },
        B: {
          insight:
            "Hormones are almost at floor. Many people feel the worst the day or two before bleeding starts, then better once it does.",
          body_note:
            "Headaches and breast tenderness often peak in this narrow window.",
        },
        C: {
          insight:
            "Everything feels a little closer to the edges. Tears sit higher, laughter sits higher, all of it.",
          body_note: "Serotonin is at its cycle-low. The volume is not you.",
        },
        D: {
          insight:
            "The premenstrual spiral isn't a window into some hidden truth about your life. Tomorrow's hormones will disagree with today's.",
          body_note:
            "Late-luteal cognition is less reliable. Your other weeks' judgment is more real.",
        },
        E: {
          insight:
            "If you can clear tomorrow's morning — fewer meetings, softer start — do it now. It won't always be possible, but when it is, it helps.",
          body_note:
            "The first few hours of day 1 are often the worst. A soft morning helps more than the math suggests.",
        },
        F: {
          insight:
            "The minute before the first raindrop. The whole street can feel it coming.",
          body_note: "The street knows before the sky does.",
        },
      },
    },
    {
      phaseDay: 14,
      variants: {
        A: {
          insight:
            "The final day before a new cycle. Hormones are at their lowest point — the body is about to begin again.",
          body_note: "Rest tonight lands better than pushing. Day 1 is close.",
        },
        B: {
          insight:
            "The last day of the cycle, or close to it. Something in the body already knows tomorrow is day one.",
          body_note:
            "Gentle is the right setting tonight. The next cycle starts on its own.",
        },
        C: {
          insight:
            "A dropping feeling in the lower belly by evening. The body starting to open its grip.",
          body_note: "Hours away from day one. The drop is already in motion.",
        },
        D: {
          insight:
            "The worst day of the cycle isn't a verdict on anything. It's the day before the body resets — nothing more, nothing less.",
          body_note:
            "Hormones are about to reset. Whatever you felt today is not a verdict.",
        },
        E: {
          insight:
            "Warm bath, early night, no hard conversations. The cycle is about to reset — help it land softly.",
          body_note:
            "The hormonal floor is tomorrow. Landing soft tonight means an easier day 1.",
        },
        F: {
          insight:
            "A page turning. You don't hear it, but the story has already moved.",
          body_note: "The page has already turned.",
        },
      },
    },
  ],
};

// ─── Functions ──────────────────────────────────────────────────────────────

export function getCycleNumber(
  lastPeriodStart: Date,
  cycleLength: number,
): number {
  const EPOCH = new Date("2024-01-01").getTime();
  const daysSinceEpoch = Math.floor(
    (lastPeriodStart.getTime() - EPOCH) / 86400000,
  );
  return Math.max(0, Math.floor(daysSinceEpoch / cycleLength));
}

/**
 * @deprecated Phase+phaseDay is already the normalized form.
 * Kept for backward compatibility — returns phaseDay unchanged.
 */
export function getNormalizedDay(
  phaseDay: number,
  _cycleLength?: number,
  _phase?: Phase,
): number {
  return phaseDay;
}

export function getDayInsight(
  phase: Phase,
  phaseDay: number,
  variant: VariantKey = "A",
  cycleMode: CycleMode = "natural",
): ResolvedDayInsight {
  const phaseEntries = library[phase];
  const maxDay = phaseEntries.length;
  const clamped = Math.max(1, Math.min(maxDay, phaseDay));

  // For hormonal mode, skip ovulation-specific content
  let effectivePhase = phase;
  let effectiveDay = clamped;
  if (cycleMode === "hormonal" && phase === "ovulation") {
    effectivePhase = "follicular";
    effectiveDay = library.follicular.length; // last follicular day
  }

  const entries = library[effectivePhase];
  const safeDay = Math.max(1, Math.min(entries.length, effectiveDay));
  const entry = entries[safeDay - 1]!;
  const content = entry.variants[variant];

  const energyEntries = PHASE_ENERGY_MAP[effectivePhase];
  const safeEnergyDay = Math.max(
    1,
    Math.min(energyEntries.length, effectiveDay),
  );
  const energy = energyEntries[safeEnergyDay - 1]!;

  return {
    insight: content.insight,
    body_note: content.body_note,
    energyLevel: energy.energyLevel,
    focusLevel: energy.focusLevel,
  };
}

/** Get the raw phase-day entry for direct access to all variants. */
export function getDayEntry(phase: Phase, phaseDay: number): PhaseDayEntry {
  const entries = library[phase];
  const clamped = Math.max(1, Math.min(entries.length, phaseDay));
  return entries[clamped - 1]!;
}

/** Build orientation string from cycle context. */
export function buildOrientationLine(
  cycleDay: number,
  phase: Phase,
  daysToNextPeriod: number,
): string {
  const phaseLabels: Record<Phase, string> = {
    menstrual: "Menstrual",
    follicular: "Follicular",
    ovulation: "Ovulation",
    luteal: "Luteal",
  };
  return `Day ${cycleDay} · ${phaseLabels[phase]} · ${daysToNextPeriod} day${daysToNextPeriod === 1 ? "" : "s"} to next period`;
}
