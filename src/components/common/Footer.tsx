import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="app-footer-content">
        <span>Developed By <strong style={{ color: '#0A192F' }}>Shlok Raskar</strong></span>
        <span className="app-footer-sep" style={{ color: '#CBD5E1' }}>|</span>
        <span>Copyrights <strong style={{ color: '#0A192F' }}>Shlok Raskar</strong> 2026</span>
      </div>
    </footer>
  );
};
