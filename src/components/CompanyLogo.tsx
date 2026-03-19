/**
 * 财大气粗总公司 Logo
 * 金色元宝 + 铜钱造型，象征财富与大气
 */
export function CompanyLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 底部铜钱 */}
      <ellipse cx="32" cy="44" rx="22" ry="10" fill="url(#coin-grad)" opacity="0.85" />
      <ellipse cx="32" cy="44" rx="8" ry="3.5" fill="#1e293b" />
      <rect x="28" y="40.5" width="8" height="7" rx="0.5" fill="#1e293b" />

      {/* 金元宝 */}
      <path
        d="M12 34c0 0 4-14 20-14s20 14 20 14c0 4-9 8-20 8S12 38 12 34z"
        fill="url(#ingot-grad)"
      />
      <path
        d="M18 28c0 0 3-6 14-6s14 6 14 6c0 2-6 5-14 5S18 30 18 28z"
        fill="url(#ingot-top)"
        opacity="0.9"
      />
      {/* 元宝高光 */}
      <ellipse cx="26" cy="27" rx="4" ry="1.5" fill="white" opacity="0.35" />

      {/* 顶部光芒 */}
      <line x1="32" y1="6" x2="32" y2="12" stroke="url(#ray-grad)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="9" x2="25" y2="14" stroke="url(#ray-grad)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="42" y1="9" x2="39" y2="14" stroke="url(#ray-grad)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="16" y1="15" x2="20" y2="18" stroke="url(#ray-grad)" strokeWidth="1" strokeLinecap="round" />
      <line x1="48" y1="15" x2="44" y2="18" stroke="url(#ray-grad)" strokeWidth="1" strokeLinecap="round" />

      <defs>
        <linearGradient id="ingot-grad" x1="12" y1="20" x2="52" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbbf24" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="ingot-top" x1="18" y1="22" x2="46" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="coin-grad" x1="10" y1="34" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d97706" />
          <stop offset="0.5" stopColor="#b45309" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="ray-grad" x1="32" y1="6" x2="32" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
