import React from 'react';

const variants = {
  primary:
    'bg-gradient-to-r from-brand-from via-brand-via to-brand-to text-white rounded-lg px-4 py-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent border border-white/10 text-zinc-300 rounded-lg px-4 py-2 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
  icon: 'p-2 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed',
  danger:
    'border border-red-900/50 text-red-400 hover:bg-red-900/20 rounded-lg px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
};

export default function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}) {
  return (
    <button className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
