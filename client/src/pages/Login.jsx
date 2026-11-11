import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import { useAuth } from '../auth.jsx';
import './Login.css';

export default function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to={from} replace />;

  function switchMode(next) {
    setCreating(next);
    setError('');
    setFieldErrors({});
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setFieldErrors({});
    setNotice('');

    if (creating && password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setBusy(true);
    try {
      if (creating) {
        await api.post('/auth/register', { orgName: orgName.trim(), email: email.trim(), password });
        // Registration creates an owner account but does not start a session.
        // Sign in normally to establish the secure httpOnly session cookie.
        try {
          await login(email.trim(), password);
          navigate('/', { replace: true });
        } catch {
          // Account creation succeeded. Do not suggest submitting registration again.
          setCreating(false);
          setPassword('');
          setConfirmPassword('');
          setNotice('Account created successfully. Sign in with your email and password.');
        }
      } else {
        await login(email.trim(), password);
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.message || (creating ? 'Could not create account' : 'Could not sign in'));
      setFieldErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <Card
        className="login__card"
        title={creating ? 'Create account' : 'Sign in'}
        subtitle={creating
          ? 'Set up your organization and its first owner account.'
          : 'Welcome back. Enter your details to continue.'}
      >
        <form className="login__form" onSubmit={handleSubmit}>
          {creating && (
            <label className="login__field">
              <span>Organization name</span>
              <input type="text" required autoFocus maxLength={100} autoComplete="organization"
                value={orgName} onChange={(e) => setOrgName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.orgName)} />
              {fieldErrors.orgName && <span className="login__field-error">{fieldErrors.orgName}</span>}
            </label>
          )}
          <label className="login__field">
            <span>Email</span>
            <input type="email" autoComplete="username" required autoFocus={!creating}
              value={email} onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)} />
            {fieldErrors.email && <span className="login__field-error">{fieldErrors.email}</span>}
          </label>
          <label className="login__field">
            <span>Password</span>
            <input type="password" autoComplete={creating ? 'new-password' : 'current-password'}
              required minLength={creating ? 8 : undefined} maxLength={128}
              value={password} onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)} />
            {creating && <span className="login__hint">At least 8 characters.</span>}
            {fieldErrors.password && <span className="login__field-error">{fieldErrors.password}</span>}
          </label>
          {creating && (
            <label className="login__field">
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" required minLength={8}
                maxLength={128} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)} />
              {fieldErrors.confirmPassword && <span className="login__field-error">{fieldErrors.confirmPassword}</span>}
            </label>
          )}
          {error && <p className="login__error" role="alert">{error}</p>}
          {notice && <p className="login__success" role="status">{notice}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? (creating ? 'Creating account…' : 'Signing in…') : (creating ? 'Create account' : 'Sign in')}
          </Button>
          <p className="login__switch">
            {creating ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" disabled={busy}
              onClick={() => switchMode(!creating)}>
              {creating ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </form>
      </Card>
    </div>
  );
}
