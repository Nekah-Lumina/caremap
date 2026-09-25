/**
 * Fallback chains for social-mention search. Each platform lists Actors in
 * priority order, the first one that runs successfully and returns items
 * wins; if it fails or returns nothing, the next one in the list is tried.
 *
 * FIELD NAMES BELOW HAVE NOW BEEN VERIFIED AGAINST REAL SAMPLE OUTPUT for
 * `danek/twitter-scraper` and `scraper_one/facebook-posts-search` (the two
 * actors that were actually reachable on the account's plan). The earlier
 * version of this file guessed field names for both and guessed wrong:
 *
 * - `scraper_one/facebook-posts-search` actually returns `postText` (not
 *   `text`/`content`/`message`), and `timestamp` as an epoch-millisecond
 *   NUMBER (not a `publicationDate`/`date` string) — so even matching the
 *   field name alone wasn't enough, the value also needed converting.
 *   `author` is a nested object ({name, profileUrl, ...}), not a flat
 *   string field. This is why the Sep 25 run logged the Facebook search as
 *   "succeeded" with 5 results, but every one of those results had an
 *   empty `evidenceSnippet` in the final output — the mapping silently
 *   produced blanks instead of throwing.
 *
 * - `danek/twitter-scraper` returns tweet objects with `text`, `author`
 *   (nested: `screen_name`, `name`), `created_at`, and `tweet_id` — but
 *   NO `url`/`tweetUrl` field at all, so the old mapping's `url: ''`
 *   caused every mapped item to be dropped by `.filter(r => r.url)`.
 *   The real bug is worse than a field-name miss, though: a sample run
 *   searching for "Lagos Food Bank Initiative (LFBI)" returned Elon
 *   Musk's own tweet timeline — completely unrelated to the query. That
 *   means this actor's `query`/`search_type`/`max_posts` input is not
 *   actually being honored as a keyword search by the actor (or the
 *   account's plan silently falls back to a default/example run). The
 *   fields below are still the best-documented guess for this actor's
 *   input, but MUST NOT be trusted to scope results — see the relevance
 *   filter in crawler.ts's runWithFallback, which now rejects mapped
 *   items that don't actually mention the organization's name. That
 *   filter is what actually prevents fabricated evidence, independent of
 *   whether this input mapping is eventually confirmed correct.
 *
 * The other Twitter Actors (`apidojo/tweet-scraper`,
 * `apidojo/twitter-scraper-lite`) never returned real output to verify
 * against (both failed with "Access to this origin is disabled" — a
 * platform-level block on this account, not a mapping bug), so their
 * mapItems stay defensive/best-effort and rely on the same relevance
 * filter as a safety net.
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
 * Same lookup as genericTextField, but also accepts an epoch-millisecond
 * number (as returned by scraper_one/facebook-posts-search's `timestamp`
 * field) and converts it to an ISO string. Plain genericTextField silently
 * skips numeric fields because of its `typeof value === 'string'` guard,
 * which is exactly why `postedAt` came out undefined even when the actor
 * DID return a timestamp.
 */
const dateField = (item: Record<string, unknown>, ...keys: string[]): string | undefined => {
    for (const key of keys) {
        const value = item[key];

        if (typeof value === 'string' && value.trim()) return value;

        if (typeof value === 'number' && Number.isFinite(value)) {
            const asDate = new Date(value);
            if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
        }
    }
    return undefined;
};

/**
 * Most of these actors nest author info as an object ({name, screen_name,
 * username, ...}) rather than a flat string field. Checks flat fields
 * first, then falls back to common nested shapes.
 */
const authorNameField = (item: Record<string, unknown>, ...flatKeys: string[]): string | undefined => {
    const flat = genericTextField(item, ...flatKeys);
    if (flat) return flat;

    const author = item.author;
    if (!author || typeof author !== 'object') return undefined;

    return genericTextField(author as Record<string, unknown>, 'name', 'screen_name', 'username', 'authorName');
};

/**
 * Twitter/X post objects from these actors don't reliably include a
 * ready-made post URL (confirmed absent in the danek/twitter-scraper
 * sample). Falls back to constructing one from the tweet id + handle,
 * which is the standard https://x.com/{handle}/status/{id} form.
 */
const twitterUrlField = (item: Record<string, unknown>): string => {
    const direct = genericTextField(item, 'url', 'tweetUrl', 'twitterUrl');
    if (direct) return direct;

    const id = genericTextField(item, 'tweet_id', 'id_str', 'id', 'rest_id');
    const author = item.author;
    const handle =
        author && typeof author === 'object'
            ? genericTextField(author as Record<string, unknown>, 'screen_name', 'username')
            : undefined;

    if (id && handle) return `https://x.com/${handle}/status/${id}`;

    return '';
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
            items
                .map((item) => ({
                    url: genericTextField(item, 'url', 'postUrl') ?? '',
                    // 'postText' is this actor's real field, confirmed from sample
                    // output; the others are kept as fallbacks for safety.
                    snippet: genericTextField(item, 'postText', 'text', 'content', 'message') ?? '',
                    author: authorNameField(item, 'authorName'),
                    postedAt: dateField(item, 'timestamp', 'publicationDate', 'date'),
                }))
                .filter((r) => r.url),
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
            items
                .map((item) => ({
                    url: twitterUrlField(item),
                    snippet: genericTextField(item, 'text', 'fullText', 'full_text') ?? '',
                    author: authorNameField(item, 'author', 'username'),
                    postedAt: dateField(item, 'createdAt', 'created_at', 'date'),
                }))
                .filter((r) => r.url),
    },
    {
        actorId: 'apidojo/twitter-scraper-lite',
        buildInput: (query, maxResults) => ({
            searchTerms: [query],
            sort: 'Latest',
            maxItems: maxResults,
        }),
        mapItems: (items) =>
            items
                .map((item) => ({
                    url: twitterUrlField(item),
                    snippet: genericTextField(item, 'text', 'fullText', 'full_text') ?? '',
                    author: authorNameField(item, 'author', 'username'),
                    postedAt: dateField(item, 'createdAt', 'created_at', 'date'),
                }))
                .filter((r) => r.url),
    },
    {
        actorId: 'danek/twitter-scraper',
        // Verified fields: `query` (single string, not an array) and
        // `max_posts` (snake_case, required). NOTE: a real sample run with
        // this input returned Elon Musk's own timeline, not search results
        // for the query string — so this input shape has NOT been proven
        // to actually filter by keyword. Do not treat a non-empty result
        // set from this actor as trustworthy without the relevance filter
        // applied in crawler.ts.
        buildInput: (query, maxResults) => ({
            query,
            search_type: 'Latest',
            max_posts: maxResults,
        }),
        mapItems: (items) =>
            items
                // Retweets duplicate the retweeted post's own content under
                // the retweeting account's id; skip them so a single post
                // doesn't get counted (or mis-attributed) twice.
                .filter((item) => !item.retweeted)
                .map((item) => ({
                    url: twitterUrlField(item),
                    snippet: genericTextField(item, 'text', 'full_text', 'content') ?? '',
                    author: authorNameField(item, 'author', 'username'),
                    postedAt: dateField(item, 'created_at', 'date', 'timestamp'),
                }))
                .filter((r) => r.url),
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
            items
                .map((item) => ({
                    url: genericTextField(item, 'url') ?? '',
                    snippet: genericTextField(item, 'caption') ?? '',
                    author: authorNameField(item, 'ownerUsername'),
                    postedAt: dateField(item, 'timestamp'),
                }))
                .filter((r) => r.url),
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
            items
                .map((item) => ({
                    url: genericTextField(item, 'url') ?? '',
                    snippet: genericTextField(item, 'caption', 'text') ?? '',
                    author: authorNameField(item, 'ownerUsername', 'username'),
                    postedAt: dateField(item, 'timestamp', 'date'),
                }))
                .filter((r) => r.url),
    },
    {
        actorId: 'apify/instagram-api-scraper',
        buildInput: (query, maxResults) => ({
            search: query,
            searchType: 'user',
            resultsLimit: maxResults,
        }),
        mapItems: (items) =>
            items
                .map((item) => ({
                    url: genericTextField(item, 'url') ?? '',
                    snippet: genericTextField(item, 'caption') ?? '',
                    author: authorNameField(item, 'ownerUsername'),
                    postedAt: dateField(item, 'timestamp'),
                }))
                .filter((r) => r.url),
    },
];