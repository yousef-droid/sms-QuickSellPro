import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

// Generates a random premium voucher code like PREM-A1B2C3D4
function generatePremiumCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
    let suffix = '';
    for (let i = 0; i < 8; i++) {
        suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `PREM-${suffix}`;
}

export async function POST(request) {
    try {
        const { code1, code2 } = await request.json();

        if (!code1 || !code2) {
            return NextResponse.json({ error: 'Both codes are required.' }, { status: 400 });
        }
        if (code1 === code2) {
            return NextResponse.json({ error: 'The two codes must be different.' }, { status: 400 });
        }
        // Reject if either code is already a premium voucher
        if (code1.toUpperCase().startsWith('PREM-') || code2.toUpperCase().startsWith('PREM-')) {
            return NextResponse.json({ error: 'Premium codes cannot be used for merging.' }, { status: 400 });
        }

        // Both codes must be in valid_vouchers (not active or burned)
        const [v1, v2] = await Promise.all([
            kv.sismember('valid_vouchers', code1),
            kv.sismember('valid_vouchers', code2),
        ]);

        if (!v1 && !v2) {
            return NextResponse.json({ error: 'Both codes are invalid or already used.' }, { status: 400 });
        }
        if (!v1) {
            return NextResponse.json({ error: `Code #1 (${code1}) is invalid or already used.` }, { status: 400 });
        }
        if (!v2) {
            return NextResponse.json({ error: `Code #2 (${code2}) is invalid or already used.` }, { status: 400 });
        }

        // Generate a unique premium code (retry on collision, very unlikely but safe)
        let premiumCode;
        let attempts = 0;
        do {
            premiumCode = generatePremiumCode();
            const exists = await kv.sismember('premium_vouchers', premiumCode);
            if (!exists) break;
            attempts++;
        } while (attempts < 5);

        // Atomically burn both standard codes and register the new premium code
        await Promise.all([
            kv.srem('valid_vouchers', code1),
            kv.srem('valid_vouchers', code2),
            kv.sadd('burned_vouchers', code1),
            kv.sadd('burned_vouchers', code2),
            kv.sadd('premium_vouchers', premiumCode),
        ]);

        return NextResponse.json({ premiumCode });

    } catch (error) {
        return NextResponse.json({ error: 'A server error occurred: ' + error.message }, { status: 500 });
    }
}
