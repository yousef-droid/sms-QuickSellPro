import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

const AUTO_BURN_MS = 20 * 60 * 1000; // 20 دقيقة

// يستدعيه Vercel Cron تلقائياً (راجع vercel.json) — يفحص كل الأكواد النشطة
// التي تجاوزت 20 دقيقة من استلام أول رسالة ويحرقها حتى لو المستخدم لم يفتح الصفحة مجدداً.
export async function GET(request) {
    // حماية بسيطة: تأكد أن الطلب قادم من Vercel Cron عبر CRON_SECRET
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'غير مخوّل' }, { status: 401 });
    }

    try {
        const activeVouchers = await kv.smembers('active_vouchers');
        const burnedNow = [];

        for (const voucher of activeVouchers) {
            const firstSmsAt = await kv.get(`first_sms_at:${voucher}`);
            if (!firstSmsAt) continue; // لم تُستلم رسالة بعد لهذا الكود، تجاهله

            const elapsed = Date.now() - Number(firstSmsAt);
            if (elapsed >= AUTO_BURN_MS) {
                await kv.srem('active_vouchers', voucher);
                await kv.srem('valid_vouchers', voucher);
                await kv.sadd('burned_vouchers', voucher);
                await kv.del(`first_sms_at:${voucher}`);
                burnedNow.push(voucher);
            }
        }

        return NextResponse.json({ success: true, burned: burnedNow });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
