export interface InteractionRuleInput {
  latestLog: {
    mood?: number;
    energy?: number;
    sleep?: number;
    stress?: number;
    cramps?: number;
    bleeding?: string;
  } | null;
  phase: string;
  cycleDay: number;
  trend: {
    energy?: 'improving' | 'worsening' | 'stable';
    cramps?: 'improving' | 'worsening' | 'stable';
  };
  consecutiveLowEnergyDays: number;
  bleedingActive: boolean;
}

export interface InteractionRuleOutput {
  overrideExplanation: string | null;
  amplifyMoodSensitivity: boolean;
  mechanismRequired: boolean;
  reinforcePositive: boolean;
}

export function evaluateInteractionRules(input: InteractionRuleInput): InteractionRuleOutput {
  const result: InteractionRuleOutput = {
    overrideExplanation: null,
    amplifyMoodSensitivity: false,
    mechanismRequired: false,
    reinforcePositive: false,
  };

  const log = input.latestLog;
  const sleep = log?.sleep;
  const stress = log?.stress;
  const energy = log?.energy;

  // Rule 1: SLEEP-FATIGUE OVERRIDE
  if (sleep !== undefined && sleep <= 2) {
    if (result.overrideExplanation === null) {
      result.overrideExplanation =
        "Your low sleep is likely the biggest factor in how you're feeling today — it overrides most hormonal effects";
    }
  }

  // Rule 2: STRESS-LUTEAL AMPLIFICATION
  // cycleEngine only produces "luteal" — mid/late both qualify
  if (
    stress !== undefined &&
    stress >= 4 &&
    input.phase === 'luteal'
  ) {
    result.amplifyMoodSensitivity = true;
  }

  // Rule 3: PAIN ESCALATION
  if (input.trend.cramps === 'worsening' && input.cycleDay <= 3) {
    result.mechanismRequired = true;
  }

  // Rule 4: ENERGY-PHASE POSITIVE REINFORCEMENT
  if (energy !== undefined && energy >= 4 && input.phase === 'follicular') {
    result.reinforcePositive = true;
  }

  // Rule 5: CUMULATIVE FATIGUE
  if (input.consecutiveLowEnergyDays >= 3 && input.bleedingActive) {
    if (result.overrideExplanation === null) {
      result.overrideExplanation =
        "You've had low energy for several days during your period — persistent fatigue during bleeding can sometimes relate to iron levels. Worth noting if this is a recurring pattern.";
    }
  }

  // Rule 6: STRESS-SLEEP COMPOUND
  if (stress !== undefined && stress >= 4 && sleep !== undefined && sleep <= 2) {
    if (result.overrideExplanation === null) {
      result.overrideExplanation =
        "High stress combined with poor sleep creates a compounding effect — your body is working harder to recover, which can make everything feel heavier today";
    }
  }

  return result;
}
