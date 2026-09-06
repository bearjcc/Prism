import { InstallControl } from "./install-control";
import type { CatalogueMod } from "../lib/catalogue";
import { modInstallSteps, packageDownloadPath } from "../lib/mod-install";

type Props = {
  mod: CatalogueMod;
};

export function ModInstallPanel({ mod }: Props) {
  const download = packageDownloadPath(mod.id);
  const steps = modInstallSteps(mod);

  return (
    <section className="mod-install-panel" aria-labelledby="install-heading">
      <h2 id="install-heading">Install</h2>
      <p className="mod-install-cta">
        <InstallControl className="btn btn-solid" labelInstall="Get Prism extension" packageId={mod.packageId} />
      </p>
      <ol className="install-steps">
        {steps.map((step) => (
          <li key={step.title}>
            <strong>{step.title}</strong>
            <span>{step.detail}</span>
          </li>
        ))}
      </ol>
      <dl className="install-meta">
        <div>
          <dt>Package id</dt>
          <dd>
            <code>{mod.packageId}</code>
          </dd>
        </div>
        <div>
          <dt>Bundled entry</dt>
          <dd>
            <code>{mod.bundledEntry}</code>
          </dd>
        </div>
        <div>
          <dt>Download</dt>
          <dd>
            <a href={download} download={`${mod.id}.prism`}>
              {mod.id}.prism
            </a>
            <span>Same validated zip the extension bundles and accepts for import.</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
