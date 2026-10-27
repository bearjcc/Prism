const SAFE_MOD_SELECTOR =
  /^(?:[a-zA-Z][\w-]*(?:[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\])*(?:\s*(?:>|\+|~)\s*[a-zA-Z][\w-]*(?:[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\])*)*|#[\w-]+(?:[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\])*|\.[\w-]+(?:[.#][\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/u;

const MAX_SELECTOR_LENGTH = 240;

export function isSafeModSelector(selector: string): boolean {
  return (
    selector.length > 0 &&
    selector.length <= MAX_SELECTOR_LENGTH &&
    SAFE_MOD_SELECTOR.test(selector) &&
    !/url\s*\(|@|\/\*/iu.test(selector)
  );
}
