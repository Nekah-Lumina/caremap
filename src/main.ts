import { Actor, log } from 'apify';

import { crawlNgoBase } from './sources/ngobase/crawler.js';
import { normalizeNgoBaseRecord } from './normalize/organization.js';
import { aggregateOrganizations } from './normalize/aggregate.js';
import type { CareMapInput } from './types/caremap.js';

await Actor.init();

const input = (await Actor.getInput<CareMapInput>()) ?? {
    healthArea: 'maternal health',
    location: 'Lagos',
    maxOrganizations: 25,
    includeEvidence: true,
};

log.info('Starting CAREMAP search', {
    healthArea: input.healthArea,
    location: input.location,
    maxOrganizations: input.maxOrganizations,
    includeEvidence: input.includeEvidence,
});

try {
    const sourceRecords = await crawlNgoBase(input.maxOrganizations, input.healthArea, input.location);

    log.info('NGOBase discovery completed', {
        recordsFound: sourceRecords.length,
    });

    const normalizedOrganizations = await Promise.all(
        sourceRecords.map((record) =>
            normalizeNgoBaseRecord(record, input.includeEvidence),
        ),
    );

    const aggregation = aggregateOrganizations(
        normalizedOrganizations,
    );

    for (const organization of aggregation.organizations) {
        await Actor.pushData(organization);
    }

    log.info('CAREMAP run completed', {
        recordsProduced: aggregation.organizations.length,
        duplicatesResolved: aggregation.duplicatesResolved,
    });
} catch (error) {
    log.error('CAREMAP run failed', {
        error: error instanceof Error ? error.message : String(error),
    });

    throw error;
} finally {
    await Actor.exit();
}
