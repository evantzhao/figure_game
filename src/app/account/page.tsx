'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { api, useApp } from '@/components/providers';

type FormMode = 'login' | 'register' | 'recover';
export default function Account() {
  const { user, online, loading, refresh } = useApp(), router = useRouter();
  const [mode, setMode] = useState<FormMode>('login');
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState(''), [issuedCode, setIssuedCode] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api(mode, { username, password, ...(mode === 'recover' ? { recoveryCode } : {}) });
      setPassword(''); setRecoveryCode('');
      if (mode === 'recover') { setMode('login'); setNotice('Password reset. Sign in and generate a new recovery code. All previous sessions have been signed out.'); return; }
      await refresh();
      const next = new URLSearchParams(location.search).get('next');
      router.push(next && /^\/game\/[a-f0-9-]+$/.test(next) ? next : mode === 'register' ? '/account' : '/');
    });
  }
  function switchMode(next: FormMode) { setMode(next); setPassword(''); setRecoveryCode(''); setError(''); setNotice(''); }
  const messages = <>{error && <div className="message error" role="alert">{error}</div>}{notice && <div className="message" role="status">{notice}</div>}</>;
  return <div className="content-page"><div className="account-layout">
    <div className="account-intro"><div className="large-seal">棋</div><p className="eyebrow">A PLACE AT THE TABLE</p><h1>Your games.<br />Your next chapter.</h1><p>Keep the games that taught you something. Find another opponent. Come back to a position with fresh eyes.</p></div>
    {loading ? <p className="loading">Checking your account…</p> : user ? <section className="card account-form">
      <div className="card-eyebrow">WELCOME BACK</div><h2>{user.username}</h2>
      <p className="micro">Casual games are saved automatically. Rated play is still undergoing rules verification.</p>
      <Link href="/history" className="button primary full">View your games<ArrowUpRight size={17} /></Link>
      <Link href="/" className="button secondary full">Back to the board</Link>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const result = await api<{ recoveryCode: string }>('account/recovery-code', { password });
        setIssuedCode(result.recoveryCode); setPassword('');
      }); }}>
        <h3 className="account-section">Protect your account</h3>
        <p className="micro">Save a recovery code in your password manager. It can reset a forgotten password once. Generating a new code replaces the previous one.</p>
        <label htmlFor="current-password">Current password<input id="current-password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className="button secondary full" disabled={busy}>Generate recovery code</button>
      </form>
      {issuedCode && <div className="recovery-code" role="status"><strong>Save this code now. It is shown only here.</strong><code>{issuedCode}</code><button className="button secondary full" onClick={() => void run(async () => {
        try { await navigator.clipboard.writeText(issuedCode); setNotice('Recovery code copied. Store it somewhere safe.'); }
        catch { setNotice('Select the code above and copy it manually.'); }
      })}>Copy recovery code</button><button className="text-link" onClick={() => setIssuedCode('')}>I have saved it</button></div>}
      <details className="account-section"><summary>Delete account</summary>
        <p className="micro">This permanently removes your password, recovery code, sessions, and private practice games. Shared games remain under an anonymous name so your opponents keep their records. Finish any active game or cancel its invitation first.</p>
        <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I understand this cannot be undone.</label>
        <button className="button secondary full" disabled={busy || !confirmed || password.length < 12} onClick={() => void run(async () => {
          await api('account/delete', { password }); setPassword(''); setIssuedCode(''); setConfirmed(false); await refresh(); setNotice('Your account has been deleted.');
        })}>Permanently delete account</button><p className="micro">Enter your current password in the field above to confirm.</p>
      </details>
      {messages}
      <button className="text-link" disabled={busy} onClick={() => void run(async () => { await api('logout', {}); setIssuedCode(''); setPassword(''); await refresh(); })}><LogOut size={15} />Sign out</button>
    </section> : <form className="card account-form" onSubmit={submit}>
      <div className="card-eyebrow">{mode === 'register' ? 'JOIN THE CLUB' : mode === 'recover' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</div>
      <h2>{mode === 'register' ? 'Make yourself at home.' : mode === 'recover' ? 'Return to your games.' : 'Take your seat.'}</h2>
      {!online && <div className="message">Accounts and online play are currently unavailable. You can play the computer without signing in.</div>}
      <label htmlFor="username">Username<input id="username" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" required value={username} onChange={event => setUsername(event.target.value)} /></label>
      {mode === 'recover' && <><label htmlFor="recovery-code">Recovery code<input id="recovery-code" aria-describedby="recovery-hint" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={recoveryCode} onChange={event => setRecoveryCode(event.target.value)} /></label><p id="recovery-hint" className="micro">Use the one-time code you previously saved from your account.</p></>}
      <label htmlFor="password">{mode === 'recover' ? 'New password' : 'Password'}<input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" /></label>
      {messages}
      <button className="button primary full" disabled={busy || !online}>{busy ? 'One moment…' : mode === 'register' ? 'Create account' : mode === 'recover' ? 'Reset password' : 'Sign in'}<ArrowUpRight size={17} /></button>
      <button type="button" className="text-link" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
      {mode === 'login' && <button type="button" className="text-link" onClick={() => switchMode('recover')}>Forgot password? Use a recovery code</button>}
      <p className="micro">Chinese Chess uses a username and password. No email is collected. After signing up, generate and save a recovery code from your account.</p>
    </form>}
  </div></div>;
}
