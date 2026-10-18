/**
 * The Voidcat mark: the box cat, a closed box with ears (storage) and two slanted, watchful gold eyes, with a soft glow.
 * `onPage` draws it in the text colour for light screens (sign-in, unlock), where white would vanish.
 */
export function Logo({ size = 24, glow = true, onPage = false }: { size?: number; glow?: boolean; onPage?: boolean }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 462) / 420)}
      viewBox="0 0 420 462"
      aria-hidden="true"
      className={onPage ? "text-ink" : "text-void"}
      style={glow && !onPage ? { filter: "drop-shadow(0 0 5px rgb(233 231 242 / 0.55))" } : undefined}
    >
      <path
        d="M15 447 V135 L93 15 L151 117 H267 L327 15 L405 135 V447 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M106 236 L174 266 M314 236 L246 266" stroke="var(--color-eye)" strokeWidth="32" strokeLinecap="round" />
    </svg>
  );
}
