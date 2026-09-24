import { CheerioCrawler, RequestQueue } from 'crawlee';
import { extractAccess } from '../../extract/access.js';

import type {
    EvidenceRecord,
    EvidenceStatus,
    ServiceClaim,
} from '../../types/caremap.js';

const SERVICE_TERMS: Record<string, string[]> = {
    'antenatal care': [
        'antenatal',
        'ante-natal',
        'prenatal care',
        'pregnancy care',
    ],
    'postnatal care': [
        'postnatal',
        'post-natal',
        'postpartum care',
        'postpartum support',
    ],
    'maternal health': [
        'maternal health',
        'maternal care',
        'maternal healthcare',
    ],
    'reproductive health': [
        'reproductive health',
        'sexual and reproductive health',
        'sexual reproductive health',
    ],
    'family planning': [
        'family planning',
        'contraception',
        'contraceptive',
    ],
    'child health': [
        'child health',
        'children health',
        'child healthcare',
        'paediatric',
        'pediatric',
    ],
    'nutrition support': [
        'nutrition',
        'nutritional support',
        'food support',
        'malnutrition',
    ],
    immunization: [
        'immunization',
        'immunisation',
        'vaccination',
        'vaccines',
    ],
    'health education': [
        'health education',
        'health awareness',
        'health promotion',
        'community health education',
    ],
};

const RELEVANT_PAGE_TERMS = [
    'program',
    'programs',
    'programme',
    'programmes',
    'service',
    'services',
    'project',
    'projects',
    'our-work',
    'ourwork',
    'what-we-do',
    'whatwedo',
    'health',
    'maternal',
    'women',
    'children',
    'reproductive',
    'nutrition',
    'about',
];

const MAX_RELEVANT_PAGES = 5;

function normalizeWebsiteUrl(url: string): string | undefined {
    try {
        const parsed = new URL(url);

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return undefined;
        }

        parsed.hash = '';
        parsed.search = '';

        return parsed.toString();
    } catch {
        return undefined;
    }
}

function getWebsiteOrigin(url: string): string {
    return new URL(url).origin;
}

function isSameWebsite(
    url: string,
    origin: string,
): boolean {
    try {
        return new URL(url).origin === origin;
    } catch {
        return false;
    }
}

function scoreRelevantLink(
    href: string,
    text: string,
): number {
    const value = `${href} ${text}`.toLowerCase();

    return RELEVANT_PAGE_TERMS.reduce(
        (score, term) =>
            score + (value.includes(term) ? 1 : 0),
        0,
    );
}

function findServiceEvidence(
    text: string,
): Map<string, string> {
    const normalizedText = text.toLowerCase();
    const results = new Map<string, string>();

    for (const [service, terms] of Object.entries(
        SERVICE_TERMS,
    )) {
        const matchedTerm = terms.find((term) =>
            normalizedText.includes(term),
        );

        if (!matchedTerm) continue;

        const index = normalizedText.indexOf(matchedTerm);
        const start = Math.max(0, index - 180);
        const end = Math.min(
            text.length,
            index + matchedTerm.length + 220,
        );

        const snippet = text
            .slice(start, end)
            .replace(/\\s+/g, ' ')
            .trim();

        results.set(service, snippet);
    }

    return results;
}

interface PageEvidence {
    access: ReturnType<typeof extractAccess>;
    url: string;
    title: string;
    services: string[];
    serviceEvidence: Map<string, string>;
}

export async function crawlOfficialWebsiteEvidence(
    website: string,
    organizationName: string,
    checkedAt = new Date().toISOString(),
): Promise<{
    evidence: EvidenceRecord[];
    serviceClaims: ServiceClaim[];
    access: ReturnType<typeof extractAccess>;
}> {
    const startUrl = normalizeWebsiteUrl(website);

    if (!startUrl) {
        return {
            evidence: [],
            serviceClaims: [],
            access: { requirements: [] },
        };
    }

    const origin = getWebsiteOrigin(startUrl);

    const queueName = `caremap-official-${organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)}-${Date.now()}`;

    const requestQueue = await RequestQueue.open(queueName);

    const pagesToVisit = new Set<string>([startUrl]);
    const visitedPages = new Set<string>();
    const pageEvidence: PageEvidence[] = [];

    const crawler = new CheerioCrawler({
        requestQueue,
        maxConcurrency: 1,
        maxRequestRetries: 1,
        requestHandlerTimeoutSecs: 20,
        maxRequestsPerCrawl: MAX_RELEVANT_PAGES,

        async requestHandler({ $, request, enqueueLinks, log }) {
            const url = request.loadedUrl ?? request.url;

            if (visitedPages.has(url)) return;

            visitedPages.add(url);

            const title = $('title').first().text().trim();

            const description =
                $('meta[name="description"]')
                    .attr('content')
                    ?.trim() ?? '';

            const headings = $('h1, h2, h3')
                .map((_, element) => $(element).text().trim())
                .get()
                .filter(Boolean);

            const paragraphs = $('p')
                .map((_, element) => $(element).text().trim())
                .get()
                .filter(Boolean)
                .slice(0, 150);

            const text = [
                title,
                description,
                ...headings,
                ...paragraphs,
            ]
                .filter(Boolean)
                .join(' ');

            const serviceEvidence =
                findServiceEvidence(text);
            const access = extractAccess(text);

            pageEvidence.push({
                url,
                title,
                services: [...serviceEvidence.keys()],
                serviceEvidence,
                access,
            });

            if (url === startUrl) {
                const links = $('a[href]')
                    .map((_, element) => ({
                        href: $(element).attr('href'),
                        text: $(element).text().trim(),
                    }))
                    .get()
                    .filter(
                        (
                            link,
                        ): link is {
                            href: string;
                            text: string;
                        } => Boolean(link.href),
                    )
                    .map((link) => {
                        try {
                            return {
                                url: new URL(
                                    link.href,
                                    url,
                                ).toString(),
                                text: link.text,
                            };
                        } catch {
                            return undefined;
                        }
                    })
                    .filter(
                        (
                            link,
                        ): link is {
                            url: string;
                            text: string;
                        } => Boolean(link),
                    )
                    .filter((link) =>
                        isSameWebsite(link.url, origin),
                    );

                const rankedLinks = [
                    ...new Map(
                        links.map((link) => [
                            link.url,
                            link,
                        ]),
                    ).values(),
                ]
                    .filter(
                        (link) =>
                            link.url !== startUrl,
                    )
                    .map((link) => ({
                        ...link,
                        score: scoreRelevantLink(
                            link.url,
                            link.text,
                        ),
                    }))
                    .filter((link) => link.score > 0)
                    .sort(
                        (a, b) =>
                            b.score - a.score,
                    )
                    .slice(
                        0,
                        MAX_RELEVANT_PAGES - 1,
                    );

                for (const link of rankedLinks) {
                    pagesToVisit.add(link.url);
                }

                if (rankedLinks.length > 0) {
                    await enqueueLinks({
                        urls: rankedLinks.map((link) => link.url),
                    });
                }
            }

            log.info('Checked official website page', {
                organizationName,
                url,
                servicesFound: [...serviceEvidence.keys()],
            });
        },
    });

    try {
        await crawler.run([
            ...pagesToVisit,
        ]);
    } catch {
        return {
            evidence: [],
            serviceClaims: [],
            access: { requirements: [] },
        };
    }

    const evidence: EvidenceRecord[] = [];
    const serviceEvidence = new Map<
        string,
        EvidenceRecord[]
    >();

    for (const page of pageEvidence) {
        if (page.url === startUrl) {
            evidence.push({
                claim: `${organizationName} has a publicly accessible official website.`,
                sourceUrl: page.url,
                sourceType: 'official_website',
                sourceTier: 'official_website',
                sourceTitle:
                    page.title || organizationName,
                checkedAt,
                status: 'source_backed',
            });
        }

        for (const service of page.services) {
            const claim =
                `${organizationName}'s official website contains publicly accessible information related to ${service}.`;

            const record: EvidenceRecord = {
                claim,
                sourceUrl: page.url,
                sourceType: 'official_website',
                sourceTier: 'official_website',
                sourceTitle:
                    page.title || organizationName,
                evidenceSnippet:
                    page.serviceEvidence.get(service),
                checkedAt,
                status: 'source_backed',
            };

            const existing =
                serviceEvidence.get(service) ?? [];

            serviceEvidence.set(service, [
                ...existing,
                record,
            ]);
        }
    }

    const serviceClaims: ServiceClaim[] = [
        ...serviceEvidence.entries(),
    ].map(([service, serviceEvidenceRecords]) => ({
        service,
        claim: `${organizationName}'s official website contains publicly accessible information related to ${service}.`,
        evidence: serviceEvidenceRecords,
        evidenceStatus:
            'source_backed' as EvidenceStatus,
    }));

    const access = pageEvidence.reduce(
        (combined, page) => ({
            phone: combined.phone ?? page.access.phone,
            email: combined.email ?? page.access.email,
            appointmentRequired:
                combined.appointmentRequired ??
                page.access.appointmentRequired,
            referralRequired:
                combined.referralRequired ??
                page.access.referralRequired,
            requirements:
                combined.requirements.length > 0
                    ? combined.requirements
                    : page.access.requirements,
        }),
        { requirements: [] } as ReturnType<typeof extractAccess>,
    );

    return {
        evidence,
        serviceClaims,
        access,
    };
}
