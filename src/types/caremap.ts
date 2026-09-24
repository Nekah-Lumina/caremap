export type EvidenceStatus =
    | 'source_backed'
    | 'independently_corroborated'
    | 'conflicting'
    | 'stale'
    | 'not_publicly_verified';

export type SourceTier =
    | 'official_registry'
    | 'official_website'
    | 'official_social'
    | 'established_directory'
    | 'news_or_third_party'
    | 'unverified';

export interface CareMapInput {
    healthArea: string;
    location: string;
    maxOrganizations: number;
    includeEvidence: boolean;
}

export interface LocationRecord {
    state?: string;
    lga?: string;
    city?: string;
    address?: string;
    country: string;
}

export interface AccessInformation {
    accessType?: string;
    requirements?: string[];
    appointmentRequired?: boolean;
    referralRequired?: boolean;
    phone?: string;
    email?: string;
    website?: string;
}

export interface EvidenceRecord {
    claim: string;
    sourceUrl: string;
    sourceType: string;
    sourceTier: SourceTier;
    sourceTitle?: string;
    sourceDate?: string;
    evidenceSnippet?: string;
    checkedAt: string;
    status: EvidenceStatus;
}

export interface ServiceAccessInfo {
    appointmentRequired?: boolean;
    referralRequired?: boolean;
    requirements?: string[];
}

export interface ServiceClaim {
    service: string;
    claim: string;
    evidence: EvidenceRecord[];
    evidenceStatus: EvidenceStatus;
    access?: ServiceAccessInfo;
}

export interface CareMapOrganization {
    organizationId: string;
    name: string;
    organizationType: string;
    description?: string;
    healthAreas: string[];
    services: string[];
    serviceClaims: ServiceClaim[];
    targetPopulation: string[];
    locations: LocationRecord[];
    access: AccessInformation;
    evidence: EvidenceRecord[];
    evidenceStatus: EvidenceStatus;
    sourceUrls: string[];
    lastVerifiedAt: string;
}

export type FacilityType =
    | 'hospital'
    | 'clinic'
    | 'pharmacy'
    | 'laboratory'
    | 'imaging_centre'
    | 'health_centre'
    | 'other';

export interface CareMapFacility {
    facilityId: string;
    name: string;
    facilityType: FacilityType;
    description?: string;
    healthAreas: string[];
    services: string[];
    serviceClaims: ServiceClaim[];
    locations: LocationRecord[];
    access: AccessInformation;
    evidence: EvidenceRecord[];
    evidenceStatus: EvidenceStatus;
    sourceUrls: string[];
    lastVerifiedAt: string;
}
