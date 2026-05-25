// VoyageAI · 旅跡 — App Logo
// Globe with a flight-path arc — gradient purple-to-cyan

interface AppLogoProps {
  size?: number;
  className?: string;
}

export default function AppLogo({ size = 32, className = "" }: AppLogoProps) {
  const id = "voyageai-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="50%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Background circle */}
      <rect width="40" height="40" rx="10" fill={`url(#${id})`} />
      {/* Globe outline */}
      <circle cx="20" cy="20" r="10" stroke="white" strokeWidth="1.5" fill="none" opacity="0.9" />
      {/* Latitude lines */}
      <ellipse cx="20" cy="20" rx="4.5" ry="10" stroke="white" strokeWidth="1" fill="none" opacity="0.5" />
      <line x1="10" y1="20" x2="30" y2="20" stroke="white" strokeWidth="1" opacity="0.5" />
      <line x1="11.5" y1="15" x2="28.5" y2="15" stroke="white" strokeWidth="0.8" opacity="0.35" />
      <line x1="11.5" y1="25" x2="28.5" y2="25" stroke="white" strokeWidth="0.8" opacity="0.35" />
      {/* Flight path arc */}
      <path
        d="M 12 26 Q 20 8 28 14"
        stroke="#fbbf24"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.95"
      />
      {/* Plane dot at end of path */}
      <circle cx="28" cy="14" r="2" fill="#fbbf24" opacity="0.95" />
      {/* Origin dot */}
      <circle cx="12" cy="26" r="1.5" fill="white" opacity="0.8" />
    </svg>
  );
}
