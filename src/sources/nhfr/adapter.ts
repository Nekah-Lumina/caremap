import type {
    CareMapFacility,
    FacilityType,
} from '../../types/caremap.js';

export interface NhfrFacilityRecord {
    name: string;
    facilityType: FacilityType;
    state?: string;
    lga?: string;
    city?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    services?: string[];
    sourceUrl: string;
    checkedAt: string;
}

export function normalizeNhfrRecord(
    record: NhfrFacilityRecord,
): CareMapFacility {
    const facilityId = `facility_${record.name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80)}`;

    return {
        facilityId,
        name: record.name,
        facilityType: record.facilityType,
        healthAreas: [],
        services: record.services ?? [],
        serviceClaims: [],
        locations: [
            {
                state: record.state,
                lga: record.lga,
                city: record.city,
                address: record.address,
                country: 'Nigeria',
            },
        ],
        access: {
            phone: record.phone,
            email: record.email,
            website: record.website,
        },
        evidence: [
            {
                claim: `${record.name} is listed in the Nigeria Health Facility Registry.`,
                sourceUrl: record.sourceUrl,
                sourceType: 'official_registry',
                sourceTier: 'official_registry',
                checkedAt: record.checkedAt,
                status: 'source_backed',
            },
        ],
        evidenceStatus: 'source_backed',
        sourceUrls: [record.sourceUrl],
        lastVerifiedAt: record.checkedAt,
    };
}
