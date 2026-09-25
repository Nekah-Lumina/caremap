import { describe, expect, it } from 'vitest';

import { extractAccess } from '../src/extract/access.js';

describe('extractAccess', () => {
    it('detects a Nigerian phone number and an email address', () => {
        const result = extractAccess(
            'Call us on 08012345678 or email info@example.org for details.',
        );

        expect(result.phone).toBe('08012345678');
        expect(result.email).toBe('info@example.org');
    });

    it('flags appointmentRequired for "by appointment"', () => {
        const result = extractAccess(
            'Consultations are by appointment only.',
        );

        expect(result.appointmentRequired).toBe(true);
        expect(result.requirements).toContain('appointment');
    });

    it('flags referralRequired for a clear referral phrase', () => {
        const result = extractAccess(
            'Patients need a referral from their GP before booking.',
        );

        expect(result.referralRequired).toBe(true);
        expect(result.requirements).toContain('referral');
    });

    it('does not flag referralRequired for unrelated uses of "refer"', () => {
        // Regression test: an earlier pattern matched the bare word
        // "refer" and false-positived on phrases like these.
        const result = extractAccess(
            'Please refer a friend to our programme, or refer to our brochure for more information.',
        );

        expect(result.referralRequired).toBeUndefined();
        expect(result.requirements).not.toContain('referral');
    });

    it('returns no requirements when the text says nothing about access', () => {
        const result = extractAccess(
            'We provide antenatal and postnatal care to mothers in Lagos.',
        );

        expect(result.appointmentRequired).toBeUndefined();
        expect(result.referralRequired).toBeUndefined();
        expect(result.requirements).toHaveLength(0);
    });
});