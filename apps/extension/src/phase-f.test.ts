import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  loadPackedMod,
  loadUnpackedMod,
  packMod,
  type PrismApi,
  type TrustedReplacement,
} from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { activate as activateYoutubeRedditMod } from "../../../mods/youtube-reddit-comments/src/index.js";
import { createContentHandlers } from "./content-script.js";
import { applyOptionalCapabilityChange } from "./popup.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";
import {
  handleRuntimeMessage,
  type ServiceWorkerDependencies,
} from "./service-worker.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "youtube-reddit-comments",
);
const watchFixture = readFileSync(
  join(modRoot, "fixtures", "watch.html"),
  "utf8",
);
const redditFixture = readFileSync(
  join(modRoot, "fixtures", "reddit-search.html"),
  "utf8",
);

describe("Phase F Reddit comments on YouTube", () => {
  test("optional capability off renders fallback copy without breaking watch", async () => {
    const dom = new JSDOM(watchFixture, {
      url: "https://www.youtube.com/watch?v=fixture-video-id",
    });
    const manifest = loadUnpackedMod(modRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: manifest.capabilities.required,
      tabId: 4,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
    });

    await activateYoutubeRedditMod(prism);

    expect(dom.window.document.querySelector("main")?.textContent).toContain(
      "Fixture watch page",
    );
    expect(
      dom.window.document.querySelector("[data-prism-comments-fallback]")
        ?.textContent,
    ).toContain("Enable Reddit comments");
  });

  test("uses the live YouTube comments host when no fixture marker exists", async () => {
    const dom = new JSDOM(
      "<main>Watch page</main><ytd-comments id=\"comments\">Original</ytd-comments>",
      { url: "https://www.youtube.com/watch?v=fixture-video-id" },
    );
    const manifest = loadUnpackedMod(modRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: manifest.capabilities.required,
      tabId: 4,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateYoutubeRedditMod(prism);

    expect(
      dom.window.document.querySelector("ytd-comments")
        ?.querySelector("[data-prism-comments-fallback]")?.textContent,
    ).toContain("Enable Reddit comments");
  });

  test("granted capability lists parsed comments and hides raw HTML from the mod", async () => {
    const dom = new JSDOM(watchFixture, {
      url: "https://www.youtube.com/watch?v=fixture-video-id",
    });
    const manifest = loadUnpackedMod(modRoot).manifest;
    const requestRedditHtml = vi.fn().mockResolvedValue({ html: redditFixture });
    const handlers = createContentHandlers(
      dom.window.document,
      undefined,
      undefined,
      requestRedditHtml,
    );
    const extract = vi.fn(handlers.extract);
    const prism = createPrismApi({
      manifest,
      grants: [
        ...manifest.capabilities.required,
        "reddit.comments.search",
      ],
      tabId: 5,
      handlers: { ...handlers, extract },
    });

    await activateYoutubeRedditMod(prism);

    expect(requestRedditHtml).toHaveBeenCalledWith({
      type: "reddit-comments-html",
      modId: manifest.id,
      query: "fixture-video-id",
    });
    const redditExtraction = await extract.mock.results[1]?.value;
    expect(redditExtraction).toEqual({
      comments: expect.arrayContaining([
        expect.objectContaining({ author: "alice" }),
      ]),
    });
    expect(redditExtraction).not.toHaveProperty("html");
    expect(
      Array.from(
        dom.window.document.querySelectorAll(
          "[data-prism-reddit-comment] strong",
        ),
      ).map((element) => element.textContent),
    ).toEqual(["alice", "bob"]);
    expect(dom.window.document.body.innerHTML).not.toContain(
      "data-testid=\"comment\"",
    );
  });

  test("mod source has no page, fetch, or raw HTML primitive", () => {
    const packed = packMod(modRoot);
    const source = new TextDecoder().decode(
      loadPackedMod(packed.archive).files["src/index.js"] ?? new Uint8Array(),
    );

    expect(source).not.toMatch(/\bfetch\b|\bdocument\b|innerHTML/iu);
    expect(source).not.toContain("data-testid");
  });

  test("popup requests Reddit host access only while enabling the capability", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const request = vi.fn().mockResolvedValue(true);
    const api = {
      runtime: { sendMessage },
      permissions: { request },
    };

    await expect(
      applyOptionalCapabilityChange(
        api,
        "prism.youtube-reddit-comments",
        "reddit.comments.search",
        true,
      ),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({
      origins: ["https://www.reddit.com/*"],
    });

    request.mockClear();
    await expect(
      applyOptionalCapabilityChange(
        api,
        "prism.youtube-reddit-comments",
        "reddit.comments.search",
        false,
      ),
    ).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  test("popup does not grant the capability when host access is denied", async () => {
    const sendMessage = vi.fn();
    const api = {
      runtime: { sendMessage },
      permissions: { request: vi.fn().mockResolvedValue(false) },
    };

    await expect(
      applyOptionalCapabilityChange(
        api,
        "prism.youtube-reddit-comments",
        "reddit.comments.search",
        true,
      ),
    ).resolves.toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("service worker fetches Reddit only for an enabled granted mod", async () => {
    const manifest = loadUnpackedMod(modRoot).manifest;
    const fetchRedditHtml = vi.fn().mockResolvedValue(redditFixture);
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn().mockResolvedValue({
        enabled: {},
        grants: {
          [manifest.id]: [
            ...manifest.capabilities.required,
            "reddit.comments.search",
          ],
        },
      }),
      setState: vi.fn(),
      sendToTab: vi.fn(),
      reloadTab: vi.fn(),
      syncBrowserRules: vi.fn(),
      fetchRedditHtml,
    };
    const mods = Promise.resolve([{ manifest, entry: null }]);

    await expect(
      handleRuntimeMessage(
        {
          type: "reddit-comments-html",
          modId: manifest.id,
          query: "fixture-video-id",
        },
        1,
        mods,
        dependencies,
      ),
    ).resolves.toEqual({ html: redditFixture });
    expect(fetchRedditHtml).toHaveBeenCalledWith("fixture-video-id");

    const deniedDependencies: ServiceWorkerDependencies = {
      ...dependencies,
      getState: vi.fn().mockResolvedValue({
        enabled: {},
        grants: { [manifest.id]: manifest.capabilities.required },
      }),
    };
    fetchRedditHtml.mockClear();
    await expect(
      handleRuntimeMessage(
        {
          type: "reddit-comments-html",
          modId: manifest.id,
          query: "fixture-video-id",
        },
        1,
        mods,
        deniedDependencies,
      ),
    ).resolves.toEqual({ status: 403, error: "Reddit comments denied" });
    expect(fetchRedditHtml).not.toHaveBeenCalled();
  });

  test("comment replacement accepts JSON data, not markup", async () => {
    const replacements: TrustedReplacement[] = [];
    const prism: PrismApi = {
      slots: {
        replace: (_slot, replacement) => replacements.push(replacement),
      },
      styles: { apply: vi.fn() },
      ui: { allowlist: vi.fn() },
      extract: vi
        .fn()
        .mockResolvedValueOnce({ videoId: "fixture-video-id" })
        .mockResolvedValueOnce({
          comments: [
            {
              author: "alice",
              body: "<img src=x onerror=alert(1)>",
              permalink: "https://www.reddit.com/r/videos/comments/abc/post/one/",
            },
          ],
        }),
      net: { request: vi.fn() },
    };

    await activateYoutubeRedditMod(prism);

    expect(replacements).toEqual([
      expect.objectContaining({
        kind: "comments",
        comments: [
          expect.objectContaining({
            body: "<img src=x onerror=alert(1)>",
          }),
        ],
      }),
    ]);
  });
});
