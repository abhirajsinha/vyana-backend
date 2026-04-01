/**
 * Shared types and constants for cycle profile fields (`User.cycleLength`,
 * `User.contraceptiveMethod`). Keeps auth validation and `getCycleMode` in sync.
 */

export const CYCLE_LENGTH_MIN = 21;
export const CYCLE_LENGTH_MAX = 45;

/** Integer days allowed for `User.cycleLength` (matches API validation). */
export type CycleLengthDays =
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 39
  | 40
  | 41
  | 42
  | 43
  | 44
  | 45;

export function isCycleLengthDays(value: unknown): value is CycleLengthDays {
  const n = Number(value);
  return (
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= CYCLE_LENGTH_MIN &&
    n <= CYCLE_LENGTH_MAX
  );
}

/**
 * Legacy list for typing / validation helpers. `getCycleMode` uses
 * `isSuppressingNaturalCycle` in `contraceptionengine.ts` so it stays aligned
 * with `resolveContraceptionType` + `getContraceptionBehavior`.
 */
export const HORMONAL_CONTRACEPTIVE_METHODS = [
  "pill",
  "combined_pill",
  "mini_pill",
  "iud_hormonal",
  "implant",
  "injection",
  "patch",
  "ring",
] as const;

export type HormonalContraceptiveMethod = (typeof HORMONAL_CONTRACEPTIVE_METHODS)[number];

/** Application-level: known hormonal method or unset. */
export type ContraceptiveMethod = HormonalContraceptiveMethod | null;

export function isHormonalContraceptiveMethod(
  value: string | null | undefined,
): value is HormonalContraceptiveMethod {
  return (
    typeof value === "string" &&
    (HORMONAL_CONTRACEPTIVE_METHODS as readonly string[]).includes(value)
  );
}
