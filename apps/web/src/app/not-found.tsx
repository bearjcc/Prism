import { SiteShell } from "../components/site-shell";

export default function NotFound() {
  return (
    <SiteShell>
      <div className="page-head">
        <h1>Not found</h1>
        <p>That page is not in the fixture catalogue.</p>
      </div>
    </SiteShell>
  );
}
