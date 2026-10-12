/** The SafeBox mark: a box with a lid and one private (amber) dot. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x="3" y="6" width="22" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 11h22" stroke="currentColor" strokeWidth="2" />
      <circle cx="14" cy="17" r="2.5" fill="var(--color-private)" />
    </svg>
  );
}
