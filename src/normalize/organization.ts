import type {
    CareMapOrganization,
    EvidenceRecord,
    EvidenceStatus,
    ServiceClaim,
    SourceTier,
} from '../types/caremap.js';

import type { NgoBaseRecord } from '../sources/ngobase/crawler.js';
import { crawlOfficialWebsiteEvidence } from '../sources/official-website/crawler.js';
import type { ExtractedAccess } from '../extract/access.js';
import {
    extractServices,
    extractServiceEvidence,
    extractTargetPopulation,
} from '../extract/services.js';

function createOrganizationId(name: string): string {
    return `org_${name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80)}`;
}

function getSourceTier(sourceType: NgoBaseRecord['sourceType']): SourceTier {
    switch (sourceType) {
        case 'directory':
            return 'established_directory';
        default:
            return 'unverified';
    }
}

function createDirectoryEvidence(
    record: NgoBaseRecord,
    claim: string,
    status: EvidenceStatus,
    evidenceSnippet?: string,
): EvidenceRecord {
    return {
        claim,
        sourceUrl: record.sourceUrl,
        sourceType: record.sourceType,
        sourceTier: getSourceTier(record.sourceType),
        sourceTitle: 'NGOBase organization profile',
        evidenceSnippet,
        checkedAt: record.checkedAt,
        status,
    };
}

function mergeServiceClaims(
    directoryClaims: ServiceClaim[],
    websiteClaims: ServiceClaim[],
): ServiceClaim[] {
    const merged = new Map<string, ServiceClaim>();

    for (const claim of directoryClaims) {
        merged.set(claim.service, {
            ...claim,
            evidence: [...claim.evidence],
            evidenceStatus:
                claim.evidence.length > 0
                    ? 'source_backed'
                    : 'not_publicly_verified',
        });
    }

    for (const claim of websiteClaims) {
        const existing = merged.get(claim.service);

        if (!existing) {
            merged.set(claim.service, {
                ...claim,
                evidence: [...claim.evidence],
                evidenceStatus:
                    claim.evidence.length > 0
                        ? 'source_backed'
                        : 'not_publicly_verified',
            });
            continue;
        }

        const combinedEvidence = [
            ...existing.evidence,
            ...claim.evidence,
        ];

        const sourceTiers = new Set(
            combinedEvidence.map(
                (item) => item.sourceTier,
            ),
        );

        const independentlyCorroborated =
            sourceTiers.has('established_directory') &&
            sourceTiers.has('official_website');

        merged.set(claim.service, {
            ...existing,
            evidence: combinedEvidence,
            evidenceStatus: independentlyCorroborated
                ? 'independently_corroborated'
                : 'source_backed',
            access: claim.access ?? existing.access,
        });
    }

    return [...merged.values()];
}

function determineOrganizationEvidenceStatus(
    evidence: EvidenceRecord[],
): EvidenceStatus {
    if (evidence.length > 0) {
        return 'source_backed';
    }

    return 'not_publicly_verified';
}

export async function normalizeNgoBaseRecord(
    record: NgoBaseRecord,
    includeEvidence = true,
): Promise<CareMapOrganization> {
    const checkedAt = record.checkedAt;

    const directoryServices = extractServices(
        record.healthAreas,
        record.description,
    );
    const directoryServiceEvidence = extractServiceEvidence(
        record.healthAreas,
        record.description,
    );
    const targetPopulation = extractTargetPopulation(
        record.healthAreas,
        record.description,
    );

    const directoryOrganizationClaim =
        `${record.name} is listed by NGOBase as a health-related organization.`;

    const directoryEvidence = includeEvidence
        ? [
              createDirectoryEvidence(
                  record,
                  directoryOrganizationClaim,
                  'source_backed',
              ),
          ]
        : [];

    const directoryServiceClaims: ServiceClaim[] =
        directoryServices.map((service) => ({
            service,
            claim: `${record.name} is described by NGOBase as providing or working in ${service}.`,
            evidence: includeEvidence
                ? [
                      createDirectoryEvidence(
                          record,
                          `${record.name} is described by NGOBase as providing or working in ${service}.`,
                          'source_backed',
                          directoryServiceEvidence.get(service),
                      ),
                  ]
                : [],
            evidenceStatus: includeEvidence
                ? 'source_backed'
                : 'not_publicly_verified',
        }));

    let websiteEvidence: EvidenceRecord[] = [];
    let websiteServiceClaims: ServiceClaim[] = [];
    let websiteAccess: ExtractedAccess = { requirements: [] };

    if (includeEvidence && record.website) {
        const websiteResult = await crawlOfficialWebsiteEvidence(
            record.website,
            record.name,
            checkedAt,
        );

        websiteEvidence = websiteResult.evidence;
        websiteServiceClaims = websiteResult.serviceClaims;
        websiteAccess = websiteResult.access;
    }

    const evidence = [
        ...directoryEvidence,
        ...websiteEvidence,
    ];

    const serviceClaims = mergeServiceClaims(
        directoryServiceClaims,
        websiteServiceClaims,
    );

    const services = serviceClaims.map(
        (claim) => claim.service,
    );

    return {
        organizationId: createOrganizationId(record.name),
        name: record.name,
        organizationType: 'health_ngo',
        description: record.description,
        healthAreas: record.healthAreas,
        services,
        serviceClaims,
        targetPopulation,
        locations: [
            {
                city: record.location.city,
                state: record.location.state,
                country: record.location.country,
            },
        ],
        access: {
            website: record.website,
            phone: websiteAccess.phone,
            email: websiteAccess.email,
            appointmentRequired: websiteAccess.appointmentRequired,
            referralRequired: websiteAccess.referralRequired,
            requirements: websiteAccess.requirements,
        },
        evidence,
        evidenceStatus:
            determineOrganizationEvidenceStatus(evidence),
        sourceUrls: [
            record.sourceUrl,
            ...(record.website ? [record.website] : []),
        ],
        lastVerifiedAt: checkedAt,
    };
}
