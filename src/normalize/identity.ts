const ORGANIZATION_NOISE = [
    'initiative',
    'foundation',
    'organization',
    'organisation',
    'association',
    'network',
    'centre',
    'center',
    'charity',
    'ngo',
    'limited',
    'ltd',
];

export function normalizeOrganizationName(
    name: string,
): string {
    let normalized = name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    for (const word of ORGANIZATION_NOISE) {
        normalized = normalized.replace(
            new RegExp(`\\b${word}\\b`, 'g'),
            ' ',
        );
    }

    return normalized
        .replace(/\s+/g, ' ')
        .trim();
}

export function getNameTokens(
    name: string,
): string[] {
    return normalizeOrganizationName(name)
        .split(' ')
        .filter(Boolean);
}

export function calculateNameSimilarity(
    first: string,
    second: string,
): number {
    const firstTokens = new Set(getNameTokens(first));
    const secondTokens = new Set(getNameTokens(second));

    if (
        firstTokens.size === 0 ||
        secondTokens.size === 0
    ) {
        return 0;
    }

    const intersection = [...firstTokens].filter(
        (token) => secondTokens.has(token),
    ).length;

    const union = new Set([
        ...firstTokens,
        ...secondTokens,
    ]).size;

    return intersection / union;
}
