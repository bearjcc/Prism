# Corpus licence check (2026-08-28)

Private engine fixtures under `corpus/` are **not** first-party bundled mods and must not be published as Prism mods.

| Tree                                                                                                                               | Licence                 | Use in corpus                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `References/wide-github` (xthexder)                                                                                                | MIT                     | Copy `build/wide-github.user.css` into `corpus/usercss/wide-github/styles/` with MIT notice.                                              |
| `References/github-wide` (mdo)                                                                                                     | MIT                     | Copy `github-wide.css` the same way.                                                                                                      |
| `References/catppuccin-userstyles`                                                                                                 | MIT                     | Copy selected `.user.less` files. Expected to fail CSS sanitise (`@import`, `url(`, preprocessor).                                        |
| `References/easylist`                                                                                                              | GPL-3.0 or CC BY-SA 3.0 | Slice of `\|\|host^` rules plus cosmetic `##` lines. Combined work with Prism is AGPL-3.0-only; keep EasyList notice in the slice header. |
| `References/youtube-nonstop`                                                                                                       | MIT                     | Study only. Corpus `userscripts/youtube-nonstop` is a Prism transcode, not a copy of their JS.                                            |
| Greasy Fork `youtube-adb`, `Reddit++`, Google search unwrap, YouTube autoplay-off, YouTube end-screen hide, YouTube miniplayer-off | various                 | Behaviour notes only. Transcodes are original Prism packages.                                                                             |

Do not copy Greasy Fork JavaScript into this tree.

Inbound MIT: keep copyright notices. EasyList slice: keep list header licence lines.
