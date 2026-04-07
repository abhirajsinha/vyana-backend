// src/services/aiService.ts — re-export barrel
// Logic has been split into chatService.ts and insightGptService.ts

export { askVyanaWithGpt, classifyIntent, type ChatHistoryItem } from "./chatService";
export {
  generateInsightsWithGpt,
  buildVyanaContextForInsights,
  buildFallbackContextBlock,
  sanitizeInsights,
  type InsightGenerationStatus,
} from "./insightGptService";
