import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { querySelectorAllDeep, querySelectorDeep } from "./dom-query.js";

describe("querySelectorAllDeep", () => {
  test("finds nodes inside open shadow roots", () => {
    const dom = new JSDOM("<body></body>");
    const host = dom.window.document.createElement("ytd-app");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <ytd-browse page-subtype="home">
        <ytd-rich-grid-renderer>
          <div id="contents">
            <ytd-rich-item-renderer lockup>
              <yt-lockup-view-model>
                <a class="ytLockupMetadataViewModelTitle"
                   href="/watch?v=shadow-video"
                   title="Shadow video">Shadow video</a>
              </yt-lockup-view-model>
            </ytd-rich-item-renderer>
          </div>
        </ytd-rich-grid-renderer>
      </ytd-browse>
    `;
    dom.window.document.body.append(host);

    expect(
      querySelectorDeep(dom.window.document, "ytd-rich-grid-renderer #contents"),
    ).not.toBeNull();
    expect(
      querySelectorAllDeep(
        dom.window.document,
        "a.ytLockupMetadataViewModelTitle",
      ),
    ).toHaveLength(1);
  });
});
