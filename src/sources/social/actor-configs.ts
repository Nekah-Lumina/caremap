/**
 * Fallback chains for social-mention search. Each platform lists Actors in
 * priority order, the first one that runs successfully and returns items
 * wins; if it fails or returns nothing, the next one in the list is tried.
 *
 * Input field names below are verified against each Actor's real Input
 * tab (not guessed). Output/dataset field names are still best-effort where
 * no output sample was available — mapItems uses genericTextField's
 * multi-key fallback specifically to absorb that remaining uncertainty, so
 * a wrong guess there degrades gracefully (empty snippet) rather than
 * throwing.
 *
 */

export interface SocialSearchResult {
    url: string;
    snippet: string;
    author?: string;
    postedAt?: string;
}

export interface SocialActorConfig {
    actorId: string;
    buildInput: (query: string, maxResults: number) => Record<string, unknown>;
    mapItems: (items: Record<string, unknown>[]) => SocialSearchResult[];
}

const genericTextField = (item: Record<string, unknown>, ...keys: string[]): string | undefined => {
    for (const key of keys) {
        const value = item[key];
        if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
};

/**
 * Only one verified keyword-search Actor for Facebook came out of the
 * research, scraper_one/facebook-posts-search. No second true
 * keyword-search Facebook Actor was confirmed, so this chain is
 * single-entry rather than the multi-Actor redundancy the other two
 * platforms get. If you find and verify a second one, add it here.
 */
export const FACEBOOK_SEARCH_ACTORS: SocialActorConfig[] = [
    {
        actorId: 'scraper_one/facebook-posts-search',
        buildInput: (query, maxResults) => ({
            query,
            resultsCount: maxResults,
            searchType: 'latest', 
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url', 'postUrl') ?? '',
                snippet: genericTextField(item, 'text', 'content', 'message') ?? '',
                author: genericTextField(item, 'author', 'authorName'),
                postedAt: genericTextField(item, 'publicationDate', 'date'),
            })).filter((r) => r.url),
    },
];

export const TWITTER_SEARCH_ACTORS: SocialActorConfig[] = [
    {
        actorId: 'apidojo/tweet-scraper',
        buildInput: (query, maxResults) => ({
            searchTerms: [query],
            maxItems: maxResults,
            sort: 'Latest',
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url', 'twitterUrl') ?? '',
                snippet: genericTextField(item, 'text', 'fullText') ?? '',
                author: genericTextField(item, 'author', 'username'),
                postedAt: genericTextField(item, 'createdAt', 'date'),
            })).filter((r) => r.url),
    },
    {
        actorId: 'apidojo/twitter-scraper-lite',
        buildInput: (query, maxResults) => ({
            searchTerms: [query],
            sort: 'Latest',
            maxItems: maxResults,
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url', 'twitterUrl') ?? '',
                snippet: genericTextField(item, 'text', 'fullText') ?? '',
                author: genericTextField(item, 'author', 'username'),
                postedAt: genericTextField(item, 'createdAt', 'date'),
            })).filter((r) => r.url),
    },
    {
        actorId: 'danek/twitter-scraper',
        // Verified fields: `query` (single string, not an array) and
        // `max_posts` (snake_case, required) — my earlier guess of
        // `maxTweets` was wrong and would have failed on every call.
        buildInput: (query, maxResults) => ({
            query,
            search_type: 'Latest',
            max_posts: maxResults,
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url', 'tweetUrl') ?? '',
                snippet: genericTextField(item, 'text', 'content') ?? '',
                author: genericTextField(item, 'author', 'username'),
                postedAt: genericTextField(item, 'date', 'timestamp'),
            })).filter((r) => r.url),
    },
];

export const INSTAGRAM_SEARCH_ACTORS: SocialActorConfig[] = [
    {
        actorId: 'apify/instagram-scraper',
        buildInput: (query, maxResults) => ({
            search: query,
            // 'user' search catches caption mentions of the org's name —
            // this is Apify's own documented recipe for brand-mention
            // detection ("set searchType to 'user'"). 'hashtag' would
            // only match literal #hashtags, which an org's name usually
            // isn't.
            searchType: 'user',
            resultsType: 'posts',
            resultsLimit: maxResults,
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url') ?? '',
                snippet: genericTextField(item, 'caption') ?? '',
                author: genericTextField(item, 'ownerUsername'),
                postedAt: genericTextField(item, 'timestamp'),
            })).filter((r) => r.url),
    },
    {
        actorId: 'apidojo/instagram-scraper',
        buildInput: (query, maxResults) => ({
            search: query,
            searchType: 'user',
            resultsType: 'posts',
            resultsLimit: maxResults,
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url') ?? '',
                snippet: genericTextField(item, 'caption', 'text') ?? '',
                author: genericTextField(item, 'ownerUsername', 'username'),
                postedAt: genericTextField(item, 'timestamp', 'date'),
            })).filter((r) => r.url),
    },
    {
        actorId: 'apify/instagram-api-scraper',
        buildInput: (query, maxResults) => ({
            search: query,
            searchType: 'user',
            resultsLimit: maxResults,
        }),
        mapItems: (items) =>
            items.map((item) => ({
                url: genericTextField(item, 'url') ?? '',
                snippet: genericTextField(item, 'caption') ?? '',
                author: genericTextField(item, 'ownerUsername'),
                postedAt: genericTextField(item, 'timestamp'),
            })).filter((r) => r.url),
    },
];