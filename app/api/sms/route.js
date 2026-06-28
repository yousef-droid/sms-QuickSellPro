import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

// How long to wait after the first message before auto-burning (ms)
const AUTO_BURN_MS = 20 * 60 * 1000; // 20 minutes

export async function POST(request) {
    const body = await request.json();
    const { action, voucher, country, service, id, status } = body;

    if (!voucher) {
        return NextResponse.json({ error: 'Please enter the activation code.' }, { status: 400 });
    }

    const API_KEY = process.env.SMS_POWER_API_KEY;
    if (!API_KEY) {
        return NextResponse.json({ error: 'API key is missing in the settings' }, { status: 500 });
    }

    try {

        // ─── getNumber ───
        if (action === 'getNumber') {
            const isValid = await kv.sismember('valid_vouchers', voucher);
            if (!isValid) {
                return NextResponse.json({ error: 'Invalid code or it is already in use!' }, { status: 400 });
            }
            await kv.srem('valid_vouchers', voucher);
            await kv.sadd('active_vouchers', voucher);
            await kv.del(`requested_another:${voucher}`);

            const url = `https://smsbower.online/stubs/handler_api.php?api_key=${API_KEY}&action=getNumber&service=${service || 'bz'}&country=${country || '117'}`;
            const response = await fetch(url);
            const text = await response.text();

            if (text.startsWith('ACCESS_NUMBER:')) {
                const parts = text.split(':');
                return NextResponse.json({ activationId: parts[1], phoneNumber: parts[2] });
            } else {
                await kv.srem('active_vouchers', voucher);
                await kv.sadd('valid_vouchers', voucher);
                if (text === 'NO_NUMBERS') return NextResponse.json({ error: 'No numbers available right now, try again later.' });
                if (text === 'NO_BALANCE') return NextResponse.json({ error: 'Provider balance is insufficient.' });
                if (text === 'BAD_SERVICE') return NextResponse.json({ error: 'This service is not available.' });
                return NextResponse.json({ error: `Provider error: ${text}` });
            }
        }

        // ─── getStatus ───
        if (action === 'getStatus') {
            const isActive = await kv.sismember('active_vouchers', voucher);
            if (!isActive) return NextResponse.json({ error: 'This code is not active.' }, { status: 400 });

            const url = `https://smsbower.online/stubs/handler_api.php?api_key=${API_KEY}&action=getStatus&id=${id}`;
            const response = await fetch(url);
            const text = await response.text();

            // The provider returns STATUS_OK:code both for the first message AND for any
            // subsequent message received after "request another" (status=3). While waiting
            // for that subsequent message it returns STATUS_WAIT_RETRY:lastCode, not STATUS_OK,
            // so we only react to an actual STATUS_OK here — that part was already correct.
            if (text.startsWith('STATUS_OK')) {
                const alreadyHasTimer = await kv.get(`first_sms_at:${voucher}`);
                if (!alreadyHasTimer) {
                    await kv.set(`first_sms_at:${voucher}`, Date.now());
                }
            }

            return NextResponse.json({ result: text });
        }

        // ─── requestAnother: request another message on the same number (status=3 = free on smsbower) ───
        if (action === 'requestAnother') {
            const isActive = await kv.sismember('active_vouchers', voucher);
            if (!isActive) {
                return NextResponse.json({ error: 'This code is not valid for this operation.' }, { status: 400 });
            }

            const url = `https://smsbower.online/stubs/handler_api.php?api_key=${API_KEY}&action=setStatus&id=${id}&status=3`;
            const response = await fetch(url);
            const text = await response.text();

            // NOTE: we deliberately do NOT reset/delete `first_sms_at` here. The 20-minute window is
            // fixed from the very first message received on this number — requesting another message
            // is free and unlimited *within* that same original window, not a way to extend it.

            // Mark this voucher as having requested another message on this number. Once this flag
            // is set, a later cancel (status=8) must always burn the code locally — the number has
            // already been used to receive at least one real message, so it can never be returned to
            // the valid pool again, regardless of what the provider's cancel endpoint says.
            await kv.set(`requested_another:${voucher}`, true);

            return NextResponse.json({ result: text });
        }

        // ─── finish: the user pressed "Finish" after receiving a message → burn the code permanently ───
        if (action === 'finish') {
            const isActive = await kv.sismember('active_vouchers', voucher);
            if (isActive) {
                // Best-effort close of the activation on the provider's side (status=6), without breaking the flow if it fails
                try {
                    await fetch(`https://smsbower.online/stubs/handler_api.php?api_key=${API_KEY}&action=setStatus&id=${id}&status=6`);
                } catch (e) { /* ignore provider errors, local burn is what matters */ }
            }
            await kv.srem('active_vouchers', voucher);
            await kv.srem('valid_vouchers', voucher);
            await kv.sadd('burned_vouchers', voucher);
            await kv.del(`first_sms_at:${voucher}`);
            await kv.del(`requested_another:${voucher}`);

            return NextResponse.json({ success: true });
        }

        // ─── setStatus (cancellation, at any point) ───
        if (action === 'setStatus') {
            const isActive = await kv.sismember('active_vouchers', voucher);
            if (!isActive) {
                return NextResponse.json({ error: 'This code is not active anymore.' }, { status: 400 });
            }

            // ── Cancel (status=8): purely local and immediate. ──
            // We deliberately do NOT call the provider's cancel endpoint here and do NOT wait for
            // or depend on its response. The provider enforces its own 2-minute minimum hold before
            // it will accept a cancellation, which used to surface to the user as "please wait two
            // minutes" — that wait is now removed entirely. Pressing Cancel burns the code in our
            // own database right away, at any time, regardless of how long ago the number was issued.
            // NOTE: this means the number itself stays reserved/active on the provider's side (we
            // never told them to release it), so it may still count toward provider-side usage.
            if (status === 8) {
                await kv.srem('active_vouchers', voucher);
                await kv.del(`first_sms_at:${voucher}`);
                await kv.del(`requested_another:${voucher}`);
                await kv.sadd('burned_vouchers', voucher);

                return NextResponse.json({ result: 'LOCAL_CANCEL_BURNED', outcome: 'burned' });
            }

            // ── Any other status (e.g. 6 = finish) still goes through the provider as before. ──
            const url = `https://smsbower.online/stubs/handler_api.php?api_key=${API_KEY}&action=setStatus&id=${id}&status=${status}`;
            const response = await fetch(url);
            const text = await response.text();

            let outcome = 'still_active';

            if (status === 6) {
                await kv.srem('active_vouchers', voucher);
                await kv.del(`first_sms_at:${voucher}`);
                await kv.del(`requested_another:${voucher}`);
                await kv.sadd('burned_vouchers', voucher);
                outcome = 'burned';
            }

            // Always return a non-empty, predictable string so the UI never has to display "undefined".
            return NextResponse.json({ result: text || 'NO_RESPONSE_FROM_PROVIDER', outcome });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ error: 'A server error occurred: ' + error.message }, { status: 500 });
    }
}
