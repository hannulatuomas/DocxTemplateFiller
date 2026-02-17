# DocX Template Filler

A lightweight web application that fills `{{PLACEHOLDER}}` tags in Word documents (`.docx`) through a browser UI. Upload a template, fill in the values, and download the completed document — no cloud services, no login, runs fully locally.

---

## Features

- Drag-and-drop or click-to-browse `.docx` upload
- Automatic detection of all `{{PLACEHOLDER}}` tags in the template
- Dynamically generated input form — one field per placeholder found
- Downloads a filled `.docx` that preserves the original formatting, styles, tables, and layout
- All processing is in-memory — no files written to disk

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
│   ├── style.css             # Styles
│   ├── app.js                # Frontend logic
│   └── example-template.docx
```

---

## Creating Templates

Write your template in Microsoft Word and use double-curly-brace tags anywhere you want a value inserted:

```
Contract date: {{DATE}}
Client: {{CLIENT_NAME}}
Total value: {{CONTRACT_VALUE}} EUR
```

**Tag naming rules:**
- Letters, numbers, and underscores only: `{{PROJECT_NAME}}`, `{{VAT_ID}}`
- Tags are case-sensitive: `{{Name}}` and `{{NAME}}` are treated as separate placeholders
- Tags can appear in the document body, headers, and footers

An example template (`public/example-template.docx`) is included and also served at `http://localhost:3000/example-template.docx`.

---

## API

The backend exposes two JSON endpoints consumed by the frontend. They can also be called directly for programmatic use.

### `POST /api/parse`

Detect all placeholders in a template.

**Request:** `multipart/form-data` with field `template` (`.docx` file)

**Response:**
```json
{
  "placeholders": ["CLIENT_NAME", "CONTRACT_VALUE", "DATE"]
}
```

### `POST /api/generate`

Fill the template and return the completed document.

**Request:** `multipart/form-data` with fields:
- `template` — the `.docx` template file
- `values` — JSON string mapping placeholder names to replacement values

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "template=@my-template.docx" \
  -F 'values={"DATE":"2025-06-01","CLIENT_NAME":"Acme Oy"}' \
  -o filled.docx
```

**Response:** `.docx` binary with `Content-Disposition: attachment` header.

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
