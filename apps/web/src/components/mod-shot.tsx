export function ModShot({ src, alt }: { src?: string; alt: string }) {
  if (src === undefined) {
    return (
      <div className="shot shot-empty" role="img" aria-label={alt}>
        <span>No preview yet</span>
      </div>
    );
  }
  return (
    <div className="shot">
      <img className="shot-img" src={src} alt={alt} loading="lazy" decoding="async" />
    </div>
  );
}
