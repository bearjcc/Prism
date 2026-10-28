import type { PageTextReplacePair, PageTextReplaceStyleId } from "@prism/schema";
import { PAGE_TEXT_REPLACE_STYLE_IDS } from "@prism/schema/page-text-replace";
import {
  defaultWordReplacerSettings,
  exportWordReplacerJson,
  importWordReplacerJson,
  renderWordReplacerPreviewHtml,
  toPageTextReplaceRules,
  type WordReplacerStoredSettings,
  WORD_REPLACER_MOD_ID,
} from "./word-replacer-settings.js";

type SettingsApi = {
  readonly runtime: {
    sendMessage<T>(message: unknown): Promise<T>;
  };
};

const STYLE_LABELS: Record<PageTextReplaceStyleId, string> = {
  bold: "Bold",
  italic: "Italic",
  underline: "Underline",
  strikethrough: "Strike",
  allCaps: "All caps",
  smallCaps: "Small caps",
  highlight: "Highlight",
};

export function mountWordReplacerSettings(
  api: SettingsApi,
  document: Document,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "word-replacer-settings";

  let settings = defaultWordReplacerSettings();
  const list = document.createElement("ol");
  list.className = "word-replacer-list";
  root.append(list);

  const previewLabel = document.createElement("label");
  previewLabel.className = "word-replacer-preview-label";
  previewLabel.textContent = "Preview sentence";
  const previewInput = document.createElement("textarea");
  previewInput.rows = 2;
  previewInput.value = settings.previewSample ?? "";
  previewInput.addEventListener("input", () => {
    settings = { ...settings, previewSample: previewInput.value };
    renderPreview();
    void persist();
  });
  previewLabel.append(previewInput);
  root.append(previewLabel);

  const previewHost = document.createElement("div");
  previewHost.className = "word-replacer-preview-host";
  root.append(previewHost);

  const tools = document.createElement("div");
  tools.className = "word-replacer-tools";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add pair";
  addButton.addEventListener("click", () => {
    settings = {
      ...settings,
      pairs: [
        ...settings.pairs,
        {
          id: `pair-${Date.now()}`,
          find: "",
          replace: "",
          enabled: true,
          wholeWord: true,
          caseSensitive: false,
          caseMode: "literal",
          styles: {},
        },
      ],
    };
    renderList();
    void persist();
  });
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export JSON";
  exportButton.addEventListener("click", () => {
    downloadText(exportWordReplacerJson(settings), "word-replacer.json");
  });
  const importLabel = document.createElement("label");
  importLabel.className = "word-replacer-import";
  importLabel.textContent = "Import JSON";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file === undefined) {
      return;
    }
    void file.text().then((text) => {
      settings = importWordReplacerJson(text);
      previewInput.value = settings.previewSample ?? "";
      renderList();
      renderPreview();
      void persist();
    });
    importInput.value = "";
  });
  importLabel.append(importInput);
  tools.append(addButton, exportButton, importLabel);
  root.append(tools);

  const status = document.createElement("p");
  status.className = "word-replacer-status";
  status.setAttribute("role", "status");
  root.append(status);

  void api.runtime
    .sendMessage<WordReplacerStoredSettings>({ type: "get-word-replacer-settings" })
    .then((loaded) => {
      settings = loaded;
      previewInput.value = settings.previewSample ?? "";
      renderList();
      renderPreview();
    })
    .catch(() => {
      status.textContent = "Could not load word replacer settings.";
    });

  function renderList(): void {
    list.replaceChildren();
    settings.pairs.forEach((pair, index) => {
      list.append(renderPairRow(pair, index));
    });
    renderPreview();
  }

  function renderPairRow(pair: PageTextReplacePair, index: number): HTMLElement {
    const item = document.createElement("li");
    item.className = "word-replacer-pair";

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = pair.enabled;
    enabled.setAttribute("aria-label", "Enable pair");
    enabled.addEventListener("change", () => {
      updatePair(index, { enabled: enabled.checked });
    });

    const find = labeledInput(document, "Find", pair.find, (value) => {
      updatePair(index, { find: value });
    });
    const replace = labeledInput(document, "Replace", pair.replace, (value) => {
      updatePair(index, { replace: value });
    });

    const wholeWord = labeledCheckbox(document, "Whole word", pair.wholeWord, (checked) => {
      updatePair(index, { wholeWord: checked });
    });
    const caseSensitive = labeledCheckbox(
      document,
      "Case sensitive",
      pair.caseSensitive,
      (checked) => {
        updatePair(index, { caseSensitive: checked });
      },
    );

    const caseMode = document.createElement("label");
    caseMode.textContent = "Case mode";
    const caseSelect = document.createElement("select");
    caseSelect.disabled = pair.caseSensitive;
    for (const option of [
      { value: "literal", label: "Replacement as typed" },
      { value: "matchSource", label: "Match source casing" },
    ] as const) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      node.selected = pair.caseMode === option.value;
      caseSelect.append(node);
    }
    caseSelect.addEventListener("change", () => {
      updatePair(index, {
        caseMode: caseSelect.value === "matchSource" ? "matchSource" : "literal",
      });
    });
    caseMode.append(caseSelect);

    const stylesBox = document.createElement("fieldset");
    stylesBox.className = "word-replacer-styles";
    const legend = document.createElement("legend");
    legend.textContent = "Styles";
    stylesBox.append(legend);
    for (const styleId of PAGE_TEXT_REPLACE_STYLE_IDS) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = pair.styles[styleId] === true;
      box.addEventListener("change", () => {
        const nextStyles = { ...pair.styles, [styleId]: box.checked };
        if (!box.checked) {
          delete nextStyles[styleId];
        }
        updatePair(index, { styles: nextStyles });
      });
      label.append(box, STYLE_LABELS[styleId]);
      stylesBox.append(label);
    }

    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.textContent = "Move up";
    moveUp.disabled = index === 0;
    moveUp.addEventListener("click", () => movePair(index, index - 1));

    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.textContent = "Move down";
    moveDown.disabled = index === settings.pairs.length - 1;
    moveDown.addEventListener("click", () => movePair(index, index + 1));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      settings = {
        ...settings,
        pairs: settings.pairs.filter((_, rowIndex) => rowIndex !== index),
      };
      renderList();
      void persist();
    });

    item.append(
      enabled,
      find,
      replace,
      wholeWord,
      caseSensitive,
      caseMode,
      stylesBox,
      moveUp,
      moveDown,
      remove,
    );
    return item;
  }

  function updatePair(index: number, patch: Partial<PageTextReplacePair>): void {
    settings = {
      ...settings,
      pairs: settings.pairs.map((pair, rowIndex) =>
        rowIndex === index ? { ...pair, ...patch } : pair,
      ),
    };
    renderList();
    void persist();
  }

  function movePair(from: number, to: number): void {
    const next = settings.pairs.slice();
    const [entry] = next.splice(from, 1);
    if (entry === undefined) {
      return;
    }
    next.splice(to, 0, entry);
    settings = { ...settings, pairs: next };
    renderList();
    void persist();
  }

  function renderPreview(): void {
    previewHost.replaceChildren(
      renderWordReplacerPreviewHtml(
        document,
        previewInput.value,
        toPageTextReplaceRules(settings),
      ),
    );
  }

  async function persist(): Promise<void> {
    status.textContent = "Saving...";
    try {
      await api.runtime.sendMessage({
        type: "set-word-replacer-settings",
        settings,
      });
      status.textContent = "Saved. Open tabs update without reload.";
    } catch {
      status.textContent = "Save failed.";
    }
  }

  renderList();
  return root;
}

function labeledInput(
  document: Document,
  labelText: string,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  label.append(input);
  return label;
}

function labeledCheckbox(
  document: Document,
  labelText: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, labelText);
  return label;
}

function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { WORD_REPLACER_MOD_ID };
