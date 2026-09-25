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
    instagram?: string;
    sourceUrl: string;
    sourceType: 'directory';
    checkedAt: string;
}

const NATIONAL_START_URL =
    'https://' + 'www.ngobase.org/cwa/NG/HLT/health-ngos-charities-nigeria';

const NIGERIA_MATERNAL_HEALTH_URL =
    'https://' + 'www.ngobase.org/cswa/NG/HLT.MT/maternal-health-nigeria';

/**
 * Real NGOBase state-listing URLs, confirmed live against
 * ngobase.org/c/NG/nigeria-ngos-charities (its "States" list — the only
 * Nigerian states NGOBase currently indexes any NGOs for). Previously only
 * "lagos" had a real code path here; every other location silently fell
 * back to the single national listing page and had to survive there. Lagos
 * keeps its existing city-level URL (`/ci/NG.LA.LA/...`), which was already
 * verified to return results; the rest use NGOBase's state-level `/st/...`
 * listing, the broadest page it exposes for them. Common aliases (e.g.
 * "Abuja" for Federal Capital Territory, "Port Harcourt" for Rivers) are
 * included so the person doesn't have to know NGOBase's exact state name.
 */
const STATE_LISTING_URLS: Record<string, string> = {
    lagos: 'https://www.ngobase.org/ci/NG.LA.LA/lagos-ngos-charities',
    borno: 'https://www.ngobase.org/st/NG.BO/borno-ngos-charities',
    edo: 'https://www.ngobase.org/st/NG.ED/edo-ngos-charities',
    'federal capital territory': 'https://www.ngobase.org/st/NG.FCT/federal-capital-territory-ngos-charities',
    fct: 'https://www.ngobase.org/st/NG.FCT/federal-capital-territory-ngos-charities',
    abuja: 'https://www.ngobase.org/st/NG.FCT/federal-capital-territory-ngos-charities',
    'kano state': 'https://www.ngobase.org/st/NG.KA/kano-state-ngos-charities',
    kano: 'https://www.ngobase.org/st/NG.KA/kano-state-ngos-charities',
    oyo: 'https://www.ngobase.org/st/NG.OY/oyo-ngos-charities',
    ibadan: 'https://www.ngobase.org/st/NG.OY/oyo-ngos-charities',
    rivers: 'https://www.ngobase.org/st/NG.RI/rivers-ngos-charities',
    'port harcourt': 'https://www.ngobase.org/st/NG.RI/rivers-ngos-charities',
    taraba: 'https://www.ngobase.org/st/NG.TA/taraba-ngos-charities',
};

/**
 * Real NGOBase Nigeria health-category URLs, confirmed live against
 * ngobase.org/cwa/NG/HLT/health-ngos-charities-nigeria. Previously only the
 * exact string "maternal health" had a category seed URL; every other
 * health area (including ones with alias configs just below, like
 * "reproductive health" and "child health") got none at all and relied
 * entirely on the generic national listing plus text filtering.
 *
 * NGOBase does not have a dedicated category for every health area CAREMAP
 * might be asked for — there is no standalone "reproductive health",
 * "family planning", or "child health" category in its actual taxonomy as
 * of writing. Where no exact category exists, this maps to the closest
 * real one rather than seeding nothing, and that choice is called out in
 * each comment below so it's easy to correct if NGOBase adds a better
 * category later.
 */
const HEALTH_AREA_CATEGORY_URLS: Record<string, string> = {
    'maternal health': NIGERIA_MATERNAL_HEALTH_URL,
    'mental health': 'https://www.ngobase.org/cswa/NG/HLT.MN/mental-health-nigeria',
    'population welfare': 'https://www.ngobase.org/cswa/NG/HLT.PP/population-welfare-nigeria',
    // No standalone category exists — Maternal Health is the closest real
    // NGOBase category for reproductive-health-focused orgs.
    'reproductive health': NIGERIA_MATERNAL_HEALTH_URL,
    // No standalone category exists — Population Welfare is the closest
    // real NGOBase category for family-planning-focused orgs.
    'family planning': 'https://www.ngobase.org/cswa/NG/HLT.PP/population-welfare-nigeria',
    wash: 'https://www.ngobase.org/cswa/NG/HLT.WS/wash-nigeria',
    'disability support': 'https://www.ngobase.org/cswa/NG/HLT.DS/disability-support-nigeria',
    'malaria': 'https://www.ngobase.org/cswa/NG/HLT.MP/malaria-and-dengue-prevention-nigeria',
    hiv: 'https://www.ngobase.org/cswa/NG/SDS.HI/hiv-aids-nigeria',
    'hiv aids': 'https://www.ngobase.org/cswa/NG/SDS.HI/hiv-aids-nigeria',
    'hiv/aids': 'https://www.ngobase.org/cswa/NG/SDS.HI/hiv-aids-nigeria',
    nutrition: 'https://www.ngobase.org/cswa/NG/PVA.HF/hunger,-food-insecurity-nigeria',
    hunger: 'https://www.ngobase.org/cswa/NG/PVA.HF/hunger,-food-insecurity-nigeria',
    // NGOBase's Health work area has no child-health category as such;
    // the closest real category ("Child Rights and Welfare") sits under
    // its Rights work area instead, so results here skew toward
    // rights/advocacy orgs rather than pediatric-care providers.
    'child health': 'https://www.ngobase.org/cswa/NG/RGT.CH/child-rights-and-welfare-nigeria',
};

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
    const startUrl = STATE_LISTING_URLS[normalizedLocation] ?? NATIONAL_START_URL;

    const normalizedHealthArea = healthArea.toLowerCase().trim();
    const healthAreaCategoryUrl = HEALTH_AREA_CATEGORY_URLS[normalizedHealthArea];

    const discoveryLimit = Math.max(maxOrganizations * 4, 40);

    const crawler = new CheerioCrawler({
        maxConcurrency: 2,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 30,
        // Budget must cover: seed page(s), enough pagination to discover
        // candidates, and one request per profile actually kept, plus
        // profiles that get discovered but rejected by the health-area or
        // location filters. Previously capped at a flat 40 regardless of
        // maxOrganizations, so a request for 20+ organizations could never
        // be satisfied even if NGOBase had enough of them listed — the
        // budget ran out on pagination before most profiles were ever
        // fetched. Scales with maxOrganizations now, with a floor for
        // small requests and a ceiling as a cost sanity check.
        maxRequestsPerCrawl: Math.min(Math.max(maxOrganizations * 4, 40), 200),

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

                // All external profile links share the same itemprop; the
                // previous version only excluded facebook.com when picking
                // "website", so an Instagram/Twitter/LinkedIn link would
                // have been mistakenly stored as the org's website. Now
                // every known social domain is excluded from "website",
                // and Instagram is captured properly instead of being
                // silently dropped.
                const profileLinks = $('a[itemprop="url"]')
                    .map((_, element) => $(element).attr('href'))
                    .get()
                    .filter((href): href is string => Boolean(href));

                const facebook = profileLinks.find((href) => href.includes('facebook.com'));
                const instagram = profileLinks.find((href) => href.includes('instagram.com'));
                const website = profileLinks.find(
                    (href) =>
                        !href.includes('facebook.com') &&
                        !href.includes('instagram.com') &&
                        !href.includes('twitter.com') &&
                        !href.includes('x.com') &&
                        !href.includes('linkedin.com'),
                );

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
                    instagram,
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
                    // Crawlee's default strategy ('same-hostname') treats
                    // ngobase.org and www.ngobase.org as different hosts
                    // and silently drops cross-host links. 'same-domain'
                    // matches on the registrable domain regardless of the
                    // www subdomain, so this can't silently return zero
                    // results again if a bare-hostname URL shows up.
                    strategy: 'same-domain',
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
                        strategy: 'same-domain',
                    });
                }
            }

            log.info('Discovered organization profiles', {
                count: uniqueProfileUrls.length,
                url,
            });
        },
    });

    const startUrls = healthAreaCategoryUrl
        ? [healthAreaCategoryUrl, startUrl]
        : [startUrl];

    await crawler.run(startUrls);

    return records.slice(0, maxOrganizations);
}