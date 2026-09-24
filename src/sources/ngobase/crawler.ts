import { CheerioCrawler } from 'crawlee';

export interface NgoBaseRecord {
    name: string;
    profileUrl: string;
    description?: string;
    healthAreas: string[];
    location: {
        city?: string;
        state?: string;
        country: string;
    };
    website?: string;
    facebook?: string;
    sourceUrl: string;
    sourceType: 'directory';
    checkedAt: string;
}

const NATIONAL_START_URL =
    'https://' + 'ngobase.org/cwa/NG/HLT/health-ngos-charities-nigeria';

const LAGOS_START_URL =
    'https://' + 'www.ngobase.org/ci/NG.LA.LA/lagos-ngos-charities';

const NIGERIA_MATERNAL_HEALTH_URL =
    'https://' + 'ngobase.org/cswa/NG/HLT.MT/maternal-health-nigeria';

interface HealthAreaAliasConfig {
    // Multi-word or otherwise specific phrases: safe to match anywhere
    // (health-area tags or free-text description).
    strong: string[];
    // Generic single words that also show up in unrelated contexts
    // (e.g. "pregnant" describing a hunger-relief org's beneficiaries).
    // These only count when NGOBase itself tagged the org with that
    // health area — never from free-text description alone.
    weak: string[];
}

const HEALTH_AREA_ALIASES: Record<string, HealthAreaAliasConfig> = {
    'maternal health': {
        strong: [
            'maternal health',
            'maternal care',
            'maternal healthcare',
            'antenatal',
            'ante-natal',
            'postnatal',
            'post-natal',
            'reproductive health',
            'sexual and reproductive health',
            'family planning',
        ],
        weak: [
            'maternal',
            'maternity',
            'pregnancy',
            'pregnant',
            'women health',
            'women’s health',
            "women's health",
            'childbirth',
        ],
    },
    'reproductive health': {
        strong: [
            'reproductive health',
            'sexual and reproductive health',
            'family planning',
        ],
        weak: [
            'reproductive',
            'maternal',
            'pregnancy',
            'sexual health',
        ],
    },
    'child health': {
        strong: [
            'child health',
            'children health',
            'child healthcare',
            'paediatric',
            'pediatric',
            'immunization',
            'immunisation',
        ],
        weak: [
            'children',
            'childcare',
        ],
    },
    'mental health': {
        strong: [
            'mental health',
            'psychiatric',
            'psychosocial',
        ],
        weak: [
            'psychological',
        ],
    },
};

function matchesHealthArea(
    healthAreas: string[],
    description: string | undefined,
    healthArea: string,
): boolean {
    const healthAreaText = healthAreas.join(' ').toLowerCase();
    const fullText = `${healthAreaText} ${description ?? ''}`.toLowerCase();
    const query = healthArea.toLowerCase().trim();

    if (!query) return true;

    if (fullText.includes(query)) return true;

    const config = HEALTH_AREA_ALIASES[query];

    if (!config) return false;

    if (config.strong.some((term) => fullText.includes(term))) {
        return true;
    }

    return config.weak.some((term) => fullText.includes(term));
}

export async function crawlNgoBase(
    maxOrganizations = 10,
    healthArea = 'maternal health',
    location = 'Lagos',
): Promise<NgoBaseRecord[]> {
    const records: NgoBaseRecord[] = [];
    const seenProfiles = new Set<string>();
    const processedProfiles = new Set<string>();

    const normalizedLocation = location.toLowerCase().trim();
    const startUrl =
        normalizedLocation === 'lagos'
            ? LAGOS_START_URL
            : NATIONAL_START_URL;

    const discoveryLimit = Math.max(maxOrganizations * 3, 30);

    const crawler = new CheerioCrawler({
        maxConcurrency: 2,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 30,
        maxRequestsPerCrawl: Math.max(
            Math.min(maxOrganizations + 15, 40),
            20,
        ),

        async requestHandler({ $, request, enqueueLinks, log }) {
            const url = request.loadedUrl ?? request.url;

            if (url.includes('/profile/')) {
                if (processedProfiles.has(url)) return;

                processedProfiles.add(url);

                const name = $('h1.ngo-profile-heading [itemprop="name"]')
                    .first()
                    .text()
                    .trim();

                if (!name) return;

                const description = $('.detailed-work-description-para')
                    .first()
                    .text()
                    .trim();

                const city = $('meta[itemprop="addressLocality"]')
                    .attr('content')
                    ?.trim();

                const state = $('meta[itemprop="addressRegion"]')
                    .attr('content')
                    ?.trim();

                const country = $('meta[itemprop="addressCountry"]')
                    .attr('content')
                    ?.trim();

                const locationRecord = {
                    city,
                    state,
                    country: country || 'Nigeria',
                };

                const locationValues = [
                    city,
                    state,
                    locationRecord.country,
                ].filter((value): value is string => Boolean(value));

                const healthAreas = $('.sub-work-area .focus-area-link')
                    .map((_, element) => $(element).text().trim())
                    .get()
                    .filter(Boolean);

                if (
                    !matchesHealthArea(
                        healthAreas,
                        description,
                        healthArea,
                    )
                ) {
                    return;
                }

                if (
                    normalizedLocation &&
                    !locationValues.some((value) =>
                        value.toLowerCase().includes(normalizedLocation),
                    )
                ) {
                    return;
                }

                const website = $('a[itemprop="url"]')
                    .map((_, element) => $(element).attr('href'))
                    .get()
                    .find(
                        (href) =>
                            href && !href.includes('facebook.com'),
                    );

                const facebook = $('a[itemprop="url"]')
                    .map((_, element) => $(element).attr('href'))
                    .get()
                    .find((href) => href?.includes('facebook.com'));

                const profileUrl = url;

                if (seenProfiles.has(profileUrl)) return;

                seenProfiles.add(profileUrl);

                if (records.length >= maxOrganizations) return;

                records.push({
                    name,
                    profileUrl,
                    description: description || undefined,
                    healthAreas: [...new Set(healthAreas)],
                    location: locationRecord,
                    website,
                    facebook,
                    sourceUrl: profileUrl,
                    sourceType: 'directory',
                    checkedAt: new Date().toISOString(),
                });

                log.info('Extracted matching organization', {
                    name,
                    healthArea,
                    location,
                    profileUrl,
                });

                return;
            }

            const profileUrls = $('a[href*="/profile/"]')
                .map((_, element) => $(element).attr('href'))
                .get()
                .filter((href): href is string => Boolean(href));

            const uniqueProfileUrls = [
                ...new Set(
                    profileUrls.map((href) => {
                        const normalized = new URL(href, url);

                        if (normalized.hostname === 'ngobase.org') {
                            normalized.hostname = 'www.ngobase.org';
                        }

                        return normalized.toString();
                    }),
                ),
            ];

            const remainingCandidates = Math.max(
                0,
                discoveryLimit - processedProfiles.size,
            );

            if (remainingCandidates > 0) {
                await enqueueLinks({
                    urls: uniqueProfileUrls.slice(
                        0,
                        remainingCandidates,
                    ),
                    label: 'PROFILE',
                });

                const nextPage = $('a[href*="page="]')
                    .map((_, element) => $(element).attr('href'))
                    .get()
                    .map((href) => new URL(href, url).toString())
                    .find((href) => {
                        const page = Number(
                            new URL(href).searchParams.get('page'),
                        );

                        const currentPage = Number(
                            new URL(url).searchParams.get('page') ?? '1',
                        );

                        return page === currentPage + 1;
                    });

                if (nextPage && processedProfiles.size < discoveryLimit) {
                    await enqueueLinks({
                        urls: [nextPage],
                        label: 'CATEGORY',
                    });
                }
            }

            log.info('Discovered organization profiles', {
                count: uniqueProfileUrls.length,
                url,
            });
        },
    });

    const startUrls =
        healthArea.toLowerCase().trim() === 'maternal health'
            ? [NIGERIA_MATERNAL_HEALTH_URL, startUrl]
            : [startUrl];

    await crawler.run(startUrls);

    return records.slice(0, maxOrganizations);
}
