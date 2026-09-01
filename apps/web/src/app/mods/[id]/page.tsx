import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentsPanel } from "../../../components/comments-panel";
import { InstallControl } from "../../../components/install-control";
import { ModShot } from "../../../components/mod-shot";
import { SiteShell } from "../../../components/site-shell";
import { catalogue, formatInstalls, formatRating, getMod } from "../../../lib/catalogue";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  return catalogue().map((mod) => ({ id: mod.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const mod = getMod(id);
  return { title: mod?.name ?? "Mod" };
}

export default async function ModPage({ params }: Props) {
  const { id } = await params;
  const mod = getMod(id);
  if (!mod) {
    notFound();
  }

  return (
    <SiteShell>
      <article className="mod-page">
        <header className="mod-id">
          <h1>
            <span className="mark" aria-hidden="true" />
            {mod.name}
          </h1>
          <p>
            {mod.author}
            <span aria-hidden="true"> / </span>
            {mod.site}
            <span aria-hidden="true"> / </span>
            {mod.version}
            <span aria-hidden="true"> / </span>
            {formatInstalls(mod.installs)} installs
            <span aria-hidden="true"> / </span>
            {formatRating(mod)}
          </p>
          <p className="mod-install">
            <InstallControl className="btn btn-solid" labelInstall="Install" />
          </p>
        </header>
        <section className="caps" aria-labelledby="caps-heading">
          <h2 id="caps-heading">Capabilities</h2>
          <ul>
            {mod.capabilities.map((cap) => (
              <li key={cap.id}>
                <code>{cap.id}</code>
                <span>{cap.required ? "required" : "optional"}</span>
                <span>{cap.summary}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="shot-strip">
          <ModShot hue={mod.screenshotHue} label={mod.screenshotLabel} scene={mod.screenshotScene} />
        </div>
        <section className="mod-copy">
          <p>{mod.summary}</p>
          <p>{mod.description}</p>
        </section>
        <section className="mod-versions">
          <h2>Versions</h2>
          <ul>
            {mod.versions.map((v) => (
              <li key={v.version}>
                <strong>{v.version}</strong>
                <time dateTime={v.released}>{v.released}</time>
                <span>{v.notes}</span>
              </li>
            ))}
          </ul>
        </section>
        <CommentsPanel modId={mod.id} />
      </article>
    </SiteShell>
  );
}
