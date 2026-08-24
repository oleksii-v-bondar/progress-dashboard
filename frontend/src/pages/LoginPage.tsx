import { useState, FormEvent } from 'react';
import { login } from '../api/client';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);
    const success = await login(password);
    setLoading(false);
    if (success) {
      onLogin();
    } else {
      setError(true);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
    }}>
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '32px',
        background: 'var(--bg-secondary)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        width: '100%',
        maxWidth: '300px',
        margin: '0 16px',
      }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', textAlign: 'center' }}>
          Login
        </h2>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            padding: '10px 12px',
            borderRadius: '6px',
            border: error ? '1px solid #ef4444' : '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        {error && (
          <span style={{ color: '#ef4444', fontSize: '13px' }}>Wrong password</span>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            padding: '10px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--accent)',
            color: 'white',
            fontSize: '14px',
            cursor: 'pointer',
            opacity: loading || !password ? 0.6 : 1,
          }}
        >
          {loading ? 'Logging in...' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
