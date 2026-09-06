import { CHROME_STORE } from "./extension-store";

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
      detail: `Load unpacked from a GitHub release or ${CHROME_STORE}. The extension ships this mod bundled.`,
    },
    {
      title: "Enable the mod in the popup",
      detail: `Open the Prism toolbar popup on a matching page and turn on ${mod.packageId}. Review required capabilities before enabling.`,
    },
    {
      title: "Optional: import the package file",
      detail: `Download ${mod.id}.prism and import it through the popup if you sideload mods outside the bundled set.`,
    },
  ];
}

export { CHROME_STORE };
