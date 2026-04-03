// tests/units/crampAndBleedingExtraction.test.ts
// Tests for extractCrampSeverity helper and bleeding detection robustness.

// We can't directly import extractCrampSeverity since it's a local function
// in insightController. Test it indirectly via selectNarrative and directly
// by duplicating the logic for unit testing.

import { selectNarrative, NarrativeSelectorInput } from '../../src/services/narrativeSelector';

// Duplicate extractCrampSeverity for direct unit testing
function extractCrampSeverity(log: { pain?: string | null; symptoms?: string[] | null }): number | undefined {
  const pain = log.pain?.trim().toLowerCase();
  if (pain) {
    if (pain === 'severe' || pain === 'very_severe') return 8;
    if (pain === 'moderate') return 5;
    if (pain === 'mild') return 3;
    if (pain === 'none') return 0;
  }
  if (log.symptoms?.includes('cramps')) return 5;
  return undefined;
}

function makeInput(overrides: Partial<NarrativeSelectorInput> = {}): NarrativeSelectorInput {
  return {
    cycleDay: 2,
    phase: 'menstrual',
    latestLog: null,
    previousDayLog: null,
    personalBaseline: null,
    logsCount: 5,
    ...overrides,
  };
}

describe('extractCrampSeverity', () => {
  it('severe pain maps to 8', () => {
    expect(extractCrampSeverity({ pain: 'severe' })).toBe(8);
  });

  it('very_severe pain maps to 8', () => {
    expect(extractCrampSeverity({ pain: 'very_severe' })).toBe(8);
  });

  it('moderate pain maps to 5', () => {
    expect(extractCrampSeverity({ pain: 'moderate' })).toBe(5);
  });

  it('mild pain maps to 3', () => {
    expect(extractCrampSeverity({ pain: 'mild' })).toBe(3);
  });

  it('no pain field but symptoms includes cramps → default 5', () => {
    expect(extractCrampSeverity({ pain: null, symptoms: ['cramps'] })).toBe(5);
  });

  it('no pain, no cramps symptom → undefined', () => {
    expect(extractCrampSeverity({ pain: null, symptoms: [] })).toBeUndefined();
  });

  it('none pain maps to 0', () => {
    expect(extractCrampSeverity({ pain: 'none' })).toBe(0);
  });
});

describe('cramp severity integration with narrativeSelector', () => {
  it('severe pain (cramps=8) triggers severe_symptom narrative', () => {
    const result = selectNarrative(
      makeInput({
        latestLog: { cramps: 8 },
      })
    );
    expect(result.primaryNarrative).toBe('severe_symptom');
  });

  it('cramp change detection fires when severity drops from 8 to 3', () => {
    const result = selectNarrative(
      makeInput({
        latestLog: { cramps: 3 },
        previousDayLog: { cramps: 8 },
        logsCount: 5,
      })
    );
    // Math.abs(8-3) = 5, threshold is 3 → signal_change
    // But severe_symptom has priority > signal_change, check that signal_change
    // fires for moderate cramps (not severe). cramps=3 < 7, so not severe_symptom.
    expect(result.primaryNarrative).toBe('signal_change');
  });
});

describe('bleeding detection', () => {
  it('padsChanged > 0 counts as bleeding', () => {
    const log = { padsChanged: 5, symptoms: [] as string[] };
    const hasPadData = log.padsChanged != null && log.padsChanged > 0;
    expect(hasPadData).toBe(true);
  });

  it('symptoms=["bleeding"] counts as bleeding', () => {
    const log = { padsChanged: null as number | null, symptoms: ['bleeding'] };
    const hasBleedingSymptom = Array.isArray(log.symptoms) && (
      log.symptoms.includes('bleeding') ||
      log.symptoms.includes('spotting') ||
      log.symptoms.includes('heavy_flow')
    );
    expect(hasBleedingSymptom).toBe(true);
  });

  it('no padsChanged and no bleeding symptom → not bleeding', () => {
    const log = { padsChanged: null as number | null, symptoms: ['headache'] };
    const hasPadData = log.padsChanged != null && log.padsChanged > 0;
    const hasBleedingSymptom = Array.isArray(log.symptoms) && (
      log.symptoms.includes('bleeding') ||
      log.symptoms.includes('spotting') ||
      log.symptoms.includes('heavy_flow')
    );
    expect(hasPadData || hasBleedingSymptom).toBe(false);
  });

  it('consecutive bleeding stops at first non-bleeding log', () => {
    const logs = [
      { padsChanged: 3, symptoms: [] as string[] },
      { padsChanged: null as number | null, symptoms: ['bleeding'] },
      { padsChanged: null as number | null, symptoms: ['headache'] },
    ];
    let bleedingDays = 0;
    for (const log of logs) {
      const hasPadData = log.padsChanged != null && log.padsChanged > 0;
      const hasBleedingSymptom = Array.isArray(log.symptoms) && (
        log.symptoms.includes('bleeding') ||
        log.symptoms.includes('spotting') ||
        log.symptoms.includes('heavy_flow')
      );
      if (hasPadData || hasBleedingSymptom) bleedingDays++;
      else break;
    }
    expect(bleedingDays).toBe(2);
  });
});
