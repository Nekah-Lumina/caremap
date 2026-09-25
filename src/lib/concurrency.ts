/**
 * Minimal concurrency limiter (no external dependency).
 *
 * Why this exists: the run log showed repeated failures like
 * "By launching this job you will exceed your limit of 5 concurrent Actor
 * runs" from Apify. That happened because getSocialEvidence() fired up to
 * 5 Actor.call()s in parallel per organization, and main.ts processes
 * organizations in parallel too — so with just 3 organizations the run
 * could burst to 10+ simultaneous Actor.call()s against a 5-slot ceiling.
 *
 * A single shared limiter instance (see sources/social/crawler.ts) wraps
 * every Actor.call() the whole run makes, regardless of which organization
 * or which platform it's for, so the true ceiling is respected no matter
 * how much org-level or platform-level parallelism happens above it.
 */
export function createLimiter(maxConcurrent: number) {
    let active = 0;
    const queue: (() => void)[] = [];

    function next(): void {
        if (active >= maxConcurrent) return;

        const run = queue.shift();

        if (!run) return;

        active += 1;
        run();
    }

    return function limit<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            queue.push(() => {
                fn()
                    .then(resolve, reject)
                    .finally(() => {
                        active -= 1;
                        next();
                    });
            });

            next();
        });
    };
}