import { selectNarrative, NarrativeSelectorInput } from '../../src/services/narrativeSelector';

function makeInput(overrides: Partial<NarrativeSelectorInput> = {}): NarrativeSelectorInput {
  return {
    cycleDay: 14,
    phase: 'follicular',
    latestLog: null,
    previousDayLog: null,
    personalBaseline: null,
    logsCount: 0,
    ...overrides,
  };
}

describe('selectNarrative', () => {
  it('returns severe_symptom when cramps >= 7', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 2,
        phase: 'menstrual',
        latestLog: { cramps: 8 },
      })
    );
    expect(result.primaryNarrative).toBe('severe_symptom');
  });

  it('returns conflict when energy is low during follicular', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 9,
        phase: 'follicular',
        latestLog: { energy: 1 },
      })
    );
    expect(result.primaryNarrative).toBe('conflict');
    expect(result.conflictDetected).toBe(true);
    expect(result.conflictDescription).toContain('Low energy during follicular');
  });

  it('returns signal_change when cramps jump significantly', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 5,
        phase: 'menstrual',
        latestLog: { cramps: 6 },
        previousDayLog: { cramps: 2 },
      })
    );
    expect(result.primaryNarrative).toBe('signal_change');
  });

  it('returns phase as default when no signals logged', () => {
    const result = selectNarrative(
      makeInput({
        latestLog: null,
      })
    );
    expect(result.primaryNarrative).toBe('phase');
  });

  it('returns phase as default when everything is normal', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 8,
        phase: 'follicular',
        latestLog: { energy: 3, mood: 3, cramps: 2 },
      })
    );
    expect(result.primaryNarrative).toBe('phase');
  });

  it('returns escalation when bleeding > 7 days', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 9,
        phase: 'menstrual',
        latestLog: { cramps: 3 },
        bleedingDays: 8,
      })
    );
    expect(result.primaryNarrative).toBe('escalation');
  });

  it('computes trend correctly — cramps worsening', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 3,
        phase: 'menstrual',
        latestLog: { cramps: 6 },
        previousDayLog: { cramps: 3 },
      })
    );
    expect(result.trend.cramps).toBe('worsening');
  });

  it('computes trend correctly — energy improving', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 10,
        phase: 'follicular',
        latestLog: { energy: 4 },
        previousDayLog: { energy: 2 },
      })
    );
    expect(result.trend.energy).toBe('improving');
  });

  it('severe_symptom takes priority over conflict', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 10,
        phase: 'follicular',
        latestLog: { cramps: 8, energy: 1 },
      })
    );
    expect(result.primaryNarrative).toBe('severe_symptom');
  });

  it('conflict takes priority over signal_change', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 9,
        phase: 'follicular',
        latestLog: { energy: 2 },
        previousDayLog: { energy: 4 },
      })
    );
    expect(result.primaryNarrative).toBe('conflict');
  });

  it('conflict detected for high stress during follicular', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 7,
        phase: 'follicular',
        latestLog: { stress: 5 },
      })
    );
    expect(result.primaryNarrative).toBe('conflict');
    expect(result.conflictDetected).toBe(true);
    expect(result.conflictDescription).toContain('High stress during follicular');
  });

  it('conflict detected for low mood at ovulation', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 14,
        phase: 'ovulation',
        latestLog: { mood: 1 },
      })
    );
    expect(result.primaryNarrative).toBe('conflict');
    expect(result.conflictDetected).toBe(true);
    expect(result.conflictDescription).toContain('Low mood at ovulation');
  });

  it('conflict detected for high energy during late luteal', () => {
    const result = selectNarrative(
      makeInput({
        cycleDay: 26,
        phase: 'late_luteal',
        latestLog: { energy: 5 },
      })
    );
    expect(result.primaryNarrative).toBe('conflict');
    expect(result.conflictDetected).toBe(true);
    expect(result.conflictDescription).toContain('High energy during late luteal');
  });
});
