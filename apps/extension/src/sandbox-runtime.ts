import type { PrismApi } from "@prism/schema";

interface SandboxRequest {
  readonly kind: "prism-request";
  readonly id: number;
  readonly operation:
    | "replace"
    | "styles"
    | "allowlist"
    | "extract"
    | "request";
  readonly args: readonly unknown[];
}

interface SandboxMessage {
  readonly kind: string;
  readonly id?: number;
  readonly source?: string;
  readonly operation?: SandboxRequest["operation"];
  readonly args?: readonly unknown[];
  readonly ok?: boolean;
  readonly result?: unknown;
  readonly error?: string;
}

const SANDBOX_TIMEOUT_MS = 10_000;

export async function runNativeModInSandbox(
  source: string,
  prism: PrismApi,
  ownerDocument: Document = document,
): Promise<void> {
  const iframe = ownerDocument.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.hidden = true;
  iframe.srcdoc = sandboxSourceDoc(createNonce());
  const parent = ownerDocument.body ?? ownerDocument.documentElement;
  if (parent === null) {
    throw new Error("Cannot create native mod sandbox");
  }

  let settled = false;
  let started = false;
  let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
  let resolveRun: (() => void) | undefined;
  let rejectRun: ((error: Error) => void) | undefined;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  const run = new Promise<void>((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });

  const finish = (error?: Error): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    ownerDocument.defaultView?.removeEventListener("message", onMessage);
    iframe.remove();
    for (const request of pending.values()) {
      request.reject(error ?? new Error("Native mod sandbox stopped"));
    }
    pending.clear();
    if (error === undefined) {
      resolveRun?.();
    } else {
      rejectRun?.(error);
    }
  };

  const post = (message: unknown): void => {
    iframe.contentWindow?.postMessage(message, "*");
  };

  const handleRequest = async (message: SandboxRequest): Promise<void> => {
    let result: unknown;
    try {
      if (message.operation === "replace") {
        prism.slots.replace(
          message.args[0] as Parameters<PrismApi["slots"]["replace"]>[0],
          message.args[1] as Parameters<PrismApi["slots"]["replace"]>[1],
        );
      } else if (message.operation === "styles") {
        prism.styles.apply(String(message.args[0] ?? ""));
      } else if (message.operation === "allowlist") {
        prism.ui.allowlist(
          String(message.args[0] ?? ""),
          String(message.args[1] ?? ""),
        );
      } else if (message.operation === "extract") {
        result = await prism.extract(
          message.args[0] as Parameters<PrismApi["extract"]>[0],
          message.args[1] as Parameters<PrismApi["extract"]>[1],
        );
      } else {
        result = await prism.net.request(String(message.args[0] ?? ""));
      }
      post({ kind: "prism-response", id: message.id, ok: true, result });
    } catch (error) {
      post({
        kind: "prism-response",
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  function onMessage(event: MessageEvent<SandboxMessage>): void {
    if (event.source !== iframe.contentWindow || !isSandboxMessage(event.data)) {
      return;
    }
    if (event.data.kind === "sandbox-ready") {
      if (started) {
        return;
      }
      started = true;
      post({ kind: "sandbox-init", source });
      return;
    }
    if (event.data.kind === "sandbox-complete") {
      finish();
      return;
    }
    if (event.data.kind === "sandbox-failed") {
      finish(new Error(event.data.error ?? "Native mod sandbox failed"));
      return;
    }
    if (event.data.kind === "prism-request") {
      void handleRequest(event.data as SandboxRequest);
      return;
    }
    if (event.data.kind === "prism-response" && event.data.id !== undefined) {
      const request = pending.get(event.data.id);
      if (request === undefined) {
        return;
      }
      pending.delete(event.data.id);
      if (event.data.ok === true) {
        request.resolve(event.data.result);
      } else {
        request.reject(new Error(event.data.error ?? "Prism request failed"));
      }
    }
  }

  ownerDocument.defaultView?.addEventListener("message", onMessage);
  parent.append(iframe);
  timeout = setTimeout(
    () => finish(new Error("Native mod sandbox timed out")),
    SANDBOX_TIMEOUT_MS,
  );
  await run;
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sandboxSourceDoc(nonce: string): string {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:; connect-src 'none'"><script nonce="${nonce}">(() => {
  const pending = new Map();
  let nextId = 0;
  const post = (message) => parent.postMessage(message, "*");
  const call = (operation, args) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    post({ kind: "prism-request", id, operation, args });
  });
  const prism = {
    slots: { replace: (slot, content) => void call("replace", [slot, content]) },
    styles: { apply: (css) => void call("styles", [css]) },
    ui: { allowlist: (surface, itemType) => void call("allowlist", [surface, itemType]) },
    extract: (capability, input) => call("extract", [capability, input]),
    net: { request: (contractId) => call("request", [contractId]) }
  };
  addEventListener("message", async (event) => {
    if (event.source !== parent || event.data?.kind !== "sandbox-init") return;
    const url = URL.createObjectURL(new Blob([event.data.source], { type: "text/javascript" }));
    try {
      const module = await import(url);
      if (typeof module.activate !== "function") throw new Error("Native mod has no activate function");
      await module.activate(prism);
      post({ kind: "sandbox-complete" });
    } catch (error) {
      post({ kind: "sandbox-failed", error: error instanceof Error ? error.message : String(error) });
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  addEventListener("message", (event) => {
    if (event.source !== parent || event.data?.kind !== "prism-response") return;
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    event.data.ok ? request.resolve(event.data.result) : request.reject(new Error(event.data.error || "Prism request failed"));
  });
  post({ kind: "sandbox-ready" });
})();</script>`;
}

function isSandboxMessage(value: unknown): value is SandboxMessage {
  return typeof value === "object" && value !== null && "kind" in value;
}
