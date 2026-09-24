export interface ExtractedAccess {
    phone?: string;
    email?: string;
    appointmentRequired?: boolean;
    referralRequired?: boolean;
    requirements: string[];
}

const PHONE_PATTERN =
    /(?:\+234|0)(?:70|80|81|90|91)\d{8}\b/g;

const EMAIL_PATTERN =
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const REQUIREMENT_PATTERNS: Array<{
    type: 'appointmentRequired' | 'referralRequired';
    patterns: RegExp[];
}> = [
    {
        type: 'appointmentRequired',
        patterns: [
            /\bappointment required\b/i,
            /\bappointment is required\b/i,
            /\bbook an appointment\b/i,
            /\bby appointment\b/i,
        ],
    },
    {
        type: 'referralRequired',
        patterns: [
            /\breferral required\b/i,
            /\brefer(?:ral|red)?\b/i,
            /\bdoctor'?s referral\b/i,
        ],
    },
];

export function extractAccess(
    text: string,
): ExtractedAccess {
    const phone = text.match(PHONE_PATTERN)?.[0];
    const email = text.match(EMAIL_PATTERN)?.[0];

    let appointmentRequired: boolean | undefined;
    let referralRequired: boolean | undefined;

    for (const rule of REQUIREMENT_PATTERNS) {
        if (!rule.patterns.some((pattern) => pattern.test(text))) {
            continue;
        }

        if (rule.type === 'appointmentRequired') {
            appointmentRequired = true;
        }

        if (rule.type === 'referralRequired') {
            referralRequired = true;
        }
    }

    const requirements: string[] = [];

    if (appointmentRequired) {
        requirements.push('appointment');
    }

    if (referralRequired) {
        requirements.push('referral');
    }

    return {
        phone,
        email,
        appointmentRequired,
        referralRequired,
        requirements,
    };
}
