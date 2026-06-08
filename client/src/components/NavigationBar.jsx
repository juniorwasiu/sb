import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const HamburgerIcon = ({ isOpen }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d={isOpen ? "M18 6L6 18M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    />
  </svg>
);

export default function NavigationBar() {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 992);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 992;
      setIsMobile(mobile);
      if (!mobile) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems = [
    { path: '/', label: 'Pattern Intel', icon: '🔮' },
    { path: '/predictions', label: 'Live Predictor & History', icon: '⚡' }
  ];

  // Auto-close menu when route changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <nav className="ultra-glass" style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: isMobile ? 'flex-start' : 'center',
      padding: isMobile ? '12px 18px' : '12px 24px',
      gap: isMobile ? '0px' : '8px',
      margin: isMobile ? '12px auto' : '20px auto 40px auto',
      borderRadius: 'var(--radius-lg)',
      width: isMobile ? 'calc(100% - 32px)' : 'fit-content',
      position: 'sticky',
      top: '12px',
      zIndex: 100,
      border: '1px solid var(--glass-border-bright)',
      transition: 'all 0.3s ease'
    }}>
      {/* Mobile Top Row */}
      {isMobile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '40px'
        }}>
          <span style={{ 
            color: 'white', 
            fontWeight: 800, 
            fontSize: '1rem', 
            letterSpacing: '-0.01em', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <span>🔮</span> Mango Intel
          </span>
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '6px',
              outline: 'none',
              transition: 'background-color 0.2s',
              backgroundColor: menuOpen ? 'rgba(255,255,255,0.05)' : 'transparent'
            }}
          >
            <HamburgerIcon isOpen={menuOpen} />
          </button>
        </div>
      )}

      {/* Nav Items List */}
      <div style={{
        display: (!isMobile || menuOpen) ? 'flex' : 'none',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '6px',
        marginTop: isMobile ? '12px' : '0px',
        transition: 'all 0.3s ease'
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
                boxShadow: isActive ? '0 0 15px rgba(0, 229, 255, 0.2)' : 'none',
                width: isMobile ? 'auto' : 'fit-content'
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{item.icon}</span> 
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
