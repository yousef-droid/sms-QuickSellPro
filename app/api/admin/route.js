import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

// Single password used for everything: login, add, delete, and reset.
const ADMIN_PASSWORD = 'yousefKk9274808';

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function getClientIp(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request) {
    const body = await request.json();
    const { action, code, password } = body;

    const ip = getClientIp(request);
    const lockKey = `admin_lockout:${ip}`;
    const attemptsKey = `admin_attempts:${ip}`;

    // Check if this IP is currently locked out
    const lockedUntil = await kv.get(lockKey);
    if (lockedUntil && Date.now() < Number(lockedUntil)) {
        const secondsLeft = Math.ceil((Number(lockedUntil) - Date.now()) / 1000);
        const minutesLeft = Math.ceil(secondsLeft / 60);
        return NextResponse.json(
            { error: `Too many failed attempts. Please try again in ${minutesLeft} minute(s).` },
            { status: 429 }
        );
    }

    if (password !== ADMIN_PASSWORD) {
        // Record a failed attempt
        const attempts = (Number(await kv.get(attemptsKey)) || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
            await kv.set(lockKey, Date.now() + LOCKOUT_MS);
            await kv.del(attemptsKey);
            return NextResponse.json(
                { error: 'Too many failed attempts. Please try again in 5 minutes.' },
                { status: 429 }
            );
        }
        await kv.set(attemptsKey, attempts);
        return NextResponse.json({ error: 'Incorrect password!' }, { status: 401 });
    }

    // Correct password → clear any previous failed attempts for this IP
    await kv.del(attemptsKey);
    await kv.del(lockKey);

    try {
        if (action === 'get_codes') {
            const valid = await kv.smembers('valid_vouchers');
            const active = await kv.smembers('active_vouchers');
            const burned = await kv.smembers('burned_vouchers');
            const premium = await kv.smembers('premium_vouchers');
            return NextResponse.json({
                valid: valid || [],
                active: active || [],
                burned: burned || [],
                premium: premium || [],
            });
        }

        if (action === 'add_code') {
            if (!code) return NextResponse.json({ error: 'Please enter the code' }, { status: 400 });

            // A code name must be unique across all three buckets. If it's currently burned or
            // active, reject the add entirely and tell the admin exactly why — don't silently
            // clean it up and re-add it, since that would let an admin accidentally reuse a name
            // that's still tied to a previous (possibly still-in-progress) activation.
            const [isValid, isActive, isBurned] = await Promise.all([
                kv.sismember('valid_vouchers', code),
                kv.sismember('active_vouchers', code),
                kv.sismember('burned_vouchers', code),
            ]);

            if (isBurned) {
                return NextResponse.json({ error: `This code already exists in the Burned list. Choose a different name.` }, { status: 400 });
            }
            if (isActive) {
                return NextResponse.json({ error: `This code already exists in the Active list (currently in use). Choose a different name.` }, { status: 400 });
            }
            if (isValid) {
                return NextResponse.json({ error: `This code is already in the Valid list.` }, { status: 400 });
            }

            await kv.sadd('valid_vouchers', code);
            return NextResponse.json({ success: true });
        }

        // Deleting a code only needs the single admin password (already verified above)
        if (action === 'delete_code') {
            await kv.srem('valid_vouchers', code);
            await kv.srem('active_vouchers', code);
            await kv.srem('burned_vouchers', code);
            await kv.srem('premium_vouchers', code);
            await kv.del(`first_sms_at:${code}`);
            await kv.del(`requested_another:${code}`);
            return NextResponse.json({ success: true });
        }

        if (action === 'reset_code') {
            await kv.srem('active_vouchers', code);
            await kv.srem('burned_vouchers', code);
            await kv.srem('premium_vouchers', code);
            await kv.sadd('valid_vouchers', code);
            await kv.del(`first_sms_at:${code}`);
            await kv.del(`requested_another:${code}`);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
