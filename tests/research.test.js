import { describe, it, expect } from 'vitest';
import { researchPrompt, extractPayload, checkProposals, sourceKind, researchTargets } from '../lib/engines/research.js';

const answer = `Voici ce que j'ai trouvé.
\`\`\`json
{"cocoa_war_room_data": [
 {"metric": "stocks", "region": "ICE_US", "value": 1820000, "previous": 1760000, "unit": "sacs", "period": "sem. 22 sept.", "published": "2026-09-26", "source": "ICE", "url": "https://www.ice.com/report/123", "quote": "Certified stocks: 1,820,000 bags as of Sep 26", "official": true},
 {"metric": "production", "region": "GH", "value": "650 000", "previous": 760000, "published": "2026-09-20", "source": "Reuters", "url": "https://www.reuters.com/x", "quote": "Ghana sees 650,000 tons", "official": true},
 {"metric": "stocks", "region": "MARS", "value": 1, "previous": 1, "url": "nope", "quote": ""}
]}
\`\`\``;

describe('research mission', () => {
  it('asks only for missing or stale data, with the strict format', () => {
    const p = researchPrompt([{ key: 'production', fresh: 'ok' }, { key: 'stocks', fresh: 'stale' }]);
    expect(p).toContain('metric "stocks"');
    expect(p).not.toContain('metric "production"');
    expect(p).toContain('cocoa_war_room_data');
    expect(researchTargets([]).every(t => t.state === 'manquante')).toBe(true);
  });
  it('extracts the JSON block from a chatty answer', () => {
    expect(extractPayload(answer)).toHaveLength(3);
    expect(() => extractPayload('rien du tout')).toThrow(/Aucun bloc/);
  });
  it('checks each proposal', () => {
    const [a, b, c] = checkProposals(extractPayload(answer), Date.parse('2026-09-28'));
    expect(a).toMatchObject({ ok: true, official: true, kind: 'official', value: 1820000 });
    expect(a.warnings).toEqual([]);
    expect(a.change).toBeCloseTo(3.41, 1);
    expect(b.ok).toBe(true);
    expect(b.value).toBe(650000);
    expect(b.official).toBe(false);
    expect(b.warnings.join()).toMatch(/officielle mais publiée par un média/);
    expect(c.ok).toBe(false);
    expect(c.errors.length).toBeGreaterThanOrEqual(3);
  });
  it('flags a figure missing from its quote and a future date', () => {
    const [x] = checkProposals([{ metric: 'grindings', region: 'EU', value: 350000, previous: 340000, published: '2030-01-01', url: 'https://eurococoa.org/q3', quote: 'Grindings rose 3%' }], Date.parse('2026-09-28'));
    expect(x.warnings.join()).toMatch(/n’apparaît pas/);
    expect(x.errors.join()).toMatch(/futur/);
  });
  it('classifies sources', () => {
    expect(sourceKind('https://www.icco.org/a')).toBe('official');
    expect(sourceKind('https://bloomberg.com/a')).toBe('press');
    expect(sourceKind('https://blog.example/a')).toBe('other');
    expect(sourceKind('pas un lien')).toBe('invalid');
  });
});
