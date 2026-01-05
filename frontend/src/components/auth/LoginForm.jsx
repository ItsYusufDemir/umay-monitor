// src/components/auth/LoginForm.jsx
import React, { useState } from 'react';
import logo from '../logo.png';

const LoginForm = ({ onSubmit, loading, error }) => {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(email, password, rememberMe);
  };

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleSubmit}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img 
  src={logo} 
  alt="Umay Monitor" 
  style={{ 
    width: '240px', 
    height: '240px', 
    objectFit: 'contain', 
    transform: 'scale(2)' // Increase or decrease this number to fit
  }} 
/>
        </div>
        <h2>Admin Login</h2>
        <div className="input-group">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@localhost"
          />
        </div>

        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div className="login-options">
          <label>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />{' '}
            Remember me
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => alert('Forgot password flow not implemented')}
          >
            Forgot password?
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
