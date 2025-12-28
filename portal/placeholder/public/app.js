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

function apiRequest(path, { method = 'GET', body } = {}) {
  return fetch(`${apiBase}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
  const [me, setMe] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    apiRequest('/auth/me')
      .then((data) => setMe(data.user))
      .catch(() => {
        setMe(null);
      })
      .finally(() => {
        setAuthReady(true);
      });
  }, []);

  useEffect(() => {
    if (authReady && !me && path !== '/login') {
      navigate('/login');
    }
  }, [authReady, me, path, navigate]);

  if (!authReady) {
    return <div className="login-page card">Checking session...</div>;
  }

  if (!me || path === '/login') {
    return <Login onLogin={(user) => {
      setMe(user);
      navigate('/dashboard');
    }} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"></div>
          <div>
            <h1>Freqtrade Portal</h1>
            <span>Session Control</span>
          </div>
        </div>
        <div className="nav-links">
          <NavLink active={path === '/dashboard'} onClick={() => navigate('/dashboard')}>Dashboard</NavLink>
          <NavLink active={path.startsWith('/sessions')} onClick={() => navigate('/sessions')}>Sessions</NavLink>
          <NavLink active={path === '/logs'} onClick={() => navigate('/logs')}>Logs</NavLink>
          {me?.role === 'admin' && (
            <NavLink active={path === '/admin'} onClick={() => navigate('/admin')}>Admin</NavLink>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="user-meta">
            <span>Signed in</span>
            <strong>{me?.email}</strong>
          </div>
          <button className="secondary" onClick={() => {
            apiRequest('/auth/logout', { method: 'POST' }).finally(() => {
              setMe(null);
              navigate('/login');
            });
          }}>Log out</button>
        </div>
      </aside>
      <main className="main">
        {path === '/dashboard' && <Dashboard />}
        {path === '/sessions' && <Sessions navigate={navigate} />}
        {path.startsWith('/sessions/') && <SessionDetail sessionId={path.split('/')[2]} />}
        {path === '/logs' && <Logs />}
        {path === '/admin' && me?.role === 'admin' && <Admin />}
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
  const canSubmit = email.trim().length > 0 && password.trim().length > 0;
  return (
    <div className="login-page card">
      <h2>Sign in</h2>
      <p>Enter your credentials to access the session control panel.</p>
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
        <button disabled={!canSubmit} onClick={() => {
          setError('');
          apiRequest('/auth/login', { method: 'POST', body: { email, password } })
            .then((data) => onLogin(data.user))
            .catch((err) => setError(err.message));
        }}>Login</button>
      </div>
    </div>
  );
}

function Dashboard() {
  const [tenant, setTenant] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    apiRequest('/tenants/me').then((data) => setTenant(data.tenant));
    apiRequest('/subscription/me').then((data) => setSubscription(data.subscription));
    apiRequest('/sessions').then((data) => setSessions(data.sessions || []));
  }, []);

  const runningCount = sessions.filter((session) => session.status === 'running').length;

  return (
    <>
      <div className="topbar">
        <h2>Dashboard</h2>
        <div className="topbar-actions">
          <span className="pill">Operations</span>
        </div>
      </div>
      <div className="status-grid">
        <div className="status-card">
          <h4>Tenant</h4>
          <p>{tenant?.id || 'Loading...'}</p>
          <span className="badge">{tenant?.email || 'Awaiting tenant'}</span>
        </div>
        <div className="status-card">
          <h4>Subscription</h4>
          <p>{subscription?.status || 'Loading...'}</p>
          <span className="badge">{subscription?.plan || 'Awaiting plan'}</span>
        </div>
        <div className="status-card">
          <h4>Sessions</h4>
          <p>{sessions.length} total</p>
          <span className="badge">{runningCount} running</span>
        </div>
      </div>
      <div className="card">
        <h3>Operations overview</h3>
        <div className="info-grid">
          <div>
            <span className="label">Active risk controls</span>
            <strong>Standard policy</strong>
          </div>
          <div>
            <span className="label">Audit window</span>
            <strong>Last 24 hours</strong>
          </div>
          <div>
            <span className="label">Last sync</span>
            <strong>Moments ago</strong>
          </div>
        </div>
      </div>
    </>
  );
}

function Sessions({ navigate }) {
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const canCreate = name.trim().length > 0;

  const refresh = () => {
    apiRequest('/sessions').then((data) => setSessions(data.sessions));
  };

  useEffect(() => {
    refresh();
  }, []);

  const createSession = () => {
    setError('');
    apiRequest('/sessions', { method: 'POST', body: { name } })
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
          <button disabled={!canCreate} onClick={createSession}>Create</button>
        </div>
      </div>
      <div className="card">
        <div className="table-head">
          <h3>Active sessions</h3>
          <span className="muted">{sessions.length} tracked</span>
        </div>
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
                <td><StatusBadge status={session.status} /></td>
                <td>{new Date(session.created_at).toLocaleString()}</td>
                <td>
                  <div className="actions">
                    <button className="ghost" onClick={() => navigate(`/sessions/${session.id}`)}>Open</button>
                    <button
                      disabled={!canStartSession(session.status)}
                      onClick={() => apiRequest(`/sessions/${session.id}/start`, { method: 'POST' }).then(refresh)}
                    >
                      Start
                    </button>
                    <button
                      className="secondary"
                      disabled={!canStopSession(session.status)}
                      onClick={() => apiRequest(`/sessions/${session.id}/stop`, { method: 'POST' }).then(refresh)}
                    >
                      Stop
                    </button>
                    <button
                      className="secondary"
                      disabled={!canBacktestSession(session.status)}
                      onClick={() => apiRequest(`/sessions/${session.id}/backtest`, { method: 'POST' }).then(refresh)}
                    >
                      Backtest
                    </button>
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

function SessionDetail({ sessionId }) {
  const [session, setSession] = useState(null);
  const [logs, setLogs] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);

  const refresh = () => {
    apiRequest(`/sessions/${sessionId}`).then((data) => setSession(data.session));
    apiRequest(`/sessions/${sessionId}/logs?tail=200`).then((data) => setLogs(data.lines));
    apiRequest(`/audit?session_id=${encodeURIComponent(sessionId)}`).then((data) => setAuditEntries(data.entries || []));
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
        <p><StatusBadge status={session.status} /></p>
        <div className="actions">
          <button
            disabled={!canStartSession(session.status)}
            onClick={() => apiRequest(`/sessions/${session.id}/start`, { method: 'POST' }).then(refresh)}
          >
            Start
          </button>
          <button
            className="secondary"
            disabled={!canStopSession(session.status)}
            onClick={() => apiRequest(`/sessions/${session.id}/stop`, { method: 'POST' }).then(refresh)}
          >
            Stop
          </button>
          <button
            className="secondary"
            disabled={!canBacktestSession(session.status)}
            onClick={() => apiRequest(`/sessions/${session.id}/backtest`, { method: 'POST' }).then(refresh)}
          >
            Backtest
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Logs (tail)</h3>
        <div className="log-box">
          {logs.length === 0 ? 'No logs yet.' : logs.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </div>
      <div className="card">
        <h3>Audit trail</h3>
        <div className="audit-list">
          {auditEntries.length === 0 ? (
            <span className="muted">No audit entries yet.</span>
          ) : (
            auditEntries.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <div>
                  <strong>{entry.action}</strong>
                  <div className="muted">{entry.session_id || 'Tenant scope'}</div>
                </div>
                <div className="audit-meta">
                  <span>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</span>
                  <code>{entry.meta ? JSON.stringify(entry.meta) : '{}'}</code>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Logs() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [logs, setLogs] = useState([]);
  const [tail, setTail] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/sessions')
      .then((data) => {
        setSessions(data.sessions || []);
        if (data.sessions?.length) {
          setActiveSessionId(data.sessions[0].id);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  const refresh = () => {
    if (!activeSessionId) {
      return;
    }
    setLoading(true);
    setError('');
    apiRequest(`/sessions/${activeSessionId}/logs?tail=${tail}`)
      .then((data) => setLogs(data.lines || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [activeSessionId, tail]);

  return (
    <>
      <div className="topbar">
        <h2>Logs</h2>
        <button className="ghost" onClick={refresh} disabled={!activeSessionId || loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="card">
        <h3>Session logs</h3>
        <div className="form-row">
          <label>
            Session
            <select
              className="input"
              value={activeSessionId}
              onChange={(event) => setActiveSessionId(event.target.value)}
            >
              {sessions.length === 0 && <option value="">No sessions</option>}
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} ({session.status})
                </option>
              ))}
            </select>
          </label>
          <label>
            Tail lines
            <input
              className="input"
              type="number"
              min="20"
              max="1000"
              value={tail}
              onChange={(event) => setTail(Number(event.target.value))}
            />
          </label>
          {error && <span className="error">{error}</span>}
        </div>
        <div className="log-box">
          {logs.length === 0 ? 'No logs available.' : logs.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </div>
    </>
  );
}

function Admin() {
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    apiRequest('/subscription/me').then((data) => setSubscription(data.subscription));
  }, []);

  return (
    <>
      <div className="topbar">
        <h2>Admin</h2>
        <span className="pill">Restricted</span>
      </div>
      <div className="card">
        <h3>Subscription controls</h3>
        <div className="info-grid">
          <div>
            <span className="label">Default plan</span>
            <strong>{subscription?.plan || 'Loading...'}</strong>
          </div>
          <div>
            <span className="label">Status</span>
            <strong>{subscription?.status || 'Loading...'}</strong>
          </div>
          <div>
            <span className="label">Governance</span>
            <strong>Managed by operations</strong>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Guidance</h3>
        <p>Use the sessions workspace to create, start, stop, and backtest sessions.</p>
      </div>
    </>
  );
}

function StatusBadge({ status }) {
  const label = statusLabel(status);
  const color = statusColor(status);
  return <span className={`badge badge-${color}`}>{label}</span>;
}

function statusLabel(status) {
  if (status === 'running') return 'Running';
  if (status === 'stopped') return 'Stopped';
  if (status === 'backtest') return 'Backtest';
  return status || 'Unknown';
}

function statusColor(status) {
  if (status === 'running') return 'success';
  if (status === 'stopped') return 'neutral';
  if (status === 'backtest') return 'warning';
  return 'neutral';
}

function canStartSession(status) {
  return status !== 'running' && status !== 'backtest';
}

function canStopSession(status) {
  return status === 'running';
}

function canBacktestSession(status) {
  return status !== 'running' && status !== 'backtest';
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
