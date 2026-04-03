// src/services/insightGuard.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST-GENERATION GUARD LAYER
//
// Runs AFTER GPT rewrite (or rule-based fallback) and BEFORE sending to client.
// This is the final enforcement layer. GPT prompt instructions can fail silently;
// this layer never fails — it's deterministic string processing.
//
// Pipeline position:
//   ruleBasedInsights → softenForConfidenceTier → GPT rewrite → softenDailyInsights
//   → cleanupInsightText → *** insightGuard.applyAllGuards() *** → res.json()
// ─────────────────────────────────────────────────────────────────────────────

import type { Phase } from "./cycleEngine";

export interface DailyInsightsShape {
  physicalInsight: string;
  mentalInsight: string;
  emotionalInsight: string;
  whyThisIsHappening: string;
  solution: string;
  recommendation: string;
  tomorrowPreview: string;
}

export type PhaseDirection = "low" | "improving" | "rising" | "peak" | "stable" | "declining";

// ─── 1. PHASE DIRECTION MAP ──────────────────────────────────────────────────

export function getPhaseDirection(cycleDay: number, cycleLength: number): PhaseDirection {
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovStart = Math.max(6, lutealStart - 3);
  const midLuteal = lutealStart + Math.floor((cycleLength - lutealStart) / 2);

  if (cycleDay <= 2) return "low";
  if (cycleDay <= 5) return "improving";
  if (cycleDay < ovStart) return "rising";
  if (cycleDay <= ovStart + 2) return "peak";
  if (cycleDay <= midLuteal) return "stable";
  return "declining";
}

// ─── 2. ZERO-DATA ASSERTION GUARD ────────────────────────────────────────────
// When logsCount === 0, ALL hard assertions about the user's current state
// must be converted to phase-based tendencies.
// Strategy: specific patterns first (better replacements), then broad catches.

const ZERO_DATA_SPECIFIC_PATTERNS: Array<[RegExp, string]> = [
  // ── Flow / bleeding ────────────────────────────────────────────────────
  [/\b[Ff]low is lighter\b/gi, "Flow can start to ease"],
  [/\b[Ff]low is heavier\b/gi, "Flow can feel heavier"],
  [/\b[Ff]low is easing\b/gi, "Flow can start to ease"],
  [/\b[Bb]leeding is lighter\b/gi, "Bleeding can start to ease"],
  [/\b[Bb]leeding is heavier\b/gi, "Bleeding can feel heavier"],
  [/\b[Bb]leeding is\b(?!\s+(typically|often|can|may|sometimes|common))/gi, "Bleeding can be"],
  [/\b[Yy]our flow\b/gi, "Flow"],
  [/\b[Yy]ou are bleeding\b/gi, "Bleeding can occur"],
  [/\b[Yy]our period is ending\b/gi, "Your period may be winding down"],
  [/\b[Yy]our period is starting\b/gi, "Your period may be starting"],
  [/\b[Yy]our period\b/gi, "the period"],
  [/\b[Yy]our body\b(?!\s+(?:can|may))/gi, "the body"],
  // Bleeding verb-phrase assertions
  [/\bas you continue to bleed\b/gi, "while your body is still in the menstrual phase"],
  [/\bcontinue to bleed\b/gi, "are still in the menstrual phase"],
  [/\bstill bleeding\b/gi, "still in the menstrual phase"],
  [/\bbleeding continues\b/gi, "the menstrual phase continues"],
  [/\bwhile you bleed\b/gi, "during the menstrual phase"],
  [/\bas you bleed\b/gi, "during the menstrual phase"],
  [/\byou're bleeding\b/gi, "bleeding may be occurring"],

  // ── Cramping / pain ────────────────────────────────────────────────────
  // Symptom continuation assertions
  [/\bas cramps continue\b/gi, "if cramping is present"],
  [/\bcramps continue\b/gi, "cramping can continue"],
  [/\bas pain continues\b/gi, "if pain is present"],
  [/\byour cramps are getting\b/gi, "cramping can get"],
  [/\byour bleeding is getting\b/gi, "bleeding can get"],
  [/\byou're still cramping\b/gi, "cramping may still be present"],
  [/\bstill cramping\b/gi, "cramping may still be present"],
  [/\b[Cc]ramping is softer\b/gi, "Cramping can start to ease"],
  [/\b[Cc]ramping is easing\b/gi, "Cramping can start to ease"],
  [/\b[Cc]ramping is worse\b/gi, "Cramping can feel more intense"],
  [/\b[Cc]ramping is intense\b/gi, "Cramping can feel more intense"],
  [/\b[Cc]ramps are easing\b/gi, "Cramps can start to ease"],
  [/\b[Cc]ramps are worse\b/gi, "Cramps can feel more intense"],
  [/\b[Cc]ramps are getting\b/gi, "Cramps can start getting"],
  [/\b[Pp]ain is subsiding\b/gi, "Pain can start to ease"],
  [/\b[Pp]ain is increasing\b/gi, "Pain can feel more noticeable"],
  [/\b[Pp]ain is worse\b/gi, "Pain can feel more intense"],
  [/\b[Yy]our cramps?\b/gi, "Cramping"],
  [/\b[Yy]our pain\b/gi, "Pain"],

  // ── Energy ─────────────────────────────────────────────────────────────
  [/\b[Yy]our energy is\b/gi, "Energy can feel"],
  [/\b[Ee]nergy is noticeably\b/gi, "Energy can feel"],
  [/\b[Ee]nergy is rising\b/gi, "Energy can start to rise"],
  [/\b[Ee]nergy is building\b/gi, "Energy can start to build"],
  [/\b[Ee]nergy is declining\b/gi, "Energy can start to dip"],
  [/\b[Ee]nergy is dropping\b/gi, "Energy can start to dip"],
  [/\b[Ee]nergy is low\b/gi, "Energy can feel lower"],
  [/\b[Ee]nergy is high\b/gi, "Energy can feel higher"],
  [/\b[Ee]nergy is strong\b/gi, "Energy can feel stronger"],
  [/\b[Ee]nergy is returning\b/gi, "Energy can start returning"],
  [/\breturn of energy\b/gi, "a gentle energy shift"],
  [/\benergy is coming\b/gi, "energy can start to come back"],
  [/\benergy is on its way\b/gi, "energy may start to return"],
  [/\b[Ee]nergy is coming\b/gi, "Energy can start coming"],

  // ── Focus / clarity / motivation ───────────────────────────────────────
  [/\b[Ff]ocus is sharpening\b/gi, "Focus can start to sharpen"],
  [/\b[Ff]ocus is returning\b/gi, "Focus can start returning"],
  [/\b[Ff]ocus is lower\b/gi, "Focus can feel lower"],
  [/\b[Ff]ocus is improving\b/gi, "Focus can start improving"],
  [/\b[Cc]larity is returning\b/gi, "Clarity can start returning"],
  [/\b[Cc]larity is improving\b/gi, "Clarity can start improving"],
  [/\b[Cc]larity is lower\b/gi, "Clarity can feel lower"],
  [/\b[Cc]larity is higher\b/gi, "Clarity can feel higher"],
  [/\b[Cc]larity is sharp\b/gi, "Clarity can feel sharper"],
  [/\b[Mm]otivation is growing\b/gi, "Motivation can start to grow"],
  [/\b[Mm]otivation is rising\b/gi, "Motivation can start to rise"],
  [/\b[Mm]otivation is low\b/gi, "Motivation can feel lower"],
  [/\b[Cc]onfidence is building\b/gi, "Confidence can start to build"],
  [/\b[Cc]onfidence is growing\b/gi, "Confidence can start to grow"],
  [/\b[Cc]onfidence is high\b/gi, "Confidence can feel higher"],
  [/\b[Cc]onfidence is rising\b/gi, "Confidence can start to rise"],

  // ── Mood ───────────────────────────────────────────────────────────────
  [/\b[Mm]ood is dropping\b/gi, "Mood can start to dip"],
  [/\b[Mm]ood is lifting\b/gi, "Mood can start to lift"],
  [/\b[Mm]ood is improving\b/gi, "Mood can start improving"],
  [/\b[Mm]ood is lower\b/gi, "Mood can feel lower"],
  [/\b[Mm]ood is low\b/gi, "Mood can feel lower"],
  [/\b[Mm]ood is stable\b/gi, "Mood can feel more stable"],

  // ── Luteal-specific symptoms ───────────────────────────────────────────
  [/\b[Cc]ravings are increasing\b/gi, "Cravings can increase"],
  [/\b[Cc]ravings are stronger\b/gi, "Cravings can feel stronger"],
  [/\b[Cc]ravings are starting\b/gi, "Cravings can start"],
  [/\b[Bb]loating is starting\b/gi, "Bloating can start"],
  [/\b[Bb]loating is increasing\b/gi, "Bloating can increase"],
  [/\b[Bb]loating is common\b/gi, "Bloating can be common"],
  [/\b[Ii]rritability is rising\b/gi, "Irritability can increase"],
  [/\b[Ii]rritability is higher\b/gi, "Irritability can feel higher"],
  [/\b[Aa]nxiety is higher\b/gi, "Anxiety can feel higher"],
  [/\b[Aa]nxiety is rising\b/gi, "Anxiety can increase"],
  [/\b[Bb]reast tenderness is\b/gi, "Breast tenderness can be"],
  [/\b[Ss]ensitivity is higher\b/gi, "Sensitivity can feel higher"],
  [/\b[Ss]ensitivity is rising\b/gi, "Sensitivity can increase"],
  [/\b[Ss]ensitivity is increasing\b/gi, "Sensitivity can increase"],
  [/\b[Ss]tress feels amplified\b/gi, "Stress can feel amplified"],
  [/\b[Ff]atigue is setting in\b/gi, "Fatigue can start setting in"],
  [/\b[Ff]atigue is increasing\b/gi, "Fatigue can increase"],
  [/\b[Ff]atigue is lifting\b/gi, "Fatigue can start to lift"],
  [/\b[Ff]atigue is higher\b/gi, "Fatigue can feel higher"],
  [/\b[Ff]atigue is lower\b/gi, "Fatigue can feel lower"],

  // ── Ovulation-specific ─────────────────────────────────────────────────
  [/\b[Ll]ibido is higher\b/gi, "Libido can feel higher"],
  [/\b[Ss]ocial energy is strong\b/gi, "Social energy can feel stronger"],
  [/\b[Ss]ocial energy is high\b/gi, "Social energy can feel higher"],
  [/\b[Cc]ommunication is easier\b/gi, "Communication can feel easier"],
  [/\b[Vv]erbal fluency is high\b/gi, "Verbal fluency can feel higher"],
  [/\b[Pp]hysical vitality is strong\b/gi, "Physical vitality can feel stronger"],
  [/\b[Yy]ou are ovulating\b/gi, "Ovulation may be occurring"],
  [/\b[Oo]vulation is occurring\b/gi, "Ovulation may be occurring"],
  [/\b[Oo]vulation is happening\b/gi, "Ovulation may be happening"],

  // ── Sleep assertions ───────────────────────────────────────────────────
  [/\b[Ss]leep is improving\b/gi, "Sleep can start improving"],
  [/\b[Ss]leep is disrupted\b/gi, "Sleep can feel disrupted"],
  [/\b[Ss]leep is worse\b/gi, "Sleep can feel worse"],
  [/\b[Ss]leep is better\b/gi, "Sleep can feel better"],
  [/\b[Yy]our sleep is\b/gi, "Sleep can be"],

  // ── Body state assertions ──────────────────────────────────────────────
  [/\b[Yy]our body is recovering\b/gi, "Your body may be recovering"],
  [/\b[Yy]our body is rebuilding\b/gi, "Your body may be rebuilding"],
  [/\b[Yy]our body is preparing\b/gi, "Your body may be preparing"],
  [/\b[Yy]our body is resetting\b/gi, "Your body may be resetting"],
  [/\b[Yy]our body is healing\b/gi, "Your body may be healing"],
  [/\b[Yy]our body is adjusting\b/gi, "Your body may be adjusting"],
  [/\b[Yy]our body is at full capacity\b/gi, "Your body can feel at higher capacity"],
  [/\b[Yy]our body is doing\b/gi, "Your body may be going through"],

  // ── "You are [state]" assertions ───────────────────────────────────────
  [/\b[Yy]ou are feeling\b/gi, "You may be feeling"],
  [/\b[Yy]ou are recovering\b/gi, "You may be recovering"],
  [/\b[Yy]ou are at your most\b/gi, "You can be at your most"],
  [/\b[Yy]ou are more reactive\b/gi, "You can feel more reactive"],
  [/\b[Yy]ou are more sensitive\b/gi, "You can feel more sensitive"],

  // ── Medical/hormone assertions ─────────────────────────────────────────
  [/\b[Ii]ron levels are low\b/gi, "Iron levels can be lower"],
  [/\b[Ii]ron levels are dropping\b/gi, "Iron levels can drop"],
  [/\b[Pp]rogesterone is dominant\b/gi, "Progesterone tends to be dominant"],
  [/\b[Pp]rogesterone is high\b/gi, "Progesterone tends to be higher"],
  [/\b[Pp]rogesterone is rising\b/gi, "Progesterone tends to rise"],
  [/\b[Ee]strogen is rising\b/gi, "Estrogen tends to rise"],
  [/\b[Ee]strogen is falling\b/gi, "Estrogen tends to fall"],
  [/\b[Ee]strogen is low\b/gi, "Estrogen tends to be lower"],
  [/\b[Ee]strogen is high\b/gi, "Estrogen tends to be higher"],
  [/\b[Ee]strogen is at its peak\b/gi, "Estrogen tends to peak"],
  [/\b[Hh]ormones are\b(?!\s+(typically|often|can|may|sometimes))/gi, "Hormones tend to be"],
  [/\bPMS symptoms are\b/gi, "PMS symptoms can be"],

  // ── Broad possessive drops (GPT reintroduces "your" constantly) ────────
  [/\b[Yy]our energy\b/gi, "Energy"],
  [/\b[Yy]our mood\b/gi, "Mood"],
  [/\b[Yy]our cycle\b/gi, "The cycle"],
  [/\b[Yy]our physical\b/gi, "Physical"],
  [/\b[Yy]our emotional\b/gi, "Emotional"],

  // ── Fuzzy "feels" verb patterns (GPT uses "feels" instead of "is") ─────
  [/\b[Ff]low feels lighter\b/gi, "Flow can start to ease"],
  [/\b[Ff]low feels heavier\b/gi, "Flow can feel heavier"],
  [/\b[Cc]ramping feels softer\b/gi, "Cramping can start to ease"],
  [/\b[Cc]ramping feels worse\b/gi, "Cramping can feel more intense"],
  [/\b[Ee]nergy feels low\b/gi, "Energy can feel lower"],
  [/\b[Ee]nergy feels high\b/gi, "Energy can feel higher"],
  [/\b[Ee]nergy feels drained\b/gi, "Energy can feel lower"],
  [/\b[Ff]ocus feels scattered\b/gi, "Focus can feel scattered"],
  [/\b[Ff]ocus feels sharp\b/gi, "Focus can feel sharper"],
  [/\b[Mm]ood feels heavy\b/gi, "Mood can feel heavier"],
  [/\b[Mm]ood feels lighter\b/gi, "Mood can start to lift"],
  [/\b[Mm]ood feels low\b/gi, "Mood can feel lower"],
  [/\b[Ss]leep feels disrupted\b/gi, "Sleep can feel disrupted"],
  [/\b[Ss]leep feels restless\b/gi, "Sleep can feel restless"],
  [/\b[Bb]ody feels heavy\b/gi, "Your body can feel heavier"],
  [/\b[Bb]ody feels sluggish\b/gi, "Your body can feel sluggish"],
  [/\b[Bb]ody feels tired\b/gi, "Your body can feel tired"],
  [/\b[Bb]ody feels drained\b/gi, "Your body can feel drained"],

  // ── Weak verb variations ("seems/appears/looks") ──────────────────────
  [/\b(flow|energy|focus|mood|sleep|body|fatigue|clarity|confidence|motivation)\s+(seems|appears|looks)\b/gi, "$1 can feel"],

  // ── Catch-all for core nouns (after specific patterns) ──────────────────
  [/\b[Ee]nergy is\b(?!\s+(typically|often|can|may|sometimes))/gi, "Energy can be"],
  [/\b[Ff]ocus is\b(?!\s+(typically|often|can|may|sometimes))/gi, "Focus can be"],
  [/\b[Mm]ood is\b(?!\s+(typically|often|can|may|sometimes))/gi, "Mood can be"],
  [/\b[Ff]low is\b(?!\s+(typically|often|can|may))/gi, "Flow can be"],
  [/\b[Cc]ramping is\b(?!\s+(typically|often|can|may))/gi, "Cramping can be"],

  // ── Assertive state claims ─────────────────────────────────────────────
  [/\b[Yy]ou feel\b/g, "You may feel"],
  [/\b[Yy]ou find that\b/gi, "You may find that"],
  [/\b[Yy]ou find\b/g, "You may find"],
  [/\b[Yy]ou notice\b/gi, "You may notice"],
  [/\b[Ee]verything takes more effort\b/g, "Things may take more effort"],
  [/\b[Ee]verything feels\b/g, "Things may feel"],
  [/\b[Ss]mall things feel harder\b/g, "small things may feel harder"],
  [/\b[Ii]t feels like\b/g, "It may feel like"],
  [/\bis lower today\b/g, "can feel lower around this time"],
  [/\bis lower right now\b/g, "can feel lower around this time"],
  [/\bis higher today\b/g, "can feel higher around this time"],
  [/\bis higher right now\b/g, "can feel higher around this time"],
  [/\bis high right now\b/g, "can feel higher around this time"],
  [/\bis at its? peak\b/g, "tends to peak around this time"],
  [/\bare at their peak\b/g, "tend to peak around this time"],
  [/\bat its? fullest\b/g, "at its strongest around this time"],
  [/\bat their fullest\b/g, "at their strongest around this time"],
  [/\bhit(?:s|ting)? their monthly high\b/g, "can reach their monthly high"],
  [/\bhits? its? monthly high\b/g, "can reach its monthly high"],

  // ── Intensity words ────────────────────────────────────────────────────
  [/\bnoticeably\b/g, ""],
  [/\bdefinitely\b/g, ""],
  [/\bclearly\b/g, ""],

];

// ─── BROAD CATCH PATTERNS ────────────────────────────────────────────────────
// Fire AFTER specific patterns to catch anything that slipped through.

const BROAD_NOUN_IS_PATTERN = /\b(stamina|drive|resilience|capacity|endurance|vitality|wellness|recovery|alertness|concentration|composure|patience|tolerance|appetite|digestion|metabolism|circulation|hydration|inflammation|soreness|stiffness|tension|discomfort|nausea|headache|dizziness|restlessness|lethargy|sluggishness|heaviness|lightness|warmth|coolness)\s+is\b/gi;

const BROAD_NOUN_ARE_PATTERN = /\b(symptoms|cramps|cravings|headaches|aches|pains|muscles|joints|hormones|levels|signals|patterns|signs)\s+are\b/gi;

const BROAD_YOUR_IS_PATTERN = /\b[Yy]our\s+(stamina|drive|resilience|capacity|endurance|vitality|concentration|composure|patience|tolerance|appetite|digestion|metabolism|libido|cycle|system|rhythm|baseline|routine|recovery|wellbeing|wellness|balance|stability|hormones?|cortisol|serotonin|dopamine|insulin|adrenaline|temperature|weight|skin|hair|nails|gut|immunity|inflammation)\s+is\b/gi;

const BROAD_YOU_ARE_PATTERN = /\b[Yy]ou are\s+(recovering|adjusting|transitioning|adapting|stabilizing|rebuilding|resetting|healing|compensating|ovulating|menstruating|cycling|peaking|declining|shifting|changing|transforming|detoxing|cleansing|rebalancing|recalibrating)\b/gi;

const BROAD_NOUN_FEELS_PATTERN =
  /\b(energy|focus|mood|flow|cramping|sleep|body|fatigue|motivation|confidence|clarity|drive|stamina|concentration)\s+feels\b/gi;

function applyBroadCatches(text: string): string {
  let result = text;

  result = result.replace(BROAD_NOUN_IS_PATTERN, (_match, noun: string) => {
    return `${noun} can be`;
  });

  result = result.replace(BROAD_NOUN_ARE_PATTERN, (_match, noun: string) => {
    return `${noun} can be`;
  });

  result = result.replace(BROAD_YOUR_IS_PATTERN, (_match, noun: string) => {
    return `${noun.charAt(0).toUpperCase() + noun.slice(1)} can be`;
  });

  result = result.replace(BROAD_YOU_ARE_PATTERN, (_match, verb: string) => {
    return `You may be ${verb}`;
  });

  result = result.replace(BROAD_NOUN_FEELS_PATTERN, (_match, noun: string) => {
    return `${noun} can feel`;
  });

  return result;
}

// ─── FINAL CATCH: Generic "is/are" softener ──────────────────────────────────

const GENERIC_STATE_IS_PATTERN =
  /\b([A-Z][a-z]+(?:\s+[a-z]+)?)\s+is\s+(?!typically|often|can|may|sometimes|common|normal|possible|not|also|what|why|how|when|where|the|a|an|just|still|now|here|there|one|this|that|about|around|usually|generally|probably|likely|perhaps|based)\b/g;

function applyGenericStateCatch(text: string): string {
  return text.replace(GENERIC_STATE_IS_PATTERN, (match, subject: string) => {
    if (/is\s+(?:why|how|what|when|where|because)/i.test(match)) return match;
    const skip = ["This", "That", "It", "There", "Here", "What", "Which", "Where", "When", "How", "Who"];
    if (skip.includes(subject.trim())) return match;
    return `${subject} can be `;
  });
}

function applySmartTodayReplacement(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const assertionVerbs = /\b(is|are|feels?|notice|experiencing|showing|having)\b/i;

  return sentences.map(sentence => {
    if (assertionVerbs.test(sentence)) {
      return sentence.replace(/\btoday\b/gi, "around this time");
    }
    return sentence;
  }).join(" ");
}

function applyZeroDataGuard(text: string): string {
  let result = text;

  // Step 1: Apply specific patterns (best replacements)
  for (const [pattern, replacement] of ZERO_DATA_SPECIFIC_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  // Step 2: Apply broad category catches
  result = applyBroadCatches(result);

  // Step 3: Apply generic state catch (last resort)
  result = applyGenericStateCatch(result);

  // Step 4: Smart "today" replacement (context-aware)
  result = applySmartTodayReplacement(result);

  // Step 5: Clean up double spaces from removals
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}

// ─── 3. DIRECTION GUARD ─────────────────────────────────────────────────────
// Prevents wrong-direction assertions.
// E.g., "harder" / "worse" during an improving direction (late menstrual Day 4-5)
// E.g., strong negatives during peak/rising phases

const NEGATIVE_ASSERTION_REPLACEMENTS: Array<[string, string]> = [
  ["harder than usual", "still settling"],
  ["harder than they should", "not quite settled yet"],
  ["harder than", "still adjusting compared to"],
  ["get worse", "still be adjusting"],
  ["worse than usual", "still stabilizing"],
  ["worse than", "still adjusting compared to"],
  ["feel worse", "still be settling"],
  ["more effort than", "a bit more effort than"],
  ["more effort", "some extra effort"],
  ["everything takes more", "things may take a bit more"],
  ["draining", "still settling"],
  ["exhausting", "still settling"],
  ["more difficult", "not as easy"],
  ["struggling", "adjusting"],
  ["feels heavy", "may still feel a bit weighty"],
  ["feels heavier", "may still feel a bit heavy"],
];

// For test validation: the terms we check for
const NEGATIVE_ASSERTIONS = [
  "harder than",
  "worse than",
  "draining",
  "exhausting",
  "more difficult",
  "struggling",
];

const STRONG_POSITIVE_ASSERTIONS = [
  "at its peak",
  "at their peak",
  "at its fullest",
  "at their fullest",
  "effortless",
  "highest point",
  "monthly high",
  "at its best",
  "at their best",
  "strongest",
  "maximum",
  "perfect",
];

function applyDirectionGuard(text: string, direction: PhaseDirection, logsCount: number): string {
  let result = text;

  // For improving/rising directions: block strong negatives (unless user has data showing it)
  if ((direction === "improving" || direction === "rising") && logsCount === 0) {
    for (const [phrase, replacement] of NEGATIVE_ASSERTION_REPLACEMENTS) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "gi"), replacement);
    }
  }

  // For low/declining/stable directions with zero data: block strong positives
  if ((direction === "low" || direction === "declining" || direction === "stable") && logsCount === 0) {
    for (const phrase of STRONG_POSITIVE_ASSERTIONS) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escapedPhrase, "gi"), "tends to improve");
    }
  }

  // For ALL directions with zero data: block peak exaggeration
  if (logsCount === 0) {
    result = applyPeakLimiter(result);
  }

  return result;
}

// ─── 4. PEAK PHASE LIMITER ──────────────────────────────────────────────────
// Caps exaggeration during ovulation/late follicular for zero/low-data users

function applyPeakLimiter(text: string): string {
  return text
    .replace(/\bat (?:its?|their) peak\b/gi, "tends to peak around this time")
    .replace(/\bat (?:its?|their) fullest\b/gi, "can feel stronger around this time")
    .replace(/\beffortless(?:ly)?\b/gi, "can feel easier")
    .replace(/\bmonthly high\b/gi, "cycle high")
    .replace(/\bhighest point\b/gi, "higher point")
    .replace(/\bat (?:its?|their) best\b/gi, "tends to be stronger")
    .replace(/\bstrongest\b/gi, "stronger")
    .replace(/\bpeak energy\b/gi, "higher energy");
}

// ─── 5. CONSISTENCY VALIDATOR ────────────────────────────────────────────────
// Detects contradictions between fields and resolves them.

const IMPROVING_SIGNALS = /\b(returning|improving|lifting|better|easing|stabilizing|recovering|lighter)\b/i;
const NEGATIVE_SIGNALS = /\b(harder|low|draining|exhausting|worse|heavy|heavier|difficult|struggling)\b/i;

function applyConsistencyGuard(insights: DailyInsightsShape): DailyInsightsShape {
  const result = { ...insights };
  const allText = Object.values(result).join(" ");

  const hasImproving = IMPROVING_SIGNALS.test(allText);
  const hasNegative = NEGATIVE_SIGNALS.test(allText);

  if (hasImproving && hasNegative) {
    // Check which direction the majority of fields lean
    const fields = Object.values(result);
    let improvingCount = 0;
    let negativeCount = 0;
    for (const field of fields) {
      if (IMPROVING_SIGNALS.test(field)) improvingCount++;
      if (NEGATIVE_SIGNALS.test(field)) negativeCount++;
    }

    if (improvingCount >= negativeCount) {
      // Majority improving — soften negatives
      for (const key of Object.keys(result) as (keyof DailyInsightsShape)[]) {
        if (NEGATIVE_SIGNALS.test(result[key]) && IMPROVING_SIGNALS.test(result[key])) {
          // Same field has both — keep it, it's probably intentional nuance
          continue;
        }
        // FIX 1: Phrase-level replacements that don't break grammar
        // OLD: \bharder\b → "a bit uneven" (broke "harder than" → "a bit uneven than")
        // NEW: Match full phrases first, then standalone words with negative lookahead
        if (NEGATIVE_SIGNALS.test(result[key]) && !IMPROVING_SIGNALS.test(result[key])) {
          result[key] = result[key]
            // Phrase-level replacements first (longer patterns before shorter)
            .replace(/\bharder than they should\b/gi, "not quite settled yet")
            .replace(/\bharder than usual\b/gi, "still settling")
            .replace(/\bharder than\b/gi, "not as easy as")
            .replace(/\bworse than usual\b/gi, "still stabilizing")
            .replace(/\bworse than\b/gi, "not as steady as")
            .replace(/\bget worse\b/gi, "still be adjusting")
            .replace(/\bfeel worse\b/gi, "still be settling")
            // Standalone word replacements (only if no "than" follows)
            .replace(/\bharder\b(?!\s+than)/gi, "not as easy")
            .replace(/\bworse\b(?!\s+than)/gi, "not as steady")
            .replace(/\bdraining\b/gi, "still settling")
            .replace(/\bexhausting\b/gi, "still settling")
            .replace(/\bheavy\b/gi, "still adjusting")
            .replace(/\bheavier\b/gi, "still adjusting");
        }
      }
    } else {
      // Majority negative — soften overly positive claims
      for (const key of Object.keys(result) as (keyof DailyInsightsShape)[]) {
        if (IMPROVING_SIGNALS.test(result[key]) && !NEGATIVE_SIGNALS.test(result[key])) {
          result[key] = result[key]
            .replace(/\blifting\b/gi, "may start to ease")
            .replace(/\bimproving\b/gi, "beginning to stabilize")
            .replace(/\bbetter\b/gi, "a little more settled");
        }
      }
    }
  }

  return result;
}

// ─── 6. INTENSITY LIMITER ────────────────────────────────────────────────────
// For zero-data users, cap emotional intensity

const HIGH_INTENSITY_PHRASES: Array<[RegExp, string]> = [
  [/\beverything feels\b/gi, "things may feel"],
  [/\bvery hard\b/gi, "a bit harder"],
  [/\bextremely\b/gi, "somewhat"],
  [/\boverwhelming\b/gi, "challenging"],
  [/\bcompletely drained\b/gi, "a bit low on energy"],
  [/\bcompletely\b/gi, ""],
  [/\btotally\b/gi, ""],
  [/\babsolutely\b/gi, ""],
];

function applyIntensityLimiter(text: string): string {
  let result = text;
  for (const [pattern, replacement] of HIGH_INTENSITY_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

// ─── 7. HALLUCINATION FILTER ─────────────────────────────────────────────────
// Block physical claims that can't be known without user data

const FORBIDDEN_PHYSICAL_CLAIMS = [
  "pelvic",
  "tingling",
  "pressure in your",
  "sensation in your",
  "cramping" // unless menstrual phase
];

function applyHallucinationFilter(text: string, phase: Phase, logsCount: number): string {
  if (logsCount > 0) return text; // Only filter for zero-data users

  let result = text;

  const HALLUCINATION_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\bpelvic\s+(?:discomfort|pressure|pain|sensation|heaviness|tension)\b/gi, "discomfort"],
    [/\bpelvic\b/gi, "lower body"],
    [/\btingling\s+(?:sensation|feeling)?\b/gi, "mild sensation"],
    [/\bpressure in your\s+\w+\b/gi, "some discomfort"],
    [/\bsensation in your\s+\w+\b/gi, "some changes"],
  ];

  if (phase !== "menstrual") {
    HALLUCINATION_REPLACEMENTS.push([/\bcramping\b/gi, "discomfort"]);
  }

  for (const [pattern, replacement] of HALLUCINATION_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result.replace(/\s{2,}/g, " ").trim();
}

// ─── 8. TOMORROW PREVIEW SOFTENER ────────────────────────────────────────────
// FIX 3: Added "should" → "may" (previously only caught "will")

function applyTomorrowSoftener(text: string, logsCount: number): string {
  if (logsCount > 0) return text;
  return text
    .replace(/\bwill\b(?!\s+not)/gi, "may")
    .replace(/\byou'll\b/gi, "you may")
    .replace(/\bshould\b(?!\s+not)/gi, "may")
    .replace(/\byou notice that\b/gi, "you may notice that")
    .replace(/\byou notice\b/gi, "you may notice")
    .replace(/\byou find that\b/gi, "you may find that")
    .replace(/\byou start to notice\b/gi, "you may start to notice")
    .replace(/\byou begin to feel\b/gi, "you may begin to feel")
    .replace(/\byou start to feel\b/gi, "you may start to feel")
    .replace(/\byou start to\b/gi, "you may start to")
    .replace(/\byou feel\b/gi, "you may feel")
    .replace(/\bhit(?:s|ting)?\b/gi, "reach")
    .replace(/\benergy and confidence hit\b/gi, "energy and confidence can reach")
    .replace(/\benergy boost\b/gi, "a gentle energy shift")
    .replace(/\ba boost\b/gi, "a gradual lift")
    .replace(/\blifts soon\b/gi, "can lift soon")
    .replace(/\beases soon\b/gi, "can ease soon")
    .replace(/\breturns soon\b/gi, "can return soon")
    .replace(/\bstarts returning\b/gi, "can start returning")
    .replace(/\bthe shift\b/gi, "a possible shift")
    .replace(/\bthings get\b/gi, "things can get")
    .replace(/\bthings improve\b/gi, "things can improve")
    .replace(/\brelief comes\b/gi, "relief can come")
    .replace(/\brelief arrives\b/gi, "relief can arrive")
    .replace(/\bthe worst is over\b/gi, "the hardest part may be passing")
    .replace(/\bthe worst is behind\b/gi, "the hardest part may be behind");
}

// ─── 9. GRAMMAR REPAIR ─────────────────────────────────────────────────────
// Catches common GPT grammar breaks that other guards don't handle.

const GRAMMAR_FIXES: Array<[RegExp, string]> = [
  [/\byou be (\w+ing)\b/gi, "you may be $1"],
  [/\bYou're (small things|everything|nothing|things)\b/gi, "$1"],
  [/\b(the \w+)\s+It\s+/gi, "$1. It "],
];

function applyGrammarRepair(text: string): string {
  let result = text;
  for (const [pattern, replacement] of GRAMMAR_FIXES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── 10. CAPITALIZE FIX ─────────────────────────────────────────────────────
// Fix broken capitalization from replacements (e.g., "— Your" mid-sentence)

function fixCapitalization(text: string): string {
  // Fix "— Your" / "— The" mid-sentence → "— your" / "— the"
  let result = text.replace(/(?:—\s*)([A-Z])(?=[a-z]{2,})/g, (match, letter) => match.replace(letter, letter.toLowerCase()));
  // Fix mid-sentence capitals after conjunctions/prepositions ("and Cramping" → "and cramping")
  result = result.replace(/(?<=\b(?:and|or|but|as|the|a|an|with|in|on|of|for)\s)([A-Z])(?=[a-z]{2,})/g, (_, letter) => letter.toLowerCase());
  // Fix mid-sentence capitals after commas/semicolons that aren't proper nouns
  result = result.replace(/(?<=[,;]\s)([A-Z])(?=[a-z]{2,})/g, (_, letter) => letter.toLowerCase());
  // Ensure sentence starts are capitalized
  result = result.replace(/(^|\.\s+|\?\s+|!\s+|\n\s*)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
  return result;
}

// ─── 10. TECHNICAL LANGUAGE GUARD ────────────────────────────────────────────
// Replace overly technical hormone language for zero-data users

function applyTechnicalLanguageGuard(text: string, logsCount: number): string {
  if (logsCount >= 3) return text; // Users with data can handle more specifics
  return text
    .replace(/\bhormone floor\b/gi, "lowest hormone levels")
    .replace(/\bhormone floor recedes\b/gi, "hormone levels begin stabilizing")
    .replace(/\bLH surge\b/gi, "hormonal shift")
    .replace(/\bLH peaks?\b/gi, "hormones shift")
    .replace(/\bcervical mucus\b/gi, "")
    .replace(/\bbasal temperature\b/gi, "body temperature")
    .replace(/\bfollicles? (?:are |is )?developing\b/gi, "your cycle is progressing")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── 11. CLINICAL LANGUAGE GUARD ────────────────────────────────────────────
// Replace academic / clinical phrasing with natural human language

const CLINICAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bemotional regulation\b/gi, "handling things emotionally"],
  [/\bemotional dysregulation\b/gi, "emotional ups and downs"],
  [/\bcognitive function\b/gi, "mental clarity"],
  [/\bcognitive load\b/gi, "mental load"],
  [/\bserotonin(?:\s+levels?)?\b/gi, "mood-related changes"],
  [/\bcortisol(?:\s+levels?)?\b/gi, "stress hormones"],
  [/\bhormonal fluctuations?\b/gi, "hormonal changes"],
  [/\bluteal phase defect\b/gi, "cycle variation"],
  [/\bpremenstrual dysphoric\b/gi, "premenstrual"],
  [/\bneuroendocrine\b/gi, "hormonal"],
  [/\bvasomotor\b/gi, "temperature"],
  [/\bsomatic\b/gi, "physical"],
];

function applyClinicalLanguageGuard(text: string): string {
  let result = text;
  for (const [pattern, replacement] of CLINICAL_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── 12. ENERGY LANGUAGE GUARD ──────────────────────────────────────────────
// Cap energy exaggeration — "boost", "peak", "optimal" → softer alternatives

const ENERGY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\benergy boost\b/gi, "a gentle energy shift"],
  [/\benergy lift\b/gi, "a gentle energy shift"],
  [/\ba boost\b/gi, "a gradual lift"],
  [/\bboost(?:s|ing|ed)?\b/gi, "lift"],
  [/\bpeak energy\b/gi, "higher energy"],
  [/\boptimal\b/gi, "a good window for"],
  [/\bat (?:its?|their) best\b/gi, "tends to be stronger"],
  [/\bat (?:its?|their) highest\b/gi, "can feel higher"],
  [/\bat its maximum\b/gi, "at a higher point"],
];

function applyEnergyLanguageGuard(text: string, logsCount: number): string {
  if (logsCount >= 5) return text; // High-data users get assertive language
  let result = text;
  for (const [pattern, replacement] of ENERGY_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── 13. DIRECTIVE LANGUAGE SOFTENER ────────────────────────────────────────
// "you should" → "it can help to", "you must" → "you may want to"

const DIRECTIVE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b[Yy]ou should\b/g, "It can help to"],
  [/\b[Yy]ou must\b/g, "You may want to"],
  [/\b[Yy]ou need to\b/g, "It may help to"],
  [/\b[Mm]ake sure (?:you |to )\b/gi, "If you can, try to "],
  [/\bresting will support\b/gi, "resting can help support"],
  [/\bresting will\b/gi, "resting can"],
  [/\bwill support\b/gi, "can help support"],
  [/\bwill help\b/gi, "can help"],
  [/\bwill change\b/gi, "can change"],
  [/\bwill improve\b/gi, "may improve"],
  [/\bwill ease\b/gi, "can ease"],
  [/\bwill lift\b/gi, "can lift"],
  [/\bwill return\b/gi, "can return"],
  [/\bwill shift\b/gi, "can shift"],
  [/\bwill feel\b/gi, "can feel"],
  [/\bwill bring\b/gi, "can bring"],
  [/\bwill start\b/gi, "may start"],
  [/\bwill come\b/gi, "can come"],
  [/\bwill notice\b/gi, "may notice"],
  [/\bwill recover\b/gi, "can recover"],
  [/\bwill stabilize\b/gi, "can stabilize"],
  [/\bwill pass\b/gi, "can pass"],
  [/\bwill fade\b/gi, "can fade"],
  [/\bwill settle\b/gi, "can settle"],
  [/\bwill calm\b/gi, "can calm"],
];

function applyDirectiveLanguageGuard(text: string, logsCount: number): string {
  if (logsCount >= 5) return text; // Data-backed users get firmer advice
  let result = text;
  for (const [pattern, replacement] of DIRECTIVE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── MAIN PIPELINE ──────────────────────────────────────────────────────────

export interface InsightGuardInput {
  insights: DailyInsightsShape;
  cycleDay: number;
  cycleLength: number;
  phase: Phase;
  logsCount: number;
}

export interface InsightGuardResult {
  insights: DailyInsightsShape;
  guardsApplied: string[];
}

function applyPopulationFramingGuard(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bmost people notice\b/gi, "you may notice"],
    [/\bmost people experience\b/gi, "you may experience"],
    [/\bmost people feel\b/gi, "you may feel"],
    [/\bmany people find\b/gi, "you may find"],
    [/\bsome people find\b/gi, "you may find"],
    [/\bsome women experience\b/gi, "you may experience"],
    [/\bit's normal for most\b/gi, "it's normal"],
    [/\bresearch shows that?\b/gi, ""],
    [/\bstudies suggest that?\b/gi, ""],
  ];
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

export function applyAllGuards(input: InsightGuardInput): InsightGuardResult {
  const { cycleDay, cycleLength, phase, logsCount } = input;
  let insights = { ...input.insights };
  const guardsApplied: string[] = [];

  const direction = getPhaseDirection(cycleDay, cycleLength);
  const isZeroData = logsCount === 0;
  const isLowData = logsCount > 0 && logsCount < 5;

  // Process each field through the pipeline
  const keys: (keyof DailyInsightsShape)[] = [
    "physicalInsight", "mentalInsight", "emotionalInsight",
    "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
  ];

  for (const key of keys) {
    let text = insights[key];

    // Guard 1: Zero-data assertion softening
    if (isZeroData) {
      const before = text;
      text = applyZeroDataGuard(text);
      if (text !== before) guardsApplied.push(`zero_data:${key}`);
    }

    // Guard 2: Direction enforcement
    {
      const before = text;
      text = applyDirectionGuard(text, direction, logsCount);
      if (text !== before) guardsApplied.push(`direction:${key}`);
    }

    // Guard 3: Intensity limiting for zero-data
    if (isZeroData || isLowData) {
      const before = text;
      text = applyIntensityLimiter(text);
      if (text !== before) guardsApplied.push(`intensity:${key}`);
    }

    // Guard 4: Hallucination filter
    {
      const before = text;
      text = applyHallucinationFilter(text, phase, logsCount);
      if (text !== before) guardsApplied.push(`hallucination:${key}`);
    }

    // Guard 5: Technical language
    {
      const before = text;
      text = applyTechnicalLanguageGuard(text, logsCount);
      if (text !== before) guardsApplied.push(`technical:${key}`);
    }

    // Guard 6: Tomorrow-specific softening
    if (key === "tomorrowPreview") {
      const before = text;
      text = applyTomorrowSoftener(text, logsCount);
      if (text !== before) guardsApplied.push(`tomorrow:${key}`);
    }

    // Guard 7: Clinical language cleanup (all users)
    {
      const before = text;
      text = applyClinicalLanguageGuard(text);
      if (text !== before) guardsApplied.push(`clinical:${key}`);
    }

    // Guard 8: Energy language control (zero/low data)
    {
      const before = text;
      text = applyEnergyLanguageGuard(text, logsCount);
      if (text !== before) guardsApplied.push(`energy:${key}`);
    }

    // Guard 9: Directive language softener (zero/low data)
    {
      const before = text;
      text = applyDirectiveLanguageGuard(text, logsCount);
      if (text !== before) guardsApplied.push(`directive:${key}`);
    }

    // Guard 10: Population framing (all users)
    {
      const before = text;
      text = applyPopulationFramingGuard(text);
      if (text !== before) guardsApplied.push(`population:${key}`);
    }

    // Guard 11: Grammar repair (common GPT breaks)
    {
      const before = text;
      text = applyGrammarRepair(text);
      if (text !== before) guardsApplied.push(`grammar:${key}`);
    }

    // Guard 11: Capitalize fix (always last — cleans up after all replacements)
    text = fixCapitalization(text);

    insights[key] = text;
  }

  // Guard 11: Cross-field consistency (only for zero/low-data users)
  // High-data users can have intentional nuance like "sleep dropped → harder → but tomorrow will be better"
  if (isZeroData || isLowData) {
    const before = JSON.stringify(insights);
    insights = applyConsistencyGuard(insights);
    if (JSON.stringify(insights) !== before) guardsApplied.push("consistency");
  }

  return { insights, guardsApplied };
}

// ─── VALIDATION HELPERS (for testing) ────────────────────────────────────────

export interface ValidationResult {
  pass: boolean;
  failures: string[];
}

/** Validates that zero-data insights don't contain hard assertions */
export function validateZeroDataSafety(insights: DailyInsightsShape): ValidationResult {
  const failures: string[] = [];
  const allText = Object.entries(insights);

  const HARD_ASSERTION_PATTERNS = [
    /\b[Yy]our energy is (?!typically|often|can|may)/,
    /\b[Ff]ocus is (?!typically|often|can|may)/,
    /\b[Yy]ou feel (?!that)/,  // "You feel X" without hedging
    /\b(?:is|are) at (?:its?|their) peak\b/,
    /\b(?:is|are) at (?:its?|their) fullest\b/,
    /\beffortlessly?\b/,
    /\bnoticeably\b/,
    /\beverything takes more effort\b/,
    /\beverything feels\b/,
    /\bhit(?:s|ting)? their monthly high\b/,
  ];

  for (const [key, text] of allText) {
    for (const pattern of HARD_ASSERTION_PATTERNS) {
      if (pattern.test(text)) {
        failures.push(`${key}: contains hard assertion matching ${pattern.source} → "${text.substring(0, 80)}..."`);
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Validates phase direction correctness */
export function validateDirectionCorrectness(
  insights: DailyInsightsShape,
  direction: PhaseDirection,
): ValidationResult {
  const failures: string[] = [];
  const allText = Object.values(insights).join(" ").toLowerCase();

  if (direction === "improving" || direction === "rising") {
    for (const neg of NEGATIVE_ASSERTIONS) {
      if (allText.includes(neg)) {
        failures.push(`Direction ${direction} but found negative assertion: "${neg}"`);
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Validates no internal contradictions */
export function validateConsistency(insights: DailyInsightsShape): ValidationResult {
  const failures: string[] = [];

  // Check physicalInsight vs emotionalInsight for contradiction
  const physical = insights.physicalInsight.toLowerCase();
  const emotional = insights.emotionalInsight.toLowerCase();
  const mental = insights.mentalInsight.toLowerCase();

  const physImproving = IMPROVING_SIGNALS.test(physical) && !NEGATIVE_SIGNALS.test(physical);
  const physNeg = NEGATIVE_SIGNALS.test(physical) && !IMPROVING_SIGNALS.test(physical);
  const emoImproving = IMPROVING_SIGNALS.test(emotional) && !NEGATIVE_SIGNALS.test(emotional);
  const emoNeg = NEGATIVE_SIGNALS.test(emotional) && !IMPROVING_SIGNALS.test(emotional);

  if (physImproving && emoNeg) {
    failures.push(`Physical says improving but emotional says negative: "${insights.physicalInsight.substring(0, 50)}" vs "${insights.emotionalInsight.substring(0, 50)}"`);
  }
  if (physNeg && emoImproving) {
    failures.push(`Physical says negative but emotional says improving`);
  }

  return { pass: failures.length === 0, failures };
}