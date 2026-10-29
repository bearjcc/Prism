import { CHROME_STORE, EXTENSION_INSTALL_PATH } from "./extension-store";

export type ModInstallStep = {
  title: string;
  detail: string;
};

export function packageDownloadPath(modId: string): string {
  return `/packages/${modId}.prism`;
}

export function modInstallSteps(mod: { id: string; packageId: string }): ModInstallStep[] {
  return [
    {
      title: "Install the Prism extension",
      detail: `Install from ${EXTENSION_INSTALL_PATH} (load unpacked from the latest GitHub release). v0.1.2+ installs mods from this site over HTTPS.`,
    },
    {
      title: "Add the mod from this page",
      detail: `Click Add to Prism on the mod page. The extension downloads ${mod.packageId} from webprism.app, verifies the signed catalogue index, and asks you to confirm in Prism settings.`,
    },
    {
      title: "Optional: import the package file",
      detail: `Download ${mod.id}.prism and import it through Prism settings if you sideload offline.`,
    },
  ];
}

export { CHROME_STORE, EXTENSION_INSTALL_PATH };
