import type { Phase } from "./cycleEngine";

export interface NotificationTemplate {
  title: string;
  body: string;
}

const PHASE_TEMPLATES: Record<Phase, NotificationTemplate[]> = {
  menstrual: [
    { title: "How's today feeling?", body: "A quick log helps build your rhythm." },
    { title: "Check in with yourself", body: "Even a few taps make a difference." },
    { title: "Your cycle is listening", body: "Log what you're noticing today." },
  ],
  follicular: [
    { title: "Energy shifting?", body: "Log how you're feeling — it builds your picture." },
    { title: "Things might feel different", body: "Capture what's showing up today." },
    { title: "Your rhythm is forming", body: "A quick check-in keeps it accurate." },
  ],
  ovulation: [
    { title: "How are things today?", body: "This part of your cycle is useful to track." },
    { title: "Quick check-in", body: "A few taps now, better insights tomorrow." },
    { title: "Noticing anything?", body: "Log it — even the small stuff matters." },
  ],
  luteal: [
    { title: "How are you holding up?", body: "Tracking now helps us understand this stretch." },
    { title: "Worth noting", body: "What you're feeling today is useful data." },
    { title: "Check in", body: "Even a quick log makes your next cycle smarter." },
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
