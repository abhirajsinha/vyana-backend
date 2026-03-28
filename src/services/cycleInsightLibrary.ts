import type { CycleMode, Phase } from "./cycleEngine";

export interface DayInsight {
  cycleDay: number;
  phase: Phase;
  // All text arrays have exactly 3 variants. Each string max 1 sentence ~15 words.
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

const library: DayInsight[] = [
  {
    cycleDay: 1,
    phase: "menstrual",
    hormoneNote: [
      "Estrogen and progesterone hit zero today — your period begins.",
      "Both hormones drop to their cycle low, triggering your period today.",
      "Hormone floor hits today — this crash is what starts your period.",
    ],
    physicalExpectation: [
      "Heaviest bleeding and strongest cramps usually hit on day 1.",
      "Expect the most intense cramping and heaviest flow of this cycle today.",
      "Cramps and flow peak today as your uterus begins shedding.",
    ],
    mentalExpectation: [
      "Brain fog and low motivation are driven by very low estrogen today.",
      "Concentration is at its weakest today — rock-bottom estrogen explains the fog.",
      "Focus is difficult today; low estrogen makes mental effort feel much harder.",
    ],
    emotionalNote: [
      "Low hormones and pain signals make emotional regulation harder today.",
      "Emotional sensitivity peaks today as hormones crash to their lowest point.",
      "Pain and hormone drop combine to make emotional steadiness harder today.",
    ],
    actionTip: [
      "Rest as much as possible and eat iron-rich food tonight.",
      "Warmth on your lower abdomen and iron-rich food are your best tools today.",
      "Prioritize rest and replenish iron — your body is doing real work today.",
    ],
    tomorrowPreview: [
      "Day 2 cramps and bleeding typically peak before easing.",
      "Day 2 often brings peak cramps and flow before relief begins.",
      "Expect day 2 to be intense before the gradual relief begins.",
    ],
    energyLevel: "very_low",
    focusLevel: "poor",
  },
  {
    cycleDay: 2,
    phase: "menstrual",
    hormoneNote: [
      "Estrogen stays at its lowest — bleeding and cramps peak today.",
      "Hormones remain at zero today — this is typically the hardest day.",
      "Iron loss is highest today as peak bleeding continues.",
    ],
    physicalExpectation: [
      "Expect the heaviest flow and sharpest cramping of your cycle today.",
      "Day 2 is typically the most physically demanding day of your cycle.",
      "Bleeding and cramps are at their worst right now — this is the peak.",
    ],
    mentalExpectation: [
      "Concentration is harder than usual due to very low estrogen today.",
      "Mental fog sits heaviest on day 2 — low hormones and pain compete for focus.",
      "Cognitive effort is at its monthly low today as estrogen stays at zero.",
    ],
    emotionalNote: [
      "Cramping and fatigue can make emotional sensitivity run high today.",
      "Day 2 often feels emotionally raw — pain and low hormones amplify feelings.",
      "Emotional regulation is hardest today; give yourself extra grace.",
    ],
    actionTip: [
      "Stay warm, reduce exertion, and prioritize iron-rich food today.",
      "Heat on the lower abdomen reduces cramps better than rest alone today.",
      "Lentils, spinach, or red meat today help replace iron you're losing.",
    ],
    tomorrowPreview: [
      "Day 3 cramps typically ease as estrogen begins its slow rise.",
      "Tomorrow usually brings lighter flow and the start of real relief.",
      "The worst is almost over — day 3 brings gradual but real improvement.",
    ],
    energyLevel: "very_low",
    focusLevel: "poor",
  },
  {
    cycleDay: 3,
    phase: "menstrual",
    hormoneNote: [
      "Estrogen begins its slow rise — bleeding is starting to ease.",
      "The hormone floor is behind you; estrogen is ticking up from today.",
      "Estrogen turns upward today — the recovery cycle begins now.",
    ],
    physicalExpectation: [
      "Cramps and flow usually lighten noticeably by day 3.",
      "Most people feel genuine physical relief as bleeding eases today.",
      "Flow is lighter and cramping is softer — the hardest days are behind you.",
    ],
    mentalExpectation: [
      "Mental fog may begin to lift slightly as estrogen ticks up today.",
      "Clarity begins its slow return today as estrogen starts climbing.",
      "Thinking is still slower than usual but the fog is starting to thin.",
    ],
    emotionalNote: [
      "Emotional steadiness starts returning as pain eases and estrogen rises.",
      "The worst emotional sensitivity is passing; today feels slightly easier.",
      "As cramping eases, emotional regulation starts becoming more manageable.",
    ],
    actionTip: [
      "A short gentle walk today can reduce cramping and boost circulation.",
      "Light movement today — even 10 minutes — supports recovery and mood.",
      "Gentle activity is safe today and will help your body recover faster.",
    ],
    tomorrowPreview: [
      "Day 4 usually brings noticeably lighter flow and returning energy.",
      "Tomorrow brings clearer thinking and lighter bleeding.",
      "Day 4 usually feels like a turning point — energy starts coming back.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 4,
    phase: "menstrual",
    hormoneNote: [
      "Estrogen rises gradually — flow is lighter and energy is returning.",
      "Rising estrogen is rebuilding your energy reserves from today.",
      "Estrogen continues its upward climb — you're in early recovery mode.",
    ],
    physicalExpectation: [
      "Most people notice significantly lighter bleeding by today.",
      "Flow is much lighter today and cramps are mostly gone.",
      "Physical energy is noticeably better as bleeding winds down today.",
    ],
    mentalExpectation: [
      "Thinking starts feeling a little clearer as hormones stabilize today.",
      "Mental clarity is returning today — this is real, not imagined.",
      "Focus is improving steadily as estrogen picks up pace today.",
    ],
    emotionalNote: [
      "Mood lifts noticeably as hormones recover and bleeding lightens today.",
      "Emotional tone is brightening today — the worst is clearly behind you.",
      "You may notice a real mood shift today as estrogen climbs higher.",
    ],
    actionTip: [
      "Gentle activity is fine today — listen to how your body responds.",
      "Today is a good day to ease back into light exercise or a walk.",
      "Reintroduce normal movement today at whatever pace feels right.",
    ],
    tomorrowPreview: [
      "Day 5 is often the last light day before your period ends.",
      "Tomorrow is typically the final day of bleeding before follicular begins.",
      "Day 5 often marks the end of your period and the start of recovery.",
    ],
    energyLevel: "low",
    focusLevel: "moderate",
  },
  {
    cycleDay: 5,
    phase: "menstrual",
    hormoneNote: [
      "Estrogen continues rising — your period is ending and energy returns.",
      "Estrogen is climbing noticeably today — the follicular shift is imminent.",
      "Rising estrogen is accelerating recovery as your period winds down.",
    ],
    physicalExpectation: [
      "Flow is usually light or spotting only by today.",
      "Bleeding is nearly done — most people have minimal flow today.",
      "Energy is noticeably higher today as your period approaches its end.",
    ],
    mentalExpectation: [
      "Mental clarity begins improving as hormones climb toward the follicular phase.",
      "Focus is sharper today than any point in the past four days.",
      "The cognitive rebound is real today — rising estrogen is helping.",
    ],
    emotionalNote: [
      "Emotional tone brightens alongside rising estrogen as your period ends.",
      "Mood is noticeably better today — the emotional heaviness is lifting.",
      "Emotional resilience is returning today as your hormone floor recedes.",
    ],
    actionTip: [
      "Start reintroducing normal activity as your energy allows today.",
      "A normal-pace walk or light workout is safe and beneficial today.",
      "Match your activity to your energy today — you likely have more than yesterday.",
    ],
    tomorrowPreview: [
      "Day 6 marks the follicular phase — energy and focus start building.",
      "Tomorrow is the start of your follicular phase — expect a real energy uplift.",
      "Day 6 brings the follicular boost — most people feel it within 24 hours.",
    ],
    energyLevel: "low",
    focusLevel: "moderate",
  },
  {
    cycleDay: 6,
    phase: "follicular",
    hormoneNote: [
      "Rising estrogen begins rebuilding your uterine lining today.",
      "Estrogen is in its active climb phase — follicles are starting to develop.",
      "Your body shifts into growth mode today as the follicular phase begins.",
    ],
    physicalExpectation: [
      "Energy and stamina start picking up noticeably from today.",
      "Physical vitality is building — this is the start of your best week.",
      "Body feels lighter and more capable today as the menstrual drain passes.",
    ],
    mentalExpectation: [
      "Mental sharpness begins its steady climb — focus improves each day.",
      "Thinking is clearer and more efficient today than it's been all week.",
      "Cognitive clarity is on an upward trajectory from today onward.",
    ],
    emotionalNote: [
      "Rising estrogen brings more emotional stability and social ease today.",
      "Mood stability is returning; emotional groundedness improves from today.",
      "Social energy and emotional openness begin rebuilding from today.",
    ],
    actionTip: [
      "Good day to plan ahead — your capacity for focused work is growing.",
      "Tackle something you've been putting off — your capacity is rebuilding.",
      "Use today to plan the week ahead while mental energy is rising.",
    ],
    tomorrowPreview: [
      "Day 7 brings continued energy and mood improvement.",
      "Tomorrow continues the upward trajectory in energy and clarity.",
      "Day 7 builds on today — energy and focus keep climbing.",
    ],
    energyLevel: "rising",
    focusLevel: "moderate",
  },
  {
    cycleDay: 7,
    phase: "follicular",
    hormoneNote: [
      "Estrogen rises steadily — follicles are developing toward ovulation.",
      "Follicular development is accelerating as estrogen keeps climbing today.",
      "Estrogen builds momentum today — you're in the heart of your recovery window.",
    ],
    physicalExpectation: [
      "Physical energy is returning consistently and fatigue is mostly gone.",
      "Stamina and physical drive are noticeably stronger than last week.",
      "Body feels increasingly capable today as the menstrual fatigue fully clears.",
    ],
    mentalExpectation: [
      "Focus and motivation are noticeably sharper than last week.",
      "Mental drive is real today — estrogen is actively boosting cognition.",
      "This is a productive thinking day; use it for real work.",
    ],
    emotionalNote: [
      "Mood and emotional resilience continue improving with rising estrogen today.",
      "Emotional tone is solidly positive and getting better each day this week.",
      "Emotional stability is high today — social interactions feel easier.",
    ],
    actionTip: [
      "Tackle moderate tasks today — energy is steady enough for real work.",
      "Push slightly past comfort today; your body is ready for more.",
      "Moderate-intensity exercise or demanding cognitive tasks suit today well.",
    ],
    tomorrowPreview: [
      "Day 8 brings even steadier energy as estrogen continues climbing.",
      "Tomorrow continues the performance build toward your monthly peak.",
      "Day 8 is where the follicular phase really hits its stride.",
    ],
    energyLevel: "rising",
    focusLevel: "good",
  },
  {
    cycleDay: 8,
    phase: "follicular",
    hormoneNote: [
      "Estrogen is building steadily — your body is moving toward ovulation.",
      "Estrogen continues climbing; ovulation is still about a week away.",
      "Rising estrogen is supporting improving energy and mental clarity.",
    ],
    physicalExpectation: [
      "Physical energy is getting noticeably stronger each day now.",
      "Stamina is building — you may feel more capable than earlier this week.",
      "Your body is gaining momentum — physical tasks feel easier than a few days ago.",
    ],
    mentalExpectation: [
      "Focus is improving — concentration feels more reliable than last week.",
      "Mental clarity is building — decision-making feels steadier today.",
      "Thinking is getting sharper each day as estrogen continues rising.",
    ],
    emotionalNote: [
      "Positive mood and emotional confidence are building gradually.",
      "Emotional warmth and social ease are growing stronger day by day.",
      "You may feel more emotionally grounded and socially comfortable today.",
    ],
    actionTip: [
      "Good day for focused work — your capacity is growing steadily.",
      "Use this window for tasks that need sustained attention or creativity.",
      "Moderate-to-demanding work suits today — your energy can handle it.",
    ],
    tomorrowPreview: [
      "Day 9 continues the upward energy and focus trend.",
      "Tomorrow keeps building — you're heading toward your stronger window.",
      "Day 9 brings improving focus as the pre-ovulatory window approaches.",
    ],
    energyLevel: "rising",
    focusLevel: "good",
  },
  {
    cycleDay: 9,
    phase: "follicular",
    hormoneNote: [
      "Estrogen continues its climb — ovulation is roughly five days away.",
      "Estrogen is building toward its peak — energy and clarity are improving.",
      "The pre-ovulatory estrogen rise is gaining momentum today.",
    ],
    physicalExpectation: [
      "Physical energy is improving — strength and endurance are building.",
      "Your body is getting stronger each day — demanding activity is becoming easier.",
      "Energy continues to build — you may feel more physically capable than yesterday.",
    ],
    mentalExpectation: [
      "Focus and verbal fluency are getting sharper as estrogen rises.",
      "Communication and clarity are improving — this window gets better each day.",
      "Mental sharpness is building — tasks that felt hard last week may feel easier now.",
    ],
    emotionalNote: [
      "Social confidence and emotional warmth are continuing to build.",
      "Emotional openness is growing — connection may feel more natural today.",
      "Mood is trending upward — you may feel more positive and engaged.",
    ],
    actionTip: [
      "Good time for collaborative work or conversations that need focus.",
      "Use today for tasks that benefit from improving clarity and social energy.",
      "Your growing energy suits moderately demanding work today.",
    ],
    tomorrowPreview: [
      "Day 10 is often when pre-ovulatory energy starts feeling strong.",
      "Energy and clarity typically keep improving over the next few days.",
      "Day 10 continues the build toward your stronger window this cycle.",
    ],
    energyLevel: "rising",
    focusLevel: "good",
  },
  {
    cycleDay: 10,
    phase: "follicular",
    hormoneNote: [
      "Estrogen is near its monthly peak — ovulation is approaching fast.",
      "Estrogen peaks today — this is the hormonal driver of your best performance.",
      "Pre-ovulatory estrogen surge peaks today — optimal function across all systems.",
    ],
    physicalExpectation: [
      "Energy and strength are at their highest point of this cycle.",
      "Physical performance peaks today — use this window for demanding activity.",
      "This is your strongest day physically — full energy reserves are available.",
    ],
    mentalExpectation: [
      "Thinking is sharpest and focus most reliable today.",
      "Cognitive function is at its monthly peak — everything clicks today.",
      "This is your best thinking day of the cycle — hard problems feel manageable.",
    ],
    emotionalNote: [
      "Peak estrogen supports the most positive mood of the month today.",
      "Emotional confidence and warmth peak today — you likely feel at your best.",
      "This is the most emotionally positive day of your cycle.",
    ],
    actionTip: [
      "Use this window for demanding work, intense exercise, or creative output.",
      "Maximize today — your performance window is at its widest right now.",
      "Tackle the hardest thing on your list today while conditions are optimal.",
    ],
    tomorrowPreview: [
      "Day 11 continues peak performance before the ovulation window opens.",
      "Tomorrow sustains peak levels before the ovulatory shift begins.",
      "Day 11 keeps peak energy and focus going for another day.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 11,
    phase: "follicular",
    hormoneNote: [
      "LH surge is building — ovulation is three to four days away.",
      "Luteinizing hormone begins its surge today; ovulation is imminent.",
      "Your body is preparing its LH peak — ovulation is days away.",
    ],
    physicalExpectation: [
      "Energy stays high but may plateau as ovulation approaches.",
      "Physical performance remains excellent today at its pre-ovulatory peak.",
      "Stamina and strength are still at their cycle high today.",
    ],
    mentalExpectation: [
      "Mental acuity and confidence remain at their monthly high today.",
      "Focus and decision-making remain sharply reliable today.",
      "Cognitive peak continues — this is still your best mental window.",
    ],
    emotionalNote: [
      "Emotional confidence and social ease remain at their monthly high today.",
      "Warmth and emotional openness are still at their peak today.",
      "Social energy and confidence are fully active — connect and engage today.",
    ],
    actionTip: [
      "Good day for negotiations, presentations, or high-stakes decisions.",
      "Use today for anything requiring confident communication or bold choices.",
      "High-leverage social or professional situations suit today perfectly.",
    ],
    tomorrowPreview: [
      "Day 12 marks the start of the pre-ovulatory transition.",
      "Tomorrow keeps peak levels while the ovulatory window nears.",
      "Day 12 is the last full follicular day before ovulation begins.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 12,
    phase: "follicular",
    hormoneNote: [
      "LH begins surging — ovulation is two to three days away.",
      "LH surge is accelerating — your most fertile window is opening.",
      "Hormonal signals for ovulation are intensifying today.",
    ],
    physicalExpectation: [
      "Energy is high and physical performance is near its monthly peak.",
      "Physical vitality remains strong as the ovulatory buildup peaks.",
      "Stamina and drive remain at their monthly best today.",
    ],
    mentalExpectation: [
      "Confidence and social energy are near their monthly peak today.",
      "Verbal and social sharpness are at their fullest expression today.",
      "Communication, creativity, and confidence all peak together today.",
    ],
    emotionalNote: [
      "Warmth, confidence, and emotional openness are near their strongest today.",
      "Emotional connection and social magnetism are at their monthly high.",
      "Openness and warmth peak today — meaningful conversations come easily.",
    ],
    actionTip: [
      "Leverage your peak social energy for important conversations today.",
      "Schedule critical meetings, negotiations, or social events today.",
      "Use today's peak openness for conversations that matter most.",
    ],
    tomorrowPreview: [
      "Day 13 is typically the last day before ovulation begins.",
      "Tomorrow is the final pre-ovulatory day — peak energy continues.",
      "Day 13 brings the last burst of follicular peak before ovulation.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 13,
    phase: "follicular",
    hormoneNote: [
      "LH surge is imminent — cervical mucus is at its clearest today.",
      "Ovulation is triggered by the LH spike — it is hours or a day away.",
      "The pre-ovulatory LH surge is at its peak — ovulation is imminent.",
    ],
    physicalExpectation: [
      "Physical energy is strong; you may feel a slight lower abdominal pull.",
      "Energy is still at its monthly peak with possible mild pelvic awareness.",
      "Physical vitality peaks today; some people notice light mittelschmerz.",
    ],
    mentalExpectation: [
      "Clarity and motivation remain at their monthly high today.",
      "Focus and confidence stay sharp on this final pre-ovulatory day.",
      "Mental acuity remains at peak — take full advantage today.",
    ],
    emotionalNote: [
      "Social and emotional energy are at their peak before ovulation.",
      "Emotional warmth and social drive are at their fullest today.",
      "Peak connection energy — social and relational moments feel natural today.",
    ],
    actionTip: [
      "Wrap up demanding tasks before ovulation shifts your energy tomorrow.",
      "Complete high-priority items today before the ovulatory shift begins.",
      "Finish demanding cognitive work before tomorrow's energy transition.",
    ],
    tomorrowPreview: [
      "Day 14 marks ovulation — your peak energy window opens.",
      "Tomorrow is ovulation — energy and confidence hit their monthly high.",
      "Day 14 brings the full ovulatory peak — the best day of your cycle.",
    ],
    energyLevel: "high",
    focusLevel: "good",
  },
  {
    cycleDay: 14,
    phase: "ovulation",
    hormoneNote: [
      "LH peaks today — ovulation is occurring right now.",
      "Ovulation is happening today — this is the LH surge apex.",
      "Your monthly hormonal peak arrives today with the LH surge.",
    ],
    physicalExpectation: [
      "Energy is at its monthly peak; some people feel a brief pelvic twinge.",
      "Physical vitality is at its absolute monthly high today.",
      "Body is at full capacity today — peak strength, stamina, and drive.",
    ],
    mentalExpectation: [
      "Confidence, clarity, and social drive all peak together today.",
      "Every cognitive dimension is at its best — focus, confidence, and speed.",
      "Mental sharpness and social confidence peak together on ovulation day.",
    ],
    emotionalNote: [
      "Emotional confidence peaks alongside LH — most people feel open and social today.",
      "Emotional warmth and connection are at their absolute monthly high today.",
      "Peak openness, warmth, and social energy all land on the same day.",
    ],
    actionTip: [
      "Use peak energy for demanding exercise, creative work, or big decisions.",
      "This is your highest-performance day — use it for what matters most.",
      "Tackle your biggest challenge today while conditions are at their peak.",
    ],
    tomorrowPreview: [
      "Day 15 energy stays high as the ovulation window continues.",
      "Tomorrow sustains peak levels as the ovulatory phase continues.",
      "Day 15 keeps the high going — energy and confidence remain strong.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 15,
    phase: "ovulation",
    hormoneNote: [
      "Estrogen starts dropping as progesterone rises post-ovulation today.",
      "Progesterone begins rising now as your body shifts post-ovulation.",
      "The post-ovulatory hormonal shift begins — progesterone takes over today.",
    ],
    physicalExpectation: [
      "Energy is still at its highest but the post-ovulation shift starts soon.",
      "Physical vitality remains strong today while the post-ovulatory drop begins.",
      "Energy is near its peak but the earliest signs of the luteal shift may arrive.",
    ],
    mentalExpectation: [
      "Peak social and verbal energy continues today before the luteal shift.",
      "Mental sharpness stays strong today — the best window is almost over.",
      "Focus and confidence remain high today before progesterone shifts the tone.",
    ],
    emotionalNote: [
      "High estrogen keeps emotional tone positive and socially energetic today.",
      "Emotional warmth and openness remain at their peak for one more day.",
      "Peak connection energy continues today before the post-ovulatory shift.",
    ],
    actionTip: [
      "Good day for anything requiring high energy or strong communication.",
      "Finish high-output tasks today before the energy transition begins.",
      "Use this last peak-energy day for anything that needs full capacity.",
    ],
    tomorrowPreview: [
      "Day 16 ends the ovulation window and energy begins its gradual decline.",
      "Tomorrow closes the ovulatory peak — the luteal shift begins.",
      "Day 16 is the final ovulation day before energy slowly starts declining.",
    ],
    energyLevel: "high",
    focusLevel: "sharp",
  },
  {
    cycleDay: 16,
    phase: "ovulation",
    hormoneNote: [
      "Progesterone begins rising — the luteal phase transition starts today.",
      "Progesterone takes charge today as the post-ovulatory phase begins.",
      "The hormone shift from estrogen-dominant to progesterone-dominant starts today.",
    ],
    physicalExpectation: [
      "Energy is strong today but the post-ovulatory shift begins now.",
      "Physical output remains solid today as the luteal transition begins.",
      "Energy peaks are behind you but today still feels strong and capable.",
    ],
    mentalExpectation: [
      "Focus remains good; emotional sensitivity may start increasing from today.",
      "Mental clarity is solid today with only the earliest signs of shifting.",
      "Cognitive function is still sharp — progesterone hasn't altered it much yet.",
    ],
    emotionalNote: [
      "Emotional warmth remains high but the luteal shift begins soon.",
      "Emotional tone is still open and positive as the phase transition begins.",
      "Warmth and connection energy remain strong today before the shift deepens.",
    ],
    actionTip: [
      "Wind down intense output before energy begins its natural decline.",
      "Shift toward completion and wrap-up rather than starting new projects today.",
      "Use today to close out high-effort work before luteal energy takes over.",
    ],
    tomorrowPreview: [
      "Day 17 starts the luteal phase — energy and mood shift gradually.",
      "Tomorrow begins the luteal phase — a steadier, calmer energy takes over.",
      "Day 17 opens the luteal phase with gradual but real changes beginning.",
    ],
    energyLevel: "high",
    focusLevel: "good",
  },
  {
    cycleDay: 17,
    phase: "luteal",
    hormoneNote: [
      "Progesterone rises steadily — your body is preparing for possible implantation.",
      "Progesterone dominates today, bringing its characteristic calming effect.",
      "Rising progesterone begins shifting your system toward the luteal rhythm.",
    ],
    physicalExpectation: [
      "Energy is still good but stamina feels slightly less reliable today.",
      "Physical capacity remains solid with only a subtle energy softening.",
      "You may notice energy is slightly less effortless than last week today.",
    ],
    mentalExpectation: [
      "Focus holds well today; mood is generally stable in early luteal.",
      "Thinking is clear and reliable today in this early luteal window.",
      "Cognitive function is still strong — early luteal is a productive phase.",
    ],
    emotionalNote: [
      "Progesterone's calming effect makes emotional steadiness solid today.",
      "Emotional stability is one of progesterone's benefits — today feels grounded.",
      "A sense of calm and emotional steadiness often accompanies early luteal.",
    ],
    actionTip: [
      "Shift to steady consistent work rather than high-intensity output today.",
      "Sustained focused effort suits today better than short intense bursts.",
      "Lower-key but reliable productivity is this phase's strong suit.",
    ],
    tomorrowPreview: [
      "Day 18 continues progesterone rise with mild physical changes beginning.",
      "Tomorrow brings continued stability with the first subtle physical changes.",
      "Day 18 brings deeper luteal shifts as progesterone keeps climbing.",
    ],
    energyLevel: "moderate",
    focusLevel: "good",
  },
  {
    cycleDay: 18,
    phase: "luteal",
    hormoneNote: [
      "Both estrogen and progesterone are elevated — body feels fuller today.",
      "Dual hormone elevation creates the characteristic mid-luteal fullness today.",
      "Estrogen and progesterone peak together — physical sensations intensify.",
    ],
    physicalExpectation: [
      "Mild bloating or breast tenderness may begin today.",
      "Some physical fullness or breast sensitivity may appear from today.",
      "Progesterone's physical effects — bloating, tenderness — may begin today.",
    ],
    mentalExpectation: [
      "Thinking is still clear; detail and analytical work feel reliable today.",
      "Analytical and detail-oriented thinking are strengths in this luteal window.",
      "Focus is reliable today — mid-luteal is good for systematic careful work.",
    ],
    emotionalNote: [
      "Progesterone's calming effect keeps emotional tone stable today.",
      "Emotional groundedness is a luteal strength — steady and controlled today.",
      "Mid-luteal emotional stability supports thoughtful, reflective work today.",
    ],
    actionTip: [
      "Detail-oriented tasks fit well today — analytical thinking is reliable.",
      "Good day for careful, systematic work — focus holds well in this phase.",
      "Route editing, analysis, or detail work to today when focus is reliable.",
    ],
    tomorrowPreview: [
      "Day 19 brings continued hormonal shifts with subtle mood changes.",
      "Tomorrow continues the progesterone peak with possible energy softening.",
      "Day 19 enters deeper luteal territory — subtle energy and mood shifts ahead.",
    ],
    energyLevel: "moderate",
    focusLevel: "good",
  },
  {
    cycleDay: 19,
    phase: "luteal",
    hormoneNote: [
      "Progesterone peaks around now — the highest point of your cycle.",
      "Progesterone is at its monthly peak today — its effects are most pronounced.",
      "Peak progesterone arrives today, bringing fullness and subtle slowdown.",
    ],
    physicalExpectation: [
      "Bloating and fatigue may feel more noticeable as progesterone peaks today.",
      "Physical fullness and mild fatigue often intensify at progesterone peak.",
      "Body heaviness and reduced energy capacity are expected at this point.",
    ],
    mentalExpectation: [
      "Thinking is calm but slightly slower — good for reflective or routine work.",
      "Mental pace slows naturally at progesterone peak — this is expected today.",
      "Calm, methodical thinking suits today better than fast-paced demands.",
    ],
    emotionalNote: [
      "Mood is generally calm today, though some people feel slightly flat.",
      "Emotional tone may feel muted or quietly introspective at this peak.",
      "Progesterone peak can bring emotional flatness or gentle calm — both normal.",
    ],
    actionTip: [
      "Steady lower-intensity work suits today better than fast-paced demands.",
      "Calm, unhurried tasks are your best fit today — avoid rushing.",
      "Methodical work and reflection fit the progesterone peak window well.",
    ],
    tomorrowPreview: [
      "Day 20 brings continued high progesterone with possible mild fatigue.",
      "Tomorrow continues the peak window with physical heaviness possible.",
      "Day 20 holds at the progesterone peak before hormones start declining.",
    ],
    energyLevel: "moderate",
    focusLevel: "moderate",
  },
  {
    cycleDay: 20,
    phase: "luteal",
    hormoneNote: [
      "Progesterone remains high — body temperature is slightly elevated today.",
      "Progesterone sustains its peak today; basal temperature is still elevated.",
      "High progesterone continues — the body is still in its post-ovulatory high.",
    ],
    physicalExpectation: [
      "Physical heaviness and mild fatigue are common today.",
      "Energy feels more limited today as progesterone holds at its peak.",
      "Lower stamina and mild physical sluggishness are expected today.",
    ],
    mentalExpectation: [
      "Mental energy feels slightly dampened by peak progesterone today.",
      "Cognitive speed is reduced today — slow and steady is the right approach.",
      "Thinking is steady but not sharp today; methodical work is well-matched.",
    ],
    emotionalNote: [
      "Emotional tone may feel muted or low-key as progesterone peaks today.",
      "Emotional expression may feel quieter than usual in this phase.",
      "Low-key emotional state is normal at progesterone peak — it lifts in a few days.",
    ],
    actionTip: [
      "Prioritize quality over quantity today, and protect your sleep tonight.",
      "Do fewer things better today, and invest in sleep quality tonight.",
      "Reduce volume today; protect your sleep window for tomorrow's recovery.",
    ],
    tomorrowPreview: [
      "Day 21 marks the transition toward late luteal and hormone decline.",
      "Tomorrow begins the hormone decline phase — PMS sensitivity increases.",
      "Day 21 enters the final luteal window as hormones start declining.",
    ],
    energyLevel: "moderate",
    focusLevel: "moderate",
  },
  {
    cycleDay: 21,
    phase: "luteal",
    hormoneNote: [
      "Estrogen and progesterone begin dropping if no pregnancy occurred today.",
      "Hormone levels start their pre-period decline today.",
      "Both hormones begin declining — the late luteal phase is starting.",
    ],
    physicalExpectation: [
      "Energy may feel less consistent as hormones begin their decline.",
      "Physical energy becomes more variable as the hormone drop begins.",
      "Stamina starts feeling less reliable today as hormones decline.",
    ],
    mentalExpectation: [
      "Mood and focus may feel more variable today as hormones shift.",
      "Thinking may feel less reliable today as estrogen starts declining.",
      "Mental steadiness begins to wobble as hormone levels drop today.",
    ],
    emotionalNote: [
      "Mood stability may begin fluctuating as estrogen and progesterone decline.",
      "Emotional tone becomes more variable as the late luteal phase opens.",
      "Emotional sensitivity starts rising today as hormones begin their fall.",
    ],
    actionTip: [
      "Protect your sleep window tonight — recovery matters more from here.",
      "Sleep quality becomes especially important from today through your period.",
      "Prioritize sleep tonight — it's the best tool for managing what's ahead.",
    ],
    tomorrowPreview: [
      "Day 22 enters the PMS-sensitive window — expect more variability.",
      "Tomorrow opens the PMS window — emotional sensitivity and fatigue increase.",
      "Day 22 begins the most variable and sensitive stretch of your cycle.",
    ],
    energyLevel: "declining",
    focusLevel: "moderate",
  },
  {
    cycleDay: 22,
    phase: "luteal",
    hormoneNote: [
      "Both estrogen and progesterone declining — PMS symptoms can begin today.",
      "Declining hormones trigger the classic PMS cluster of symptoms today.",
      "The pre-period hormone drop opens the PMS window from today.",
    ],
    physicalExpectation: [
      "Fatigue, bloating, and cravings may increase as hormones drop today.",
      "Physical PMS symptoms — bloating, fatigue, cravings — are possible from today.",
      "Expect increased physical discomfort as the hormone decline accelerates.",
    ],
    mentalExpectation: [
      "Decision-making feels harder today as estrogen drops — keep tasks simple.",
      "Mental sharpness is reduced today — low estrogen affects focus and clarity.",
      "Cognitive resilience dips today — routine work suits better than complex tasks.",
    ],
    emotionalNote: [
      "Low estrogen makes feelings run closer to the surface today.",
      "Emotional reactions may feel disproportionate today — this is hormonal.",
      "PMS emotional sensitivity peaks in this window — feelings are real but amplified.",
    ],
    actionTip: [
      "Reduce decision load today and schedule lighter tasks where possible.",
      "Keep your obligations light today and avoid high-stakes decisions.",
      "Simplify today's demands — lower load now prevents worse overwhelm later.",
    ],
    tomorrowPreview: [
      "Day 23 continues the hormone drop that drives PMS symptoms.",
      "Tomorrow deepens the PMS window — plan for lower energy and sensitivity.",
      "Day 23 continues the most sensitive stretch of your cycle.",
    ],
    energyLevel: "declining",
    focusLevel: "moderate",
  },
  {
    cycleDay: 23,
    phase: "luteal",
    hormoneNote: [
      "Estrogen keeps declining — serotonin tends to dip alongside it today.",
      "Falling estrogen pulls serotonin down with it — mood takes a real hit today.",
      "Estrogen decline directly reduces serotonin availability today.",
    ],
    physicalExpectation: [
      "Physical discomfort like headaches or bloating can increase today.",
      "PMS physical symptoms often intensify around day 23.",
      "Headaches, bloating, or joint aches are common today as hormones fall.",
    ],
    mentalExpectation: [
      "Mood may feel lower or more reactive than your usual baseline today.",
      "Low serotonin makes mood harder to regulate today — this is temporary.",
      "Emotional reactivity is higher than usual today as estrogen declines.",
    ],
    emotionalNote: [
      "Mood feels more reactive today as serotonin dips alongside estrogen.",
      "Emotional sensitivity peaks around day 23 for many people.",
      "Feelings run close to the surface today — small triggers land harder.",
    ],
    actionTip: [
      "Gentle movement and reduced screen time can support mood stability today.",
      "Short walks, less news, and quiet time help stabilize mood today.",
      "Limit stimulation today and add one gentle physical activity for mood support.",
    ],
    tomorrowPreview: [
      "Day 24 is often when PMS symptoms feel most noticeable.",
      "Tomorrow tends to be the peak PMS day — prepare for the hardest window.",
      "Day 24 is typically the most intense PMS day of the cycle.",
    ],
    energyLevel: "declining",
    focusLevel: "moderate",
  },
  {
    cycleDay: 24,
    phase: "luteal",
    hormoneNote: [
      "Hormones are near their pre-period low — cortisol sensitivity is highest now.",
      "Estrogen's near-zero level makes cortisol hit much harder today.",
      "Low estrogen amplifies the stress hormone response — you're more reactive today.",
    ],
    physicalExpectation: [
      "Bloating, breast tenderness, and fatigue often peak around day 24.",
      "Physical PMS symptoms are typically at their worst today.",
      "Day 24 brings the confluence of fatigue, bloating, and physical discomfort.",
    ],
    mentalExpectation: [
      "Stress hits harder than usual today because estrogen is very low.",
      "Cognitive resilience is at its lowest — avoid high-pressure demands today.",
      "Mental load feels heavier today; small problems feel much larger.",
    ],
    emotionalNote: [
      "Low hormone levels make emotional reactions stronger than usual today.",
      "Emotional intensity peaks today — reactions may feel out of proportion.",
      "This is the most emotionally amplified day of your cycle.",
    ],
    actionTip: [
      "Reduce commitments today — this is the hardest window of your cycle.",
      "Protect yourself from unnecessary stress today — it hits harder than normal.",
      "Cancel anything optional today; your resilience is at its monthly low.",
    ],
    tomorrowPreview: [
      "Day 25 continues peak PMS; your period is about four days away.",
      "Tomorrow stays in the hardest window — keep your schedule light.",
      "Day 25 continues the PMS peak — relief is coming but not yet.",
    ],
    energyLevel: "declining",
    focusLevel: "poor",
  },
  {
    cycleDay: 25,
    phase: "luteal",
    hormoneNote: [
      "Estrogen and progesterone near their lowest pre-period levels today.",
      "Both hormones are nearly at zero as your period approaches.",
      "Pre-period hormone floor is arriving — the cycle is completing.",
    ],
    physicalExpectation: [
      "Pre-period cramping, fatigue, or low back ache may begin today.",
      "Physical signals of the approaching period appear today for many.",
      "Low back ache, breast tenderness, or early cramps can start today.",
    ],
    mentalExpectation: [
      "Emotional load feels heavier and reactivity is elevated today.",
      "Mental fatigue is real today — even routine tasks need more effort.",
      "Focus is harder today as the pre-period hormone drop deepens.",
    ],
    emotionalNote: [
      "Pre-period hormonal drop can make emotions feel heavier today.",
      "Emotional heaviness and sensitivity are expected and normal today.",
      "Feelings feel larger and harder to manage today — this is hormonal.",
    ],
    actionTip: [
      "Prioritize sleep, hydration, and light activity over social obligations today.",
      "Rest, warmth, and minimal social demands are your best tools today.",
      "Low output, high recovery — that's the right approach for today.",
    ],
    tomorrowPreview: [
      "Day 26 stays in the hardest window — hold steady, relief is close.",
      "Tomorrow continues the pre-period window — hold steady.",
      "Day 26 stays in the PMS stretch but relief is only days away.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 26,
    phase: "luteal",
    hormoneNote: [
      "Hormone levels are very low — your body is preparing to shed the lining.",
      "Hormones have nearly bottomed out as your period prepares to arrive.",
      "The hormone low point is here — your body is ready to reset.",
    ],
    physicalExpectation: [
      "Pre-period symptoms like cramps or low back ache are common today.",
      "Early cramping or pelvic heaviness often intensifies on day 26.",
      "Physical pre-period symptoms are typically pronounced today.",
    ],
    mentalExpectation: [
      "Irritability and low mood often peak in this final luteal window.",
      "Low mood and short fuse are common today as the cycle nears its end.",
      "Mental and emotional irritability peak in this pre-period window.",
    ],
    emotionalNote: [
      "Irritability and emotional heaviness peak because estrogen is at its lowest.",
      "Emotional reactions are strongest today — the pre-period drop is at its deepest.",
      "This is typically the most irritable and emotionally heavy day of the cycle.",
    ],
    actionTip: [
      "Warm food, earlier sleep, and minimal decision-making support today.",
      "Warmth, nourishment, and minimal demands are the right prescription today.",
      "Protect your evening routine tonight — quality sleep is your priority.",
    ],
    tomorrowPreview: [
      "Day 27 — period is two days away; hold steady.",
      "Tomorrow is almost the end of the PMS stretch — one more day.",
      "Day 27 is nearly the last pre-period day before relief arrives.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 27,
    phase: "luteal",
    hormoneNote: [
      "Progesterone is near zero — uterine contractions may begin lightly today.",
      "Near-zero progesterone allows the uterine lining to begin detaching today.",
      "Both hormones are at their absolute cycle low — period is imminent.",
    ],
    physicalExpectation: [
      "Light cramping or spotting may appear today as your period nears.",
      "Early signs of your period — spotting or cramping — can appear today.",
      "Your period may technically start today — early signs are common.",
    ],
    mentalExpectation: [
      "Emotional sensitivity remains high today — small stressors feel disproportionate.",
      "Low mood and heightened sensitivity persist today through the final stretch.",
      "Mental resilience is still low today — protect yourself from unnecessary demands.",
    ],
    emotionalNote: [
      "Even small stressors can feel disproportionate today as hormones near zero.",
      "Emotional reactions are still amplified today — the pre-period edge is sharp.",
      "Irritability and emotional fragility remain high today — they lift soon.",
    ],
    actionTip: [
      "Keep your schedule light and prepare for your period arriving soon.",
      "Rest and prepare today — your period is almost here.",
      "Low demands today; prepare practically for your period arriving soon.",
    ],
    tomorrowPreview: [
      "Day 28 — period arrives very soon; relief follows within hours.",
      "Tomorrow is likely your last day before bleeding begins.",
      "Day 28 brings the pre-period peak — relief arrives when bleeding starts.",
    ],
    energyLevel: "low",
    focusLevel: "poor",
  },
  {
    cycleDay: 28,
    phase: "luteal",
    hormoneNote: [
      "All hormones are at their cycle low — your period is arriving soon.",
      "The cycle bottoms out today — your period is hours or a day away.",
      "Rock-bottom hormones signal the cycle's end and period's arrival.",
    ],
    physicalExpectation: [
      "Cramps or spotting signal your period is imminent today.",
      "Spotting or cramping intensifies today as your period approaches.",
      "The final pre-period day often brings the most intense pre-cramp signals.",
    ],
    mentalExpectation: [
      "Mental load often feels heaviest right before bleeding starts.",
      "Emotional and mental exhaustion peak today before the hormonal reset.",
      "The days before bleeding feel hardest mentally — relief comes with day 1.",
    ],
    emotionalNote: [
      "Emotional tension is highest right before bleeding — relief comes with day 1.",
      "Pre-period emotional buildup peaks today — it releases when bleeding begins.",
      "The most tightly wound emotional day; release comes with the start of bleeding.",
    ],
    actionTip: [
      "Rest, warmth, and gentle nutrition — relief comes when bleeding starts.",
      "Comfort, rest, and warmth today — your period brings relief very soon.",
      "Self-care today is medicine — your period and its relief are coming.",
    ],
    tomorrowPreview: [
      "Day 1 — your period begins and PMS relief usually follows within hours.",
      "Tomorrow is day 1 — bleeding brings a rapid hormonal reset and relief.",
      "The cycle begins again tomorrow — PMS ends when bleeding starts.",
    ],
    energyLevel: "very_low",
    focusLevel: "poor",
  },
];

/**
 * Returns cycle number (0-indexed) since a reference epoch.
 * Use cycleNumber % 3 as variantIndex for insight rotation.
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
 * variantIndex: 0 | 1 | 2, determined by cycleNumber % 3.
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
