/**
 * DocX Template Filler — frontend
 *
 * Flow:
 *   1. User picks/drops a .docx  →  POST /api/parse  →  render fields
 *   2. User fills fields          →  POST /api/generate  →  trigger download
 *
 * Field type rules (matched against the placeholder key):
 *   contains date segment: DATE, DT, PVM, PAIVA, PAIVAMAARA, PAIVAMARAA… → date picker
 *   ends with _TEXT or _BODY                                               → textarea
 *   everything else                                                        → text input
 */

"use strict";

// ── Constants ─────────────────────────────────────────────────────────────────
const HISTORY_KEY     = "docx-filler:history";
const HISTORY_MAX     = 10;

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  /** @type {File|null} */
  file:         null,
  /** @type {string[]} */
  placeholders: [],
  /** @type {string|null} object URL to revoke on reset */
  downloadUrl:  null,
};

// ── DOM helpers ───────────────────────────────────────────────────────────────
/** @param {string} id @returns {HTMLElement} */
const el = (id) => document.getElementById(id);

const dom = {
  dropzone:     el("dropzone"),
  fileInput:    el("file-input"),
  fileChip:     el("file-chip"),
  fileNameDisp: el("file-name-display"),
  btnClear:     el("btn-clear"),
  btnParse:     el("btn-parse"),

  stepUpload:   el("step-upload"),
  stepFields:   el("step-fields"),
  stepDone:     el("step-done"),

  fieldsGrid:   el("fields-container"),
  btnBack:      el("btn-back"),
  btnGenerate:  el("btn-generate"),

  btnRestart:   el("btn-restart"),
  btnDownload:  el("btn-download"),

  errorBanner:  el("error-banner"),
  errorText:    el("error-text"),
  btnErrClose:  el("btn-error-close"),

  loadingOverlay: el("loading-overlay"),
  loadingText:    el("loading-text"),

  historySection: el("history-section"),
  historyList:    el("history-list"),
};

const SECTIONS = [dom.stepUpload, dom.stepFields, dom.stepDone];

// ── UI helpers ────────────────────────────────────────────────────────────────
function showSection(section) {
  SECTIONS.forEach((s) => s.classList.add("hidden"));
  section.classList.remove("hidden");
}

function showLoading(msg = "Processing…") {
  dom.loadingText.textContent = msg;
  dom.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  dom.loadingOverlay.classList.add("hidden");
}

function showError(msg) {
  dom.errorText.textContent = msg;
  dom.errorBanner.classList.remove("hidden");
}

function hideError() {
  dom.errorBanner.classList.add("hidden");
}

// ── Field type detection ──────────────────────────────────────────────────────

/**
 * Date token pattern — matches any of these words (case-insensitive) as a
 * whole segment (surrounded by underscores or string start/end):
 *   English : date, dt
 *   Finnish : pvm, päivämäärä, päiväys, päivä (and ASCII equivalents)
 *
 * Examples that resolve to "date":
 *   DATE, date, START_DATE, END_DATE, SIGNING_DATE,
 *   PVM, pvm, ALKU_PVM, LOPPU_PVM,
 *   PAIVA, PAIVAMAARA, DT, CREATED_DT
 */
// "date" requires _ or ^ on the left to avoid matching UPDATE, CANDIDATE, VALIDATE etc.
// Finnish tokens (pvm, dt, päivä…) are unambiguous enough to match without a left separator,
// which handles concatenated keys like HYVAKSYNTAPVM.
const DATE_RE = /(?:(?:^|_)date|pvm|dt|p[aä]iv[aä]m[aä][aä]r[aä]|p[aä]iv[aä]ys|p[aä]iv[aä])(?:_|$)/i;

/**
 * Determine the appropriate input widget for a placeholder key.
 * @param {string} key
 * @returns {"date"|"textarea"|"text"}
 */
function fieldTypeFor(key) {
  if (DATE_RE.test(key)) return "date";
  const upper = key.toUpperCase();
  if (upper.endsWith("_TEXT") || upper.endsWith("_BODY")) return "textarea";
  return "text";
}

/**
 * Create the right input element for a given placeholder key.
 * @param {string} key
 * @returns {HTMLElement}
 */
function createInputEl(key) {
  const type = fieldTypeFor(key);
  let widget;

  if (type === "textarea") {
    widget = document.createElement("textarea");
    widget.rows = 4;
    widget.placeholder = `Enter value for ${key}`;
  } else {
    widget = document.createElement("input");
    widget.type = type;           // "date" or "text"
    if (type === "text") {
      widget.placeholder  = `Enter value for ${key}`;
      widget.autocomplete = "off";
    }
  }

  widget.id   = `f-${key}`;
  widget.name = key;
  return widget;
}

// ── Template history (localStorage) ──────────────────────────────────────────
/**
 * @typedef {Object} HistoryEntry
 * @property {string}   id          — unique ID (timestamp)
 * @property {string}   templateName
 * @property {string[]} placeholders
 * @property {Object}   values       — last-used values
 * @property {string}   usedAt       — ISO date string
 */

/** @returns {HistoryEntry[]} */
function historyLoad() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

/** @param {HistoryEntry[]} entries */
function historySave(entries) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

/**
 * Upsert an entry (match by templateName + same placeholder set).
 * @param {string}   templateName
 * @param {string[]} placeholders
 * @param {Object}   values
 */
function historyPush(templateName, placeholders, values) {
  const entries = historyLoad();
  const key     = templateName + "|" + [...placeholders].sort().join(",");

  // Remove existing entry with same key so we can move it to the top
  const filtered = entries.filter(
    (e) => e.templateName + "|" + [...e.placeholders].sort().join(",") !== key
  );

  filtered.unshift({
    id:           Date.now().toString(),
    templateName,
    placeholders,
    values,
    usedAt: new Date().toISOString(),
  });

  historySave(filtered.slice(0, HISTORY_MAX));
  renderHistory();
}

/** Remove one history entry by id */
function historyDelete(id) {
  historySave(historyLoad().filter((e) => e.id !== id));
  renderHistory();
}

/** Format ISO date string to a readable local date */
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Render the history panel in the upload step */
function renderHistory() {
  const entries = historyLoad();

  if (!entries.length) {
    dom.historySection.classList.add("hidden");
    return;
  }

  dom.historySection.classList.remove("hidden");
  dom.historyList.innerHTML = "";

  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <div class="history-item__info">
        <span class="history-item__name">${escHtml(entry.templateName)}</span>
        <span class="history-item__meta">
          ${entry.placeholders.length} field${entry.placeholders.length !== 1 ? "s" : ""}
          &middot; ${fmtDate(entry.usedAt)}
        </span>
      </div>
      <div class="history-item__actions">
        <button class="btn btn-ghost btn-sm" data-action="reuse" data-id="${entry.id}">
          Reuse values
        </button>
        <button class="icon-btn" data-action="delete" data-id="${entry.id}" title="Remove">✕</button>
      </div>
    `;
    dom.historyList.appendChild(item);
  }
}

/**
 * Apply saved values from a history entry to the current fields.
 * Only fills fields that exist in both the saved entry and current template.
 * @param {string} id
 */
function historyReuse(id) {
  const entry = historyLoad().find((e) => e.id === id);
  if (!entry) return;

  for (const [key, value] of Object.entries(entry.values)) {
    const widget = document.getElementById(`f-${key}`);
    if (widget) widget.value = value;
  }
}

/** Minimal HTML escaping for user-supplied strings rendered via innerHTML */
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── File handling ─────────────────────────────────────────────────────────────
function acceptFile(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".docx")) {
    showError("Please upload a .docx file.");
    return;
  }

  hideError();
  state.file = file;
  dom.fileNameDisp.textContent = file.name;
  dom.fileChip.classList.remove("hidden");
  dom.btnParse.disabled = false;
}

function clearFile() {
  state.file = null;
  dom.fileInput.value = "";
  dom.fileChip.classList.add("hidden");
  dom.btnParse.disabled = true;
  hideError();
}

// ── Step 1 → 2: Parse ─────────────────────────────────────────────────────────
async function parsePlaceholders() {
  hideError();
  showLoading("Scanning template…");

  const body = new FormData();
  body.append("template", state.file);

  try {
    const res  = await fetch("/api/parse", { method: "POST", body });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to parse template.");

    state.placeholders = data.placeholders;
    buildFields(data.placeholders);
    showSection(dom.stepFields);
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
  }
}

/** Build one labelled widget per placeholder, using smart field types */
function buildFields(keys) {
  dom.fieldsGrid.innerHTML = "";

  for (const key of keys) {
    const type  = fieldTypeFor(key);
    const group = document.createElement("div");
    group.className = "field-group";

    const label = document.createElement("label");
    label.htmlFor     = `f-${key}`;
    // "CLIENT_NAME" → "Client Name"
    label.textContent = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Add a subtle type badge next to the label
    if (type !== "text") {
      const badge = document.createElement("span");
      badge.className   = "field-type-badge";
      badge.textContent = type === "date" ? "date" : "multiline";
      label.appendChild(badge);
    }

    const widget = createInputEl(key);
    group.append(label, widget);
    dom.fieldsGrid.appendChild(group);
  }

  // Show Ctrl+Enter hint if any textareas were rendered
  const hintEl = document.getElementById("textarea-hint");
  if (hintEl) hintEl.hidden = !dom.fieldsGrid.querySelector("textarea");

  // Focus the first focusable widget
  const first = dom.fieldsGrid.querySelector("input, textarea");
  if (first) first.focus();
}

/** Read all widget values into a plain object */
function collectValues() {
  return Object.fromEntries(
    state.placeholders.map((key) => {
      const widget = document.getElementById(`f-${key}`);
      return [key, widget ? widget.value : ""];
    })
  );
}

// ── Step 2 → 3: Generate ──────────────────────────────────────────────────────
async function generateDocument() {
  hideError();
  showLoading("Generating document…");

  const values = collectValues();

  const body = new FormData();
  body.append("template", state.file);
  body.append("values", JSON.stringify(values));

  try {
    const res = await fetch("/api/generate", { method: "POST", body });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to generate document.");
    }

    // Parse filename from Content-Disposition header
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match       = disposition.match(/filename="?([^"]+)"?/);
    const filename    = match ? match[1] : "filled_document.docx";

    const blob = await res.blob();

    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(blob);

    dom.btnDownload.href     = state.downloadUrl;
    dom.btnDownload.download = filename;

    // Save to history
    historyPush(state.file.name, state.placeholders, values);

    showSection(dom.stepDone);
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function restart() {
  clearFile();
  state.placeholders = [];
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
  }
  dom.fieldsGrid.innerHTML = "";
  hideError();
  renderHistory();
  showSection(dom.stepUpload);
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Dropzone — click to browse
dom.dropzone.addEventListener("click",  () => dom.fileInput.click());
dom.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dom.fileInput.click(); }
});

// Dropzone — drag & drop
dom.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dom.dropzone.classList.add("drag-over");
});
dom.dropzone.addEventListener("dragleave", (e) => {
  if (!dom.dropzone.contains(e.relatedTarget)) {
    dom.dropzone.classList.remove("drag-over");
  }
});
dom.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dom.dropzone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) acceptFile(file);
});

// File input change
dom.fileInput.addEventListener("change", () => {
  if (dom.fileInput.files[0]) acceptFile(dom.fileInput.files[0]);
});

// Buttons
dom.btnClear.addEventListener("click",    clearFile);
dom.btnParse.addEventListener("click",    parsePlaceholders);
dom.btnBack.addEventListener("click",     () => showSection(dom.stepUpload));
dom.btnGenerate.addEventListener("click", generateDocument);
dom.btnRestart.addEventListener("click",  restart);
dom.btnErrClose.addEventListener("click", hideError);

// History list — event delegation for "Reuse values" and delete buttons
dom.historyList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "reuse")  historyReuse(id);
  if (action === "delete") historyDelete(id);
});

// Allow Ctrl+Enter from a textarea to submit; plain Enter submits from text/date
dom.fieldsGrid.addEventListener("keydown", (e) => {
  const isTextarea = e.target.tagName === "TEXTAREA";
  if (e.key === "Enter" && (!isTextarea || e.ctrlKey)) {
    e.preventDefault();
    generateDocument();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
renderHistory();