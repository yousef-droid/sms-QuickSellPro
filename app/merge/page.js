'use client';
import { useState } from 'react';

export default function MergePage() {
    const [code1, setCode1] = useState('');
    const [code2, setCode2] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { premiumCode } on success
    const [error, setError] = useState('');

    const merge = async () => {
        setError(''); setResult(null);
        const c1 = code1.trim();
        const c2 = code2.trim();
        if (!c1 || !c2) { setError('Please enter both codes.'); return; }
        if (c1 === c2) { setError('The two codes must be different.'); return; }
        if (c1.toUpperCase().startsWith('PREM-') || c2.toUpperCase().startsWith('PREM-')) {
            setError('Only standard codes can be merged. Premium codes cannot be used here.'); return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/merge', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code1: c1, code2: c2 })
            });
            const data = await res.json();
            if (data.error) { setError(data.error); }
            else { setResult(data); setCode1(''); setCode2(''); }
        } catch { setError('A connection error occurred. Please try again.'); }
        setLoading(false);
    };

    const copyCode = () => {
        if (result?.premiumCode) {
            navigator.clipboard.writeText(result.premiumCode).catch(() => {});
        }
    };

    return (
        <>
            <style dangerouslySetInnerHTML={{__html: `html,body{margin:0!important;padding:0!important;background:#0a0a0a!important;overflow-x:hidden}`}} />
            <div style={{ minHeight:'100vh', width:'100vw', background:'linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 50%,#0a0a0a 100%)', color:'#fff', fontFamily:'Arial', direction:'ltr', display:'flex', justifyContent:'center', alignItems:'center' }}>
                <div style={{ width:'100%', maxWidth:'540px', textAlign:'center', padding:'20px' }}>

                    <h1 style={{ fontSize:'2.5rem', fontWeight:'900', marginBottom:'5px', color:'#fff' }}>
                        Quick<span style={{ color:'#e53935' }}>Sell</span>Pro
                    </h1>
                    <p style={{ color:'#ffca28', fontSize:'1rem', marginBottom:'6px', fontWeight:'bold' }}>⭐ Premium Code Generator</p>
                    <p style={{ color:'#bdbdbd', fontSize:'14px', marginBottom:'30px' }}>
                        Combine 2 standard codes → get 1 Premium code that unlocks all countries
                    </p>

                    <div style={{ padding:'30px', background:'rgba(255,255,255,0.04)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,202,40,0.25)', borderRadius:'15px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>

                        {/* Code inputs */}
                        <div style={{ display:'flex', flexDirection:'column', gap:'16px', marginBottom:'24px' }}>
                            <div>
                                <label style={{ display:'block', color:'#f0f0f0', fontWeight:'bold', marginBottom:'8px' }}>Standard Code #1</label>
                                <input type="text" value={code1} onChange={(e) => setCode1(e.target.value)}
                                    placeholder="Enter first code"
                                    style={{ padding:'12px', width:'100%', maxWidth:'320px', textAlign:'center', borderRadius:'8px', border:'none', background:'#fff', color:'#1a1a1a', fontSize:'16px', fontWeight:'bold', boxSizing:'border-box' }} />
                            </div>

                            <div style={{ color:'#ffca28', fontSize:'1.4rem', fontWeight:'bold' }}>+</div>

                            <div>
                                <label style={{ display:'block', color:'#f0f0f0', fontWeight:'bold', marginBottom:'8px' }}>Standard Code #2</label>
                                <input type="text" value={code2} onChange={(e) => setCode2(e.target.value)}
                                    placeholder="Enter second code"
                                    style={{ padding:'12px', width:'100%', maxWidth:'320px', textAlign:'center', borderRadius:'8px', border:'none', background:'#fff', color:'#1a1a1a', fontSize:'16px', fontWeight:'bold', boxSizing:'border-box' }} />
                            </div>
                        </div>

                        <div style={{ color:'#888', fontSize:'13px', marginBottom:'20px' }}>
                            ⚠️ Both codes will be permanently consumed. This action cannot be undone.
                        </div>

                        <button onClick={merge} disabled={loading}
                            style={{ padding:'13px 35px', background:'linear-gradient(90deg,#f57f17,#ffca28)', color:'#000', border:'none', borderRadius:'25px', cursor:'pointer', fontSize:'17px', fontWeight:'bold', boxShadow:'0 4px 15px rgba(255,202,40,0.35)', opacity: loading ? 0.6 : 1 }}>
                            {loading ? 'Merging...' : '⭐ Merge & Generate Premium Code'}
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <p style={{ color:'#ff5252', fontWeight:'bold', fontSize:'1rem', padding:'12px', background:'rgba(0,0,0,0.3)', borderRadius:'8px', marginTop:'20px' }}>
                            {error}
                        </p>
                    )}

                    {/* Success */}
                    {result && (
                        <div style={{ marginTop:'24px', padding:'28px', border:'2px solid #ffca28', borderRadius:'15px', background:'rgba(255,202,40,0.06)', boxShadow:'0 0 25px rgba(255,202,40,0.2)' }}>
                            <p style={{ color:'#ffca28', fontWeight:'bold', fontSize:'1rem', marginBottom:'10px' }}>
                                ✅ Premium code generated successfully!
                            </p>
                            <p style={{ color:'#bdbdbd', fontSize:'13px', marginBottom:'14px' }}>
                                Copy this code and use it on the main page to access all countries.
                            </p>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', flexWrap:'wrap' }}>
                                <span style={{ fontSize:'1.6rem', fontWeight:'900', color:'#fff', letterSpacing:'2px', background:'rgba(255,202,40,0.12)', padding:'10px 20px', borderRadius:'10px', border:'1px solid rgba(255,202,40,0.3)' }}>
                                    {result.premiumCode}
                                </span>
                                <button onClick={copyCode}
                                    style={{ padding:'10px 18px', background:'#ffca28', color:'#000', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'14px' }}>
                                    📋 Copy
                                </button>
                            </div>
                            <p style={{ color:'#888', fontSize:'12px', marginTop:'14px' }}>
                                Save this code — it will not be shown again.
                            </p>
                            <a href="/" style={{ display:'inline-block', marginTop:'16px', padding:'10px 24px', background:'linear-gradient(90deg,#e53935,#b71c1c)', color:'#fff', borderRadius:'8px', fontWeight:'bold', fontSize:'14px', textDecoration:'none' }}>
                                → Go to Main Page
                            </a>
                        </div>
                    )}

                    <div style={{ marginTop:'24px' }}>
                        <a href="/" style={{ color:'#888', fontSize:'13px', textDecoration:'none' }}>← Back to main page</a>
                    </div>
                </div>
            </div>
        </>
    );
}
