import type { CSSProperties, ReactElement } from "react";
import type { CatalogueMod } from "../lib/catalogue";

type Scene = CatalogueMod["screenshotScene"];

function Kittens() {
  return (
    <div className="shot-kittens">
      {["a", "b", "c", "d"].map((id) => (
        <div key={id} className="shot-kitten">
          <span className="shot-ear shot-ear-l" />
          <span className="shot-ear shot-ear-r" />
          <span className="shot-face" />
        </div>
      ))}
    </div>
  );
}

function YtHome() {
  return (
    <div className="shot-ythome">
      <div className="shot-mast" />
      <div className="shot-thumbs">
        {["a", "b", "c", "d", "e", "f"].map((id) => (
          <div key={id} className="shot-thumb">
            <span className="shot-thumb-pic" />
            <span className="shot-thumb-line" />
            <span className="shot-thumb-line short" />
          </div>
        ))}
      </div>
    </div>
  );
}

function YtWatch() {
  return (
    <div className="shot-ytwatch">
      <div className="shot-player" />
      <div className="shot-thread">
        {["a", "b", "c"].map((id) => (
          <div key={id} className="shot-cmt">
            <span className="shot-avatar" />
            <span className="shot-cmt-lines">
              <span className="shot-thumb-line" />
              <span className="shot-thumb-line short" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GhFiles() {
  return (
    <div className="shot-gh">
      {["a", "b", "c", "d", "e"].map((id) => (
        <div key={id} className="shot-file">
          <span className="shot-file-ico" />
          <span className="shot-thumb-line" />
        </div>
      ))}
    </div>
  );
}

function RedditFeed() {
  return (
    <div className="shot-reddit">
      {["a", "b", "c"].map((id) => (
        <div key={id} className="shot-post">
          <span className="shot-votes" />
          <span className="shot-post-body">
            <span className="shot-thumb-line" />
            <span className="shot-thumb-line short" />
          </span>
        </div>
      ))}
    </div>
  );
}

const SCENES: Record<Scene, () => ReactElement> = {
  kittens: Kittens,
  "yt-home": YtHome,
  "yt-watch": YtWatch,
  "gh-files": GhFiles,
  "reddit-feed": RedditFeed,
};

export function ModShot({
  hue,
  label,
  scene,
}: {
  hue: number;
  label: string;
  scene: Scene;
}) {
  const Body = SCENES[scene];
  return (
    <div
      className="shot"
      role="img"
      aria-label={label}
      style={{ "--shot-h": String(hue) } as CSSProperties}
    >
      <div className="shot-chrome" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="shot-stage" aria-hidden="true">
        <Body />
      </div>
    </div>
  );
}
