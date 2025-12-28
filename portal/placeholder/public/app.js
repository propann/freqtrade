import React, { useEffect, useState } from 'https://esm.sh/react@18';
import { createRoot } from 'https://esm.sh/react-dom@18/client';

const apiBase = `${window.location.origin}/api/v1`;

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  const navigate = (to) => {
    window.history.pushState({}, '', to);
    setPath(to);
  };
  return { path, navigate };
}

function apiRequest(path, { method = 'GET', body } = {}, token) {
  return fetch(`${apiBase}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }
    return data;
  });
}

function App() {
  const { path, navigate } = useRoute();
  const [token, setToken] = useState(localStorage.getItem('portal_token') || '');
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    apiRequest('/auth/me', {}, token)
      .then((data) => setMe(data.user))
      .catch(() => {
        setToken('');
        localStorage.removeItem('portal_token');
      });
  }, [token]);

  useEffect(() => {
    if (!token && path !== '/login') {
      navigate('/login');
    }
  }, [token, path, navigate]);

  if (!token || path === '/login') {
    return <Login onLogin={(newToken) => {
      setToken(newToken);
      localStorage.setItem('portal_token', newToken);
      navigate('/dashboard');
    }} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Quant-Core Portal</h1>
        <div className="nav-links">
          <NavLink active={path === '/dashboard'} onClick={() => navigate('/dashboard')}>Dashboard</NavLink>
          <NavLink active={path.startsWith('/sessions')} onClick={() => navigate('/sessions')}>Sessions</NavLink>
          <NavLink active={path === '/admin'} onClick={() => navigate('/admin')}>Admin</NavLink>
        </div>
        <div style={{ marginTop: 'auto', fontSize: '12px', color: '#94a3b8' }}>
          Signed in as {me?.email}
        </div>
        <button className="secondary" onClick={() => {
          setToken('');
          localStorage.removeItem('portal_token');
          navigate('/login');
        }}>Log out</button>
      </aside>
      <main className="main">
        {path === '/dashboard' && <Dashboard token={token} />}
        {path === '/sessions' && <Sessions token={token} navigate={navigate} />}
        {path.startsWith('/sessions/') && <SessionDetail token={token} sessionId={path.split('/')[2]} />}
        {path === '/admin' && <Admin token={token} />}
      </main>
    </div>
  );
}

function NavLink({ active, onClick, children }) {
  return (
    <a href="#" className={active ? 'active' : ''} onClick={(event) => {
      event.preventDefault();
      onClick();
    }}>{children}</a>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="login-page card">
      <h2>Sign in</h2>
      <p>Use your admin credentials to access the control plane.</p>
      <div className="form-row">
        <label>
          Email
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        <button onClick={() => {
          setError('');
          apiRequest('/auth/login', { method: 'POST', body: { email, password } })
            .then((data) => onLogin(data.token))
            .catch((err) => setError(err.message));
        }}>Login</button>
      </div>
    </div>
  );
}

function Dashboard({ token }) {
  const [tenant, setTenant] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    apiRequest('/tenants/me', {}, token).then((data) => setTenant(data.tenant));
    apiRequest('/subscription/me', {}, token).then((data) => setSubscription(data.subscription));
  }, [token]);

  return (
    <>
      <div className="topbar">
        <h2>Dashboard</h2>
      </div>
      <div className="status-grid">
        <div className="status-card">
          <h4>Tenant</h4>
          <p>{tenant?.id || 'Loading...'}</p>
          <span className="badge">{tenant?.email}</span>
        </div>
        <div className="status-card">
          <h4>Subscription</h4>
          <p>{subscription?.status || 'Loading...'}</p>
          <span className="badge">{subscription?.plan}</span>
        </div>
      </div>
    </>
  );
}

function Sessions({ token, navigate }) {
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const refresh = () => {
    apiRequest('/sessions', {}, token).then((data) => setSessions(data.sessions));
  };

  useEffect(() => {
    refresh();
  }, [token]);

  const createSession = () => {
    setError('');
    apiRequest('/sessions', { method: 'POST', body: { name } }, token)
      .then((data) => {
        setName('');
        refresh();
        navigate(`/sessions/${data.session.id}`);
      })
      .catch((err) => setError(err.message));
  };

  return (
    <>
      <div className="topbar">
        <h2>Sessions</h2>
        <button onClick={refresh} className="ghost">Refresh</button>
      </div>
      <div className="card">
        <h3>Create session</h3>
        <div className="form-row">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Session name" />
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
          <button onClick={createSession}>Create</button>
        </div>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.name}</td>
                <td><span className="badge">{session.status}</span></td>
                <td>{new Date(session.created_at).toLocaleString()}</td>
                <td>
                  <div className="actions">
                    <button className="ghost" onClick={() => navigate(`/sessions/${session.id}`)}>Open</button>
                    <button onClick={() => apiRequest(`/sessions/${session.id}/start`, { method: 'POST' }, token).then(refresh)}>Start</button>
                    <button className="secondary" onClick={() => apiRequest(`/sessions/${session.id}/stop`, { method: 'POST' }, token).then(refresh)}>Stop</button>
                    <button className="secondary" onClick={() => apiRequest(`/sessions/${session.id}/backtest`, { method: 'POST' }, token).then(refresh)}>Backtest</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SessionDetail({ token, sessionId }) {
  const [session, setSession] = useState(null);
  const [logs, setLogs] = useState([]);

  const refresh = () => {
    apiRequest(`/sessions/${sessionId}`, {}, token).then((data) => setSession(data.session));
    apiRequest(`/sessions/${sessionId}/logs?tail=200`, {}, token).then((data) => setLogs(data.lines));
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [sessionId]);

  if (!session) {
    return <div className="card">Loading session...</div>;
  }

  return (
    <>
      <div className="topbar">
        <h2>{session.name}</h2>
        <button className="ghost" onClick={refresh}>Refresh</button>
      </div>
      <div className="card">
        <h3>Status</h3>
        <p><span className="badge">{session.status}</span></p>
        <div className="actions">
          <button onClick={() => apiRequest(`/sessions/${session.id}/start`, { method: 'POST' }, token).then(refresh)}>Start</button>
          <button className="secondary" onClick={() => apiRequest(`/sessions/${session.id}/stop`, { method: 'POST' }, token).then(refresh)}>Stop</button>
          <button className="secondary" onClick={() => apiRequest(`/sessions/${session.id}/backtest`, { method: 'POST' }, token).then(refresh)}>Backtest</button>
        </div>
      </div>
      <div className="card">
        <h3>Logs (tail)</h3>
        <div className="log-box">
          {logs.length === 0 ? 'No logs yet.' : logs.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </div>
    </>
  );
}

function Admin({ token }) {
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    apiRequest('/subscription/me', {}, token).then((data) => setSubscription(data.subscription));
  }, [token]);

  return (
    <div className="card">
      <h2>Admin overview</h2>
      <p>Default plan: {subscription?.plan}</p>
      <p>Status: {subscription?.status}</p>
      <p>Use the sessions screen to create and manage bot runs.</p>
    </div>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
