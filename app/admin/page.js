'use client';
import { useState } from 'react';

export default function AdminDashboard() {
    const [password, setPassword] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [validCodes, setValidCodes] = useState([]);
    const [activeCodes, setActiveCodes] = useState([]);
    const [burnedCodes, setBurnedCodes] = useState([]);
    const [newCode, setNewCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [confirmAction, setConfirmAction] = useState(null); // { code, type, kind: 'delete' | 'reset' }

    const fetchCodes = async (pass) => {
        setLoading(true);
        setLoginError('');
        const res = await fetch('/api/admin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_codes', password: pass })
        });
        const data = await res.json();
        setLoading(false);
        if (res.ok) {
            setValidCodes(data.valid || []);
            setActiveCodes(data.active || []);
            setBurnedCodes(data.burned || []);
            setIsLoggedIn(true);
        } else {
            setLoginError(data.error || 'Login failed.');
        }
    };

    const addCode = async () => {
        if (!newCode.trim()) return;
        const res = await fetch('/api/admin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_code', code: newCode, password })
        });
        if (res.ok) { setNewCode(''); fetchCodes(password); }
    };

    const deleteCode = async (code) => {
        const res = await fetch('/api/admin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_code', code, password })
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); return; }
        setConfirmAction(null);
        fetchCodes(password);
    };

    const resetCode = async (code) => {
        const res = await fetch('/api/admin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset_code', code, password })
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error); return; }
        setConfirmAction(null);
        fetchCodes(password);
    };

    const logout = () => {
        setIsLoggedIn(false);
        setPassword('');
        setValidCodes([]); setActiveCodes([]); setBurnedCodes([]);
        setConfirmAction(null);
    };

    if (!isLoggedIn) {
        return (
            <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', alignItems:'center', background:'#0a0a0a', direction:'ltr' }}>
                <div style={{ padding:'40px', background:'#141414', borderRadius:'15px', border:'1px solid #2a2a2a', textAlign:'center' }}>
                    <h2 style={{ color:'#fff', marginBottom:'4px' }}>Admin Login</h2>
                    <p style={{ color:'#888', fontSize:'13px', marginBottom:'20px' }}>QuickSellPro</p>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchCodes(password)}
                        placeholder="Password"
                        style={{ padding:'10px', width:'100%', marginBottom:'15px', borderRadius:'8px', border:'none', background:'#fff', color:'#1a1a1a' }} />
                    <button onClick={() => fetchCodes(password)} disabled={loading}
                        style={{ padding:'10px 20px', background:'linear-gradient(90deg,#e53935,#b71c1c)', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', opacity: loading ? 0.6 : 1 }}>
                        {loading ? 'Checking...' : 'Login'}
                    </button>
                    {loginError && (
                        <p style={{ color:'#ff5252', fontSize:'13px', marginTop:'15px' }}>{loginError}</p>
                    )}
                </div>
            </div>
        );
    }

    const liStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', borderBottom:'1px solid rgba(255,255,255,0.08)', flexWrap:'wrap', gap:'6px' };

    // Delete/Reset now only need a single confirmation click — no second password.
    const ActionButtons = ({ code, type }) => {
        const isConfirmingDelete = confirmAction && confirmAction.code === code && confirmAction.type === type && confirmAction.kind === 'delete';
        const isConfirmingReset = confirmAction && confirmAction.code === code && confirmAction.type === type && confirmAction.kind === 'reset';

        if (isConfirmingDelete) {
            return (
                <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
                    <span style={{ color:'#ff8a80', fontSize:'12px' }}>Delete this code?</span>
                    <button onClick={() => deleteCode(code)}
                        style={{ background:'#ff5252', color:'#fff', border:'none', borderRadius:'5px', padding:'4px 8px', cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>
                        ✓ Confirm
                    </button>
                    <button onClick={() => setConfirmAction(null)}
                        style={{ background:'transparent', color:'#aaa', border:'1px solid #444', borderRadius:'5px', padding:'4px 7px', cursor:'pointer', fontSize:'13px' }}>
                        ✕
                    </button>
                </div>
            );
        }

        if (isConfirmingReset) {
            return (
                <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
                    <span style={{ color:'#b9f6ca', fontSize:'12px' }}>Reset this code?</span>
                    <button onClick={() => resetCode(code)}
                        style={{ background:'#69f0ae', color:'#000', border:'none', borderRadius:'5px', padding:'4px 8px', cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>
                        ✓ Confirm
                    </button>
                    <button onClick={() => setConfirmAction(null)}
                        style={{ background:'transparent', color:'#aaa', border:'1px solid #444', borderRadius:'5px', padding:'4px 7px', cursor:'pointer', fontSize:'13px' }}>
                        ✕
                    </button>
                </div>
            );
        }

        return (
            <div style={{ display:'flex', gap:'6px' }}>
                {type === 'active' && (
                    <button onClick={() => setConfirmAction({ code, type, kind: 'reset' })}
                        style={{ background:'transparent', color:'#69f0ae', border:'1px solid #69f0ae', borderRadius:'5px', padding:'4px 10px', cursor:'pointer', fontSize:'13px' }}>
                        Reset
                    </button>
                )}
                <button onClick={() => setConfirmAction({ code, type, kind: 'delete' })}
                    style={{ background:'transparent', color:'#ff5252', border:'1px solid #ff5252', borderRadius:'5px', padding:'4px 10px', cursor:'pointer', fontSize:'13px' }}>
                    Delete
                </button>
            </div>
        );
    };

    return (
        <div style={{ minHeight:'100vh', background:'#0a0a0a', color:'#e0e0e0', padding:'30px', fontFamily:'Arial', direction:'ltr' }}>
            <div style={{ maxWidth:'860px', margin:'0 auto 10px', display:'flex', justifyContent:'flex-end' }}>
                <button onClick={logout}
                    style={{ padding:'8px 18px', background:'transparent', color:'#bdbdbd', border:'1px solid #444', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'bold' }}>
                    Logout
                </button>
            </div>

            <h1 style={{ textAlign:'center', color:'#fff', marginBottom:'2px' }}>
                <span style={{ color:'#e53935' }}>QuickSellPro</span> Admin Panel
            </h1>
            <p style={{ textAlign:'center', color:'#888', fontSize:'13px', marginBottom:'25px' }}>Activation Codes Management</p>

            {/* Burned counter */}
            <div style={{ textAlign:'center', marginBottom:'25px' }}>
                <div style={{ display:'inline-block', background:'#1a0d0d', border:'2px solid #e53935', borderRadius:'12px', padding:'12px 35px' }}>
                    <div style={{ color:'#ff8a80', fontSize:'13px', marginBottom:'4px' }}>Total Burned Codes</div>
                    <div style={{ color:'#e53935', fontSize:'2.8rem', fontWeight:'900', lineHeight:1 }}>{burnedCodes.length}</div>
                    <div style={{ color:'#ff8a80', fontSize:'12px', marginTop:'4px' }}>burned codes 🔥</div>
                </div>
            </div>

            {/* Add code */}
            <div style={{ maxWidth:'860px', margin:'0 auto 25px', background:'#111', padding:'25px', borderRadius:'15px', border:'1px solid #2a2a2a' }}>
                <h3 style={{ color:'#fff', marginBottom:'12px' }}>Add New Code</h3>
                <div style={{ display:'flex', gap:'10px' }}>
                    <input type="text" value={newCode} onChange={(e) => setNewCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCode()}
                        placeholder="Enter new code"
                        style={{ flex:1, padding:'10px', borderRadius:'8px', border:'1px solid #333', background:'#1a1a1a', color:'#fff' }} />
                    <button onClick={addCode}
                        style={{ padding:'10px 25px', background:'#2e7d32', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold' }}>
                        Add
                    </button>
                </div>
            </div>

            {/* Three columns */}
            <div style={{ display:'flex', gap:'15px', maxWidth:'860px', margin:'0 auto', flexWrap:'wrap' }}>

                {/* Valid */}
                <div style={{ flex:1, minWidth:'220px', background:'#111', padding:'20px', borderRadius:'15px', border:'1px solid #2a2a2a' }}>
                    <h3 style={{ color:'#69f0ae', textAlign:'center', marginBottom:'12px' }}>✅ Valid ({validCodes.length})</h3>
                    <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                        {validCodes.map(code => (
                            <li key={code} style={liStyle}>
                                <span>{code}</span>
                                <ActionButtons code={code} type="valid" />
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Active */}
                <div style={{ flex:1, minWidth:'220px', background:'#161200', padding:'20px', borderRadius:'15px', border:'1px solid #f57f17' }}>
                    <h3 style={{ color:'#ffca28', textAlign:'center', marginBottom:'12px' }}>⏳ Active ({activeCodes.length})</h3>
                    <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                        {activeCodes.map(code => (
                            <li key={code} style={liStyle}>
                                <span style={{ color:'#ffca28' }}>{code}</span>
                                <ActionButtons code={code} type="active" />
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Burned */}
                <div style={{ flex:1, minWidth:'220px', background:'#1a0d0d', padding:'20px', borderRadius:'15px', border:'1px solid #e53935' }}>
                    <h3 style={{ color:'#ff5252', textAlign:'center', marginBottom:'12px' }}>🔥 Burned ({burnedCodes.length})</h3>
                    <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                        {burnedCodes.map(code => (
                            <li key={code} style={liStyle}>
                                <span style={{ textDecoration:'line-through', color:'#ff8a80' }}>{code}</span>
                                <ActionButtons code={code} type="burned" />
                            </li>
                        ))}
                    </ul>
                </div>

            </div>
        </div>
    );
}
