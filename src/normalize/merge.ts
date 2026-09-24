import type {
    CareMapOrganization,
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
        });
    }

    return [...merged.values()];
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

    const conflictingAccess =
        first.access.appointmentRequired !== undefined &&
        second.access.appointmentRequired !== undefined &&
        first.access.appointmentRequired !==
            second.access.appointmentRequired;

    const conflictingReferral =
        first.access.referralRequired !== undefined &&
        second.access.referralRequired !== undefined &&
        first.access.referralRequired !==
            second.access.referralRequired;

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
        evidenceStatus:
            conflictingAccess || conflictingReferral
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
