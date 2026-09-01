"use client";

import { useEffect, useState } from "react";

const KEY = "prism-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const stored = window.localStorage.getItem(KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
    setTheme(next);
    root.dataset.theme = next;
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(KEY, next);
  }

  return (
    <button type="button" className="ghost" onClick={toggle} aria-pressed={theme === "dark"}>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

export function ThemeBoot() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var k="prism-theme";var s=localStorage.getItem(k);var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=s==="light"||s==="dark"?s:(d?"dark":"light");document.documentElement.dataset.theme=t;document.documentElement.dataset.surface="site"}catch(e){}`,
      }}
    />
  );
}
