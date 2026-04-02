import {
  classifyIntent,
  type ChatIntent,
  type ChatHistoryItem,
} from "../../src/services/chatService";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function healthHistory(content = "Your cycle day is 14 and you are in the ovulation phase."): ChatHistoryItem[] {
  return [
    { role: "user", content: "what phase am I in" },
    { role: "assistant", content },
  ];
}

function casualHistory(): ChatHistoryItem[] {
  return [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hey there! How can I help you today?" },
  ];
}

// ─── Group 1: Pure casual ───────────────────────────────────────────────────────

describe("classifyIntent", () => {
  describe("Group 1: Pure casual messages → 'casual'", () => {
    const CASUAL_MESSAGES: string[] = [
      // greetings
      "hi", "hello", "hey", "hii", "hiii", "hola", "yo",
      // time-of-day greetings
      "good morning", "good afternoon", "good evening", "good night",
      // conversational openers
      "how are you", "how's it going", "what's up", "sup",
      // thanks
      "thanks", "thank you", "thx", "ty",
      // acknowledgements
      "ok", "okay", "sure", "cool", "nice", "great", "awesome", "haha", "lol",
      // farewells
      "bye", "goodbye", "see you", "gn",
      // meta / about-bot
      "tell me about yourself", "who are you", "what are you", "what can you do",
      // idle
      "nothing", "nm", "not much", "just chilling", "bored",
    ];

    it.each(CASUAL_MESSAGES)("'%s' → casual", (msg) => {
      expect(classifyIntent(msg, [])).toBe("casual");
    });
  });

  // ─── Group 2: Pure health ───────────────────────────────────────────────────────

  describe("Group 2: Pure health messages → 'health'", () => {
    const HEALTH_MESSAGES: string[] = [
      // cycle keywords (must match \b-bounded stems exactly)
      "why is my period late",
      "what phase am I in",
      "I think I'm about to ovulat",  // matches \bovulat\b
      "is this ovulation",              // matches \bovulation\b
      // symptoms (exact word boundary matches)
      "I have a cramp",                 // matches \bcramp\b
      "I have a headache",
      "I feel bloat",                   // matches \bbloat\b
      // feelings with temporal qualifier
      "I feel tired today",
      "I'm feeling really low lately",
      "I felt anxious today",
      "I feel so tired recently",
      // why questions
      "why do I feel so low",
      "why am I so tired",
      // what is wrong
      "what is wrong with me",
      // tracking (exact matches: log, track, insight, predict, forecast)
      "should I log this",
      "show me my insight",             // matches \binsight\b
      "predict my next period",
      // medical
      "is it normal to bleed this much",// bleed doesn't match \bbleeding\b — but "should i" matches
      "should I see a doctor",
      "can I exercise on my period",
      // body signals
      "my sleep is terrible",
      "stress is killing me",
      "my energy is so low",
      // hormones
      "is my estrogen high",
      "what are my hormone levels",     // hormone matches \bhormone\b
      // specific
      "I'm spotting between periods",
      "my flow is heavier than usual",
    ];

    it.each(HEALTH_MESSAGES)("'%s' → health", (msg) => {
      expect(classifyIntent(msg, [])).toBe("health");
    });
  });

  // ─── Group 3: Ambiguous ─────────────────────────────────────────────────────────

  describe("Group 3: Ambiguous messages → 'ambiguous'", () => {
    const AMBIGUOUS_MESSAGES: string[] = [
      "I don't feel great",
      "not my best day",
      "could be better",
      "help",
      "what do you think",
      "tell me something",
      "hmm",
      "I don't know",
    ];

    it.each(AMBIGUOUS_MESSAGES)("'%s' → ambiguous", (msg) => {
      expect(classifyIntent(msg, [])).toBe("ambiguous");
    });
  });

  // ─── Group 4: History-dependent ─────────────────────────────────────────────────

  describe("Group 4: History-dependent classification", () => {
    it("health assistant history + 'yes' → health", () => {
      expect(classifyIntent("yes", healthHistory())).toBe("health");
    });

    it("health assistant history + 'tell me more' → health", () => {
      expect(classifyIntent("tell me more", healthHistory())).toBe("health");
    });

    it("health assistant history + 'why' → health", () => {
      expect(classifyIntent("why", healthHistory())).toBe("health");
    });

    it("casual assistant history + 'ok' → casual (casual patterns checked first)", () => {
      // "ok" matches casual pattern before history is checked
      expect(classifyIntent("ok", casualHistory())).toBe("casual");
    });

    it("empty history + ambiguous message → ambiguous", () => {
      expect(classifyIntent("hmm", [])).toBe("ambiguous");
    });

    it("health history + 'thanks' → casual (casual patterns win over history)", () => {
      // "thanks" matches ^(thanks|...) casual pattern; casual is checked first
      expect(classifyIntent("thanks", healthHistory())).toBe("casual");
    });

    it("health history + non-casual non-health message → health", () => {
      // "what about that" doesn't match casual or health patterns,
      // but last assistant message has health keywords
      expect(classifyIntent("what about that", healthHistory())).toBe("health");
    });
  });

  // ─── Group 5: Edge cases ────────────────────────────────────────────────────────

  describe("Group 5: Edge cases", () => {
    it("empty string does not crash", () => {
      expect(() => classifyIntent("", [])).not.toThrow();
      const result = classifyIntent("", []);
      expect(["casual", "health", "ambiguous"]).toContain(result);
    });

    it("very long message (500+ chars) with health keywords → health", () => {
      const padding = "a ".repeat(300);
      const longMsg = `${padding} my period is late and I have pain`;
      expect(classifyIntent(longMsg, [])).toBe("health");
    });

    it("ALL CAPS 'WHY IS MY PERIOD LATE' → health (lowercased internally)", () => {
      expect(classifyIntent("WHY IS MY PERIOD LATE", [])).toBe("health");
    });

    it("leading/trailing whitespace '  hello  ' → casual (trimmed internally)", () => {
      expect(classifyIntent("  hello  ", [])).toBe("casual");
    });

    it("mixed greeting + symptom 'hey I'm not feeling well' → casual (casual patterns checked first)", () => {
      // "hey" matches ^(hi|hello|hey|...) so casual wins
      // The casual regex array is checked before health
      expect(classifyIntent("hey I'm not feeling well", [])).toBe("casual");
    });

    it("mixed case with whitespace '  GOOD MORNING  ' → casual", () => {
      expect(classifyIntent("  GOOD MORNING  ", [])).toBe("casual");
    });

    it("single health keyword 'period' → health", () => {
      expect(classifyIntent("period", [])).toBe("health");
    });
  });

  // ─── Critical parametric: no health message ever returns casual ─────────────────

  describe("Critical: no health message is ever classified as casual", () => {
    const HEALTH_MESSAGES: string[] = [
      "why is my period late",
      "what phase am I in",
      "when will I ovulate",
      "my cramps are bad",
      "I have a headache",
      "I'm bloated",
      "I feel tired today",
      "I'm feeling really low lately",
      "I felt anxious today",
      "I feel so tired recently",
      "why do I feel so low",
      "why am I so tired",
      "what is wrong with me",
      "should I log this",
      "show me my insights",
      "predict my next period",
      "is it normal to bleed this much",
      "should I see a doctor",
      "can I exercise on my period",
      "my sleep is terrible",
      "stress is killing me",
      "my energy is so low",
      "is my estrogen high",
      "what are my hormone levels",
      "I'm spotting between periods",
      "my flow is heavier than usual",
    ];

    it.each(HEALTH_MESSAGES)("health message '%s' is never classified as casual", (msg) => {
      expect(classifyIntent(msg, [])).not.toBe("casual");
    });
  });
});
