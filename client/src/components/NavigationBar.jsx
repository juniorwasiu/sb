import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function NavigationBar() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Pattern Intel', icon: '🔮' },
    { path: '/advanced-engine', label: 'Advanced AI Engine', icon: '⚡' },
    { path: '/daily-tips', label: 'Daily Tips', icon: '🧠' },
    { path: '/behaviour', label: 'Behaviour', icon: '🧬' },
    { path: '/results', label: 'Dashboard', icon: '📋' },
    { path: '/admin', label: 'Admin', icon: '⚙️' }
  ];

  return (
    <nav className="ultra-glass" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 24px',
      gap: '8px',
      margin: '20px auto 40px auto',
      borderRadius: 'var(--radius-lg)',
      width: 'fit-content',
      flexWrap: 'wrap',
      position: 'sticky',
      top: '20px',
      zIndex: 100,
      border: '1px solid var(--glass-border-bright)'
    }}>
      {navItems.map(item => {
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className="hover-lift"
            style={{
              textDecoration: 'none',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: isActive ? 700 : 500,
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              background: isActive ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
              border: isActive ? '1px solid rgba(0, 229, 255, 0.3)' : '1px solid transparent',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
              boxShadow: isActive ? '0 0 15px rgba(0, 229, 255, 0.2)' : 'none'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{item.icon}</span> 
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
