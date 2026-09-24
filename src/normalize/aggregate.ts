import type { CareMapOrganization } from '../types/caremap.js';
import { resolveOrganization } from './entity-resolution.js';
import { mergeOrganizations } from './merge.js';

export interface AggregationResult {
    organizations: CareMapOrganization[];
    duplicatesResolved: number;
}

export function aggregateOrganizations(
    organizations: CareMapOrganization[],
): AggregationResult {
    const uniqueOrganizations: CareMapOrganization[] = [];
    let duplicatesResolved = 0;

    for (const candidate of organizations) {
        const match = resolveOrganization(candidate, uniqueOrganizations);

        if (match) {
            duplicatesResolved += 1;

            const index =
                uniqueOrganizations.indexOf(match.organization);

            if (index !== -1) {
                uniqueOrganizations[index] =
                    mergeOrganizations(
                        match.organization,
                        candidate,
                    );
            }

            continue;
        }

        uniqueOrganizations.push(candidate);
    }

    return {
        organizations: uniqueOrganizations,
        duplicatesResolved,
    };
}
