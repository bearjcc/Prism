/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentsPanel } from "../components/comments-panel";
import { CreateForm } from "../components/create-form";
import { ExploreBrowser } from "../components/explore-browser";
import { InstallControl } from "../components/install-control";
import { catalogue } from "./catalogue";

const push = vi.fn();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let root: Root | undefined;
let host: HTMLElement | undefined;

async function render(ui: ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(ui);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("guest access", () => {
  beforeEach(() => {
    push.mockReset();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-prism");
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    host?.remove();
  });

  it("renders Explore listings with no session", async () => {
    await render(<ExploreBrowser />);
    for (const mod of catalogue()) {
      expect(host.textContent).toContain(mod.name);
      expect(host.querySelector(`a[href="/mods/${mod.id}"]`)).toBeTruthy();
    }
    expect(host.textContent).toContain("0 installs");
    expect(host.textContent).toContain("No ratings");
    expect(host.textContent).not.toMatch(/\d+(\.\d+)?k installs/);
    expect(host.textContent).not.toMatch(/\d+(\.\d+)?\/5/);
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toMatch(/sign in to browse/i);
  });

  it("offers Install without an account", async () => {
    await render(<InstallControl labelInstall="Install" />);
    const link = host.querySelector("a[href='https://chromewebstore.google.com/']");
    expect(link?.textContent).toMatch(/Install/);
    expect(host.querySelector("form")).toBeNull();
  });

  it("hides comment and rating controls until signed in", async () => {
    await render(<CommentsPanel modId="kitten-ad-replace" />);
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelector("a[href='/signin']")).toBeTruthy();
    expect(host.textContent).toMatch(/without an account/);
  });

  it("shows the comment form after sign-in", async () => {
    window.localStorage.setItem("prism-web-session", "1");
    await render(<CommentsPanel modId="kitten-ad-replace" />);
    expect(host.querySelector("form")).toBeTruthy();
    expect(host.querySelector("textarea")).toBeTruthy();
    expect(host.querySelector("select")).toBeTruthy();
  });

  it("refuses a userscript runtime dump on Create", async () => {
    window.localStorage.setItem("prism-web-session", "1");
    await render(<CreateForm />);
    const userscript = host.querySelector('input[type="radio"]:not(:checked)') as HTMLInputElement;
    await act(async () => {
      userscript.click();
    });
    const area = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(area, "// ==UserScript==\nGM_xmlhttpRequest\n");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector("form")?.requestSubmit();
    });
    expect(host.textContent).toMatch(/will not dump a Violentmonkey script into the runtime/);
    expect(push).not.toHaveBeenCalled();
  });

  it("sends unsigned Create submits to sign-in", async () => {
    await render(<CreateForm />);
    await act(async () => {
      host.querySelector("form")?.requestSubmit();
    });
    expect(push).toHaveBeenCalledWith("/signin");
  });
});
