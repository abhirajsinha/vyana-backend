import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 8000 })
  : null;

// ─── Circuit breaker for GPT calls ──────────────────────────────────────────
// After 5 consecutive failures, skip GPT for 5 minutes (serve drafts instead).

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;

let consecutiveFailures = 0;
let circuitOpenedAt: number | null = null;

export function isCircuitOpen(): boolean {
  if (circuitOpenedAt === null) return false;
  if (Date.now() - circuitOpenedAt >= CIRCUIT_COOLDOWN_MS) {
    // Cooldown elapsed — half-open: allow one attempt
    circuitOpenedAt = null;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

export function recordGptSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

export function recordGptFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuitOpenedAt === null) {
    circuitOpenedAt = Date.now();
    console.warn(JSON.stringify({ type: "circuit_breaker", status: "opened", failures: consecutiveFailures, timestamp: new Date().toISOString() }));
  }
}
