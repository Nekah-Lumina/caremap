import { Actor, log } from 'apify';
import type { EvidenceRecord } from '../../types/caremap.js';
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

async function getFacebookEvidence(
    facebookUrl: string,
    organizationName: string,
    checkedAt: string,
): Promise<EvidenceRecord | null> {
    try {
        const run = await Actor.call(FACEBOOK_PAGE_ACTOR, {
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
        log.warning('Facebook page evidence lookup failed, skipping', {
            facebookUrl,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

async function getInstagramEvidence(
    instagramUrl: string,
    organizationName: string,
    checkedAt: string,
): Promise<EvidenceRecord | null> {
    try {
        const run = await Actor.call(INSTAGRAM_PROFILE_ACTOR, {
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
 * without throwing AND returns at least one mapped result. A validation
 * error from a wrong input field, a deprecated Actor, or an empty result
 * set all fall through to the next Actor the same way.
 */
async function runWithFallback(
    chain: SocialActorConfig[],
    query: string,
    maxResults: number,
    platformLabel: string,
): Promise<SocialSearchResult[]> {
    for (const config of chain) {
        try {
            const run = await Actor.call(config.actorId, config.buildInput(query, maxResults));
            const dataset = await Actor.openDataset(run.defaultDatasetId);
            const { items } = await dataset.getData();
            const mapped = config.mapItems(items as Record<string, unknown>[]);

            if (mapped.length > 0) {
                log.info(`${platformLabel} mention search succeeded`, {
                    actorId: config.actorId,
                    resultsFound: mapped.length,
                });
                return mapped;
            }

            log.info(`${platformLabel} Actor returned no results, trying next in chain`, {
                actorId: config.actorId,
            });
        } catch (err) {
            log.warning(`${platformLabel} Actor failed, trying next in chain`, {
                actorId: config.actorId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    log.warning(`${platformLabel} mention search exhausted the whole fallback chain with no results`);
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
 * wasn't already discovered from the directory/website sources.
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
        runWithFallback(FACEBOOK_SEARCH_ACTORS, organizationName, MAX_MENTIONS_PER_PLATFORM, 'Facebook'),
        runWithFallback(TWITTER_SEARCH_ACTORS, organizationName, MAX_MENTIONS_PER_PLATFORM, 'Twitter'),
        runWithFallback(INSTAGRAM_SEARCH_ACTORS, organizationName, MAX_MENTIONS_PER_PLATFORM, 'Instagram'),
    ]);

    return [
        ...(facebookPageEvidence ? [facebookPageEvidence] : []),
        ...(instagramPageEvidence ? [instagramPageEvidence] : []),
        ...toMentionEvidence(facebookMentions, organizationName, 'Facebook', checkedAt),
        ...toMentionEvidence(twitterMentions, organizationName, 'Twitter', checkedAt),
        ...toMentionEvidence(instagramMentions, organizationName, 'Instagram', checkedAt),
    ];
}