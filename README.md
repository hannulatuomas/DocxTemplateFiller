# DocX Template Filler

A lightweight web application that fills `{{PLACEHOLDER}}` tags in Word documents (`.docx`) through a browser UI. Upload a template, fill in the values, and download the completed document — no cloud services, no login, runs fully locally.

---

## Features

- Drag-and-drop or click-to-browse `.docx` upload
- Automatic detection of all `{{PLACEHOLDER}}` tags in the template
- Dynamically generated form with **smart field types** based on placeholder naming:
  - Keys ending in `_DATE` → native date picker
  - Keys ending in `_TEXT` or `_BODY` → multi-line textarea
  - Everything else → single-line text input
- **Template history** — the last 10 used templates and their values are saved in `localStorage` and can be reused with one click
- Downloads a filled `.docx` that preserves the original formatting, styles, tables, and layout
- All processing is in-memory — no files written to disk
- **REST API** for programmatic use (see below)

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or newer

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
open http://localhost:3000
```

For development with auto-reload on file changes:

```bash
npm run dev
```

The port defaults to `3000`. Override it with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

---

## Project Structure

```
docx-template-filler/
├── server.js                 # Express backend — parse & generate endpoints
├── package.json
├── public/
│   ├── index.html            # Single-page UI
│   ├── style.css
│   ├── app.js                # Frontend logic
│   └── example-template.docx
```

---

## Creating Templates

Write your template in Microsoft Word and use double-curly-brace tags anywhere you want a value inserted:

```
Contract date: {{DATE}}
Client: {{CLIENT_NAME}}
Project description: {{PROJECT_BODY}}
Total value: {{CONTRACT_VALUE}} EUR
```

**Tag naming rules:**

| Suffix | Widget rendered | Example |
|---|---|---|
| `_DATE` | Date picker | `{{SIGNING_DATE}}` |
| `_TEXT` | Multi-line textarea | `{{NOTES_TEXT}}` |
| `_BODY` | Multi-line textarea | `{{PROJECT_BODY}}` |
| *(anything else)* | Single-line text | `{{CLIENT_NAME}}` |

Additional rules:
- Letters, numbers, and underscores only: `{{PROJECT_NAME}}`, `{{VAT_ID}}`
- Tags are case-sensitive: `{{Name}}` and `{{NAME}}` are treated as separate placeholders
- Tags can appear in the document body, headers, and footers

An example template (`public/example-template.docx`) is included and served at `http://localhost:3000/example-template.docx`.

---

## Template History

After each successful document generation the template name, placeholder list, and all entered values are saved to `localStorage` (browser-local, never sent to a server). On the upload screen, a **Recent Templates** panel shows the last 10 entries. Clicking **Reuse values** pre-fills all matching fields in the current session — useful when generating the same document type repeatedly with small changes.

History entries can be individually deleted with the ✕ button and persist across browser sessions.

---

## REST API

The backend exposes two endpoints that can be called directly for programmatic or scripted use — no authentication required when running locally.

### `POST /api/parse`

Detect all `{{PLACEHOLDER}}` tags in a template.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `template` | file | The `.docx` template |

**Response `200`:**
```json
{
  "placeholders": ["CLIENT_NAME", "CONTRACT_VALUE", "DATE"]
}
```

**Response `422`** — no tags found in the document.  
**Response `400`** — no file uploaded or wrong file type.

---

### `POST /api/generate`

Fill the template and stream back the completed document.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `template` | file | The `.docx` template |
| `values` | string | JSON object mapping placeholder names to replacement values |

**Response `200`:** `application/vnd.openxmlformats-officedocument.wordprocessingml.document`  
The filled `.docx` binary. Filename is provided via the `Content-Disposition` header.

**Response `400`** — missing file or malformed `values` JSON.  
**Response `500`** — template rendering error.

---

### curl examples

```bash
# Detect placeholders
curl -s -X POST http://localhost:3000/api/parse \
  -F "template=@my-template.docx" | jq .

# Generate a filled document
curl -X POST http://localhost:3000/api/generate \
  -F "template=@my-template.docx" \
  -F 'values={"DATE":"2025-06-01","CLIENT_NAME":"Acme Oy","CONTRACT_VALUE":"15000"}' \
  -o filled.docx
```

### Python example

```python
import requests, json

BASE = "http://localhost:3000"

# Step 1 — discover placeholders
with open("my-template.docx", "rb") as f:
    placeholders = requests.post(
        f"{BASE}/api/parse", files={"template": f}
    ).json()["placeholders"]

print("Placeholders:", placeholders)

# Step 2 — fill and save
values = {"DATE": "2025-06-01", "CLIENT_NAME": "Acme Oy", "CONTRACT_VALUE": "15 000"}

with open("my-template.docx", "rb") as f:
    resp = requests.post(
        f"{BASE}/api/generate",
        files={"template": f},
        data={"values": json.dumps(values)}
    )

with open("filled.docx", "wb") as out:
    out.write(resp.content)

print("Saved filled.docx")
```

---

## Dependencies

| Package | Purpose |
|---|---|
| [express](https://expressjs.com/) | HTTP server |
| [multer](https://github.com/expressjs/multer) | Multipart file upload handling |
| [docxtemplater](https://docxtemplater.com/) | Template rendering in `.docx` files |
| [pizzip](https://github.com/open-xml-templating/pizzip) | ZIP/docx reading and writing |
| [cors](https://github.com/expressjs/cors) | Cross-Origin Resource Sharing headers |

---

## License

MIT
