import type { Phase } from "./cycleEngine";

export interface NotificationTemplate {
  title: string;
  body: string;
}

const PHASE_TEMPLATES: Record<Phase, NotificationTemplate[]> = {
  menstrual: [
    { title: "How's your flow today?", body: "A quick check-in helps Vyana understand your pattern better." },
    { title: "Taking it easy?", body: "Log how you're feeling — it only takes a few seconds." },
  ],
  follicular: [
    { title: "How's your energy?", body: "This phase often brings a lift — let's see how it's going for you." },
    { title: "Feeling the shift?", body: "Log today so Vyana can track what's changing." },
  ],
  ovulation: [
    { title: "How are you feeling today?", body: "Energy and mood often peak around now — is that matching for you?" },
    { title: "Quick check-in", body: "A few taps now means better insights tomorrow." },
  ],
  luteal: [
    { title: "How are you holding up?", body: "This phase can feel heavier — logging helps us support you better." },
    { title: "Noticing any changes?", body: "Track your mood and energy so Vyana can spot patterns." },
  ],
};

const DELAYED_PERIOD_TEMPLATE: NotificationTemplate = {
  title: "Has your period started?",
  body: "Tap to update — it helps keep your cycle predictions accurate.",
};

const GENERIC_TEMPLATE: NotificationTemplate = {
  title: "How's your day going?",
  body: "A quick log helps Vyana learn your patterns.",
};

/**
 * Returns a notification template appropriate for the user's current state.
 * Rotates through available templates using cycleDay as a simple selector.
 */
export function getNotificationForUser(
  phase: Phase | null,
  cycleDay: number,
  isPeriodDelayed: boolean,
): NotificationTemplate {
  if (isPeriodDelayed) return DELAYED_PERIOD_TEMPLATE;
  if (!phase) return GENERIC_TEMPLATE;

  const templates = PHASE_TEMPLATES[phase];
  const idx = cycleDay % templates.length;
  return templates[idx];
}
