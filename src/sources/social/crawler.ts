import { Actor, log } from 'apify';
import type { EvidenceRecord } from '../../types/caremap.js';
import { getNameTokens } from '../../normalize/identity.js';
import { createLimiter } from '../../lib/concurrency.js';
import {
    FACEBOOK_SEARCH_ACTORS,
    TWITTER_SEARCH_ACTORS,
    INSTAGRAM_SEARCH_ACTORS,
    type SocialActorConfig,
    type SocialSearchResult,
} from './actor-configs.js';

/**
 * Two different kinds of social evidence, kept separate on purpose:
 *
 * 1. Official page lookup (getFacebookEvidence / getInstagramEvidence) —
 *    "does this org run its own official page?" Tier: official_social.
 *    Only runs when we already discovered that page's URL elsewhere
 *    (NGOBase profile), so it never fabricates a page.
 *
 * 2. Mention search (searchMentions + the per-platform wrappers below) —
 *    "does anyone publicly mention this org doing health work?" Tier:
 *    news_or_third_party, since a keyword hit isn't the org's own voice.
 *    This runs for every org, using the org's name as the search query,
 *    and is what actually needed the multi-Actor fallback chains.
 */

const FACEBOOK_PAGE_ACTOR = 'apify/facebook-pages-scraper';
const INSTAGRAM_PROFILE_ACTOR = 'apify/instagram-profile-scraper';

const MAX_MENTIONS_PER_PLATFORM = 2; // keep runs fast/cheap for the demo

/**
 * Every Actor.call() this module makes — official-page lookups AND mention
 * search across all three platforms, for every organization in the run —
 * goes through this ONE shared limiter. The Sep 25 run log showed repeated
 * "you will exceed your limit of 5 concurrent Actor runs" failures because
 * getSocialEvidence() fired up to 5 Actor.call()s in parallel per org, with
 * multiple orgs also running in parallel from main.ts. A per-call or
 * per-org limiter wouldn't fix that — only a single limiter shared across
 * the whole run guarantees the true ceiling is respected. 3 is a
 * conservative default for a 5-slot account ceiling; raise it if the
 * account's plan allows more.
 */
const limit = createLimiter(3);

function callActor(actorId: string, input: Record<string, unknown>) {
    return limit(() => Actor.call(actorId, input));
}

/**
 * Rejects a mapped social-search result unless the organization's own
 * distinctive name tokens actually appear in it. This is the safety net
 * against fabricated evidence: a real run searching for "Lagos Food Bank
 * Initiative (LFBI)" returned Elon Musk's personal tweet timeline and, on
 * Facebook, posts about used Tesla car sales in Thailand — both totally
 * unrelated to the organization, but both would have been recorded as
 * "{org} is publicly mentioned in a {platform} post" evidence without this
 * check. Common noise words and very short tokens are excluded so e.g. an
 * org named "One Health Initiative" doesn't pass on the word "health"
 * alone.
 */
function isLikelyAboutOrganization(
    organizationName: string,
    result: SocialSearchResult,
): boolean {
    const tokens = getNameTokens(organizationName).filter((token) => token.length > 2);

    // Nothing distinctive to check against (e.g. a very short org name) —
    // don't block on a check that can't mean anything either way.
    if (tokens.length === 0) return true;

    const haystack = `${result.snippet} ${result.author ?? ''}`.toLowerCase();

    // No text to check at all: rather than assume it's relevant, treat a
    // result we can't verify as not verified. Better to under-report
    // evidence than fabricate it.
    if (!haystack.trim()) return false;

    const matched = tokens.filter((token) => haystack.includes(token));
    const requiredMatches = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);

    return matched.length >= requiredMatches;
}

async function getFacebookEvidence(
    facebookUrl: string,
    organizationName: string,
    checkedAt: string,
): Promise<EvidenceRecord | null> {
    const attempts = 2;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const run = await callActor(FACEBOOK_PAGE_ACTOR, {
                startUrls: [{ url: facebookUrl }],
            });

            const dataset = await Actor.openDataset(run.defaultDatasetId);
            const { items } = await dataset.getData();
            const page = items[0] as Record<string, unknown> | undefined;

            if (!page) return null;

            const about = typeof page.about === 'string' ? page.about : undefined;

            return {
                claim: `${organizationName} maintains an official Facebook page.`,
                sourceUrl: facebookUrl,
                sourceType: 'organization_social_account',
                sourceTier: 'official_social',
                sourceTitle: 'Official Facebook page',
                evidenceSnippet: about,
                checkedAt,
                status: 'source_backed',
            };
        } catch (err) {
            log.warning('Facebook page evidence lookup failed', {
                facebookUrl,
                attempt,
                attemptsRemaining: attempts - attempt,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    log.warning('Facebook page evidence lookup exhausted retries, skipping', { facebookUrl });
    return null;
}

async function getInstagramEvidence(
    instagramUrl: string,
    organizationName: string,
    checkedAt: string,
): Promise<EvidenceRecord | null> {
    try {
        const run = await callActor(INSTAGRAM_PROFILE_ACTOR, {
            usernames: [instagramUrl.replace(/\/+$/, '').split('/').pop()],
        });

        const dataset = await Actor.openDataset(run.defaultDatasetId);
        const { items } = await dataset.getData();
        const profile = items[0] as Record<string, unknown> | undefined;

        if (!profile) return null;

        const biography =
            typeof profile.biography === 'string' ? profile.biography : undefined;

        return {
            claim: `${organizationName} maintains an official Instagram page.`,
            sourceUrl: instagramUrl,
            sourceType: 'organization_social_account',
            sourceTier: 'official_social',
            sourceTitle: 'Official Instagram page',
            evidenceSnippet: biography,
            checkedAt,
            status: 'source_backed',
        };
    } catch (err) {
        log.warning('Instagram evidence lookup failed, skipping', {
            instagramUrl,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/**
 * Tries each Actor in the chain in order. Returns the first one that runs
 * without throwing AND returns at least one mapped result that actually
 * appears to be about the organization (see isLikelyAboutOrganization). A
 * validation error from a wrong input field, a deprecated Actor, an empty
 * result set, or a result set that's all irrelevant noise all fall through
 * to the next Actor the same way — irrelevant results are treated as a
 * miss, not a success, so they never get attached as evidence.
 */
async function runWithFallback(
    chain: SocialActorConfig[],
    query: string,
    maxResults: number,
    platformLabel: string,
    organizationName: string,
): Promise<SocialSearchResult[]> {
    for (const config of chain) {
        try {
            const run = await callActor(config.actorId, config.buildInput(query, maxResults));
            const dataset = await Actor.openDataset(run.defaultDatasetId);
            const { items } = await dataset.getData();
            const mapped = config.mapItems(items as Record<string, unknown>[]);
            const relevant = mapped.filter((result) => isLikelyAboutOrganization(organizationName, result));

            if (relevant.length > 0) {
                log.info(`${platformLabel} mention search succeeded`, {
                    actorId: config.actorId,
                    resultsFound: relevant.length,
                    resultsDiscarded: mapped.length - relevant.length,
                });
                return relevant;
            }

            log.info(`${platformLabel} Actor returned no relevant results, trying next in chain`, {
                actorId: config.actorId,
                rawResultsReturned: mapped.length,
            });
        } catch (err) {
            log.warning(`${platformLabel} Actor failed, trying next in chain`, {
                actorId: config.actorId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    log.warning(`${platformLabel} mention search exhausted the whole fallback chain with no relevant results`);
    return [];
}

function toMentionEvidence(
    results: SocialSearchResult[],
    organizationName: string,
    platformLabel: string,
    checkedAt: string,
): EvidenceRecord[] {
    return results.slice(0, MAX_MENTIONS_PER_PLATFORM).map((result) => ({
        claim: `${organizationName} is publicly mentioned in a ${platformLabel} post.`,
        sourceUrl: result.url,
        sourceType: `${platformLabel.toLowerCase()}_mention`,
        sourceTier: 'news_or_third_party',
        sourceTitle: result.author ? `${platformLabel} post by ${result.author}` : `${platformLabel} post`,
        sourceDate: result.postedAt,
        evidenceSnippet: result.snippet,
        checkedAt,
        status: 'source_backed',
    }));
}

/**
 * Returns evidence for whichever official social accounts the org actually
 * has on record, plus mention evidence found by searching the org's name
 * across Facebook, Twitter, and Instagram. Never fabricates a page that
 * wasn't already discovered from the directory/website sources, and never
 * attaches mention evidence that didn't pass the relevance check.
 */
export async function getSocialEvidence(
    organizationName: string,
    checkedAt: string,
    facebookUrl?: string,
    instagramUrl?: string,
): Promise<EvidenceRecord[]> {
    const [
        facebookPageEvidence,
        instagramPageEvidence,
        facebookMentions,
        twitterMentions,
        instagramMentions,
    ] = await Promise.all([
        facebookUrl
            ? getFacebookEvidence(facebookUrl, organizationName, checkedAt)
            : Promise.resolve(null),
        instagramUrl
            ? getInstagramEvidence(instagramUrl, organizationName, checkedAt)
            : Promise.resolve(null),
        runWithFallback(FACEBOOK_SEARCH_ACTORS, organizationName, MAX_MENTIONS_PER_PLATFORM, 'Facebook', organizationName),
        runWithFallback(TWITTER_SEARCH_ACTORS, organizationName, MAX_MENTIONS_PER_PLATFORM, 'Twitter', organizationName),
        runWithFallback(INSTAGRAM_SEARCH_ACTORS, organizationName, MAX_MENTIONS_PER_PLATFORM, 'Instagram', organizationName),
    ]);

    return [
        ...(facebookPageEvidence ? [facebookPageEvidence] : []),
        ...(instagramPageEvidence ? [instagramPageEvidence] : []),
        ...toMentionEvidence(facebookMentions, organizationName, 'Facebook', checkedAt),
        ...toMentionEvidence(twitterMentions, organizationName, 'Twitter', checkedAt),
        ...toMentionEvidence(instagramMentions, organizationName, 'Instagram', checkedAt),
    ];
}