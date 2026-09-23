import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        marginTop: 'auto',
        padding: '1.25rem 1rem',
        textAlign: 'center',
        borderTop: '1px solid #E2E8F0',
        backgroundColor: '#FFFFFF',
        color: '#64748B',
        fontSize: '0.85rem',
        fontWeight: 500,
        letterSpacing: '0.2px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '0.4rem',
        }}
      >
        <span>Developed By <strong style={{ color: '#0A192F' }}>Shlok Raskar</strong></span>
        <span style={{ color: '#CBD5E1' }}>|</span>
        <span>Copyrights <strong style={{ color: '#0A192F' }}>Shlok Raskar</strong> 2026</span>
      </div>
    </footer>
  );
};
