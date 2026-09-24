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
    'immunization': [
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

export function extractServices(
    healthAreas: string[],
    description?: string,
): string[] {
    const text = `${healthAreas.join(' ')} ${description ?? ''}`.toLowerCase();

    return Object.entries(SERVICE_TERMS)
        .filter(([, terms]) =>
            terms.some((term) => text.includes(term)),
        )
        .map(([service]) => service);
}


export function extractServiceEvidence(
    healthAreas: string[],
    description?: string,
): Map<string, string> {
    const text = `${healthAreas.join(' ')} ${description ?? ''}`.trim();
    const lowerText = text.toLowerCase();
    const evidence = new Map<string, string>();

    for (const [service, terms] of Object.entries(SERVICE_TERMS)) {
        for (const term of terms) {
            const index = lowerText.indexOf(term);

            if (index === -1) continue;

            const start = Math.max(0, index - 100);
            const end = Math.min(text.length, index + term.length + 180);

            evidence.set(
                service,
                text.slice(start, end).trim(),
            );

            break;
        }
    }

    return evidence;
}

export function extractTargetPopulation(
    healthAreas: string[],
    description?: string,
): string[] {
    const text = `${healthAreas.join(' ')} ${description ?? ''}`.toLowerCase();

    const populationTerms: Record<string, string[]> = {
        'pregnant women': [
            'pregnant women',
            'pregnant woman',
            'pregnancy',
        ],
        'lactating women': [
            'lactating women',
            'lactating mothers',
            'breastfeeding mothers',
        ],
        women: [
            'women',
            'women and girls',
        ],
        children: [
            'children',
            'child',
            'paediatric',
            'pediatric',
        ],
        adolescents: [
            'adolescents',
            'adolescent',
        ],
        youth: [
            'youth',
            'young people',
        ],
        'older adults': [
            'older adults',
            'elderly',
            'seniors',
        ],
        'vulnerable communities': [
            'vulnerable groups',
            'vulnerable communities',
            'vulnerable populations',
        ],
    };

    return Object.entries(populationTerms)
        .filter(([, terms]) =>
            terms.some((term) => text.includes(term)),
        )
        .map(([population]) => population);
}
