/* The mark is the diagram: a beam from the top left, a point-up prism, and
   three rays falling out of the base. Used for the favicon and the site brand. */
export function PrismMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path d="M16 5 L27 26 H5 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 4 L12 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 22 L8 31" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 22 L16 31" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 22 L24 31" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
