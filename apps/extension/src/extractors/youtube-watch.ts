export interface YoutubeWatchExtraction {
  readonly videoId: string;
}

export interface YoutubeIdlePrompt {
  readonly kind: "continue-watching";
}

export interface YoutubeIdleDismissResult {
  readonly dismissed: boolean;
  readonly kind?: "continue-watching";
}

export interface YoutubeAutoplayState {
  readonly autoplay: boolean;
}

export interface YoutubeAutoplayConstrainResult {
  readonly constrained: boolean;
  readonly kind?: "autonav" | "video";
}

const IDLE_PROMPT_ATTRIBUTE = "data-prism-idle-prompt";
const IDLE_DISMISSED_ATTRIBUTE = "data-prism-idle-dismissed";
const LIVE_IDLE_PROMPT_SELECTOR =
  "yt-confirm-dialog-renderer, ytmusic-you-there-renderer";
const CONFIRM_BUTTON_SELECTOR =
  "#confirm-button button, #confirm-button, button";
const AUTONAV_ATTRIBUTE = "data-prism-autonav";
const LIVE_AUTONAV_SELECTOR = ".ytp-autonav-toggle-button";
const MAIN_VIDEO_SELECTOR = "video.html5-main-video";

export function extractYoutubeWatch(
  pageUrl: string,
  root?: ParentNode,
): YoutubeWatchExtraction {
  const url = new URL(pageUrl);
  const urlVideoId =
    url.hostname === "www.youtube.com" && url.pathname === "/watch"
      ? url.searchParams.get("v")?.trim()
      : undefined;
  const fixtureVideoId = root
    ?.querySelector("[video-id]")
    ?.getAttribute("video-id")
    ?.trim();
  const videoId = urlVideoId || fixtureVideoId;

  if (videoId === undefined || videoId === "") {
    throw new Error("YouTube watch video id is not available");
  }
  return { videoId };
}

function findIdlePromptElement(root: ParentNode): Element | undefined {
  const labelled = Array.from(
    root.querySelectorAll(`[${IDLE_PROMPT_ATTRIBUTE}]`),
  );
  const live = Array.from(root.querySelectorAll(LIVE_IDLE_PROMPT_SELECTOR));
  const seen = new Set<Element>();
  for (const element of [...labelled, ...live]) {
    if (seen.has(element)) {
      continue;
    }
    seen.add(element);
    if (element.getAttribute(IDLE_DISMISSED_ATTRIBUTE) === "true") {
      continue;
    }
    return element;
  }
  return undefined;
}

export function extractYoutubeIdlePrompt(
  root: ParentNode,
): YoutubeIdlePrompt | null {
  if (findIdlePromptElement(root) === undefined) {
    return null;
  }
  return { kind: "continue-watching" };
}

export function dismissYoutubeIdlePrompt(
  root: ParentNode,
): YoutubeIdleDismissResult {
  const element = findIdlePromptElement(root);
  if (element === undefined) {
    return { dismissed: false };
  }
  const button = element.querySelector<HTMLElement>(CONFIRM_BUTTON_SELECTOR);
  button?.click();
  element.setAttribute(IDLE_DISMISSED_ATTRIBUTE, "true");
  return { dismissed: true, kind: "continue-watching" };
}

function findAutonavToggle(root: ParentNode): Element | undefined {
  const labelled = root.querySelector(`[${AUTONAV_ATTRIBUTE}]`);
  if (labelled !== null) {
    return labelled;
  }
  const live = root.querySelector(LIVE_AUTONAV_SELECTOR);
  return live ?? undefined;
}

function autonavIsOn(element: Element): boolean {
  return element.getAttribute("aria-checked") === "true";
}

function clickElement(element: Element): void {
  if (!("click" in element)) {
    return;
  }
  const click = Reflect.get(element, "click");
  if (typeof click === "function") {
    click.call(element);
  }
}

function findAutoplayingMainVideo(root: ParentNode): Element | undefined {
  const video = root.querySelector(MAIN_VIDEO_SELECTOR);
  if (video === null || !video.hasAttribute("autoplay")) {
    return undefined;
  }
  return video;
}

export function extractYoutubeAutoplay(
  root: ParentNode,
): YoutubeAutoplayState | null {
  const toggle = findAutonavToggle(root);
  if (toggle !== undefined && autonavIsOn(toggle)) {
    return { autoplay: true };
  }
  if (findAutoplayingMainVideo(root) !== undefined) {
    return { autoplay: true };
  }
  return null;
}

export function constrainYoutubeAutoplay(
  root: ParentNode,
): YoutubeAutoplayConstrainResult {
  const toggle = findAutonavToggle(root);
  const toggleOn = toggle !== undefined && autonavIsOn(toggle);
  const video = findAutoplayingMainVideo(root);
  if (!toggleOn && video === undefined) {
    return { constrained: false };
  }
  if (toggle !== undefined && toggleOn) {
    clickElement(toggle);
    toggle.setAttribute("aria-checked", "false");
  }
  video?.removeAttribute("autoplay");
  return {
    constrained: true,
    kind: toggleOn ? "autonav" : "video",
  };
}

export interface YoutubeEndScreenState {
  readonly present: boolean;
}

export interface YoutubeEndScreenConstrainResult {
  readonly constrained: boolean;
  readonly kind?: "endscreen";
}

const ENDSCREEN_ATTRIBUTE = "data-prism-endscreen";
const ENDSCREEN_CONSTRAINED_ATTRIBUTE = "data-prism-endscreen-constrained";
const LIVE_ENDSCREEN_SELECTORS = [
  ".ytp-endscreen-content",
  ".ytp-ce-element",
  ".ytp-cards-teaser",
] as const;

function isConstrainedEndScreen(element: Element): boolean {
  return element.getAttribute(ENDSCREEN_CONSTRAINED_ATTRIBUTE) === "true";
}

function findEndScreenOverlays(root: ParentNode): Element[] {
  const seen = new Set<Element>();
  const overlays: Element[] = [];
  const labelled = Array.from(
    root.querySelectorAll(`[${ENDSCREEN_ATTRIBUTE}]`),
  );
  const live = LIVE_ENDSCREEN_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll(selector)),
  );
  for (const element of [...labelled, ...live]) {
    if (seen.has(element) || isConstrainedEndScreen(element)) {
      continue;
    }
    seen.add(element);
    overlays.push(element);
  }
  return overlays;
}

export function extractYoutubeEndScreens(
  root: ParentNode,
): YoutubeEndScreenState | null {
  if (findEndScreenOverlays(root).length === 0) {
    return null;
  }
  return { present: true };
}

export function constrainYoutubeEndScreens(
  root: ParentNode,
): YoutubeEndScreenConstrainResult {
  const overlays = findEndScreenOverlays(root);
  if (overlays.length === 0) {
    return { constrained: false };
  }
  for (const element of overlays) {
    element.setAttribute(ENDSCREEN_CONSTRAINED_ATTRIBUTE, "true");
    Reflect.set(element, "hidden", true);
    element.setAttribute("hidden", "");
  }
  return { constrained: true, kind: "endscreen" };
}

export interface YoutubeMiniplayerState {
  readonly present: boolean;
}

export interface YoutubeMiniplayerConstrainResult {
  readonly constrained: boolean;
  readonly kind?: "miniplayer";
}

const MINIPLAYER_ATTRIBUTE = "data-prism-miniplayer";
const MINIPLAYER_CONSTRAINED_ATTRIBUTE = "data-prism-miniplayer-constrained";
const LIVE_MINIPLAYER_SELECTORS = [
  "ytd-miniplayer",
  "#miniplayer",
  ".ytp-miniplayer-ui",
] as const;
const MINIPLAYER_CLOSE_SELECTOR = ".ytp-miniplayer-close-button";

function isConstrainedMiniplayer(element: Element): boolean {
  return element.getAttribute(MINIPLAYER_CONSTRAINED_ATTRIBUTE) === "true";
}

function findMiniplayerShells(root: ParentNode): Element[] {
  const seen = new Set<Element>();
  const shells: Element[] = [];
  const labelled = Array.from(
    root.querySelectorAll(`[${MINIPLAYER_ATTRIBUTE}]`),
  );
  const live = LIVE_MINIPLAYER_SELECTORS.flatMap((selector) =>
    Array.from(root.querySelectorAll(selector)),
  );
  for (const element of [...labelled, ...live]) {
    if (seen.has(element) || isConstrainedMiniplayer(element)) {
      continue;
    }
    seen.add(element);
    shells.push(element);
  }
  return shells;
}

export function extractYoutubeMiniplayer(
  root: ParentNode,
): YoutubeMiniplayerState | null {
  if (findMiniplayerShells(root).length === 0) {
    return null;
  }
  return { present: true };
}

export function constrainYoutubeMiniplayer(
  root: ParentNode,
): YoutubeMiniplayerConstrainResult {
  const shells = findMiniplayerShells(root);
  if (shells.length === 0) {
    return { constrained: false };
  }
  for (const element of shells) {
    const close = element.querySelector(MINIPLAYER_CLOSE_SELECTOR);
    if (close !== null) {
      clickElement(close);
    }
    element.setAttribute(MINIPLAYER_CONSTRAINED_ATTRIBUTE, "true");
    Reflect.set(element, "hidden", true);
    element.setAttribute("hidden", "");
  }
  return { constrained: true, kind: "miniplayer" };
}
