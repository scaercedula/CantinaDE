import React from 'react';

export const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white/70 backdrop-blur-xl border border-white/50 shadow-glass rounded-3xl p-6 ${className}`}>
    {children}
  </div>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  
}
export const GlassInput: React.FC<InputProps> = ({ label, className = '', ...props }) => (
  <div className="mb-4 w-full">
    {label && <label className="block text-xs font-bold text-gray-500 mb-2 ml-1 uppercase tracking-wider">{label}</label>}
    <input
      className={`w-full bg-white/50 border border-white/60 focus:border-brand-500 rounded-xl px-4 py-4 text-gray-900 font-medium placeholder-gray-400 focus:outline-none focus:bg-white/80 transition-all text-lg shadow-sm ${className}`}
      {...props}
    />
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}
export const GlassButton: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center shadow-lg";
  
  const variants = {
    primary: "bg-brand-600 hover:bg-brand-500 text-white shadow-brand-500/30 border border-transparent",
    secondary: "bg-white/60 hover:bg-white/80 backdrop-blur-md text-gray-800 border border-white/60 shadow-glass",
    danger: "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30",
    ghost: "bg-transparent hover:bg-black/5 text-gray-600 hover:text-gray-900 shadow-none"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let colorClass = 'bg-gray-100/80 text-gray-600 border-gray-200';
  if (status === 'CONCLUIDO') colorClass = 'bg-emerald-100/80 text-emerald-700 border-emerald-200/50';
  if (status === 'PENDENTE') colorClass = 'bg-amber-100/80 text-amber-700 border-amber-200/50';
  if (status === 'CANCELADO') colorClass = 'bg-red-100/80 text-red-700 border-red-200/50';

  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border backdrop-blur-sm ${colorClass}`}>
      {status}
    </span>
  );
};

export const StatCard: React.FC<{ title: string; value: string | number; icon?: React.ReactNode; color?: string }> = ({ title, value, icon, color = "text-gray-900" }) => (
  <GlassCard className="flex flex-col items-center justify-center p-6 border-b-4 border-brand-500/50">
    <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-2">{title}</span>
    <div className={`text-3xl font-black ${color} flex items-center gap-3 drop-shadow-sm`}>
      {icon}
      {value}
    </div>
  </GlassCard>
);
