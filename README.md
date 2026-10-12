# R-instat Knowlegde

A local-first web workspace for searching R-Instat memory, comparing VB.NET code with repository precedents, and optionally asking Gemini to review or research a new assignment.

The app reads the existing folders beside this project:

- `../memory/rinstat_memory` — local Chroma database (collection `rinstat`, 33k+ chunks)
- `../memory/local_embedder` — the downloaded transformer model
- `../source/R-Instat-master` — R-Instat source checkout
- `backend/style_guide.md` — copied from the existing style guide

Search and comparison run against local data. Gemini is contacted only after you press **Judge with AI** or **Research with Gemini**. Research uses Gemini's Google Search grounding and applies the persistent workflow in `backend/research_skill.md` on every research request. It sends the query, the style guide, and retrieved snippets, not the repository or other files. Edit `research_skill.md` to change how Research works.

## Set up the backend (Windows PowerShell)

```powershell
cd .\backend
python -m venv --system-site-packages env
.\env\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Add your Google AI Studio key to backend\.env only if you want Gemini features.
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

The first run opens the local Chroma collection and embedder. The downloaded model is loaded from `../memory/local_embedder` with local-only loading. If vector dependencies are unavailable, search falls back to lexical matching over the stored Chroma documents.

## Set up the frontend

In a second PowerShell window:

```powershell
cd .\frontend
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://127.0.0.1:5173`). Keep both terminals running while using the site.

After setup, you can launch both services and open the page with this command from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

## Gemini setup

Open `backend/.env` and set:

```text
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-flash-latest
```

Leave the key blank to keep Gemini unavailable. Search and local comparison still work. Do not commit `.env` or share the key.

## Compare workflow

1. Paste VB.NET into **Compare** or choose **New template**.
2. Select **Find patterns** to retrieve similar local chunks.
3. Review the side-by-side evidence and adjust your code yourself.
4. Set a filename and choose **Save .vb** to download a copy, or press **Judge with AI** for an optional Gemini review.

The browser downloads the current editor contents as a `.vb` file. It does not write into the R-Instat source checkout.
