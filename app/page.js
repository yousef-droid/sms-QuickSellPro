'use client';
import { useState, useEffect, useRef } from 'react';

const AUTO_BURN_MS = 20 * 60 * 1000;

// Standard countries (cheap) — available to all vouchers
const STANDARD_COUNTRIES = [
    { id: '117', name: 'Portugal PT' },
    { id: '43',  name: 'Germany' },
    { id: '16',  name: 'United Kingdom' },
    { id: '73',  name: 'Brazil' },
    { id: '52',  name: 'Thailand' },
    { id: '78',  name: 'France' },
    { id: '6',   name: 'Indonesia' },
    { id: '33',  name: 'Colombia' },
    { id: '32',  name: 'Romania' },
    { id: '37',  name: 'Morocco' },
    { id: '10',  name: 'Viet Nam' },
    { id: '4',   name: 'Philippines' },
];

// Premium countries (expensive) — only available to PREM-... vouchers
const PREMIUM_COUNTRIES = [
    { id: '187', name: 'United States' },
    { id: '53',  name: 'Saudi Arabia' },
    { id: '67',  name: 'New Zealand' },
    { id: '163', name: 'Finland' },
    { id: '66',  name: 'Pakistan' },
    { id: '95',  name: 'UAE' },
    { id: '116', name: 'Jordan' },
    { id: '54',  name: 'Mexico' },
    { id: '111', name: 'Qatar' },
];

const isPremiumVoucher = (v) => typeof v === 'string' && v.toUpperCase().startsWith('PREM-');

const services = [{ id: 'bz', name: 'Blizzard' }];

export default function SMSPage() {
    const [voucher, setVoucher]         = useState('');
    const [country, setCountry]         = useState(STANDARD_COUNTRIES[0].id);
    const [service, setService]         = useState(services[0].id);
    const [numberData, setNumberData]   = useState(null);
    const [smsCode, setSmsCode]         = useState('Waiting for message...');
    const [loading, setLoading]         = useState(false);
    const [message, setMessage]         = useState('');
    const [smsReceived, setSmsReceived] = useState(false);
    const [firstSmsAt, setFirstSmsAt]   = useState(null);
    const [remainingMs, setRemainingMs] = useState(null);

    const tickRef = useRef(null);

    // Countries available depend on whether the entered voucher is premium
    const availableCountries = isPremiumVoucher(voucher)
        ? [...STANDARD_COUNTRIES, ...PREMIUM_COUNTRIES]
        : STANDARD_COUNTRIES;

    // When voucher type changes, reset the country selection to the first available option
    // so a standard-country selection doesn't get stuck when switching to premium and back.
    useEffect(() => {
        setCountry(availableCountries[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPremiumVoucher(voucher)]);

    // ── Persist / restore session ──
    useEffect(() => {
        try {
            const saved = localStorage.getItem('smsSession');
            if (saved) {
                const p = JSON.parse(saved);
                setNumberData(p.numberData);
                setSmsCode(p.smsCode);
                setVoucher(p.voucher);
                setSmsReceived(p.smsReceived || false);
                setFirstSmsAt(p.firstSmsAt || null);
            }
        } catch { localStorage.removeItem('smsSession'); }
    }, []);

    useEffect(() => {
        if (numberData || voucher) {
            localStorage.setItem('smsSession', JSON.stringify({ numberData, smsCode, voucher, smsReceived, firstSmsAt }));
        } else {
            localStorage.removeItem('smsSession');
        }
    }, [numberData, smsCode, voucher, smsReceived, firstSmsAt]);

    // ── Polling every 5 s while waiting for a message ──
    useEffect(() => {
        let interval;
        if (numberData && numberData.activationId && !smsReceived) {
            interval = setInterval(() => checkStatus(numberData.activationId), 5000);
        }
        return () => clearInterval(interval);
    }, [numberData, smsReceived]);

    // ── 20-minute countdown ──
    useEffect(() => {
        clearInterval(tickRef.current);
        if (!firstSmsAt) { setRemainingMs(null); return; }
        const tick = () => {
            const left = AUTO_BURN_MS - (Date.now() - firstSmsAt);
            if (left <= 0) {
                setRemainingMs(0);
                clearInterval(tickRef.current);
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
                setFirstSmsAt(Date.now());
            } else if (data.result && data.result.startsWith('STATUS_WAIT_RETRY')) {
                setSmsCode('Waiting for the new message...');
            }
        } catch (e) { console.error(e); }
    };

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
            if (data.error) { setMessage(data.error); }
            else {
                setSmsCode('Waiting for a new message...');
                setSmsReceived(false);
                setMessage('Another message requested, please wait...');
            }
        } catch { setMessage('An error occurred.'); }
        setLoading(false);
    };

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
            if (data.error) { setMessage(data.error); setLoading(false); return; }
            switch (data.outcome) {
                case 'burned':
                    setMessage('Number canceled and the code has been burned.');
                    resetSession(); break;
                case 'returned_to_valid':
                    setMessage('Number canceled and the code has been returned for reuse.');
                    resetSession(); break;
                case 'early_cancel_denied':
                    setMessage('Cannot cancel yet, please wait two minutes.'); break;
                default:
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
        return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
    };

    const isPrem = isPremiumVoucher(voucher);

    return (
        <>
            <style dangerouslySetInnerHTML={{__html: `html,body{margin:0!important;padding:0!important;background:#0a0a0a!important;overflow-x:hidden}`}} />
            <div style={{ minHeight:'100vh', width:'100vw', background:'linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 50%,#0a0a0a 100%)', color:'#fff', fontFamily:'Arial', direction:'ltr', display:'flex', justifyContent:'center', alignItems:'center' }}>
                <div style={{ width:'100%', maxWidth:'600px', textAlign:'center', padding:'20px' }}>

                    <h1 style={{ fontSize:'3rem', fontWeight:'900', marginBottom:'5px', letterSpacing:'1px', color:'#fff', textShadow:'0 4px 15px rgba(0,0,0,0.5)' }}>
                        Quick<span style={{ color:'#e53935' }}>Sell</span>Pro
                    </h1>
                    <p style={{ color:'#bdbdbd', fontSize:'1.2rem', marginBottom:'25px' }}>Digital Number Activation Platform</p>

                    {/* Merge banner — visible when no active session */}
                    {!numberData && (
                        <p style={{ color:'#ffca28', fontSize:'13px', marginBottom:'15px' }}>
                            Have 2 standard codes?{' '}
                            <a href="/merge" style={{ color:'#ffca28', fontWeight:'bold', textDecoration:'underline' }}>
                                Merge them → get a Premium code
                            </a>
                            {' '}(unlocks all countries)
                        </p>
                    )}

                    <div style={{ marginBottom:'20px', padding:'30px', background:'rgba(255,255,255,0.04)', backdropFilter:'blur(10px)', border:`1px solid ${isPrem ? 'rgba(255,202,40,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius:'15px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>

                        {/* Premium badge */}
                        {isPrem && (
                            <div style={{ display:'inline-block', background:'linear-gradient(90deg,#f57f17,#ffca28)', color:'#000', fontWeight:'bold', fontSize:'12px', padding:'3px 12px', borderRadius:'20px', marginBottom:'12px' }}>
                                ⭐ PREMIUM — All Countries Unlocked
                            </div>
                        )}

                        <div style={{ marginBottom:'20px' }}>
                            <label style={{ display:'block', marginBottom:'10px', color:'#f0f0f0', fontWeight:'bold' }}>Activation Code:</label>
                            <input type="text" value={voucher} onChange={(e) => setVoucher(e.target.value)} disabled={numberData !== null}
                                style={{ padding:'12px', width:'80%', maxWidth:'300px', textAlign:'center', borderRadius:'8px', border:`2px solid ${isPrem ? '#ffca28' : 'transparent'}`, background:'#fff', color:'#1a1a1a', fontSize:'16px', fontWeight:'bold' }}
                                placeholder="Enter your code here" />
                        </div>

                        <div style={{ marginBottom:'25px', display:'flex', justifyContent:'center', gap:'15px', flexWrap:'wrap' }}>
                            <div>
                                <label style={{ color:'#f0f0f0', marginRight:'5px' }}>Country: </label>
                                <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ padding:'8px', borderRadius:'5px', border:'none', color:'#1a1a1a', fontWeight:'bold' }}>
                                    {availableCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                            style={{ padding:'12px 30px', background: isPrem ? 'linear-gradient(90deg,#f57f17,#ffca28)' : 'linear-gradient(90deg,#e53935,#b71c1c)', color: isPrem ? '#000' : '#fff', border:'none', borderRadius:'25px', cursor:'pointer', fontSize:'18px', fontWeight:'bold', boxShadow: isPrem ? '0 4px 15px rgba(255,202,40,0.4)' : '0 4px 15px rgba(229,57,53,0.4)', opacity:(loading || numberData) ? 0.6 : 1 }}>
                            {loading ? 'Loading...' : 'Get a New Number'}
                        </button>
                    </div>

                    {message && (
                        <p style={{ fontWeight:'bold', fontSize:'1.1rem', color: isSuccess ? '#69f0ae' : '#ff5252', padding:'10px', background:'rgba(0,0,0,0.3)', borderRadius:'8px' }}>
                            {message}
                        </p>
                    )}

                    {numberData && (
                        <div style={{ padding:'25px', border:`2px solid ${isPrem ? '#ffca28' : '#e53935'}`, borderRadius:'15px', marginTop:'20px', background:'rgba(0,0,0,0.5)', boxShadow: isPrem ? '0 0 20px rgba(255,202,40,0.25)' : '0 0 20px rgba(229,57,53,0.25)' }}>
                            <h2 style={{ color:'#fff', fontSize:'2rem', margin:'10px 0' }}>Number: +{numberData.phoneNumber}</h2>
                            <h3 style={{ color:'#ff8a80', fontSize:'1.5rem', marginBottom:'20px' }}>Message: {smsCode}</h3>

                            {smsReceived ? (
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
