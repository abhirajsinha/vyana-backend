import type { CycleMode, Phase } from "./cycleEngine";

export interface DayInsight {
  cycleDay: number;
  phase: Phase;
  // All text arrays have exactly 3 variants mapped to confidence:
  // [0] = zero confidence (tentative, general)
  // [1] = medium confidence (grounded in their experience)
  // [2] = high confidence (earned identity language)
  hormoneNote: [string, string, string];
  physicalExpectation: [string, string, string];
  mentalExpectation: [string, string, string];
  emotionalNote: [string, string, string];
  actionTip: [string, string, string];
  tomorrowPreview: [string, string, string];
  energyLevel: "very_low" | "low" | "moderate" | "rising" | "high" | "declining";
  focusLevel: "poor" | "moderate" | "good" | "sharp";
}

export interface ResolvedDayInsight {
  hormoneNote: string;
  physicalExpectation: string;
  mentalExpectation: string;
  emotionalNote: string;
  actionTip: string;
  tomorrowPreview: string;
  energyLevel: DayInsight["energyLevel"];
  focusLevel: DayInsight["focusLevel"];
}

// ─── Vyana Voice Templates ──────────────────────────────────────────────────
// Fields mapped from Vyana Voice:
//   hormoneNote      → orientation (where in the cycle, stated simply)
//   physicalExpectation → physical (what the body might be feeling)
//   mentalExpectation   → mental (what thinking/focus might be like)
//   emotionalNote       → emotional (what emotions might be doing)
//   actionTip           → allowance (permission to be where they are)
//   tomorrowPreview     → gentle next-day observation
//
// Confidence tiers:
//   [0] zero  — "can feel", "often", tentative, no identity claims
//   [1] medium — "You've noticed...", "showing up again", grounded in experience
//   [2] high  — "For you...", "consistently...", earned identity

const library: DayInsight[] = [
  // ─── MENSTRUAL PHASE (Days 1–5) ────────────────────────────────────────────
  {
    cycleDay: 1,
    phase: "menstrual",
    hormoneNote: [
      "This is the start of your period.",
      "Day 1 of your period.",
      "Day 1 of your period.",
    ],
    physicalExpectation: [
      "Energy can feel heavier here. Movement takes more effort.",
      "You've noticed energy drops around here. That heaviness is showing up again.",
      "Energy dips at the start of your period. It's here again.",
    ],
    mentalExpectation: [
      "Thoughts can drift. Focus can be harder to hold.",
      "Focus gets harder to hold during your period. If that's here today, it's familiar.",
      "Focus loosens for you on day 1. It does this consistently.",
    ],
    emotionalNote: [
      "Small things can land harder. Emotions can feel closer to the surface.",
      "Emotions tend to sit heavier for you at the start. That weight is recognizable.",
      "Emotions feel heavier here. Every cycle, this shows up.",
    ],
    actionTip: [
      "Slower can feel more natural today.",
      "This part is familiar now.",
      "You know this part.",
    ],
    tomorrowPreview: [
      "Tomorrow can feel like the heaviest day. Then it starts easing.",
      "Day 2 has been intense for you before. It passes.",
      "Tomorrow is usually your heaviest. You know how it goes.",
    ],
    energyLevel: "very_low",
    focusLevel: "poor",
  },
  {
    cycleDay: 2,
    phase: "menstrual",
    hormoneNote: [
      "Day 2 of your period.",
      "Day 2 of your period.",
      "Day 2 of your period.",
    ],
    physicalExpectation: [
      "Bleeding can feel heaviest on day 2. Energy may still feel low.",
      "You've felt this heaviness on day 2 before. It's here again.",
      "Day 2 is consistently one of your heavier days. Energy follows that.",
    ],
    mentalExpectation: [
      "Concentration can take more effort. Shorter tasks can feel more manageable.",
      "Thinking takes more effort around here. That fog is recognizable.",
      "This is where focus feels most scattered for you. It passes.",
    ],
    emotionalNote: [
      "Patience can feel thinner. Things that normally roll off might stick.",
      "You've noticed patience wears thinner during bleeding. If that's present, it makes sense.",
      "Emotions are raw here. You've seen this enough times to recognize it.",
    ],
    actionTip: [
      "Today asks for less.",
      "Familiar territory.",
      "You know how this goes.",
    ],
    tomorrowPreview: [
      "Something might start to ease tomorrow.",
      "Day 3 has brought some relief for you before.",
      "Tomorrow is where it starts to turn for you.",
    ],
    energyLevel: "very_low",
    focusLevel: "poor",
  },
  {
    cycleDay: 3,
    phase: "menstrual",
    hormoneNote: [
      "Day 3 of your period.",
      "Day 3 of your period.",
      "Day 3 of your period.",
    ],
    physicalExpectation: [
      "Energy can still feel low, but the heaviest part may be starting to ease.",
      "You've felt this slight easing around day 3 before. Energy isn't back, but the bottom may have passed.",
      "For you, day 3 is where the heaviest part starts to ease. Not recovered, but turning.",
    ],
    mentalExpectation: [
      "Thinking may start to feel slightly less foggy. Still not sharp, but shifting.",
      "Focus starts returning for you around here. Still fragile, but present.",
      "Focus begins to come back here. You've seen this across cycles.",
    ],
    emotionalNote: [
      "Emotional intensity can begin to soften. The edge may feel less sharp.",
      "The emotional weight begins to lift. You've noticed this shift before.",
      "The emotional rawness softens around day 3 for you. Consistently.",
    ],
    actionTip: [
      "Something might be starting to ease.",
      "Something is shifting.",
      "The turn is starting.",
    ],
    tomorrowPreview: [
      "Energy can start to creep back tomorrow.",
      "You've felt this shift around day 4 before.",
      "Tomorrow is where energy starts returning for you.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 4,
    phase: "menstrual",
    hormoneNote: [
      "Day 4 of your period.",
      "Day 4 of your period.",
      "Day 4 of your period.",
    ],
    physicalExpectation: [
      "Energy can start to creep back around day 4. Bleeding may be lighter.",
      "Energy starts creeping back for you around here. You've felt this lift before.",
      "For you, day 4 is where energy starts its return. Reliably.",
    ],
    mentalExpectation: [
      "Thoughts can start to feel less scattered. Clarity isn't fully back, but the fog lifts a little.",
      "The mental fog is clearing. You've noticed thinking gets easier around day 4.",
      "Thinking sharpens here. Every cycle, this is where the fog lifts for you.",
    ],
    emotionalNote: [
      "Emotions may feel less tender. The intensity from heavier bleeding often eases here.",
      "Emotions settle for you as bleeding eases. That steadying is familiar.",
      "Emotional steadiness returns around day 4. Consistent for you.",
    ],
    actionTip: [
      "Recovery is quiet work.",
      "Settling in.",
      "Coming back.",
    ],
    tomorrowPreview: [
      "Tomorrow may feel like the last day of heaviness.",
      "Day 5 has been lighter for you. It's coming.",
      "Tomorrow marks the shift for you. Reliably.",
    ],
    energyLevel: "low",
    focusLevel: "moderate",
  },
  {
    cycleDay: 5,
    phase: "menstrual",
    hormoneNote: [
      "Late period. Transitioning toward your next phase.",
      "Late period. Transitioning.",
      "End of period. Transition begins.",
    ],
    physicalExpectation: [
      "Bleeding can taper off around day 5. Energy can start to feel more available.",
      "You've felt energy returning around day 5 before. That lift is showing up again.",
      "For you, day 5 marks the shift. Energy returns here reliably.",
    ],
    mentalExpectation: [
      "Focus often returns more fully here. The transition out of your period is usually felt mentally first.",
      "Focus is coming back. You've noticed this transition happens around here.",
      "Focus sharpens. You've seen this transition enough to trust it.",
    ],
    emotionalNote: [
      "Emotional intensity from the first few days usually softens by now. Things feel lighter.",
      "The heaviness eases around now for you. Things start feeling clearer emotionally.",
      "Emotional clarity comes back around day 5 for you. Every cycle.",
    ],
    actionTip: [
      "The shift is underway.",
      "Lighter already.",
      "You know what's coming next.",
    ],
    tomorrowPreview: [
      "Something can start waking up tomorrow.",
      "You've felt this shift into a new stretch before.",
      "Tomorrow is where things wake up for you.",
    ],
    energyLevel: "low",
    focusLevel: "moderate",
  },
  // ─── FOLLICULAR PHASE (Days 6–13) ──────────────────────────────────────────
  {
    cycleDay: 6,
    phase: "follicular",
    hormoneNote: [
      "Early follicular. A few days past your period.",
      "Early follicular.",
      "Early follicular.",
    ],
    physicalExpectation: [
      "Energy can feel like it's waking up. The heaviness from your period can feel like it's behind you.",
      "You've noticed energy picking up around here. That lift is arriving.",
      "Energy wakes up here for you. Reliably. It's arriving again.",
    ],
    mentalExpectation: [
      "Thinking can feel less cloudy. Space for ideas can start to open.",
      "Clarity starts for you after your period. It's coming in.",
      "The fog clears in your early follicular phase. You've seen this across cycles.",
    ],
    emotionalNote: [
      "There's often a quiet lift. Not dramatic, just lighter.",
      "Mood lightens around now. You've felt this before.",
      "That quiet lift in mood is here. Familiar.",
    ],
    actionTip: [
      "Something is waking up.",
      "Arriving.",
      "Waking up.",
    ],
    tomorrowPreview: [
      "Tomorrow continues the rebuilding.",
      "Energy keeps picking up for you through this stretch.",
      "This upward stretch continues for you.",
    ],
    energyLevel: "rising",
    focusLevel: "moderate",
  },
  {
    cycleDay: 7,
    phase: "follicular",
    hormoneNote: [
      "Follicular phase. A few days past your period.",
      "Follicular phase.",
      "Follicular phase.",
    ],
    physicalExpectation: [
      "Energy can feel like it's building steadily. The heaviness from last week is fading.",
      "You've noticed energy building through this stretch. That momentum is here.",
      "Energy builds through here for you. Consistently. The momentum is real.",
    ],
    mentalExpectation: [
      "Thinking can feel clearer than last week. Ideas may come a little easier.",
      "Clarity has been building for you through this part. It's continuing.",
      "Focus sharpens through here for you. You've seen this across cycles.",
    ],
    emotionalNote: [
      "Mood can feel more even. The emotional weight from earlier may be lifting.",
      "You've noticed mood stabilizing around now. That steadiness is arriving.",
      "Emotional stability builds here for you. Reliably.",
    ],
    actionTip: [
      "Building quietly.",
      "Continuing.",
      "This is your build.",
    ],
    tomorrowPreview: [
      "Energy can keep climbing from here.",
      "You've felt this steady build before.",
      "The climb continues for you.",
    ],
    energyLevel: "rising",
    focusLevel: "good",
  },
  {
    cycleDay: 8,
    phase: "follicular",
    hormoneNote: [
      "Follicular phase.",
      "Follicular phase.",
      "Follicular phase.",
    ],
    physicalExpectation: [
      "Energy can feel like it's climbing. Things can feel more physically available.",
      "Energy climbs for you around here. You've felt this upward shift before.",
      "For you, energy climbs steadily through your follicular phase. It's building.",
    ],
    mentalExpectation: [
      "Focus can start to sharpen. Things that felt effortful last week can feel easier.",
      "Thinking has been getting clearer for you through this phase. It's continuing.",
      "Focus sharpens here. Every cycle, this is where clarity grows for you.",
    ],
    emotionalNote: [
      "Mood can feel more stable and positive. There's often a sense of steadiness.",
      "Mood is steadier for you now. That stability is recognizable.",
      "Mood stabilizes here for you. Consistently.",
    ],
    actionTip: [
      "Building.",
      "Climbing.",
      "On the way up.",
    ],
    tomorrowPreview: [
      "Tomorrow can feel another step up.",
      "Energy keeps building for you here.",
      "This build continues. You've seen it.",
    ],
    energyLevel: "rising",
    focusLevel: "good",
  },
  {
    cycleDay: 9,
    phase: "follicular",
    hormoneNote: [
      "Follicular phase.",
      "Follicular phase.",
      "Follicular phase.",
    ],
    physicalExpectation: [
      "Energy can feel stronger. Things can feel more capable than earlier this week.",
      "You've noticed energy getting stronger through this stretch. It's continuing.",
      "Energy continues to build here for you. Reliably stronger each day.",
    ],
    mentalExpectation: [
      "Thinking can feel sharper. Things that needed effort before may come easier now.",
      "Clarity has been getting stronger for you around here. It's present.",
      "Focus is strong here for you. You've seen this across cycles.",
    ],
    emotionalNote: [
      "Mood can feel more positive. Social energy may feel more available.",
      "You've noticed mood lifting through this part. That ease is recognizable.",
      "Mood lifts through here for you. Familiar and consistent.",
    ],
    actionTip: [
      "Things can feel easier.",
      "Building steadily.",
      "This is your stride.",
    ],
    tomorrowPreview: [
      "Things can feel easier around here.",
      "You've noticed this stretch feeling stronger.",
      "This is where things feel strongest for you.",
    ],
    energyLevel: "rising",
    focusLevel: "good",
  },
  {
    cycleDay: 10,
    phase: "follicular",
    hormoneNote: [
      "Mid follicular phase.",
      "Mid follicular.",
      "Mid follicular.",
    ],
    physicalExpectation: [
      "Energy can feel stronger around this point. Things can feel more physically capable.",
      "Energy picks up for you around here. You've felt this before.",
      "This is where your energy feels strongest. It's here again.",
    ],
    mentalExpectation: [
      "Thinking can feel sharper. Complex things can feel more approachable.",
      "Clarity has been stronger for you in this part of your cycle. It's showing up again.",
      "Clarity is at its strongest for you around mid-follicular. You've seen this across cycles.",
    ],
    emotionalNote: [
      "Mood often feels more even and positive. Being around people can feel easier.",
      "You've noticed mood feels steadier around now. That ease is recognizable.",
      "Your mood reliably lifts here. That brightness is familiar.",
    ],
    actionTip: [
      "Things can feel easier.",
      "Familiar ground.",
      "This is your space.",
    ],
    tomorrowPreview: [
      "Tomorrow continues this stretch.",
      "This strong stretch holds for you a bit longer.",
      "Still at your strongest. It holds.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 11,
    phase: "follicular",
    hormoneNote: [
      "Follicular phase. Approaching the middle of your cycle.",
      "Follicular phase. Getting close.",
      "Follicular phase. Almost there.",
    ],
    physicalExpectation: [
      "Energy can feel at or near its strongest. Everything can feel more available.",
      "You've felt this kind of energy before around here. It's holding strong.",
      "For you, energy stays at its strongest through here. Reliably.",
    ],
    mentalExpectation: [
      "Thinking can feel quick and clear. New ideas can come more naturally.",
      "Focus has been sharp for you around now. That clarity is present.",
      "This is your sharpest mental stretch. Every cycle, it shows up here.",
    ],
    emotionalNote: [
      "Confidence and social energy can feel more present.",
      "You've noticed feeling more socially available around here. It's showing up again.",
      "Social energy and confidence are strong here for you. Consistently.",
    ],
    actionTip: [
      "Something is cresting.",
      "Holding strong.",
      "At your strongest.",
    ],
    tomorrowPreview: [
      "Tomorrow approaches the strongest part of this stretch.",
      "You've felt energy at its strongest around here.",
      "The brightest part is arriving.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 12,
    phase: "follicular",
    hormoneNote: [
      "Late follicular. Approaching ovulation.",
      "Late follicular. Approaching ovulation.",
      "Late follicular. Ovulation approaching.",
    ],
    physicalExpectation: [
      "Energy can feel at its strongest here. Everything can feel physically available.",
      "You've felt energy building toward this point before. It's nearing its strongest for you.",
      "For you, this is where physical energy is fullest. Reliably. It's here.",
    ],
    mentalExpectation: [
      "Thinking can feel quick and sharp. New ideas can come more naturally.",
      "Thinking has been sharp for you around here. That clarity is present.",
      "Sharpest thinking for you. Right before ovulation, every cycle.",
    ],
    emotionalNote: [
      "Confidence and social energy often feel more present. Being around people can feel easier.",
      "Confidence tends to be higher for you before ovulation. It's showing up again.",
      "Confidence and ease are fullest here for you. Consistently.",
    ],
    actionTip: [
      "Something is cresting.",
      "Nearing the top.",
      "At the top.",
    ],
    tomorrowPreview: [
      "Tomorrow may bring the strongest part of this stretch.",
      "You've felt this brightness before. It's close.",
      "Tomorrow is your strongest. You know this.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 13,
    phase: "follicular",
    hormoneNote: [
      "Late follicular. The middle of your cycle is arriving.",
      "Late follicular. Almost at the middle.",
      "Late follicular. Right before the shift.",
    ],
    physicalExpectation: [
      "Energy can feel at its strongest. Everything can feel fully capable.",
      "You've felt this kind of energy before around here. It's holding.",
      "For you, this is still the strongest point. It holds here before the shift.",
    ],
    mentalExpectation: [
      "Thinking can feel clear and quick. This can be one of the sharpest mental days.",
      "Focus stays sharp for you on this last day before the shift. It's present.",
      "Focus is still sharp here. You've seen this enough times to trust it.",
    ],
    emotionalNote: [
      "Social and emotional energy can feel at their fullest.",
      "You've noticed feeling most open and socially available around now.",
      "Connection energy is fullest for you. Consistently, right here.",
    ],
    actionTip: [
      "This can be a bright spot.",
      "Still at the brightest.",
      "The last bright day. You know this.",
    ],
    tomorrowPreview: [
      "Tomorrow may feel bright with something quieter underneath.",
      "You've felt this transition before. The shift is gentle.",
      "Tomorrow is ovulation for you. You know the feel.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  // ─── OVULATION PHASE (Days 14–16) ──────────────────────────────────────────
  {
    cycleDay: 14,
    phase: "ovulation",
    hormoneNote: [
      "Ovulation. Middle of your cycle.",
      "Ovulation. Middle of your cycle.",
      "Ovulation.",
    ],
    physicalExpectation: [
      "Energy can feel at its highest around ovulation. Some notice a brief, bright physical lift.",
      "You've felt this energy lift around ovulation before. It's showing up again.",
      "This is where your energy feels lightest. It's here again.",
    ],
    mentalExpectation: [
      "Thinking can feel clear. Being around people can feel easier.",
      "Clarity tends to be strong for you around now. It's here.",
      "Clarity is at its strongest for you around ovulation. You've seen this across cycles.",
    ],
    emotionalNote: [
      "Mood can feel buoyant. There's often a lightness that shows up around this time.",
      "Mood lifts for you around ovulation. That brightness is recognizable.",
      "Your mood reliably lifts here. That brightness is familiar.",
    ],
    actionTip: [
      "A bright spot.",
      "Recognizable brightness.",
      "This is your space.",
    ],
    tomorrowPreview: [
      "Tomorrow may still feel bright, with something quieter starting underneath.",
      "You've noticed the shift starting around here. Still bright though.",
      "The brightness holds one more day for you.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 15,
    phase: "ovulation",
    hormoneNote: [
      "Just past ovulation. A transition is starting.",
      "Post-ovulation. Transition beginning.",
      "Post-ovulation.",
    ],
    physicalExpectation: [
      "Energy can still feel high, but some notice a subtle shift beginning. The strongest part may be passing.",
      "You've noticed energy starts to dip just after ovulation. That subtle shift may be arriving.",
      "For you, the strongest part passes right around here. The dip begins.",
    ],
    mentalExpectation: [
      "Thinking can still feel clear, but the sharpest edge may have softened slightly.",
      "The sharpest clarity starts to soften for you around here. Familiar.",
      "Clarity starts to soften after ovulation for you. Consistently.",
    ],
    emotionalNote: [
      "Mood can still feel positive, but there can be a quiet shift beginning underneath.",
      "Mood stays positive but something quieter starts to settle in. You've felt this before.",
      "Mood begins its quiet shift here. You've seen this transition every cycle.",
    ],
    actionTip: [
      "Still bright, but shifting.",
      "The shift is starting.",
      "The turn.",
    ],
    tomorrowPreview: [
      "Tomorrow begins the transition into a quieter stretch.",
      "You've felt the shift starting around day 16.",
      "The turn starts tomorrow for you.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 16,
    phase: "ovulation",
    hormoneNote: [
      "Transitioning from ovulation into the luteal phase.",
      "Transitioning into luteal phase.",
      "Into the luteal phase.",
    ],
    physicalExpectation: [
      "Energy can start to feel less available. Things are shifting.",
      "You've felt energy starting to fade around here before. That shift is arriving.",
      "Energy fades around here for you. Every cycle, this transition arrives.",
    ],
    mentalExpectation: [
      "Focus can feel slightly harder to sustain. The ease of the last few days may be fading.",
      "Focus gets harder to hold for you after ovulation. It's starting.",
      "Focus starts requiring more effort. You've seen this consistently.",
    ],
    emotionalNote: [
      "Emotions can start to feel more inward. Social energy can feel less automatic.",
      "You've noticed a quieting here. Social energy pulls back. It's familiar.",
      "The emotional shift inward begins here for you. Reliably.",
    ],
    actionTip: [
      "Something is changing.",
      "Shifting gears.",
      "The quiet part begins.",
    ],
    tomorrowPreview: [
      "Something quieter begins tomorrow.",
      "You've felt this settling before.",
      "The quiet part begins tomorrow for you.",
    ],
    energyLevel: "high",
    focusLevel: "good",
  },
  // ─── LUTEAL PHASE (Days 17–28) ─────────────────────────────────────────────
  {
    cycleDay: 17,
    phase: "luteal",
    hormoneNote: [
      "Early luteal phase.",
      "Early luteal.",
      "Early luteal.",
    ],
    physicalExpectation: [
      "Energy can feel more moderate. Not low, but the brightness from ovulation is usually gone.",
      "You've noticed energy settling into something more moderate here. It's here again.",
      "Energy settles into moderate for you here. Consistently, after ovulation, this is where things land.",
    ],
    mentalExpectation: [
      "Focus can feel steady but less sharp. Detail work can feel more tiring.",
      "Focus feels steady but less effortless for you around now. Recognizable.",
      "Focus is present but requires more effort. You've seen this across cycles.",
    ],
    emotionalNote: [
      "Emotions can feel more present. Things that were easy to brush off might linger.",
      "Emotions are more present for you in the luteal phase. That shift is arriving.",
      "Emotions are closer for you in the luteal phase. Every cycle.",
    ],
    actionTip: [
      "A quieter stretch.",
      "Settling.",
      "Familiar quiet.",
    ],
    tomorrowPreview: [
      "Tomorrow continues this quieter stretch.",
      "You've felt this steady settling before.",
      "This part holds for you.",
    ],
    energyLevel: "moderate",
    focusLevel: "good",
  },
  {
    cycleDay: 18,
    phase: "luteal",
    hormoneNote: [
      "Early luteal phase.",
      "Early luteal.",
      "Early luteal.",
    ],
    physicalExpectation: [
      "Energy can feel steady but not strong. Some notice mild fullness or tenderness beginning.",
      "You've noticed some physical changes starting around here. They're arriving again.",
      "For you, physical changes start showing up around day 18. Recognizable.",
    ],
    mentalExpectation: [
      "Thinking can feel reliable but slower. Careful, steady work can feel more natural.",
      "Focus has been steady but slower for you in this stretch. It's familiar.",
      "Thinking slows down here for you. Consistently. Steady work fits best.",
    ],
    emotionalNote: [
      "Emotions can feel grounded but more present. Things may sit with you longer.",
      "You've noticed emotions becoming more present around now. That shift is here.",
      "Emotional presence deepens here for you. Every cycle, around this point.",
    ],
    actionTip: [
      "A steady stretch.",
      "Grounded here.",
      "Familiar ground.",
    ],
    tomorrowPreview: [
      "Energy may continue to settle.",
      "You've noticed things gradually shifting here.",
      "The gradual settling continues for you.",
    ],
    energyLevel: "moderate",
    focusLevel: "good",
  },
  {
    cycleDay: 19,
    phase: "luteal",
    hormoneNote: [
      "Luteal phase.",
      "Luteal phase.",
      "Luteal phase.",
    ],
    physicalExpectation: [
      "Energy can feel like it's slowly declining. Not a crash, more of a gradual settling.",
      "Energy has been declining for you through this phase. That gradual settling is here.",
      "For you, energy declines steadily through the luteal phase. It's doing that now.",
    ],
    mentalExpectation: [
      "Focus can feel present but less resilient. Interruptions can feel more disruptive.",
      "You've noticed focus becoming more fragile around now. It's recognizable.",
      "Focus gets more fragile here. Consistently. You know this stretch.",
    ],
    emotionalNote: [
      "Emotions can feel a little closer. Sensitivity can increase without a clear reason.",
      "Emotions are closer for you here. You've felt this shift before.",
      "Emotional sensitivity rises here for you. Every cycle.",
    ],
    actionTip: [
      "Settling is natural here.",
      "Gradual.",
      "Familiar territory.",
    ],
    tomorrowPreview: [
      "Tomorrow may feel a little heavier.",
      "You've noticed energy declining through this stretch.",
      "This part gets heavier for you.",
    ],
    energyLevel: "moderate",
    focusLevel: "moderate",
  },
  {
    cycleDay: 20,
    phase: "luteal",
    hormoneNote: [
      "Luteal phase.",
      "Luteal phase.",
      "Luteal phase.",
    ],
    physicalExpectation: [
      "Energy can feel more limited. Things may feel heavier or more sluggish.",
      "You've felt this kind of heaviness around here before. It's showing up again.",
      "For you, energy feels more limited around day 20. Reliably.",
    ],
    mentalExpectation: [
      "Thinking can feel slower. Steady, unhurried work can feel more manageable.",
      "You've noticed thinking slowing down around here. That pace is familiar.",
      "Thinking slows here for you. Consistently. You know how to work with it.",
    ],
    emotionalNote: [
      "Emotions can feel quieter or more muted. That's not unusual here.",
      "You've noticed a quieter emotional tone around now. It's recognizable.",
      "Emotional tone goes quieter here for you. Every cycle.",
    ],
    actionTip: [
      "Quieter is natural here.",
      "Settling in.",
      "You know this part.",
    ],
    tomorrowPreview: [
      "Things may start to feel more variable.",
      "You've noticed shifts starting around here.",
      "The changeable part begins for you.",
    ],
    energyLevel: "moderate",
    focusLevel: "moderate",
  },
  {
    cycleDay: 21,
    phase: "luteal",
    hormoneNote: [
      "Luteal phase. Approaching the second half.",
      "Luteal phase.",
      "Luteal phase.",
    ],
    physicalExpectation: [
      "Energy can feel less consistent. Some days feel okay, others feel heavier.",
      "You've noticed energy becoming more variable around here. It's starting.",
      "For you, energy gets unpredictable around day 21. You've seen this before.",
    ],
    mentalExpectation: [
      "Focus can feel more variable. Concentration may come and go.",
      "You've noticed thinking becoming less steady around now. That wobble is familiar.",
      "Focus wobbles here for you. Consistently. It steadies again later.",
    ],
    emotionalNote: [
      "Emotions can start to shift more. Stability may feel harder to hold.",
      "You've noticed emotional shifts starting around here. They're arriving.",
      "Emotional stability starts shifting here for you. Every cycle.",
    ],
    actionTip: [
      "Things can feel more changeable here.",
      "Variable territory.",
      "You know this shift.",
    ],
    tomorrowPreview: [
      "Sensitivity may start to build.",
      "You've felt things intensifying around here.",
      "This is where it starts to build for you.",
    ],
    energyLevel: "declining",
    focusLevel: "moderate",
  },
  {
    cycleDay: 22,
    phase: "luteal",
    hormoneNote: [
      "Mid luteal phase.",
      "Mid luteal.",
      "Mid luteal.",
    ],
    physicalExpectation: [
      "Energy can feel like it's declining more noticeably. Some notice bloating, tenderness, or fatigue.",
      "You've felt energy dropping around mid-luteal before. That dip is arriving.",
      "For you, mid-luteal is where energy reliably drops. It's here.",
    ],
    mentalExpectation: [
      "Focus can feel harder. Tasks that felt easy last week can feel more draining.",
      "Thinking gets harder for you around here. The effort is noticeable.",
      "Focus requires significantly more effort here. Every cycle, this arrives.",
    ],
    emotionalNote: [
      "Emotions can start to feel more intense or reactive. Small irritations can feel bigger.",
      "Emotions intensify for you in this part of your cycle. It's showing up again.",
      "Emotional intensity is at its strongest for you in mid-luteal. Consistently.",
    ],
    actionTip: [
      "Things feel heavier. That's real.",
      "Heavier. Familiar.",
      "You know this stretch.",
    ],
    tomorrowPreview: [
      "Things may feel heavier tomorrow.",
      "You've felt this stretch intensifying before.",
      "It gets heavier here for you.",
    ],
    energyLevel: "declining",
    focusLevel: "moderate",
  },
  {
    cycleDay: 23,
    phase: "luteal",
    hormoneNote: [
      "Mid to late luteal phase.",
      "Mid to late luteal.",
      "Mid to late luteal.",
    ],
    physicalExpectation: [
      "Physical discomfort can increase. Headaches, bloating, or aches are not unusual here.",
      "You've felt this kind of physical discomfort around here before. It's arriving.",
      "For you, physical discomfort builds around day 23. Recognizable.",
    ],
    mentalExpectation: [
      "Mood can feel lower or more reactive. Things that usually roll off can stick.",
      "You've noticed mood dipping around here. That heaviness is familiar.",
      "Mood dips here for you. Consistently. It lifts again.",
    ],
    emotionalNote: [
      "Feelings can run closer to the surface. Small triggers can land harder.",
      "You've noticed emotional sensitivity is strongest around here. It's here.",
      "Emotional sensitivity is fullest around day 23 for you. Every cycle.",
    ],
    actionTip: [
      "Heavier is natural here.",
      "Recognizable weight.",
      "You've been here before.",
    ],
    tomorrowPreview: [
      "Tomorrow may feel like the hardest stretch.",
      "You've felt this kind of intensity before.",
      "The hardest part is close for you.",
    ],
    energyLevel: "declining",
    focusLevel: "moderate",
  },
  {
    cycleDay: 24,
    phase: "luteal",
    hormoneNote: [
      "Late luteal phase.",
      "Late luteal.",
      "Late luteal.",
    ],
    physicalExpectation: [
      "Bloating, tenderness, and fatigue can feel at their strongest around now.",
      "You've felt this kind of physical heaviness around here before. It's at its strongest.",
      "For you, this is where physical discomfort is heaviest. Reliably. It's here.",
    ],
    mentalExpectation: [
      "Stress can feel harder to manage. Small problems can feel much larger.",
      "You've noticed things feeling harder to manage around now. That weight is familiar.",
      "Mental load is at its heaviest here for you. Consistently. It eases soon.",
    ],
    emotionalNote: [
      "Emotional reactions can feel stronger than usual. That intensity is not unusual here.",
      "You've noticed emotional reactions feeling out of proportion around here. Familiar.",
      "This is the most emotionally amplified stretch for you. You've seen it enough to know.",
    ],
    actionTip: [
      "This is a harder stretch. It passes.",
      "The hardest part. Familiar.",
      "You know it passes.",
    ],
    tomorrowPreview: [
      "Tomorrow continues this stretch. But relief is getting closer.",
      "You've been here before. It passes.",
      "Still in the hard part. You know it passes.",
    ],
    energyLevel: "declining",
    focusLevel: "poor",
  },
  {
    cycleDay: 25,
    phase: "luteal",
    hormoneNote: [
      "Late luteal. Your period is approaching.",
      "Late luteal. Period approaching.",
      "Late luteal. Period is close.",
    ],
    physicalExpectation: [
      "Energy can feel at its lowest before your period. Fatigue and physical discomfort are not unusual.",
      "You've felt this low energy before your period before. It's arriving again.",
      "For you, the days before your period are your lowest energy. Reliably. It's here.",
    ],
    mentalExpectation: [
      "Concentration can feel scattered. Things can feel foggy or slow.",
      "Thinking gets foggy for you in late luteal. That heaviness is here.",
      "Focus is hardest here for you. Every cycle, this is where the fog is thickest.",
    ],
    emotionalNote: [
      "Emotions can feel most intense in the days before your period. Irritability or sadness can surface.",
      "You've noticed emotions intensify before your period. If that's present, it's recognizable.",
      "Emotional intensity is strongest right before your period. You've seen this enough to know it passes.",
    ],
    actionTip: [
      "This is a harder part. It passes.",
      "Almost through.",
      "The hardest part. You know it passes.",
    ],
    tomorrowPreview: [
      "Tomorrow holds here, but relief is close.",
      "You've felt this final stretch before.",
      "Almost through for you.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 26,
    phase: "luteal",
    hormoneNote: [
      "Late luteal. Your period is close.",
      "Late luteal. Almost there.",
      "Late luteal. Period is imminent.",
    ],
    physicalExpectation: [
      "Pre-period symptoms like cramping or heaviness are not unusual today.",
      "You've felt this pre-period heaviness before. Things are getting ready to shift.",
      "For you, this is deep in the pre-period stretch. The heaviness is familiar.",
    ],
    mentalExpectation: [
      "Focus can feel scattered and concentration harder to hold.",
      "You've noticed thinking gets hardest right around here. It's recognizable.",
      "Focus is at its hardest for you right here. Consistently.",
    ],
    emotionalNote: [
      "Irritability and emotional heaviness can feel at their strongest.",
      "You've felt this emotional weight before around now. It's familiar.",
      "Emotional heaviness is strongest here for you. Every cycle. It lifts soon.",
    ],
    actionTip: [
      "Almost through.",
      "Nearly there.",
      "You know this ends.",
    ],
    tomorrowPreview: [
      "Tomorrow is nearly the last day before relief.",
      "You've been here before. Almost there.",
      "Nearly through for you.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 27,
    phase: "luteal",
    hormoneNote: [
      "Pre-menstrual. Period is very close.",
      "Pre-menstrual.",
      "Pre-menstrual. Period is imminent.",
    ],
    physicalExpectation: [
      "Energy can feel very depleted. Cramping or lower back discomfort can begin before bleeding starts.",
      "You've felt this pre-period heaviness before. Things are getting ready to shift.",
      "For you, this is the lowest point physically. Every cycle, right before your period. It's here.",
    ],
    mentalExpectation: [
      "Focus can feel scattered. Simple things can require more effort.",
      "Thinking is hardest for you right here. The fog is at its thickest.",
      "Focus is at its hardest. Consistently, this is where it's heaviest for you.",
    ],
    emotionalNote: [
      "Emotions can feel raw and close. This is often the most emotionally intense time before a period.",
      "Emotions feel rawest for you just before your period. It's here.",
      "Emotional rawness is strongest here. You've seen this. It resets soon.",
    ],
    actionTip: [
      "Almost there.",
      "Almost there.",
      "Tomorrow starts fresh.",
    ],
    tomorrowPreview: [
      "Tomorrow may be the last day before your period.",
      "You've felt this final stretch before. It's almost done.",
      "Tomorrow is the last day. You know what follows.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 28,
    phase: "luteal",
    hormoneNote: [
      "Pre-menstrual. Period may arrive very soon.",
      "Pre-menstrual. Period is imminent.",
      "Pre-menstrual. The cycle is completing.",
    ],
    physicalExpectation: [
      "Cramping or spotting can signal your period is arriving. Energy can feel very low.",
      "You've felt these final pre-period signals before. They're here again.",
      "For you, this is the final day before the reset. The signals are here. Familiar.",
    ],
    mentalExpectation: [
      "Mental load can feel heaviest right before bleeding starts.",
      "You've noticed mental heaviness is strongest right before your period. Recognizable.",
      "Mental exhaustion is heaviest here for you. Every cycle, right before the reset.",
    ],
    emotionalNote: [
      "Emotional tension can feel highest right before bleeding. Relief often comes with day 1.",
      "You've felt this emotional buildup before your period before. It releases soon.",
      "Emotional tension is at its strongest. You've seen this. It releases when bleeding begins.",
    ],
    actionTip: [
      "Relief is coming.",
      "Almost through. Relief is close.",
      "You know what's coming. It resets.",
    ],
    tomorrowPreview: [
      "Your period may arrive soon. A new cycle begins.",
      "You've been through this reset before.",
      "Tomorrow starts fresh for you.",
    ],
    energyLevel: "very_low",
    focusLevel: "poor",
  },
];

// ─── Contraception-Aware Templates ──────────────────────────────────────────

export interface ContraceptionTemplates {
  physical: [string, string, string];
  mental: [string, string, string];
  emotional: [string, string, string];
  orientation: [string, string, string];
  allowance: [string, string, string];
}

export const HORMONAL_CONTRACEPTION_TEMPLATES: ContraceptionTemplates = {
  physical: [
    "On hormonal contraception, energy shifts are usually more about sleep, stress, and activity than your cycle. Notice what feels different today.",
    "You've noticed energy shifting on certain days. On contraception, that tends to track with sleep and stress more than hormones.",
    "For you, energy consistently follows sleep and stress more than cycle timing. That's clear across your entries.",
  ],
  mental: [
    "Focus can still shift day to day. Without a strong hormonal cycle, those shifts are more likely tied to how you slept or what you're carrying mentally.",
    "Focus varies for you. You've tracked enough to see it follows how rested you are, not your cycle.",
    "Focus tracks with rest and stress for you. Reliably. Your contraception keeps the hormonal piece steady.",
  ],
  emotional: [
    "Emotions can still move. On contraception, the swings tend to be flatter, but they're still real. What's present today is worth noticing.",
    "Emotional shifts show up for you even on contraception. They're real. Just driven by different things.",
    "Emotional shifts are present for you. Consistently tied to life factors, not hormones. That's your rhythm.",
  ],
  orientation: [
    "On hormonal contraception. Your hormonal fluctuations are managed.",
    "On hormonal contraception.",
    "On hormonal contraception.",
  ],
  allowance: [
    "What you're feeling is still real, even without a natural cycle driving it.",
    "Your rhythms are still yours.",
    "You know what drives your days.",
  ],
};

export const POST_IPILL_TEMPLATES: ContraceptionTemplates = {
  physical: [
    "Things may feel unpredictable for a little while. Energy and how you feel can shift without a clear rhythm.",
    "Things may feel unpredictable for a little while. Energy and how you feel can shift without a clear rhythm.",
    "Things may feel unpredictable for a little while. Energy and how you feel can shift without a clear rhythm.",
  ],
  mental: [
    "Focus may feel scattered. Things are adjusting, and that can show up mentally.",
    "Focus may feel scattered. Things are adjusting, and that can show up mentally.",
    "Focus may feel scattered. Things are adjusting, and that can show up mentally.",
  ],
  emotional: [
    "Emotions may feel more unpredictable. That's a normal response to the disruption.",
    "Emotions may feel more unpredictable. That's a normal response to the disruption.",
    "Emotions may feel more unpredictable. That's a normal response to the disruption.",
  ],
  orientation: [
    "Your cycle is resetting after emergency contraception.",
    "Your cycle is resetting after emergency contraception.",
    "Your cycle is resetting after emergency contraception.",
  ],
  allowance: [
    "Give it time. Things are recalibrating.",
    "Give it time. Things are recalibrating.",
    "Give it time. Things are recalibrating.",
  ],
};

export const POST_BC_STOP_TEMPLATES: ContraceptionTemplates = {
  physical: [
    "Things may feel unpredictable for a few cycles as your natural rhythm returns.",
    "Things may feel unpredictable for a few cycles as your natural rhythm returns.",
    "Things may feel unpredictable for a few cycles as your natural rhythm returns.",
  ],
  mental: [
    "Focus may shift in unfamiliar ways as things find a new rhythm.",
    "Focus may shift in unfamiliar ways as things find a new rhythm.",
    "Focus may shift in unfamiliar ways as things find a new rhythm.",
  ],
  emotional: [
    "Emotions can feel more intense or unpredictable after stopping contraception. That's normal while things adjust.",
    "Emotions can feel more intense or unpredictable after stopping contraception. That's normal while things adjust.",
    "Emotions can feel more intense or unpredictable after stopping contraception. That's normal while things adjust.",
  ],
  orientation: [
    "Transitioning off hormonal contraception. Your natural cycle is returning.",
    "Transitioning off hormonal contraception. Your natural cycle is returning.",
    "Transitioning off hormonal contraception. Your natural cycle is returning.",
  ],
  allowance: [
    "This is a transition. It takes time.",
    "This is a transition. It takes time.",
    "This is a transition. It takes time.",
  ],
};

// ─── Driver-Specific Overlay Templates ──────────────────────────────────────

export interface DriverOverlay {
  /** [zero/medium, high] */
  physical: [string, string];
  mental: [string, string];
  emotional: [string, string];
}

export const DRIVER_OVERLAYS: Record<string, DriverOverlay> = {
  sleep: {
    physical: [
      "Sleep has been lighter recently. That can affect how everything else feels — energy, focus, mood.",
      "For you, when sleep dips, everything follows. Energy drops. Focus scatters. You've seen this before.",
    ],
    mental: [
      "Sleep has been lighter recently. That can affect how everything else feels — energy, focus, mood.",
      "For you, when sleep dips, everything follows. Energy drops. Focus scatters. You've seen this before.",
    ],
    emotional: [
      "Sleep has been lighter recently. That can affect how everything else feels — energy, focus, mood.",
      "For you, when sleep dips, everything follows. Energy drops. Focus scatters. You've seen this before.",
    ],
  },
  stress: {
    physical: [
      "Stress can amplify how your cycle feels. What might be manageable otherwise can feel heavier when stress is present.",
      "When stress is high for you, it takes over. Energy, mood, focus — they all follow stress more than your cycle. You've seen this consistently.",
    ],
    mental: [
      "Stress can amplify how your cycle feels. What might be manageable otherwise can feel heavier when stress is present.",
      "When stress is high for you, it takes over. Energy, mood, focus — they all follow stress more than your cycle. You've seen this consistently.",
    ],
    emotional: [
      "Stress can amplify how your cycle feels. What might be manageable otherwise can feel heavier when stress is present.",
      "When stress is high for you, it takes over. Energy, mood, focus — they all follow stress more than your cycle. You've seen this consistently.",
    ],
  },
  mood: {
    physical: [
      "Your mood has shifted. Sometimes that's cycle-related, sometimes not. What matters is that it's present and worth noticing.",
      "Mood shifts for you around this time. Consistently. It arrives regardless of external circumstances. It's part of your rhythm.",
    ],
    mental: [
      "Your mood has shifted. Sometimes that's cycle-related, sometimes not. What matters is that it's present and worth noticing.",
      "Mood shifts for you around this time. Consistently. It arrives regardless of external circumstances. It's part of your rhythm.",
    ],
    emotional: [
      "Your mood has shifted. Sometimes that's cycle-related, sometimes not. What matters is that it's present and worth noticing.",
      "Mood shifts for you around this time. Consistently. It arrives regardless of external circumstances. It's part of your rhythm.",
    ],
  },
};

// ─── Nudge Templates (Zero→Medium, Medium→High) ────────────────────────────

export const NUDGE_ZERO_TO_MEDIUM: string[] = [
  "Track your symptoms across a few different days this cycle. When we see how you feel across phases, the insights get personal.",
  "Track once more in a different part of your cycle. That's what unlocks the next level.",
  "You're building something. A few more entries across different weeks and these insights start being about you.",
];

export const NUDGE_MEDIUM_TO_HIGH: string[] = [
  "One more complete cycle. After that, we'll know your personal rhythm with real clarity.",
  "When this phase repeats next cycle, we'll see if what you've noticed holds. That's when insights become truly yours.",
  "You're close. Another cycle and we'll know exactly what happens for you here.",
];

// ─── Functions ──────────────────────────────────────────────────────────────

/**
 * Returns cycle number (0-indexed) since a reference epoch.
 * Does not require storing firstPeriodStart separately — uses a fixed epoch.
 */
export function getCycleNumber(lastPeriodStart: Date, cycleLength: number): number {
  const EPOCH = new Date("2024-01-01").getTime();
  const daysSinceEpoch = Math.floor((lastPeriodStart.getTime() - EPOCH) / 86400000);
  return Math.max(0, Math.floor(daysSinceEpoch / cycleLength));
}

export function getNormalizedDay(
  cycleDay: number,
  cycleLength: number,
  phase: Phase,
): number {
  if (cycleDay > cycleLength) return 28;
  if (cycleLength === 28) return Math.max(1, Math.min(28, cycleDay));
  if (phase === "menstrual") return Math.min(Math.max(1, cycleDay), 5);

  if (phase === "follicular") {
    const follicularLength = Math.max(1, cycleLength - 19);
    const follicularDay = Math.max(1, cycleDay - 5);
    const normalized = Math.round((follicularDay / follicularLength) * 8) + 5;
    return Math.min(Math.max(6, normalized), 13);
  }

  if (phase === "ovulation") {
    return Math.min(16, Math.max(14, cycleDay));
  }

  const daysFromEnd = cycleLength - cycleDay;
  return Math.min(28, Math.max(17, 28 - daysFromEnd));
}

/**
 * Returns resolved day-specific insight data for any cycle day.
 * Days beyond 28 are clamped to 28 (deep luteal, longer cycles).
 * variantIndex: 0 | 1 | 2, mapped from confidence level (low=0, medium=1, high=2).
 */
export function getDayInsight(
  cycleDay: number,
  variantIndex: 0 | 1 | 2 = 0,
  cycleMode: CycleMode = "natural",
): ResolvedDayInsight {
  const clamped = Math.max(1, Math.min(28, cycleDay));
  const effectiveDay =
    cycleMode === "hormonal" && clamped >= 14 && clamped <= 16
      ? 12
      : clamped;
  const day = library[effectiveDay - 1]!;
  return {
    hormoneNote: day.hormoneNote[variantIndex],
    physicalExpectation: day.physicalExpectation[variantIndex],
    mentalExpectation: day.mentalExpectation[variantIndex],
    emotionalNote: day.emotionalNote[variantIndex],
    actionTip: day.actionTip[variantIndex],
    tomorrowPreview: day.tomorrowPreview[variantIndex],
    energyLevel: day.energyLevel,
    focusLevel: day.focusLevel,
  };
}
