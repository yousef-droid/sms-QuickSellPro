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

            // When the first message arrives: don't burn the code immediately, instead let the user
            // choose to "Finish" or "Request another message". Record the receipt time to drive the
            // 20-minute auto-burn.
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

            // Reset the auto-burn timer to give a full window while waiting for the new message
            await kv.del(`first_sms_at:${voucher}`);

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

            return NextResponse.json({ success: true });
        }

        // ─── setStatus (currently used only for cancellation before any message is received) ───
        if (action === 'setStatus') {
            const isActive = await kv.sismember('active_vouchers', voucher);
            if (!isActive) return NextResponse.json({ error: 'This code is not active.' }, { status: 400 });

            const url = `https://smsbower.online/stubs/handler_api.php?api_key=${API_KEY}&action=setStatus&id=${id}&status=${status}`;
            const response = await fetch(url);
            const text = await response.text();

            if (status === 8) {
                // Cancel before receiving any message → the code goes back to valid as long as no code arrived
                await kv.srem('active_vouchers', voucher);
                await kv.del(`first_sms_at:${voucher}`);

                if (text === 'ACCESS_CANCEL') {
                    await kv.sadd('valid_vouchers', voucher);
                } else {
                    await kv.sadd('burned_vouchers', voucher);
                }
            }

            if (status === 6) {
                await kv.srem('active_vouchers', voucher);
                await kv.del(`first_sms_at:${voucher}`);
                await kv.sadd('burned_vouchers', voucher);
            }

            return NextResponse.json({ result: text });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json({ error: 'A server error occurred: ' + error.message }, { status: 500 });
    }
}
