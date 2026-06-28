'use client';
import { useState, useEffect, useRef } from 'react';

const AUTO_BURN_MS = 20 * 60 * 1000; // 20 minutes — matches the server-side duration

export default function SMSPage() {
    const countries = [{ id: '117', name: 'Portugal PT' }];
    const services = [{ id: 'bz', name: 'Blizzard' }];

    const [country, setCountry] = useState(countries[0].id);
    const [service, setService] = useState(services[0].id);
    const [voucher, setVoucher] = useState('');
    const [numberData, setNumberData] = useState(null);
    const [smsCode, setSmsCode] = useState('Waiting for message...');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [smsReceived, setSmsReceived] = useState(false);
    const [firstSmsAt, setFirstSmsAt] = useState(null);
    const [remainingMs, setRemainingMs] = useState(null);

    const tickRef = useRef(null);

    useEffect(() => {
        try {
            const savedData = localStorage.getItem('smsSession');
            if (savedData) {
                const parsed = JSON.parse(savedData);
                setNumberData(parsed.numberData);
                setSmsCode(parsed.smsCode);
                setVoucher(parsed.voucher);
                setSmsReceived(parsed.smsReceived || false);
                setFirstSmsAt(parsed.firstSmsAt || null);
            }
        } catch (e) { localStorage.removeItem('smsSession'); }
    }, []);

    useEffect(() => {
        if (numberData || voucher) {
            localStorage.setItem('smsSession', JSON.stringify({ numberData, smsCode, voucher, smsReceived, firstSmsAt }));
        } else {
            localStorage.removeItem('smsSession');
        }
    }, [numberData, smsCode, voucher, smsReceived, firstSmsAt]);

    // Check for the message every 5 seconds — only while no message has been received yet
    useEffect(() => {
        let interval;
        if (numberData && numberData.activationId && !smsReceived) {
            interval = setInterval(() => checkStatus(numberData.activationId), 5000);
        }
        return () => clearInterval(interval);
    }, [numberData, smsReceived]);

    // 20-minute countdown starting from the FIRST message ever received on this number.
    // Keeps running whether we're showing a received message or waiting for the next one
    // (after "Request Another"), since the window is fixed and doesn't restart per message.
    useEffect(() => {
        clearInterval(tickRef.current);
        if (!firstSmsAt) { setRemainingMs(null); return; }

        const tick = () => {
            const left = AUTO_BURN_MS - (Date.now() - firstSmsAt);
            if (left <= 0) {
                setRemainingMs(0);
                clearInterval(tickRef.current);
                // The code is actually burned server-side via the cron job; this just reflects it in the UI
                setMessage('Time limit reached, the code has been burned automatically.');
                resetSession();
            } else {
                setRemainingMs(left);
            }
        };
        tick();
        tickRef.current = setInterval(tick, 1000);
        return () => clearInterval(tickRef.current);
    }, [firstSmsAt]);

    const getNumber = async () => {
        if (!voucher.trim()) { setMessage('Please enter your activation code first.'); return; }
        setLoading(true); setMessage('');
        try {
            const res = await fetch('/api/sms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getNumber', country, service, voucher })
            });
            const data = await res.json();
            if (data.error) { setMessage(data.error); }
            else if (data.activationId) {
                setNumberData(data);
                setSmsCode('Waiting for message...');
                setSmsReceived(false);
                setFirstSmsAt(null);
                setMessage('Number retrieved successfully!');
            } else { setMessage('No numbers available right now.'); }
        } catch { setMessage('A server connection error occurred.'); }
        setLoading(false);
    };

    const checkStatus = async (id) => {
        try {
            const res = await fetch('/api/sms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'getStatus', id, voucher })
            });
            const data = await res.json();
            if (data.result && data.result.startsWith('STATUS_OK')) {
                const code = data.result.split(':')[1];
                setSmsCode(`Received: ${code}`);
                setSmsReceived(true);
                setFirstSmsAt(Date.now()); // start the 20-minute window
            } else if (data.result && data.result.startsWith('STATUS_WAIT_RETRY')) {
                // Still waiting for the new message after "request another" — show the provider's
                // own status instead of leaving a stale message on screen.
                setSmsCode('Waiting for the new message...');
            }
        } catch (e) { console.error(e); }
    };

    // Manual check, in case the 5-second polling missed a state change for any reason
    // (e.g. the tab was inactive). Always safe to call — it just re-runs the same check.
    const checkNow = async () => {
        if (!numberData) return;
        setLoading(true);
        await checkStatus(numberData.activationId);
        setLoading(false);
    };

    const requestAnother = async () => {
        if (!numberData) return;
        setLoading(true); setMessage('');
        try {
            const res = await fetch('/api/sms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'requestAnother', id: numberData.activationId, voucher })
            });
            const data = await res.json();
            if (data.error) {
                setMessage(data.error);
            } else {
                // Back to waiting for a new message on the same number. The 20-minute auto-burn
                // window is NOT reset here — it keeps counting down from the first message, so the
                // user can request as many additional messages as they like, all within that same
                // original 20 minutes.
                setSmsCode('Waiting for a new message...');
                setSmsReceived(false);
                setMessage('Another message requested, please wait...');
            }
        } catch { setMessage('An error occurred.'); }
        setLoading(false);
    };

    // User pressed "Finish" after receiving a message → burn the code immediately on the server
    const finishSession = async () => {
        if (!numberData) return;
        setLoading(true);
        try {
            await fetch('/api/sms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'finish', id: numberData.activationId, voucher })
            });
            setMessage('Finished and the code has been burned.');
        } catch {
            setMessage('An error occurred while finishing, but the session was closed locally.');
        }
        setLoading(false);
        resetSession();
    };

    const cancelNumber = async () => {
        if (!numberData) return;
        setLoading(true);
        try {
            const res = await fetch('/api/sms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'setStatus', status: 8, id: numberData.activationId, voucher })
            });
            const data = await res.json();

            if (data.error) {
                // The server returned an explicit error (e.g. the code is no longer active) — show it,
                // never fall through to printing an undefined result. The session is left untouched.
                setMessage(data.error);
                setLoading(false);
                return;
            }

            // `outcome` is the server's authoritative answer for what actually happened to the
            // voucher in the database. We trust this field alone — never local component state.
            switch (data.outcome) {
                case 'burned':
                    // At least one message had already been received on this number, so the cancel
                    // was instant and local — no provider wait involved.
                    setMessage('Number canceled and the code has been burned.');
                    resetSession();
                    break;
                case 'returned_to_valid':
                    setMessage('Number canceled and the code has been returned for reuse.');
                    resetSession();
                    break;
                case 'early_cancel_denied':
                    setMessage('Cannot cancel yet, please wait two minutes.');
                    // numberData stays as-is — the activation is still alive and usable.
                    break;
                default:
                    // 'still_active' or anything unexpected: the code was NOT burned by the server,
                    // so keep the current session exactly as it was instead of leaving the UI in a
                    // broken/ambiguous state.
                    setMessage('Could not cancel right now. Your number and code are still active — you can try again or press Finish.');
            }
        } catch { setMessage('A connection error occurred while canceling. Your number is still active — please try again.'); }
        setLoading(false);
    };

    const resetSession = () => {
        setNumberData(null); setVoucher('');
        setSmsCode('Waiting for message...'); setSmsReceived(false);
        setFirstSmsAt(null); setRemainingMs(null);
        localStorage.removeItem('smsSession');
    };

    const isSuccess = message.includes('successfully') || message.includes('burned') || message.includes('Another') || message.includes('returned');

    const formatRemaining = (ms) => {
        if (ms === null) return '';
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <>
            <style dangerouslySetInnerHTML={{__html: `html,body{margin:0!important;padding:0!important;background:#0a0a0a!important;overflow-x:hidden}`}} />
            <div style={{ minHeight:'100vh', width:'100vw', background:'linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 50%,#0a0a0a 100%)', color:'#fff', fontFamily:'Arial', direction:'ltr', display:'flex', justifyContent:'center', alignItems:'center' }}>
                <div style={{ width:'100%', maxWidth:'600px', textAlign:'center', padding:'20px' }}>

                    <h1 style={{ fontSize:'3rem', fontWeight:'900', marginBottom:'5px', letterSpacing:'1px', color:'#fff', textShadow:'0 4px 15px rgba(0,0,0,0.5)' }}>
                        Quick<span style={{ color:'#e53935' }}>Sell</span>Pro
                    </h1>
                    <p style={{ color:'#bdbdbd', fontSize:'1.2rem', marginBottom:'25px' }}>Digital Number Activation Platform</p>

                    <div style={{ marginBottom:'20px', padding:'30px', background:'rgba(255,255,255,0.04)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'15px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
                        <div style={{ marginBottom:'20px' }}>
                            <label style={{ display:'block', marginBottom:'10px', color:'#f0f0f0', fontWeight:'bold' }}>Activation Code:</label>
                            <input type="text" value={voucher} onChange={(e) => setVoucher(e.target.value)} disabled={numberData !== null}
                                style={{ padding:'12px', width:'80%', maxWidth:'300px', textAlign:'center', borderRadius:'8px', border:'none', background:'#fff', color:'#1a1a1a', fontSize:'16px', fontWeight:'bold' }}
                                placeholder="Enter your code here" />
                        </div>

                        <div style={{ marginBottom:'25px', display:'flex', justifyContent:'center', gap:'15px', flexWrap:'wrap' }}>
                            <div>
                                <label style={{ color:'#f0f0f0', marginRight:'5px' }}>Country: </label>
                                <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ padding:'8px', borderRadius:'5px', border:'none', color:'#1a1a1a', fontWeight:'bold' }}>
                                    {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ color:'#f0f0f0', marginRight:'5px' }}>Service: </label>
                                <select value={service} onChange={(e) => setService(e.target.value)} style={{ padding:'8px', borderRadius:'5px', border:'none', color:'#1a1a1a', fontWeight:'bold' }}>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <button onClick={getNumber} disabled={loading || numberData !== null}
                            style={{ padding:'12px 30px', background:'linear-gradient(90deg,#e53935,#b71c1c)', color:'#fff', border:'none', borderRadius:'25px', cursor:'pointer', fontSize:'18px', fontWeight:'bold', boxShadow:'0 4px 15px rgba(229,57,53,0.4)', opacity:(loading || numberData) ? 0.6 : 1 }}>
                            {loading ? 'Loading...' : 'Get a New Number'}
                        </button>
                    </div>

                    {message && (
                        <p style={{ fontWeight:'bold', fontSize:'1.1rem', color: isSuccess ? '#69f0ae' : '#ff5252', padding:'10px', background:'rgba(0,0,0,0.3)', borderRadius:'8px' }}>
                            {message}
                        </p>
                    )}

                    {numberData && (
                        <div style={{ padding:'25px', border:'2px solid #e53935', borderRadius:'15px', marginTop:'20px', background:'rgba(0,0,0,0.5)', boxShadow:'0 0 20px rgba(229,57,53,0.25)' }}>
                            <h2 style={{ color:'#fff', fontSize:'2rem', margin:'10px 0' }}>Number: +{numberData.phoneNumber}</h2>
                            <h3 style={{ color:'#ff8a80', fontSize:'1.5rem', marginBottom:'20px' }}>Message: {smsCode}</h3>

                            {smsReceived ? (
                                // ── After receiving the message: choose to finish or request another ──
                                <div style={{ display:'flex', flexDirection:'column', gap:'12px', alignItems:'center' }}>
                                    {remainingMs !== null && (
                                        <p style={{ color:'#ffca28', fontSize:'14px', margin:0 }}>
                                            ⏳ The code will be burned automatically in <b>{formatRemaining(remainingMs)}</b> if no action is taken
                                        </p>
                                    )}
                                    <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', justifyContent:'center' }}>
                                        <button onClick={requestAnother} disabled={loading}
                                            style={{ padding:'11px 28px', background:'#fff', color:'#1a1a1a', border:'1px solid #444', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'15px', boxShadow:'0 4px 12px rgba(0,0,0,0.3)', opacity: loading ? 0.6 : 1 }}>
                                            {loading ? 'Requesting...' : '📨 Request Another Message on Same Number'}
                                        </button>
                                        <button onClick={finishSession} disabled={loading}
                                            style={{ padding:'11px 28px', background:'linear-gradient(90deg,#e53935,#b71c1c)', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'15px', boxShadow:'0 4px 12px rgba(229,57,53,0.4)', opacity: loading ? 0.6 : 1 }}>
                                            {loading ? 'Finishing...' : '🔥 Finish & Burn Code'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // ── Before receiving a message (or waiting for an additional one after Request Another) ──
                                <>
                                    {remainingMs !== null && (
                                        <p style={{ color:'#ffca28', fontSize:'14px', margin:'0 0 15px' }}>
                                            ⏳ The code will be burned automatically in <b>{formatRemaining(remainingMs)}</b> if no action is taken
                                        </p>
                                    )}
                                    <div style={{ display:'flex', gap:'12px', justifyContent:'center', flexWrap:'wrap' }}>
                                        <button onClick={checkNow} disabled={loading}
                                            style={{ padding:'10px 20px', background:'#fff', color:'#1a1a1a', border:'1px solid #444', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', opacity: loading ? 0.6 : 1 }}>
                                            {loading ? 'Checking...' : '🔄 Check Now'}
                                        </button>
                                        <button onClick={cancelNumber} disabled={loading}
                                            style={{ padding:'10px 20px', background:'#e53935', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', opacity: loading ? 0.6 : 1 }}>
                                            {loading ? 'Working...' : 'Cancel Number'}
                                        </button>
                                    </div>
                                    <p style={{ fontSize:'13px', color:'#bdbdbd', marginTop:'15px' }}>* Before any message arrives, cancellation may require a short wait and returns the code for reuse. After a message has been received, cancellation is instant and burns the code.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
