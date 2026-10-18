/**
 * The Voidcat mark: the line cat, one open stroke with two slanted eyes, white with gold eyes and a soft glow.
 * `onPage` draws it in the text colour for light screens (sign-in, unlock), where white would vanish.
 */
export function Logo({ size = 24, glow = true, onPage = false }: { size?: number; glow?: boolean; onPage?: boolean }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 222) / 200)}
      viewBox="0 0 200 222"
      aria-hidden="true"
      className={onPage ? "text-ink" : "text-void"}
      style={glow && !onPage ? { filter: "drop-shadow(0 0 5px rgb(233 231 242 / 0.55))" } : undefined}
    >
      <path
        d="M58 214 C18 190 4 150 10 102 L12 10 L66 58 Q100 50 134 58 L188 10 L190 102 C196 150 182 190 142 214"
        fill="none"
        stroke="currentColor"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M50 124 L80 136 M150 124 L120 136" stroke="var(--color-eye)" strokeWidth="13" strokeLinecap="round" />
    </svg>
  );
}
