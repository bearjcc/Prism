export function ModShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="shot">
      <img className="shot-img" src={src} alt={alt} loading="lazy" decoding="async" />
    </div>
  );
}
