import {
    calculateNameSimilarity,
    normalizeOrganizationName,
} from './identity.js';

import type { CareMapOrganization } from '../types/caremap.js';

export interface EntityMatch {
    organization: CareMapOrganization;
    score: number;
    reasons: string[];
}

function normalizeWebsite(
    website?: string,
): string | undefined {
    if (!website) return undefined;

    try {
        return new URL(website).hostname
            .toLowerCase()
            .replace(/^www\./, '');
    } catch {
        return undefined;
    }
}

export function resolveOrganization(
    candidate: CareMapOrganization,
    existing: CareMapOrganization[],
): EntityMatch | null {
    let bestMatch: EntityMatch | null = null;

    for (const organization of existing) {
        let score = 0;
        const reasons: string[] = [];

        const nameSimilarity =
            calculateNameSimilarity(
                candidate.name,
                organization.name,
            );

        if (nameSimilarity >= 0.8) {
            score += 0.6;
            reasons.push('strong name match');
        } else if (nameSimilarity >= 0.5) {
            score += 0.35;
            reasons.push('partial name match');
        }

        const candidateWebsite =
            normalizeWebsite(candidate.access.website);

        const existingWebsite =
            normalizeWebsite(organization.access.website);

        if (
            candidateWebsite &&
            existingWebsite &&
            candidateWebsite === existingWebsite
        ) {
            score += 0.3;
            reasons.push('same website');
        }

        const candidateLocation =
            candidate.locations[0];

        const existingLocation =
            organization.locations[0];

        if (
            candidateLocation?.state &&
            existingLocation?.state &&
            candidateLocation.state.toLowerCase() ===
                existingLocation.state.toLowerCase()
        ) {
            score += 0.1;
            reasons.push('same state');
        }

        if (score < 0.7) continue;

        if (
            !bestMatch ||
            score > bestMatch.score
        ) {
            bestMatch = {
                organization,
                score,
                reasons,
            };
        }
    }

    return bestMatch;
}

export function getOrganizationIdentityKey(
    organization: CareMapOrganization,
): string {
    const website = normalizeWebsite(
        organization.access.website,
    );

    if (website) {
        return `website:${website}`;
    }

    return `name:${normalizeOrganizationName(
        organization.name,
    )}`;
}
