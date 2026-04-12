import type { CycleMode, Phase } from "./cycleEngine";

// ─── New Layered Insight Types (4-variant, v3.2) ─────────────────────────────

export type VariantKey = 0 | 1 | 2 | 3;

export interface VariantContent {
  insight: string;
  body_note: string;
}

export interface PhaseDayEntry {
  phaseDay: number;
  variants: VariantContent[]; // exactly 4 entries, indexed 0-3
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

// ─── Variant Selection (equal-weight rotation, v3.2) ─────────────────────────

const NUM_VARIANTS = 4;

/** Simple deterministic hash for stable variant selection. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Select a variant (0-3) using equal-weight rotation with special rules:
 * - No repeat on consecutive cycles for same phaseDay
 * - Deterministic hash-based selection
 */
export function selectVariant(
  userId: string,
  cycleNumber: number,
  cycleDay: number,
  _phase: Phase,
  _phaseDay: number,
): VariantKey {
  // Compute previous cycle's variant for same day to avoid repeats
  const prevSeed = simpleHash(`${userId}-${cycleNumber - 1}-${cycleDay}`);
  const prevVariant = prevSeed % NUM_VARIANTS;

  // Pick current variant
  const seed = simpleHash(`${userId}-${cycleNumber}-${cycleDay}`);
  let variant = seed % NUM_VARIANTS;

  // If same as previous cycle, shift by 1
  if (variant === prevVariant) {
    variant = ((variant + 1) % NUM_VARIANTS) as VariantKey;
  }

  return variant as VariantKey;
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

// ─── PHASE × PHASEDAY × 4-VARIANT TEMPLATE LIBRARY (v3.2) ─────────────────

const library: Record<Phase, PhaseDayEntry[]> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // MENSTRUAL PHASE (phaseDays 1–5)
  // ═══════════════════════════════════════════════════════════════════════════
  menstrual: [
    {
      phaseDay: 1,
      variants: [
        {
          insight:
            "The lining is shedding. Estrogen and progesterone are at their lowest, and the body is quiet on purpose today.",
          body_note:
            "Prostaglandins rise to trigger the uterine contractions that move the flow.",
        },
        {
          insight:
            "Day one of menses. Both estrogen and progesterone have dropped to the floor, and that drop is what started the bleed.",
          body_note:
            "Progesterone withdrawal is the direct trigger for endometrial shedding.",
        },
        {
          insight:
            "Menses has begun. Hormones are at their lowest point of the cycle, which is why the body often asks for less today.",
          body_note:
            "Cortisol sensitivity is higher when estrogen is this low.",
        },
        {
          insight:
            "The uterus is contracting to release the lining. The hormonal backdrop is the quietest it will be all cycle.",
          body_note:
            "Prostaglandin F2-alpha drives the contractions and the cramping that comes with them.",
        },
      ],
    },
    {
      phaseDay: 2,
      variants: [
        {
          insight:
            "Flow is often heaviest around now. Iron leaves the body with the blood, and fatigue can feel more present than usual.",
          body_note:
            "Serum ferritin drops measurably during the first days of menses.",
        },
        {
          insight:
            "Second day of bleeding, usually the heaviest. Iron stores are dipping, and fatigue often increases alongside it.",
          body_note:
            "Blood loss of 30-80 ml is typical across a full period.",
        },
        {
          insight:
            "The body is losing iron alongside the flow today. Energy can feel lower, and that is a physical fact of the day.",
          body_note:
            "Hemoglobin levels temporarily dip with heavier flow days.",
        },
        {
          insight:
            "Heavier flow is common on day two. The fatigue that often shows up here has a direct biological source.",
          body_note:
            "Iron loss during menses averages 15-30 mg across the period.",
        },
      ],
    },
    {
      phaseDay: 3,
      variants: [
        {
          insight:
            "Cramping can ease as prostaglandin levels start to taper. Hormones are still at their lowest stretch of the cycle.",
          body_note:
            "Prostaglandin peaks are typically in the first 48 hours of bleeding.",
        },
        {
          insight:
            "Prostaglandins are falling from their peak. Cramps often soften by this point, even if flow is still steady.",
          body_note:
            "The uterus contracts less forcefully as prostaglandin output drops.",
        },
        {
          insight:
            "The sharpest part of menses is often behind by this point. Hormones remain low, and the body is still in recovery mode.",
          body_note:
            "Estrogen and progesterone both stay near baseline on day three.",
        },
        {
          insight:
            "Cramping intensity typically drops on day three. The uterus is still shedding, but with less force behind it.",
          body_note:
            "Prostaglandin levels roughly halve between day one and day three.",
        },
      ],
    },
    {
      phaseDay: 4,
      variants: [
        {
          insight:
            "Estrogen is beginning its slow climb from the floor. Flow is lightening for most cycles by this point.",
          body_note:
            "FSH is already signalling the next batch of follicles to begin maturing.",
        },
        {
          insight:
            "The ovaries are starting the next cycle's work. Estrogen is low but rising, and flow often tapers today.",
          body_note:
            "Follicular recruitment begins in the late menstrual days.",
        },
        {
          insight:
            "Estradiol is beginning to rise off its lowest point. Bleeding is usually lighter now than it was 48 hours ago.",
          body_note:
            "FSH peaks in the early follicular phase to drive follicle growth.",
        },
        {
          insight:
            "The shift into the next phase is already underway. Estrogen is climbing, and flow is easing.",
          body_note:
            "Multiple follicles begin maturing under FSH signalling around this day.",
        },
      ],
    },
    {
      phaseDay: 5,
      variants: [
        {
          insight:
            "Bleeding is winding down. Estrogen is low but rising, and the uterine lining has started its fresh rebuild.",
          body_note:
            "The basal layer of the endometrium begins proliferating under estrogen.",
        },
        {
          insight:
            "The final day of menses for most cycles. Estrogen is pulling the body out of the low-hormone window.",
          body_note:
            "Endometrial thickness begins increasing from its post-menses minimum.",
        },
        {
          insight:
            "Menses is ending. Estrogen is climbing, and the lining is rebuilding from the base layer up.",
          body_note:
            "Proliferative-phase tissue growth starts while flow is still tapering.",
        },
        {
          insight:
            "The body is closing out the bleed and opening the next phase at the same time. Estrogen does both.",
          body_note:
            "Rising estradiol drives both endometrial repair and the follicular phase transition.",
        },
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLICULAR PHASE (phaseDays 1–8)
  // ═══════════════════════════════════════════════════════════════════════════
  follicular: [
    {
      phaseDay: 1,
      variants: [
        {
          insight:
            "Estrogen is on the rise. Follicles in the ovaries are maturing, and the lining is thickening again.",
          body_note:
            "FSH has been driving follicular growth since late menses.",
        },
        {
          insight:
            "The follicular phase has begun in earnest. Estrogen is climbing, and the body is building capacity back up.",
          body_note:
            "Multiple antral follicles are competing to become dominant.",
        },
        {
          insight:
            "Estradiol is climbing out of its cycle low. The lining is proliferating under that hormonal drive.",
          body_note:
            "Endometrial thickness doubles across the early follicular days.",
        },
        {
          insight:
            "Post-menses, the rebuild is active. Estrogen is rising steadily, and the ovaries are back at work.",
          body_note:
            "FSH levels remain elevated to support follicle maturation.",
        },
      ],
    },
    {
      phaseDay: 2,
      variants: [
        {
          insight:
            "Estrogen keeps climbing. Energy can feel easier to access here, and sleep can feel deeper.",
          body_note:
            "Rising estradiol improves REM quality and shortens sleep latency.",
        },
        {
          insight:
            "The hormonal floor is behind. Estradiol is rising, and the effects on sleep and energy often show.",
          body_note:
            "Estrogen modulates both slow-wave sleep and next-day alertness.",
        },
        {
          insight:
            "Estrogen is well above its cycle low. Physical recovery can feel more complete by this point.",
          body_note:
            "Serotonin and dopamine tone both improve with rising estradiol.",
        },
        {
          insight:
            "The follicular climb is underway. Deeper sleep and steadier energy are common features of this stretch.",
          body_note:
            "REM density increases as estradiol rises in the follicular phase.",
        },
      ],
    },
    {
      phaseDay: 3,
      variants: [
        {
          insight:
            "One dominant follicle is usually pulling ahead now. The others quietly regress.",
          body_note:
            "Selection of the dominant follicle happens around cycle days 7-9.",
        },
        {
          insight:
            "Follicular selection is happening inside the ovary today. One follicle takes the lead for this cycle.",
          body_note:
            "The dominant follicle has the most FSH receptors and outgrows the rest.",
        },
        {
          insight:
            "The ovaries narrow their focus around now. A single follicle wins the selection and continues maturing.",
          body_note:
            "Non-dominant follicles undergo atresia during selection.",
        },
        {
          insight:
            "One follicle is becoming the lead for this cycle. The rest of the cohort is shutting down.",
          body_note:
            "Selection is driven by FSH receptor density across the follicle pool.",
        },
      ],
    },
    {
      phaseDay: 4,
      variants: [
        {
          insight:
            "Estrogen is climbing faster. Verbal fluency and working memory can feel sharper in this stretch.",
          body_note:
            "Estrogen modulates dopamine and acetylcholine in prefrontal regions.",
        },
        {
          insight:
            "Estradiol levels rise more steeply as ovulation approaches. Cognitive sharpness often increases alongside it.",
          body_note:
            "Prefrontal dopamine tone peaks alongside estradiol in the late follicular.",
        },
        {
          insight:
            "The steeper part of the estrogen curve is here. Focus and verbal recall often feel more available.",
          body_note:
            "Estrogen has direct effects on hippocampal and cortical function.",
        },
        {
          insight:
            "Estrogen's rise is accelerating. The cognitive effects of that are often noticeable in this stretch.",
          body_note:
            "Working memory performance rises alongside estradiol in the follicular phase.",
        },
      ],
    },
    {
      phaseDay: 5,
      variants: [
        {
          insight:
            "The dominant follicle is getting close to full size. Cervical mucus is beginning to shift toward clearer and stretchier.",
          body_note:
            "Rising estrogen changes cervical crypt secretions to favour sperm transport.",
        },
        {
          insight:
            "Pre-ovulatory changes are starting. The follicle is nearing maturity, and cervical fluid is shifting.",
          body_note:
            "Estradiol-driven mucus changes begin 3-5 days before ovulation.",
        },
        {
          insight:
            "The body is setting up for a fertile window. Cervical secretions are changing character under estrogen.",
          body_note:
            "Mucus becomes less viscous and more elastic as estradiol climbs.",
        },
        {
          insight:
            "Follicle size approaches ovulatory readiness. Fertile-type cervical fluid is becoming more present.",
          body_note:
            "The dominant follicle reaches 18-24 mm before ovulation.",
        },
      ],
    },
    {
      phaseDay: 6,
      variants: [
        {
          insight:
            "Estrogen is approaching its pre-ovulatory peak. Skin often looks its clearest in this window.",
          body_note:
            "Estrogen supports collagen synthesis and skin hydration.",
        },
        {
          insight:
            "Estradiol is near its highest point of the cycle. The skin effects of that are often visible now.",
          body_note:
            "Sebum production is lower under high estradiol relative to progesterone.",
        },
        {
          insight:
            "The late follicular peak is close. Skin texture and tone often reflect the hormonal environment today.",
          body_note:
            "Collagen type I synthesis is estrogen-dependent.",
        },
        {
          insight:
            "Estrogen is at or near its cycle peak. Hydration and skin clarity often track with that.",
          body_note:
            "Estradiol increases hyaluronic acid retention in the dermis.",
        },
      ],
    },
    {
      phaseDay: 7,
      variants: [
        {
          insight:
            "The LH surge is building. The body is setting up for ovulation within roughly 24 to 36 hours.",
          body_note:
            "Sustained high estrogen flips LH feedback from negative to positive.",
        },
        {
          insight:
            "Positive feedback has started. LH is rising, and ovulation is likely within a day and a half.",
          body_note:
            "The LH surge is triggered when estradiol stays above ~200 pg/ml for 50 hours.",
        },
        {
          insight:
            "Estrogen has crossed the threshold that triggers the LH surge. The cycle is about to pivot.",
          body_note:
            "The surge converts the feedback loop from inhibitory to stimulatory.",
        },
        {
          insight:
            "The pituitary is now driving toward ovulation. LH is climbing, with release expected within 36 hours.",
          body_note:
            "LH levels rise roughly tenfold during the surge.",
        },
      ],
    },
    {
      phaseDay: 8,
      variants: [
        {
          insight:
            "LH is surging. The dominant follicle is nearly ready to release its egg.",
          body_note:
            "The surge typically lasts 24-36 hours before rupture.",
        },
        {
          insight:
            "The surge is in full effect. Ovulation usually follows within the next 24 hours from this point.",
          body_note:
            "Final oocyte maturation happens during the LH surge.",
        },
        {
          insight:
            "The late follicular window is closing. The follicle is fully primed for release.",
          body_note:
            "The oocyte resumes meiosis in response to the LH surge.",
        },
        {
          insight:
            "LH peaks around now. The ovary is in the final hours before the egg is released.",
          body_note:
            "Follicular wall enzymes are breaking down in preparation for rupture.",
        },
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // OVULATION (phaseDay 1)
  // ═══════════════════════════════════════════════════════════════════════════
  ovulation: [
    {
      phaseDay: 1,
      variants: [
        {
          insight:
            "Ovulation day. The follicle ruptures and releases the egg, and estrogen peaks just before this. Energy and clarity can feel close to their highest here.",
          body_note:
            "The egg remains viable for roughly 12 to 24 hours after release.",
        },
        {
          insight:
            "The egg is released today. Estrogen was at its peak just before rupture, and that is usually felt.",
          body_note:
            "Follicular fluid and the oocyte move into the fallopian tube at release.",
        },
        {
          insight:
            "Ovulation occurs in this window. The hormonal backdrop is the most activating stretch of the cycle.",
          body_note:
            "Peak estradiol and the LH surge together define the ovulatory phase.",
        },
        {
          insight:
            "Release happens today. Energy, focus, and social ease can feel close to their highest in this window.",
          body_note:
            "Testosterone also peaks mid-cycle in a smaller parallel rise.",
        },
      ],
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // LUTEAL PHASE (phaseDays 1–14)
  // ═══════════════════════════════════════════════════════════════════════════
  luteal: [
    {
      phaseDay: 1,
      variants: [
        {
          insight:
            "The ruptured follicle has become the corpus luteum. Progesterone is starting to rise, and the nervous system shifts with it.",
          body_note:
            "Progesterone's metabolite allopregnanolone acts on GABA receptors.",
        },
        {
          insight:
            "The luteal phase has begun. Progesterone is climbing from its post-ovulatory baseline.",
          body_note:
            "The corpus luteum forms from the ruptured follicle within hours of ovulation.",
        },
        {
          insight:
            "Post-ovulation, the hormonal environment flips. Progesterone takes over as the dominant signal.",
          body_note:
            "Progesterone output from the corpus luteum exceeds 25 mg per day at peak.",
        },
        {
          insight:
            "The corpus luteum is active and producing progesterone. The second half of the cycle has started.",
          body_note:
            "Basal body temperature begins to rise within 24 hours of ovulation.",
        },
      ],
    },
    {
      phaseDay: 2,
      variants: [
        {
          insight:
            "Progesterone is climbing steadily. Basal body temperature is about 0.3 to 0.5 °C higher than it was a week ago.",
          body_note:
            "The thermal shift is driven by progesterone acting on the hypothalamus.",
        },
        {
          insight:
            "The luteal thermal shift is in effect. Progesterone continues to rise from the corpus luteum.",
          body_note:
            "BBT elevation persists throughout the luteal phase.",
        },
        {
          insight:
            "Core body temperature has stepped up. That is a direct effect of rising progesterone on the hypothalamus.",
          body_note:
            "The temperature shift is one of the most reliable markers of ovulation.",
        },
        {
          insight:
            "Progesterone's thermogenic effect is measurable now. The body is running slightly warmer than it was pre-ovulation.",
          body_note:
            "Hypothalamic set-point increases by roughly 0.4 °C under progesterone.",
        },
      ],
    },
    {
      phaseDay: 3,
      variants: [
        {
          insight:
            "Progesterone continues to rise. Sleep can feel lighter or more interrupted in this part of the cycle.",
          body_note:
            "Higher core temperature reduces slow-wave sleep depth.",
        },
        {
          insight:
            "The warmer core that comes with progesterone has an effect on sleep. Night-time interruptions are more common now.",
          body_note:
            "Luteal-phase sleep shows reduced slow-wave activity in polysomnography studies.",
        },
        {
          insight:
            "Progesterone is mid-climb. Sleep architecture shifts in measurable ways during this stretch.",
          body_note:
            "REM percentage is lower in the luteal than in the follicular phase.",
        },
        {
          insight:
            "The body is running warmer, and sleep often reflects that. Waking during the night is more common in the luteal.",
          body_note:
            "Thermoregulation during sleep is harder under elevated progesterone.",
        },
      ],
    },
    {
      phaseDay: 4,
      variants: [
        {
          insight:
            "Estrogen has a second, smaller rise in the mid-luteal window. Sound and light can feel more intense, and the nervous system can register more detail.",
          body_note:
            "The auditory cortex is more reactive during the luteal phase.",
        },
        {
          insight:
            "The luteal estrogen bump is in effect. Sensory thresholds often drop, especially for sound and light.",
          body_note:
            "Sensory gating is modulated by both estrogen and progesterone.",
        },
        {
          insight:
            "Estradiol rises a second time in the mid-luteal, alongside high progesterone. Sensitivity to stimuli is often heightened.",
          body_note:
            "Auditory evoked potentials are larger in the luteal phase.",
        },
        {
          insight:
            "The second estrogen rise of the cycle is here. Ambient sound and light can feel more present than usual.",
          body_note:
            "Luteal-phase pain thresholds are also measurably lower.",
        },
      ],
    },
    {
      phaseDay: 5,
      variants: [
        {
          insight:
            "Progesterone is near its peak. Appetite often runs higher, and resting metabolic rate rises alongside it.",
          body_note:
            "RMR increases by roughly 2.5 to 11.5 percent in the luteal phase.",
        },
        {
          insight:
            "Caloric needs are measurably higher in this part of the cycle. Progesterone drives the increase.",
          body_note:
            "The thermogenic effect of progesterone raises baseline energy expenditure.",
        },
        {
          insight:
            "Hunger cues often sharpen around now. The metabolic reason for that is measurable.",
          body_note:
            "Luteal-phase women eat an average of 90-500 additional kcal per day.",
        },
        {
          insight:
            "Progesterone is raising metabolic rate. Appetite changes that track with this window have a biological basis.",
          body_note:
            "Both resting metabolic rate and core temperature rise under peak progesterone.",
        },
      ],
    },
    {
      phaseDay: 6,
      variants: [
        {
          insight:
            "Progesterone is at its highest. The body is holding a fully built lining in case of implantation.",
          body_note:
            "Peak progesterone occurs around 7 days after ovulation.",
        },
        {
          insight:
            "Mid-luteal peak. Progesterone is maintaining the endometrium at maximum thickness.",
          body_note:
            "The lining is at its most receptive to implantation in this window.",
        },
        {
          insight:
            "The corpus luteum is at peak output today. The hormonal environment is set up for potential pregnancy.",
          body_note:
            "Endometrial receptivity markers peak 6-8 days after ovulation.",
        },
        {
          insight:
            "Progesterone holds its highest level of the cycle. The lining is fully built and stabilised.",
          body_note:
            "Peak luteal progesterone reaches 10-20 ng/ml in healthy cycles.",
        },
      ],
    },
    {
      phaseDay: 7,
      variants: [
        {
          insight:
            "Hormones are holding at their luteal peak. Emotional responses can feel closer to the surface here.",
          body_note:
            "Amygdala reactivity to emotional stimuli is higher in the mid-luteal.",
        },
        {
          insight:
            "The mid-luteal hormonal plateau is where emotional reactivity often shifts. The brain basis for that is measurable.",
          body_note:
            "fMRI studies show increased limbic activation during peak progesterone.",
        },
        {
          insight:
            "Peak progesterone changes how emotional stimuli are processed. Reactions can sit closer to the surface in this stretch.",
          body_note:
            "Allopregnanolone has biphasic effects on anxiety depending on concentration.",
        },
        {
          insight:
            "The hormonal backdrop is most intense around now. Emotional sensitivity often reflects that intensity.",
          body_note:
            "Threat perception and startle response are both modulated in the luteal.",
        },
      ],
    },
    {
      phaseDay: 8,
      variants: [
        {
          insight:
            "If no implantation occurs, the corpus luteum begins preparing to break down. Progesterone is still high but no longer climbing.",
          body_note:
            "The corpus luteum has a fixed 14-day lifespan without hCG rescue.",
        },
        {
          insight:
            "The luteal peak is over. Without pregnancy signals, the corpus luteum is on a set countdown.",
          body_note:
            "hCG from an implanting embryo is the only signal that extends the corpus luteum.",
        },
        {
          insight:
            "Progesterone has plateaued and is about to start falling. The body is near its hormonal turning point.",
          body_note:
            "Corpus luteum regression begins 9-11 days after ovulation in a non-pregnant cycle.",
        },
        {
          insight:
            "The corpus luteum begins its programmed decline today in most cycles. Hormones will start falling from here.",
          body_note:
            "Luteolysis is driven by prostaglandin F2-alpha in the absence of hCG.",
        },
      ],
    },
    {
      phaseDay: 9,
      variants: [
        {
          insight:
            "Progesterone is beginning its decline. Serotonin often dips with it, which changes how mood and sleep feel.",
          body_note:
            "Serotonin synthesis is partly estrogen- and progesterone-dependent.",
        },
        {
          insight:
            "The hormonal drop has started. Mood regulation shifts measurably as progesterone falls.",
          body_note:
            "Serotonin receptor density changes across the luteal phase.",
        },
        {
          insight:
            "Progesterone is falling from its peak. The brain chemistry that depends on it shifts in step.",
          body_note:
            "GABAergic tone drops as allopregnanolone levels decline.",
        },
        {
          insight:
            "Late-luteal changes are underway. Mood and sleep often reflect the falling hormonal environment.",
          body_note:
            "Tryptophan availability for serotonin synthesis rises and falls alongside estradiol.",
        },
      ],
    },
    {
      phaseDay: 10,
      variants: [
        {
          insight:
            "Both progesterone and estrogen are falling. Water retention and breast tenderness are common in this stretch.",
          body_note:
            "Aldosterone activity shifts as progesterone drops, affecting fluid balance.",
        },
        {
          insight:
            "The combined hormonal drop has fluid effects. Breast and abdominal tenderness often show up here.",
          body_note:
            "Progesterone withdrawal alters sodium and water handling in the kidneys.",
        },
        {
          insight:
            "Estrogen and progesterone are both declining. Fluid retention and tissue sensitivity often track with that.",
          body_note:
            "Mammary tissue is estrogen- and progesterone-responsive throughout the cycle.",
        },
        {
          insight:
            "The late-luteal window brings measurable fluid shifts. Tenderness and bloating can show up more often in this stretch.",
          body_note:
            "Average luteal-phase weight gain from fluid is 0.5-1.5 kg.",
        },
      ],
    },
    {
      phaseDay: 11,
      variants: [
        {
          insight:
            "Hormones are dropping more steeply. The late luteal is when PMS signals are most likely to show up.",
          body_note:
            "The rate of progesterone withdrawal matters more than the absolute level.",
        },
        {
          insight:
            "The steepest part of the hormonal fall is here. Pre-menstrual signals often concentrate in this window.",
          body_note:
            "PMS symptoms correlate with the slope of progesterone decline, not its level.",
        },
        {
          insight:
            "Progesterone withdrawal is accelerating. Physical and emotional PMS markers often appear now.",
          body_note:
            "Fast hormonal withdrawal has larger neural effects than slow decline.",
        },
        {
          insight:
            "The late-luteal drop is underway. The cluster of signals known as PMS concentrates in this window.",
          body_note:
            "Luteal-phase symptoms are part of most cycles.",
        },
      ],
    },
    {
      phaseDay: 12,
      variants: [
        {
          insight:
            "Estrogen and progesterone are both low now. The nervous system is more reactive to stress in this window.",
          body_note:
            "HPA-axis sensitivity is elevated during hormone withdrawal.",
        },
        {
          insight:
            "The hormonal floor is approaching. Stress reactivity is measurably higher as both hormones fall.",
          body_note:
            "Cortisol responses to stressors are larger in the late luteal.",
        },
        {
          insight:
            "Low estrogen and falling progesterone together raise stress reactivity. The effect has a clear neural basis.",
          body_note:
            "Estrogen normally dampens HPA-axis responses.",
        },
        {
          insight:
            "The late-luteal low is here. The nervous system responds more strongly to the same inputs in this stretch.",
          body_note:
            "Autonomic reactivity is elevated when both estrogen and progesterone are low.",
        },
      ],
    },
    {
      phaseDay: 13,
      variants: [
        {
          insight:
            "Hormones are near their lowest. Sleep is often lighter, and small stressors can land heavier.",
          body_note:
            "Low progesterone reduces GABAergic calming at night.",
        },
        {
          insight:
            "The pre-menstrual hormonal low is here. Both sleep depth and stress tolerance often shift with it.",
          body_note:
            "Allopregnanolone levels are minimal at this point in the cycle.",
        },
        {
          insight:
            "The body is at the end of the luteal phase. The calming effects of progesterone are almost gone.",
          body_note:
            "GABA-A receptor sensitivity is also down-regulated by this point.",
        },
        {
          insight:
            "The last days before menses carry the sharpest drop. Sleep and reactivity both reflect that.",
          body_note:
            "Sleep fragmentation is highest in the last few days of the cycle.",
        },
      ],
    },
    {
      phaseDay: 14,
      variants: [
        {
          insight:
            "The corpus luteum has broken down. Estrogen and progesterone are at the floor, and the next cycle is about to begin.",
          body_note:
            "The drop in progesterone is what triggers the shedding of the lining.",
        },
        {
          insight:
            "Luteolysis is complete. Both hormones are at cycle lows, and bleeding typically starts within 24 hours.",
          body_note:
            "Endometrial prostaglandin release follows the progesterone drop.",
        },
        {
          insight:
            "The hormonal turnover is finished. The body is primed to start the next menstrual phase.",
          body_note:
            "Spiral arteries in the endometrium constrict as progesterone withdraws.",
        },
        {
          insight:
            "The cycle closes here. Estrogen and progesterone have returned to the floor, and menses is imminent.",
          body_note:
            "FSH is already beginning to rise to start the next follicular phase.",
        },
      ],
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
  variant: VariantKey = 0,
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
  const safeVariant = Math.max(0, Math.min(NUM_VARIANTS - 1, variant));
  const content = entry.variants[safeVariant]!;

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
