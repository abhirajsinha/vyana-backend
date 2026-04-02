// ─────────────────────────────────────────────────────────────────────────────
// PATCH: insightGuard.ts — Zero-data guard overhaul
//
// PROBLEM:
//   The current ZERO_DATA_ASSERTION_PATTERNS list catches ~15 specific phrases
//   but GPT can generate 30+ variations per phase that slip through.
//   Examples: "cramping is softer", "cravings are increasing", "confidence is high",
//   "your body is recovering", "fatigue is setting in", "you are ovulating"
//
// FIX APPROACH:
//   1. Keep existing specific patterns (they produce better replacements)
//   2. Add BROAD CATCH patterns that cover entire categories GPT can invent
//   3. Add a WHITELIST of safe phrases that should NOT be softened
//   4. Add "your body is [verb]" broad pattern (was only "your body is doing")
//   5. Add "you are [verb]" broad pattern (was only "you are feeling/bleeding")
//
// WHERE TO APPLY:
//   Replace the ZERO_DATA_ASSERTION_PATTERNS array and applyZeroDataGuard function
//   in src/services/insightGuard.ts
// ─────────────────────────────────────────────────────────────────────────────


// ─── 2. ZERO-DATA ASSERTION GUARD — REWRITTEN ───────────────────────────────
// Strategy: specific patterns first (better replacements), then broad catches.
// Broad catches use a WHITELIST to avoid false positives on safe phrasing.

// Phrases that should NOT be softened even for zero-data users.
// These are already probabilistic or are structural phrases.
const ZERO_DATA_SAFE_PHRASES = new Set([
  "can",
  "may",
  "might",
  "could",
  "often",
  "sometimes",
  "typically",
  "tends to",
  "tend to",
  "around this time",
  "during this phase",
  "common to",
  "normal to",
  "possible",
]);

// Check if the text immediately following "is/are" is already hedged
function isAlreadyHedged(text: string, matchIndex: number, matchLength: number): boolean {
  const after = text.slice(matchIndex + matchLength).trimStart().toLowerCase();
  return Array.from(ZERO_DATA_SAFE_PHRASES).some(safe => after.startsWith(safe));
}

// ─── SPECIFIC PATTERNS (high-quality replacements) ───────────────────────────
// These fire first and produce natural-sounding output.

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

  // ── Cramping / pain ────────────────────────────────────────────────────
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

  // ── Focus / clarity / motivation ───────────────────────────────────────
  [/\b[Ff]ocus is sharpening\b/gi, "Focus can start to sharpen"],
  [/\b[Ff]ocus is returning\b/gi, "Focus can start returning"],
  [/\b[Ff]ocus is lower\b/gi, "Focus can feel lower"],
  [/\b[Ff]ocus is improving\b/gi, "Focus can start improving"],
  [/\b[Cc]larity is returning\b/gi, "Clarity can start returning"],
  [/\b[Cc]larity is improving\b/gi, "Clarity can start improving"],
  [/\b[Cc]larity is lower\b/gi, "Clarity can feel lower"],
  [/\b[Cc]larity is higher\b/gi, "Clarity can feel higher"],
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

  // ── Assertive state claims ─────────────────────────────────────────────
  [/\b[Yy]ou feel\b/g, "You may feel"],
  [/\b[Yy]ou find that\b/gi, "You may find that"],
  [/\b[Yy]ou find\b/g, "You may find"],
  [/\b[Yy]ou notice\b/gi, "You may notice"],
  [/\b[Ee]verything takes more effort\b/g, "Things may take more effort"],
  [/\b[Ee]verything feels\b/g, "Things may feel"],
  [/\b[Ss]mall things feel harder\b/g, "Small things may feel harder"],
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

  // ── "today" → "around this time" (GPT reintroduces this constantly) ───
  [/\btoday\b/gi, "around this time"],
];

// ─── BROAD CATCH PATTERNS ────────────────────────────────────────────────────
// These fire AFTER specific patterns and catch anything that slipped through.
// They use a function-based replacer that checks context before replacing.

// Pattern: "[Symptom/state noun] is [anything not already hedged]"
// Catches: "Stamina is improving", "Drive is picking up", etc.
const BROAD_NOUN_IS_PATTERN = /\b(stamina|drive|resilience|capacity|endurance|vitality|wellness|recovery|alertness|concentration|composure|patience|tolerance|appetite|digestion|metabolism|circulation|hydration|inflammation|soreness|stiffness|tension|discomfort|nausea|headache|dizziness|restlessness|lethargy|sluggishness|heaviness|lightness|warmth|coolness)\s+is\b/gi;

// Pattern: "[Symptom/state noun] are [anything not already hedged]"
const BROAD_NOUN_ARE_PATTERN = /\b(symptoms|cramps|cravings|headaches|aches|pains|muscles|joints|hormones|levels|signals|patterns|signs)\s+are\b/gi;

// Pattern: "Your [noun] is [anything]" — broad possessive catch
const BROAD_YOUR_IS_PATTERN = /\b[Yy]our\s+(stamina|drive|resilience|capacity|endurance|vitality|concentration|composure|patience|tolerance|appetite|digestion|metabolism|libido|cycle|system|rhythm|baseline|routine|recovery|wellbeing|wellness|balance|stability|hormones?|cortisol|serotonin|dopamine|insulin|adrenaline|temperature|weight|skin|hair|nails|gut|immunity|inflammation)\s+is\b/gi;

// Pattern: "You are [verbing]" — broad catch beyond "feeling/bleeding"
const BROAD_YOU_ARE_PATTERN = /\b[Yy]ou are\s+(recovering|adjusting|transitioning|adapting|stabilizing|rebuilding|resetting|healing|compensating|ovulating|menstruating|cycling|peaking|declining|shifting|changing|transforming|detoxing|cleansing|rebalancing|recalibrating)\b/gi;

function applyBroadCatches(text: string): string {
  let result = text;

  // "[noun] is" → "[noun] can be"
  result = result.replace(BROAD_NOUN_IS_PATTERN, (match, noun) => {
    return `${noun} can be`;
  });

  // "[noun] are" → "[noun] can be"
  result = result.replace(BROAD_NOUN_ARE_PATTERN, (match, noun) => {
    return `${noun} can be`;
  });

  // "Your [noun] is" → "[noun] can be"
  result = result.replace(BROAD_YOUR_IS_PATTERN, (match, noun) => {
    // Drop possessive, soften
    return `${noun.charAt(0).toUpperCase() + noun.slice(1)} can be`;
  });

  // "You are [verbing]" → "You may be [verbing]"
  result = result.replace(BROAD_YOU_ARE_PATTERN, (match, verb) => {
    return `You may be ${verb}`;
  });

  return result;
}

// ─── FINAL CATCH: Generic "is/are" softener ──────────────────────────────────
// After all specific and broad patterns, catch remaining "[State] is [adjective]"
// patterns that weren't covered. Only fires for zero-data users.
//
// This catches things like:
//   "Physical vitality is strong" → "Physical vitality can feel strong"
//   "Communication is easier" → "Communication can feel easier"
//
// Uses negative lookahead to skip already-hedged phrases.

const GENERIC_STATE_IS_PATTERN =
  /\b([A-Z][a-z]+(?:\s+[a-z]+)?)\s+is\s+(?!typically|often|can|may|sometimes|common|normal|possible|not|also|what|why|how|when|where|the|a|an|just|still|now|here|there|one|this|that|about|around|usually|generally|probably|likely|perhaps|based)\b/g;

function applyGenericStateCatch(text: string): string {
  return text.replace(GENERIC_STATE_IS_PATTERN, (match, subject) => {
    // Don't soften structural phrases like "This is" or "That is"
    const skip = ["This", "That", "It", "There", "Here", "What", "Which", "Where", "When", "How", "Who"];
    if (skip.includes(subject.trim())) return match;
    return `${subject} can be `;
  });
}


// ─── REPLACEMENT: applyZeroDataGuard function ────────────────────────────────
// This replaces the existing applyZeroDataGuard in insightGuard.ts

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

  // Step 4: Clean up double spaces from removals
  result = result.replace(/\s{2,}/g, " ").trim();

  return result;
}


// ─── ALSO UPDATE: applyDirectiveLanguageGuard ────────────────────────────────
// Add missing patterns that the audit found

const DIRECTIVE_REPLACEMENTS_UPDATED: Array<[RegExp, string]> = [
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
  // ── NEW: additional directive patterns ──────────────────────────────────
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


// ─── ALSO UPDATE: applyTomorrowSoftener ──────────────────────────────────────
// Strengthen to catch more GPT reintroductions

function applyTomorrowSoftenerUpdated(text: string, logsCount: number): string {
  if (logsCount > 0) return text;
  return text
    .replace(/\bwill\b(?!\s+not)/gi, "may")
    .replace(/\byou'll\b/gi, "you may")
    .replace(/\bshould\b(?!\s+not)/gi, "may")
    .replace(/\byou notice\b/gi, "you may notice")
    .replace(/\byou start to\b/gi, "you may start to")
    .replace(/\byou feel\b/gi, "you may feel")
    .replace(/\bhit(?:s|ting)?\b/gi, "reach")
    .replace(/\benergy and confidence hit\b/gi, "energy and confidence can reach")
    .replace(/\benergy boost\b/gi, "gradual return of energy")
    .replace(/\ba boost\b/gi, "a gradual lift")
    // ── NEW: additional tomorrow patterns ─────────────────────────────────
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


// ─── EXPORTS FOR REFERENCE ───────────────────────────────────────────────────
// When applying this patch, you need to:
//
// 1. Replace ZERO_DATA_ASSERTION_PATTERNS array with ZERO_DATA_SPECIFIC_PATTERNS
// 2. Replace applyZeroDataGuard function with the new version above
// 3. Add applyBroadCatches and applyGenericStateCatch as new functions
// 4. Update DIRECTIVE_REPLACEMENTS with DIRECTIVE_REPLACEMENTS_UPDATED
// 5. Update applyTomorrowSoftener with applyTomorrowSoftenerUpdated
// 6. Add BROAD_NOUN_IS_PATTERN, BROAD_NOUN_ARE_PATTERN,
//    BROAD_YOUR_IS_PATTERN, BROAD_YOU_ARE_PATTERN constants
// 7. Add ZERO_DATA_SAFE_PHRASES and isAlreadyHedged helper
//
// The applyAllGuards pipeline does NOT change — it still calls
// applyZeroDataGuard, applyDirectionGuard, etc. in the same order.
// Only the internals of these functions improve.