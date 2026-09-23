import React, { useState, useEffect } from 'react';
import { User } from './types';
import { initializeDatabase } from './db';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { TraineeDashboard } from './pages/trainee/TraineeDashboard';
import './styles/theme.css';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const bootApp = async () => {
      try {
        await initializeDatabase();
        // Restore session if available
        const savedUser = sessionStorage.getItem('etihad_active_user');
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }
      } catch (err) {
        console.error('Failed to initialize database:', err);
      } finally {
        setInitializing(false);
      }
    };
    bootApp();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    sessionStorage.setItem('etihad_active_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('etihad_active_user');
  };

  if (initializing) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A192F',
          color: '#C5A059',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '1.1rem',
          fontWeight: 600,
        }}
      >
        Initializing Etihad Engineering OJE Portal...
      </div>
    );
  }

  return (
    <div className="app-container">
      {currentUser && <Header user={currentUser} onLogout={handleLogout} />}

      {!currentUser ? (
        <Login onLoginSuccess={handleLoginSuccess} />
      ) : currentUser.role === 'MASTER' || currentUser.role === 'INSTRUCTOR' ? (
        <AdminDashboard currentUser={currentUser} />
      ) : (
        <TraineeDashboard currentUser={currentUser} />
      )}

      {currentUser && <Footer />}
    </div>
  );
};

export default App;
