# Ollama Agents Studio

Two Ollama-backed agents (planner + writer) that produce environmental briefs for lower-income countries, with a simple UI and optional Google Drive upload.

## Quick start

1) Install deps (requires network):
```
npm install
```

2) Run dev server:
```
npm run dev
```
Then open http://localhost:3000.

3) Pull models (suggested):
```
ollama pull llama3.1:8b
ollama pull qwen2.5:3b
# fallback if needed
ollama pull llama3:8b
```

## Usage
- Set topic, adjust models if desired, and click "Run two-agent pass".
- Drafts are saved under `data/output/` as Markdown.
- Add Google Drive credentials in the right panel, then "Upload latest draft" to push the saved file.
- Scheduling: create recurring runs in minutes (min 15) and optionally auto-upload. Schedules persist in `data/schedules.json` and run while `npm run dev`/`npm run start` is active.

## Google Drive credentials
Provide:
- Client ID
- Client Secret
- Refresh Token
- Target Folder ID (optional)

The UI keeps these in memory only for the session. The server uses them to create a short-lived OAuth2 client per upload.
If you enable auto-upload on schedules, the credentials you provide are stored in `data/schedules.json` so the scheduler can upload in the future—keep that file safe.

## Notes
- No live web search is performed; facts must be verified manually.
- External network calls are only made when you trigger a Drive upload.
- Configure OLLAMA_HOST env var if your Ollama is not on `http://localhost:11434`.
