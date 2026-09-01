export function HomeSurface() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.dataset.surface="home";document.documentElement.removeAttribute("data-theme")`,
      }}
    />
  );
}
