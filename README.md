# CODEMIND AI

CODEMIND AI is a local web application that helps you understand a codebase. You register a folder from your
computer, it scans and parses the code, and then you can explore files, search functions and classes, see the
architecture and dependencies, ask questions in an AI chat, investigate bugs and generate documentation.

Everything runs on your own computer. Repository code is only ever **read** (never executed).

```
agent_pro/   React + TypeScript + Vite frontend (http://localhost:5173)
backend/     FastAPI + SQLite backend           (http://localhost:8000)
scripts/     Windows PowerShell helper scripts
```

## What needs an AI model and what does not

| Feature | Needs an AI provider? |
| --- | --- |
| Register, scan, languages / frameworks / statistics | No |
| File explorer, code parsing, symbol search (functions, classes), references | No |
| Dependency analysis, dependency graph, circular dependencies, architecture view | No |
| Documentation (overview, architecture, module, API, dependency report) | No – the facts are generated from the code. An AI provider only adds a written summary. |
| AI chat | **Yes** |
| Bug investigation | Evidence (stack-trace locations, matching code) works without AI; the root-cause explanation **needs AI** |

If no provider is configured, the app says so and tells you what to set. Nothing else breaks.

## Requirements

- Windows 10/11 (the scripts are PowerShell; the code itself is cross-platform)
- Python 3.11 or newer (developed with 3.12)
- Node.js 20 or newer and npm
- Optional: [Ollama](https://ollama.com) for a local model, or an API key for an external provider

## Quick start (Windows)

Open PowerShell in the project folder (`ai`) and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1        # once: venv, packages, database, npm install
powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1    # starts backend + frontend and opens the browser
```

Then open <http://localhost:5173>.

### The same thing by hand

```powershell
# Backend (terminal 1)
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env                                   # optional: edit to enable AI
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

# Frontend (terminal 2)
cd agent_pro
npm install
npm run dev
```

The SQLite database is created automatically at `backend\data\codemind.db` the first time the backend starts
(`setup.ps1` also creates it up front). To start from scratch, stop the backend and delete that file.
Interactive API documentation is available at <http://localhost:8000/docs>.

## Using the app

1. **Repositories** → *Add repository*. Enter an absolute Windows path such as `C:\Users\you\projects\my-app`
   (or pick one from the suggested folders). Git repositories and ordinary source folders both work.
2. Click **Scan**. The scan lists files and folders, languages, frameworks and package managers, and then the code
   is parsed automatically (functions, classes, imports). Progress is shown live.
3. **Explorer** – browse the tree, open files, see each file's symbols and imports, and search symbols by name.
4. **Architecture** and **Dependencies** – modules and how they import each other, external packages,
   circular dependencies and the most important modules.
5. **AI Chat** – pick a repository and ask questions. Answers cite the real files and line numbers they used.
6. **Bug Investigation** – paste an error message and/or stack trace. The relevant code is located from the stack
   frames and searched; with an AI provider you also get a likely root cause and suggested fix (a suggestion only –
   nothing is changed in your files).
7. **Documentation** – generate and download Markdown documentation.
8. **Agents** – the six specialised agents and the history of what they ran.

## AI configuration

AI is configured with environment variables, normally in `backend\.env` (copy `backend\.env.example`).
Restart the backend after changing it. Check the result at <http://localhost:8000/api/ai/status>
(`?check=true` also tests the connection) or on the Dashboard.

### Local model with Ollama

1. Install Ollama from <https://ollama.com> and start it.
2. Download a model, for example: `ollama pull qwen2.5-coder:7b`
3. In `backend\.env`:
   ```
   CODEMIND_AI_PROVIDER=ollama
   CODEMIND_AI_MODEL=qwen2.5-coder:7b
   ```
   (`CODEMIND_AI_ENDPOINT` defaults to `http://localhost:11434`.) Small local models work best with
   `CODEMIND_AI_CONTEXT_CHARS=8000`.

### External provider with an API key

```
# OpenAI
CODEMIND_AI_PROVIDER=openai
CODEMIND_AI_MODEL=gpt-4o-mini
CODEMIND_AI_API_KEY=sk-...

# Anthropic
CODEMIND_AI_PROVIDER=anthropic
CODEMIND_AI_MODEL=claude-sonnet-4-5
CODEMIND_AI_API_KEY=sk-ant-...

# Any OpenAI-compatible server (LM Studio, vLLM, Groq, OpenRouter, ...)
CODEMIND_AI_PROVIDER=openai_compatible
CODEMIND_AI_ENDPOINT=http://localhost:1234/v1
CODEMIND_AI_MODEL=your-model
```

To switch between a local and an external model, change those three or four lines and restart the backend.
No model training is involved, and no other machine is needed.

**Privacy:** with Ollama or another local server nothing leaves your computer. With an external provider, the
question and the relevant code snippets (with obvious secrets masked) are sent to that provider.

### Settings reference

| Variable | Meaning | Default |
| --- | --- | --- |
| `CODEMIND_AI_PROVIDER` | `ollama`, `openai`, `anthropic`, `openai_compatible` or empty (no AI) | empty |
| `CODEMIND_AI_MODEL` | Model name | – |
| `CODEMIND_AI_ENDPOINT` | Provider URL | provider default |
| `CODEMIND_AI_API_KEY` | API key (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` also accepted) | – |
| `CODEMIND_AI_TIMEOUT` | Seconds to wait for the model | 120 |
| `CODEMIND_AI_MAX_TOKENS` | Longest answer | 1500 |
| `CODEMIND_AI_TEMPERATURE` | Sampling temperature | 0.2 |
| `CODEMIND_AI_CONTEXT_CHARS` | Repository text sent per question | 16000 |
| `CODEMIND_DB` | SQLite file | `backend\data\codemind.db` |
| `CODEMIND_EXCLUDES` | Extra scan exclusions (`.gitignore` syntax, comma separated) | – |
| `CODEMIND_CORS` | Allowed browser origins | `http://localhost:5173` |
| `VITE_API_URL` (frontend `.env`) | Backend address | `http://localhost:8000` |

## Tests and checks

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest          # backend tests

cd ..\agent_pro
npm test                                       # frontend tests (HTTP client, layout helpers)
npm run typecheck                              # TypeScript
npm run lint                                   # oxlint
npm run build                                  # type-check + production build
```

The backend tests use small temporary repositories and stand-in HTTP servers for the AI providers, so they run
without Ollama or an API key.

## Troubleshooting

- **"Cannot reach the CODEMIND backend"** – the backend is not running (or not on port 8000). Start it with
  `scripts\start-backend.ps1` and check <http://localhost:8000/api/health>.
- **"Address already in use"** – something else uses port 8000 or 5173. Close it, or start uvicorn with another
  `--port` and set `VITE_API_URL` in `agent_pro\.env` to match (also add the frontend origin to `CODEMIND_CORS`
  if you change the frontend port).
- **"That folder does not exist" / "Use an absolute path"** – enter the full path including the drive letter.
- **"AI provider is not configured"** – set the variables above and restart the backend.
- **"Cannot reach Ollama"** – start Ollama; **"model not found"** – run `ollama pull <model>`.
- **PowerShell refuses to run scripts** – use the `-ExecutionPolicy Bypass -File ...` form shown above.
- **The AI answer is slow** – local models on a laptop CPU can take a minute or more; raise
  `CODEMIND_AI_TIMEOUT` if needed or use a smaller model.

## Safety notes

- Repository files are only read; no repository code, script or build step is ever run.
- `.env`, key and credential files are listed but their contents are never read or sent anywhere.
  Obvious secrets inside code snippets are masked before they are shown to a model.
- Symbolic links are not followed and every file read is checked to stay inside the registered folder.
- The API key lives only in `backend\.env` (which is git-ignored) and is never returned by the API.
- The backend only accepts browser requests from `localhost` origins and is meant for local use; there is no login.

## How the AI part works (short)

- A small **supervisor** (built with LangGraph) reads your request and picks one of six agents: Repository Explorer,
  Architecture Analyst, Code Intelligence, Bug Investigator, Dependency Analyst or Documentation.
- The agent first collects real evidence from the scanned repository: symbol definitions, code snippets with line
  numbers, import/dependency data and, for bugs, the code at each stack-trace location. Retrieval is a simple
  keyword search over the parsed index (no vector database).
- The model only sees that evidence (marked as untrusted data), must cite it, and its references are checked: file
  references in the answer come only from real evidence, and citations or file paths that do not exist are flagged
  in the chat. If nothing relevant is found the model is not called at all.
- Bug investigation never changes your files. Confidence is capped by how strong the evidence is.

## Limitations

- The AI features were verified with stand-in servers that speak the Ollama protocol, not with a real language
  model, because none was installed on the development machine. Answer quality depends on the model you choose.
  Try the chat with your own model and tell the maintainer if the prompts need adjusting for it.
- "Stop watching" on a running scan only hides the progress window; the backend finishes the scan on its own.

- Import classification (internal / external / standard library / unresolved) is static and best effort; packages
  installed in virtual environments or `node_modules` are not inspected.
- Module types in the architecture view (frontend, API, service, database) are guessed from folder names and
  detected frameworks.
- AI answers are only as good as the model you configure and the code snippets retrieved for the question; answers
  list the evidence they used so you can check them.
