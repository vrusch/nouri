
interface LogoIconProps {
  className?: string;
  /** Křivka se "kreslí" (stroke-dashoffset smyčka) a jiskřička pulzuje — pro loading obrazovku
   *  v App.tsx, ne pro běžné statické použití v hlavičce/onboardingu. */
  animated?: boolean;
}

export const LogoIcon = ({ className = "w-8 h-8", animated = false }: LogoIconProps) => (
  <svg
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="bloomGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF9AB0" />
        <stop offset="100%" stopColor="#C43A5C" />
      </linearGradient>
      <linearGradient id="starGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FBC4D0" />
        <stop offset="100%" stopColor="#E14E72" />
      </linearGradient>
    </defs>
    <path
      d="M 15 80 L 15 35 C 15 10, 45 10, 45 35 L 45 65 C 45 90, 75 90, 75 65 L 75 25"
      fill="none"
      stroke="url(#bloomGradMain)"
      strokeWidth="14"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(animated ? { pathLength: 1, className: "animate-logo-draw" } : {})}
    />
    <path
      d="M 88 5 Q 88 15 98 15 Q 88 15 88 25 Q 88 15 78 15 Q 88 15 88 5 Z"
      fill="url(#starGrad)"
      className={animated ? "animate-pulse" : undefined}
    />
  </svg>
);

export const LogoHorizontal = ({ className = "" }) => (
  <div className={`flex items-center gap-2 select-none ${className}`}>
    <LogoIcon className="w-8 h-8" />
    <span className="font-display italic text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100 transition-colors">
      Nouri<span className="text-rose-500">.</span>
    </span>
  </div>
);

export const LogoVertical = ({ className = "" }) => (
  <div className={`flex flex-col items-center gap-3 select-none ${className}`}>
    <LogoIcon className="w-16 h-16" />
    <span className="font-display italic text-4xl font-semibold tracking-tight text-slate-800 dark:text-slate-100 transition-colors">
      Nouri<span className="text-rose-500">.</span>
    </span>
  </div>
);
