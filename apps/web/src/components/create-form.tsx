"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signedIn } from "./comments-panel";

function looksLikeUserscript(text: string): boolean {
  return /==UserScript==|GM_|tampermonkey|violentmonkey/i.test(text);
}

function userCssFlags(text: string): string[] {
  const flags: string[] = [];
  if (/@import\s+url\s*\(/i.test(text)) {
    flags.push("External @import URL");
  }
  if (/url\s*\(\s*["']?https?:/i.test(text)) {
    flags.push("Remote url() resource");
  }
  if (/content\s*:/i.test(text)) {
    flags.push("generated content");
  }
  return flags;
}

export function CreateForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"usercss" | "userscript">("usercss");
  const [source, setSource] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!signedIn()) {
      router.push("/signin");
      return;
    }
    if (mode === "userscript" || looksLikeUserscript(source)) {
      setError(
        "Userscripts cannot run as page JavaScript. They have to be translated into Prism capabilities. This form will not dump a Violentmonkey script into the runtime.",
      );
      return;
    }
    if (!source.trim()) {
      setError("Paste UserCSS to continue.");
      return;
    }
    const flags = userCssFlags(source);
    const extra = flags.length
      ? ` Disclosed: ${flags.join(", ")}.`
      : " No remote import, remote url(), or generated content flagged.";
    setMessage(
      `UserCSS accepted for sanitise (fixture). Not treated as harmless CSS.${extra} Registry publish is not wired yet.`,
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <fieldset className="stack" style={{ border: 0, padding: 0 }}>
        <legend>Source</legend>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === "usercss"}
            onChange={() => setMode("usercss")}
          />{" "}
          UserCSS (Stylus, UserStyles.world)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            checked={mode === "userscript"}
            onChange={() => setMode("userscript")}
          />{" "}
          Userscript (Violentmonkey, Tampermonkey, Greasy Fork JS)
        </label>
      </fieldset>
      {mode === "userscript" ? (
        <p className="note">
          Userscripts get translated into capabilities. They are not compatible the way UserCSS is.
        </p>
      ) : (
        <p className="note">
          Default path. Sanitise still applies. External URLs, imports, overlays, and update sources are
          disclosed or rejected.
        </p>
      )}
      <label>
        Package source
        <textarea
          rows={12}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
        />
      </label>
      {error ? <p className="err">{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <button type="submit" className="btn-solid">
        Submit
      </button>
    </form>
  );
}
