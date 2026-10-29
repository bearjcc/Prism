export const GITHUB_REPO = "bearjcc/Prism";

export const EXTENSION_RELEASE_ASSETS = {
  chromiumZip: "prism-chromium-unpacked.zip",
  chromiumCrx: "prism-chromium.crx",
  firefoxZip: "prism-firefox-unpacked.zip",
  firefoxXpi: "prism-firefox.xpi",
  firefoxSignedXpi: "prism-firefox-signed.xpi",
} as const;

export type ExtensionReleaseAsset = {
  name: string;
  downloadUrl: string;
  size: number;
};

export type ExtensionReleaseInfo = {
  tagName: string;
  version: string;
  publishedAt: string;
  htmlUrl: string;
  assets: ExtensionReleaseAsset[];
};

type GitHubReleaseJson = {
  tag_name?: string;
  published_at?: string;
  html_url?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
    size?: number;
  }>;
};

function normaliseAsset(raw: NonNullable<GitHubReleaseJson["assets"]>[number]): ExtensionReleaseAsset | null {
  const name = raw.name?.trim();
  const downloadUrl = raw.browser_download_url?.trim();
  if (name === undefined || name.length === 0 || downloadUrl === undefined || downloadUrl.length === 0) {
    return null;
  }
  return {
    name,
    downloadUrl,
    size: typeof raw.size === "number" && raw.size >= 0 ? raw.size : 0,
  };
}

export function parseGitHubRelease(json: GitHubReleaseJson): ExtensionReleaseInfo | null {
  const tagName = json.tag_name?.trim();
  const publishedAt = json.published_at?.trim();
  const htmlUrl = json.html_url?.trim();
  if (tagName === undefined || tagName.length === 0) {
    return null;
  }
  if (publishedAt === undefined || publishedAt.length === 0) {
    return null;
  }
  if (htmlUrl === undefined || htmlUrl.length === 0) {
    return null;
  }

  const assets: ExtensionReleaseAsset[] = [];
  for (const raw of json.assets ?? []) {
    const asset = normaliseAsset(raw);
    if (asset !== null) {
      assets.push(asset);
    }
  }

  const version = tagName.replace(/^v/i, "");

  return {
    tagName,
    version,
    publishedAt,
    htmlUrl,
    assets,
  };
}

export function findReleaseAsset(
  release: ExtensionReleaseInfo,
  assetName: string,
): ExtensionReleaseAsset | undefined {
  return release.assets.find((asset) => asset.name === assetName);
}

export function firefoxSignedInstallAvailable(release: ExtensionReleaseInfo): boolean {
  return findReleaseAsset(release, EXTENSION_RELEASE_ASSETS.firefoxSignedXpi) !== undefined;
}

export type FetchLatestReleaseOptions = {
  repo?: string;
  token?: string;
  fetchImpl?: typeof fetch;
};

export async function fetchLatestExtensionRelease(
  options: FetchLatestReleaseOptions = {},
): Promise<ExtensionReleaseInfo | null> {
  const repo = options.repo ?? GITHUB_REPO;
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = options.token?.trim();
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    next: { revalidate: 600 },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GitHub releases API ${response.status}`);
  }

  const json = (await response.json()) as GitHubReleaseJson;
  return parseGitHubRelease(json);
}

export function formatReleaseDate(iso: string, locale = "en-NZ"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}
