import { describe, expect, it } from 'vitest';

import { mergeOrganizations } from '../src/normalize/merge.js';
import type { CareMapOrganization } from '../src/types/caremap.js';

function makeOrganization(
    overrides: Partial<CareMapOrganization> = {},
): CareMapOrganization {
    return {
        organizationId: 'org_test',
        name: 'Test Organization',
        organizationType: 'health_ngo',
        healthAreas: [],
        services: [],
        serviceClaims: [],
        targetPopulation: [],
        locations: [{ country: 'Nigeria' }],
        access: { requirements: [] },
        evidence: [],
        evidenceStatus: 'not_publicly_verified',
        conflicts: [],
        sourceUrls: [],
        lastVerifiedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('mergeOrganizations', () => {
    it('marks the merge as conflicting when two sources disagree on referralRequired', () => {
        const first = makeOrganization({
            access: { requirements: ['referral'], referralRequired: true },
        });
        const second = makeOrganization({
            access: { requirements: [], referralRequired: false },
        });

        const merged = mergeOrganizations(first, second);

        expect(merged.evidenceStatus).toBe('conflicting');
        expect(merged.conflicts).toHaveLength(1);
        expect(merged.conflicts[0].field).toBe('referralRequired');
    });

    it('does not report a conflict when only one source states a value', () => {
        const first = makeOrganization({
            access: { requirements: [], appointmentRequired: true },
        });
        const second = makeOrganization({
            access: { requirements: [] },
        });

        const merged = mergeOrganizations(first, second);

        expect(merged.conflicts).toHaveLength(0);
        expect(merged.access.appointmentRequired).toBe(true);
    });

    it('carries conflicts forward across repeated merges', () => {
        const a = makeOrganization({
            access: { requirements: [], appointmentRequired: true },
        });
        const b = makeOrganization({
            access: { requirements: [], appointmentRequired: false },
        });
        const c = makeOrganization({
            access: { requirements: [] },
        });

        const ab = mergeOrganizations(a, b);
        const abc = mergeOrganizations(ab, c);

        expect(abc.conflicts).toHaveLength(1);
        expect(abc.evidenceStatus).toBe('conflicting');
    });
});