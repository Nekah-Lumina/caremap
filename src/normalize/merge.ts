import type {
    CareMapOrganization,
    ConflictRecord,
    EvidenceStatus,
    ServiceClaim,
} from '../types/caremap.js';

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

function mergeServiceClaims(
    first: ServiceClaim[],
    second: ServiceClaim[],
): ServiceClaim[] {
    const merged = new Map<string, ServiceClaim>();

    for (const claim of [...first, ...second]) {
        const existing = merged.get(claim.service);

        if (!existing) {
            merged.set(claim.service, {
                ...claim,
                evidence: [...claim.evidence],
            });
            continue;
        }

        const evidence = [
            ...existing.evidence,
            ...claim.evidence,
        ];

        const sourceTiers = new Set(
            evidence.map((item) => item.sourceTier),
        );

        let evidenceStatus: EvidenceStatus =
            existing.evidenceStatus;

        if (
            sourceTiers.has('established_directory') &&
            sourceTiers.has('official_website')
        ) {
            evidenceStatus = 'independently_corroborated';
        } else if (evidence.length > 0) {
            evidenceStatus = 'source_backed';
        }

        merged.set(claim.service, {
            ...existing,
            claim: existing.claim || claim.claim,
            evidence,
            evidenceStatus,
            access: existing.access ?? claim.access,
        });
    }

    return [...merged.values()];
}

function describeRequirement(value: boolean | undefined): string {
    if (value === undefined) return 'not stated';
    return value ? 'required' : 'not required';
}

// Compares the two records' own access fields (not any conflicts they
// already carry from earlier merges) and returns one ConflictRecord per
// field where both sources state a value and those values disagree.
function detectAccessConflicts(
    first: CareMapOrganization,
    second: CareMapOrganization,
): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];

    if (
        first.access.appointmentRequired !== undefined &&
        second.access.appointmentRequired !== undefined &&
        first.access.appointmentRequired !==
            second.access.appointmentRequired
    ) {
        conflicts.push({
            field: 'appointmentRequired',
            description: `One source says an appointment is ${describeRequirement(
                first.access.appointmentRequired,
            )}, another source says it is ${describeRequirement(
                second.access.appointmentRequired,
            )}.`,
        });
    }

    if (
        first.access.referralRequired !== undefined &&
        second.access.referralRequired !== undefined &&
        first.access.referralRequired !==
            second.access.referralRequired
    ) {
        conflicts.push({
            field: 'referralRequired',
            description: `One source says a referral is ${describeRequirement(
                first.access.referralRequired,
            )}, another source says it is ${describeRequirement(
                second.access.referralRequired,
            )}.`,
        });
    }

    return conflicts;
}

export function mergeOrganizations(
    first: CareMapOrganization,
    second: CareMapOrganization,
): CareMapOrganization {
    const serviceClaims = mergeServiceClaims(
        first.serviceClaims,
        second.serviceClaims,
    );

    const evidence = [
        ...first.evidence,
        ...second.evidence,
    ];

    const sourceUrls = uniqueStrings([
        ...first.sourceUrls,
        ...second.sourceUrls,
    ]);

    const services = uniqueStrings([
        ...first.services,
        ...second.services,
        ...serviceClaims.map((claim) => claim.service),
    ]);

    const healthAreas = uniqueStrings([
        ...first.healthAreas,
        ...second.healthAreas,
    ]);

    const targetPopulation = uniqueStrings([
        ...first.targetPopulation,
        ...second.targetPopulation,
    ]);

    const locations = [
        ...first.locations,
        ...second.locations,
    ].filter(
        (location, index, all) =>
            index ===
            all.findIndex(
                (candidate) =>
                    candidate.state === location.state &&
                    candidate.lga === location.lga &&
                    candidate.city === location.city &&
                    candidate.address === location.address &&
                    candidate.country === location.country,
            ),
    );

    // Both records may already carry conflicts found in an earlier merge
    // (e.g. when a third duplicate is folded in later), so those are kept
    // alongside anything new found between `first` and `second` here.
    const conflicts: ConflictRecord[] = [
        ...first.conflicts,
        ...second.conflicts,
        ...detectAccessConflicts(first, second),
    ];

    return {
        ...first,
        description:
            first.description || second.description,
        healthAreas,
        services,
        serviceClaims,
        targetPopulation,
        locations,
        access: {
            website:
                first.access.website ||
                second.access.website,
            phone:
                first.access.phone ||
                second.access.phone,
            email:
                first.access.email ||
                second.access.email,
            appointmentRequired:
                first.access.appointmentRequired ??
                second.access.appointmentRequired,
            referralRequired:
                first.access.referralRequired ??
                second.access.referralRequired,
            requirements: uniqueStrings([
                ...(first.access.requirements ?? []),
                ...(second.access.requirements ?? []),
            ]),
        },
        evidence,
        conflicts,
        evidenceStatus:
            conflicts.length > 0
                ? 'conflicting'
                : evidence.length > 0
                  ? 'source_backed'
                  : 'not_publicly_verified',
        sourceUrls,
        lastVerifiedAt:
            first.lastVerifiedAt >= second.lastVerifiedAt
                ? first.lastVerifiedAt
                : second.lastVerifiedAt,
    };
}