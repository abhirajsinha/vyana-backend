export interface TransitionWarmup {
  active: boolean;
  daysSinceTransition: number;
  daysRemaining: number;
  message: string;
  tip: string;
}

const WARMUP_DURATION_DAYS = 14;

export function buildTransitionWarmup(
  contraceptionChangedAt: Date | null,
): TransitionWarmup | null {
  if (!contraceptionChangedAt) return null;

  const daysSince = Math.floor(
    (Date.now() - contraceptionChangedAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSince >= WARMUP_DURATION_DAYS) return null;

  const daysRemaining = WARMUP_DURATION_DAYS - daysSince;

  let message: string;
  let tip: string;

  if (daysSince <= 3) {
    message =
      "Your insights are resetting to match your new contraception. " +
      "Keep logging daily — personalized patterns will return within 1–2 weeks.";
    tip =
      "The more you log right now, the faster your insights will feel like yours again.";
  } else if (daysSince <= 7) {
    message =
      "We're learning your new patterns. " +
      "Your insights will get more personal over the next week.";
    tip =
      "Logging mood, sleep, and stress daily gives us the strongest signal to work with.";
  } else {
    message =
      "Your personalized insights are almost ready. " +
      "A few more days of logging and we'll have a clear picture.";
    tip =
      "You're close — consistency now makes a real difference in accuracy.";
  }

  return {
    active: true,
    daysSinceTransition: daysSince,
    daysRemaining,
    message,
    tip,
  };
}
