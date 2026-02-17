/**
 * DocX Template Filler — frontend
 *
 * Flow:
 *   1. User picks/drops a .docx  →  POST /api/parse  →  render fields
 *   2. User fills fields          →  POST /api/generate  →  trigger download
 */

"use strict";

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

/** Build one labelled <input> per placeholder */
function buildFields(keys) {
  dom.fieldsGrid.innerHTML = "";

  for (const key of keys) {
    const group = document.createElement("div");
    group.className = "field-group";

    const label = document.createElement("label");
    label.htmlFor = `f-${key}`;
    label.textContent = key.replace(/_/g, " ");   // "CLIENT_NAME" → "CLIENT NAME"

    const input = document.createElement("input");
    input.type        = "text";
    input.id          = `f-${key}`;
    input.name        = key;
    input.placeholder = `Enter value for ${key}`;
    input.autocomplete = "off";

    group.append(label, input);
    dom.fieldsGrid.appendChild(group);
  }

  // Focus the first field
  const first = dom.fieldsGrid.querySelector("input");
  if (first) first.focus();
}

/** Read all input values into a plain object */
function collectValues() {
  return Object.fromEntries(
    state.placeholders.map((key) => {
      const inp = document.getElementById(`f-${key}`);
      return [key, inp ? inp.value : ""];
    })
  );
}

// ── Step 2 → 3: Generate ──────────────────────────────────────────────────────
async function generateDocument() {
  hideError();
  showLoading("Generating document…");

  const body = new FormData();
  body.append("template", state.file);
  body.append("values", JSON.stringify(collectValues()));

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
  // Only remove if we're leaving the dropzone itself (not a child)
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

// Allow Enter from any field to trigger generation
dom.fieldsGrid.addEventListener("keydown", (e) => {
  if (e.key === "Enter") generateDocument();
});
