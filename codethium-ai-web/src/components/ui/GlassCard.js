import React from 'react';

export default function GlassCard({ className = '', children, ...props }) {
  return (
    <div
      className={`glass gradient-border rounded-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
