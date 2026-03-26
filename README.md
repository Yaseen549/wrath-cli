# ⚡ WRATH CLI

> AI-powered developer CLI — scaffold projects, index codebases, and intelligently fix errors.

---

## Installation

```bash
npm install -g wrath-cli
# or run locally
npm install
npm link
```

## Setup

Create a `.env` file in your project root:

```env
# Choose your AI provider (default: anthropic)
AI_PROVIDER=anthropic

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # optional

# OR OpenAI
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o
```

---

## Commands

### `wrath create "<description>"`
Scaffold a new project from a natural-language description.

```bash
wrath create "a REST API with Express, Prisma, and JWT auth"
wrath create "a React app with Tailwind and Zustand" --dir ./my-app
wrath create "a CLI tool for bulk image resizing" --no-install
```

**Options:**
- `-d, --dir <directory>` — Target directory (default: `.`)
- `--no-install` — Skip `npm install`
- `--no-git` — Skip `git init`

---

### `wrath init`
Scan and index the current project into `.wrath/index.json`.

```bash
wrath init
wrath init --force   # re-index even if already indexed
```

The index captures per-file: hash, imports, exports, functions, classes, summary, lastModified.

---

### `wrath fix "<error>"`
Use the AI to diagnose and fix an error, with an interactive diff review.

```bash
wrath fix "TypeError: Cannot read properties of undefined (reading 'map')"
wrath fix "Module not found: Error: Can't resolve './utils/parser'" --dry-run
```

**Workflow:**
1. WRATH loads the index and asks the AI which files are relevant.
2. Reads only those files (no entire codebase in context).
3. Sends error + file contents to the AI.
4. Shows a colorized diff of proposed changes.
5. Prompts you to apply or discard.
6. Updates the index for modified files.

**Options:**
- `--dry-run` — Show diff but don't write any files.

---

### `wrath status`
Show the state of the current WRATH index.

```bash
wrath status
```

---

### `wrath reindex`
Force a full re-scan of the project.

```bash
wrath reindex
```

---

### `wrath clear`
Delete the `.wrath` directory entirely.

```bash
wrath clear
```

---

## Project Structure

```
.
├── bin/wrath.js              # CLI entry point
├── src/
│   ├── commands/             # One file per command
│   ├── indexer/              # File scanning, hashing, index building
│   ├── fixer/                # AI client, diff viewer, patch applier
│   ├── creator/              # Project scaffolding via AI
│   ├── utils/                # Logger, file hasher
│   └── config.js             # Central config & constants
└── .wrath/
    └── index.json            # Generated project index
```

## Index Schema

```json
{
  "files": {
    "src/app.js": {
      "hash": "sha256hex...",
      "imports": ["express", "./routes/users"],
      "exports": ["app"],
      "functions": ["createApp", "startServer"],
      "classes": [],
      "summary": "Functions: createApp, startServer | Exports: app",
      "lastModified": 1712345678000
    }
  },
  "lastScan": 1712345678000
}
```

## Supported File Types

JS/TS/JSX/TSX, Python, Go, Rust, Java, C/C++, C#, PHP, Ruby, HTML/CSS/SCSS, JSON, YAML, Markdown, Shell, Dockerfile, and more.

## Requirements

- Node.js ≥ 18
- An Anthropic or OpenAI API key

## License

MIT
