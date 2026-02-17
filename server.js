"use strict";

const express  = require("express");
const multer   = require("multer");
const cors     = require("cors");
const PizZip   = require("pizzip");
const Docxtemplater = require("docxtemplater");
const path     = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// multer: memory storage, .docx only, 10 MB cap
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".docx")) {
      return cb(new Error("Only .docx files are accepted."), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract unique {{PLACEHOLDER}} tags from a .docx buffer.
 * Reads raw XML so split-run tags are still found correctly.
 * @param {Buffer} buffer
 * @returns {string[]} sorted array of unique tag names
 */
function extractPlaceholders(buffer) {
  const zip = new PizZip(buffer);
  const found = new Set();
  const re = /\{\{([A-Za-z0-9_]+)\}\}/g;

  const targets = [
    "word/document.xml",
    "word/header1.xml", "word/header2.xml", "word/header3.xml",
    "word/footer1.xml",  "word/footer2.xml",  "word/footer3.xml",
  ];

  for (const name of targets) {
    const file = zip.files[name];
    if (!file) continue;
    let m;
    while ((m = re.exec(file.asText())) !== null) {
      found.add(m[1]);
    }
  }

  return Array.from(found).sort();
}

/**
 * Replace all {{PLACEHOLDER}} tags in a .docx buffer and return the
 * filled document as a Buffer.
 * @param {Buffer} buffer     Original template
 * @param {Object} values     { TAG_NAME: "value", … }
 * @returns {Buffer}
 */
function fillTemplate(buffer, values) {
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
    // Tell docxtemplater that tags use {{ }} (its default is { })
    delimiters: { start: "{{", end: "}}" },
  });
  doc.render(values);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/parse
 * Multipart body: { template: <.docx file> }
 * Response: { placeholders: string[] }
 */
app.post("/api/parse", upload.single("template"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const placeholders = extractPlaceholders(req.file.buffer);

    if (placeholders.length === 0) {
      return res.status(422).json({
        error:
          'No {{PLACEHOLDER}} tags found. Make sure your template uses double-curly-brace syntax, e.g. {{CLIENT_NAME}}.',
      });
    }

    return res.json({ placeholders });
  } catch (err) {
    console.error("[/api/parse]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/generate
 * Multipart body: { template: <.docx file>, values: JSON string }
 * Response: filled .docx binary
 */
app.post("/api/generate", upload.single("template"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    let values = {};
    if (req.body.values) {
      try {
        values = JSON.parse(req.body.values);
      } catch {
        return res.status(400).json({ error: "Invalid JSON in 'values' field." });
      }
    }

    const filled   = fillTemplate(req.file.buffer, values);
    const baseName = path.basename(req.file.originalname, ".docx");
    const outName  = `${baseName}_filled.docx`;

    res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    return res.send(filled);
  } catch (err) {
    console.error("[/api/generate]", err.message);
    const message = err.properties?.explanation ?? err.message;
    return res.status(500).json({ error: message });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  DocX Template Filler running at http://localhost:${PORT}\n`);
});
