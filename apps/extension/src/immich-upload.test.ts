import { describe, expect, test, vi } from "vitest";
import {
  IMMICH_CONFIG_STORAGE_KEY,
  immichApiBase,
  immichHostPermissionPattern,
  isImmichConfigured,
  normalizeImmichServerUrl,
  testImmichConnection,
  uploadToImmich,
} from "./immich-upload.js";
import {
  immichModActionEvent,
  performImmichUploadWithFeedback,
  readImmichUiSettings,
  requestImmichHostAccess,
  runImmichUpload,
  syncImmichContextMenu,
} from "./immich-upload-handler.js";

const CONFIG = {
  serverUrl: "http://100.64.0.2:2283",
  apiKey: "secret-key",
};

describe("Immich upload API", () => {
  test("normalises LAN and Tailscale-style server URLs", () => {
    expect(normalizeImmichServerUrl("http://100.64.0.2:2283/")).toBe(
      "http://100.64.0.2:2283",
    );
    expect(immichHostPermissionPattern("http://photos.tail.ts.net:2283")).toBe(
      "http://photos.tail.ts.net:2283/*",
    );
    expect(immichApiBase("http://100.64.0.2:2283")).toBe(
      "http://100.64.0.2:2283/api",
    );
  });

  test("test connection treats 401 as bad key", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }));
    await expect(testImmichConnection(fetchImpl, CONFIG)).resolves.toEqual({
      outcome: "failed",
      reason: "bad-key",
    });
  });

  test("test connection succeeds on ping", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(testImmichConnection(fetchImpl, CONFIG)).resolves.toEqual({
      outcome: "success",
      reason: "connected",
    });
  });

  test("upload treats duplicate JSON as duplicate outcome", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ duplicate: true }, { status: 200 }),
    );
    const result = await uploadToImmich(fetchImpl, CONFIG, {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      filename: "x.png",
    }, "asset-id");
    expect(result).toEqual({ outcome: "duplicate", reason: "duplicate" });
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      "secret-key",
    );
    expect(init.credentials).toBe("omit");
  });

  test("upload maps network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      uploadToImmich(fetchImpl, CONFIG, {
        bytes: new Uint8Array([1]),
        mimeType: "image/jpeg",
        filename: "a.jpg",
      }, "id"),
    ).resolves.toEqual({ outcome: "failed", reason: "network-error" });
  });
});

describe("Immich upload flow", () => {
  test("not configured opens options and skips upload", async () => {
    const openOptions = vi.fn();
    const result = await runImmichUpload(
      {
        fetch: vi.fn(),
        getState: async () => ({}),
        setState: async () => undefined,
        sendToTab: async () => undefined,
        openOptions,
      },
      {
        srcUrl: "https://example.com/a.jpg",
        pageOrigin: "https://example.com",
        tabId: 1,
      },
    );
    expect(result.reason).toBe("not-configured");
    expect(openOptions).toHaveBeenCalledWith("immich-setup");
  });

  test("performImmichUploadWithFeedback logs mod-action without secrets", async () => {
    const setState = vi.fn(async () => undefined);
    const showNotification = vi.fn();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/assets")) {
        return Response.json({ id: "1" }, { status: 201 });
      }
      return new Response(new Uint8Array([9, 9]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    await performImmichUploadWithFeedback(
      {
        fetch: fetchImpl,
        getState: async () => ({
          [IMMICH_CONFIG_STORAGE_KEY]: CONFIG,
        }),
        setState,
        sendToTab: async () => ({ ok: false }),
        requestHostPermission: async () => true,
        showNotification,
        randomId: () => "fixed-id",
      },
      {
        srcUrl: "https://example.com/photo.png",
        pageOrigin: "https://example.com",
        tabId: 2,
      },
    );
    expect(setState).toHaveBeenCalled();
    const saved = setState.mock.calls[0]?.[0] as {
      activity: Array<Record<string, unknown>>;
    };
    const event = saved.activity[0];
    expect(event?.layer).toBe("mod-action");
    expect(event?.pageOrigin).toBe("https://example.com");
    expect(JSON.stringify(event)).not.toContain("secret-key");
    expect(showNotification).toHaveBeenCalled();
  });

  test("immichModActionEvent never includes api key field", () => {
    const event = immichModActionEvent(
      { outcome: "failed", reason: "bad-key" },
      "https://news.example",
    );
    expect(event.detail).toBe("bad-key");
    expect(Object.keys(event)).not.toContain("apiKey");
  });

  test("requestImmichHostAccess uses origin pattern", async () => {
    const requestHostPermission = vi.fn(async () => true);
    await expect(
      requestImmichHostAccess(CONFIG.serverUrl, requestHostPermission),
    ).resolves.toBe(true);
    expect(requestHostPermission).toHaveBeenCalledWith(
      "http://100.64.0.2:2283/*",
    );
  });

  test("isImmichConfigured requires url and key", () => {
    expect(isImmichConfigured(CONFIG)).toBe(true);
    expect(isImmichConfigured({ serverUrl: CONFIG.serverUrl })).toBe(false);
  });

  test("syncImmichContextMenu nests upload under Prism root for images", async () => {
    const created: Array<Record<string, unknown>> = [];
    await syncImmichContextMenu(
      {
        create: (details) => {
          created.push({ ...details });
        },
        remove: vi.fn(),
      },
      true,
      true,
      {},
      "Mozilla/5.0 (Windows)",
    );
    expect(created).toHaveLength(1);
    expect(created[0]?.parentId).toBe("prism-root");
    expect(created[0]?.contexts).toEqual(["image"]);
  });

  test("readImmichUiSettings reads mobile chip toggle", () => {
    expect(
      readImmichUiSettings({ immichUploadUi: { mobileChip: true } }).mobileChip,
    ).toBe(true);
  });
});
