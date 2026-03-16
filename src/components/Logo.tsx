export const LogoIcon = ({ className = "w-8 h-8" }) => (
  <svg
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="blueGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
    </defs>
    <path
      d="M50 15 C 20 15, 15 45, 15 45 C 15 45, 30 35, 50 35 C 70 35, 85 45, 85 45 C 85 45, 80 15, 50 15 Z"
      fill="url(#blueGradMain)"
      opacity="0.9"
    />
    <path
      d="M50 35 C 30 55, 30 85, 50 85 C 70 85, 70 55, 50 35 Z"
      fill="#2563eb"
    />
    <circle cx="50" cy="85" r="4" fill="#1e40af" />
  </svg>
);

export const LogoHorizontal = ({ className = "" }) => (
  <div className={`flex items-center gap-2 select-none ${className}`}>
    <LogoIcon className="w-8 h-8 drop-shadow-sm" />
    <span className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 transition-colors">
      Nouri<span className="text-blue-500">.</span>
    </span>
  </div>
);
