import { NextResponse } from "next/server";
import {
  EXTENSION_RELEASE_ASSETS,
  fetchLatestExtensionRelease,
  findReleaseAsset,
} from "../../../../lib/github-extension-release";

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  let release;
  try {
    release = await fetchLatestExtensionRelease({
      token: process.env.GITHUB_TOKEN,
    });
  } catch {
    return NextResponse.json({ error: "Could not load release metadata." }, { status: 502 });
  }

  const asset = release
    ? findReleaseAsset(release, EXTENSION_RELEASE_ASSETS.firefoxSignedXpi)
    : undefined;

  if (asset === undefined) {
    return NextResponse.json(
      {
        error:
          "Signed Firefox build not attached yet. Configure AMO_JWT_ISSUER and AMO_JWT_SECRET in the release workflow.",
      },
      { status: 404 },
    );
  }

  const headers: Record<string, string> = { Accept: "application/octet-stream" };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  const upstream = await fetch(asset.downloadUrl, { headers });
  if (!upstream.ok || upstream.body === null) {
    return NextResponse.json({ error: "Could not download signed XPI." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/x-xpinstall",
      "Content-Disposition": 'attachment; filename="prism-firefox.xpi"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
