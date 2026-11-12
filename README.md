# Momence

Momence turns a long video into short vertical clips. You upload a video or paste a YouTube or
Twitch link, and Momence transcribes it, picks the strongest moments and lets you edit each clip
from its transcript before you export a 1080×1920 MP4. Everything runs on your own Mac.

I built it as a personal tool, so the interface is in Indonesian.

## Features

- Clip discovery with Gemini. Each clip gets a score from 60 to 99, with Hook, Flow, Value and
  Trend sub-scores.
- Word-level transcription in Indonesian and English with mlx-whisper on the Apple GPU.
- A transcript-based editor: cut words and pauses, correct the text, undo and redo, with drafts
  kept in the browser.
- Speech cleanup for filler words, filler phrases, repeated words and long pauses.
- Animated captions (6 presets), 9:16 auto-reframe that follows faces, and B-roll from Pixabay
  stock video.
- Up to 8 custom text overlays per clip. You drag them in the preview and time them on the clip
  map.
- Post captions and hashtags per clip for TikTok, Reels or Shorts, written by Gemini and ready to
  copy.
- 1080×1920 MP4 export with Remotion.

Your videos stay on your machine. The server binds to `127.0.0.1`, and the database and videos
live in the `data/` folder. Momence sends data out in three cases: transcripts to the Gemini API,
B-roll searches to Pixabay, and the first-run downloads of models, fonts and Chrome.

## Requirements

| Requirement | Version used | Notes |
|---|---|---|
| Apple Silicon Mac | M series | mlx-whisper needs the Apple GPU |
| Node.js | 26 | `node --version` |
| uv | 0.8+ | `brew install uv` (uv downloads Python 3.12 for you) |
| ffmpeg | 9 | `brew install ffmpeg` |
| Google Chrome | – | end-to-end tests only |

## Install

```bash
git clone https://github.com/kambingcode/Momence.git
cd Momence

cd web && npm install && cd ..
cd worker && uv sync && cd ..
```

### API keys

Copy the examples and fill in your own keys. Don't commit these files, and don't paste their
contents into a chat.

```bash
cp web/.env.example web/.env.local     # PIXABAY_API_KEY (B-roll, free)
cp worker/.env.example worker/.env     # GEMINI_API_KEY (clip discovery, B-roll plans, post captions)
```

| Variable | File | Used for | If empty |
|---|---|---|---|
| `GEMINI_API_KEY` | `worker/.env` | clip discovery, B-roll plans, post captions and hashtags | the discover job fails with a clear message |
| `PIXABAY_API_KEY` | `web/.env.local` | B-roll stock video search | the B-roll picker shows how to add the key |
| `CLIPSTUDIO_DATA_DIR` | both | a different data folder (for tests, say) | `data/` at the repo root |
| `CLIPSTUDIO_GEMINI_MODEL` | `worker/.env` | default Gemini model | `gemini-3.6-flash` |
| `CLIPSTUDIO_WHISPER_MODEL` | `worker/.env` | a different Whisper model | `mlx-community/whisper-large-v3-turbo` |

You can change the Gemini model, the filler word and phrase lists, and the pause threshold on the
**Pengaturan** (Settings) page without a restart. The same page shows whether the worker is
running and whether each key is set. It never shows the key values.

## Run

Start the web app and the worker in two terminals:

```bash
# Terminal 1: web (UI + API). The first request creates and migrates the database.
cd web && npm run dev            # http://127.0.0.1:3000

# Terminal 2: worker (ffmpeg, Whisper, Gemini, MediaPipe, render)
cd worker && uv run worker run   # Ctrl+C finishes the running job, then stops
```

Start the web app first, because the worker refuses to start until the database exists.
`uv run worker info` prints the data location and key status. Only one worker can run per data
folder.

First-run downloads:

- **transcribe** job: the Whisper model, about 1.6 GB, into the Hugging Face cache
- **reframe** job: the MediaPipe face model, about 1 MB, into `data/models`
- **render** job: headless Chrome, about 100 MB. Caption fonts come from Google Fonts, so the
  first render needs internet.

### Importing from YouTube and Twitch

Link imports use [yt-dlp](https://github.com/yt-dlp/yt-dlp) (installed by `uv sync`), ffmpeg to
merge video and audio, and Node.js for YouTube's JavaScript challenges. YouTube changes often. If
downloads start failing, update yt-dlp:
`cd worker && uv lock --upgrade-package yt-dlp && uv sync`.

For Twitch, Momence accepts VODs (`twitch.tv/videos/<id>`) and rejects clips, channels and
collections. Next to the link field you pick the download quality: 1080p (default) or 720p. 720p
cuts the size and download time about in half (a 2 h 41 m Twitch VOD goes from 7.4 GB to 4.2 GB),
but the export follows the source, so it looks softer. The choice applies to link imports, not to
file uploads.

Long streams get big, about 2.8 GB per hour at 1080p60. Before it downloads, the worker estimates
the size (bitrate × duration) and refuses if free disk space is under twice that size plus 2 GB.

### Long stream performance

Measured on a 2 h 41 m Twitch VOD (1080p60, Apple M4 Pro, home connection around 10 MB/s):

| | Before | Now |
|---|---|---|
| Download 1080p video | 41.5 min (about 3 MB/s) | 11.9 min (8 parallel fragments) |
| Ingest (720p proxy) | 12.1 min | 6.7 min alone, 12.8 min next to transcription |
| Find clips (18 windows) | 6.9 min | 3.0 min (4 parallel requests) |
| **Clips visible after import** | **about 76 min** | **23 min** (audio first: a 36 s audio download, then transcription and clips while the video downloads) |
| Everything done (video ready, faces analyzed) | about 77 min | 26 min |

Two optional settings in `worker/.env` control this: `CLIPSTUDIO_DOWNLOAD_CONCURRENCY` (parallel
download fragments, default 8, range 1–32) and `CLIPSTUDIO_DISCOVER_CONCURRENCY` (parallel Gemini
requests, default 4, range 1–16). Pick 720p on import when disk space or download time matters
more than a sharp export (the same VOD: 5.7 min, 4.0 GB). Peak memory is about 0.4 GB for the
ffmpeg proxy, 0.1 GB for audio extraction (it stays flat as videos get longer) and 1.7 GB for
transcription with the Whisper model.

## Using Momence

The labels below match the Indonesian interface, with the English meaning in parentheses.

1. **Home.** Open **Proyek** (Projects) in the left sidebar. On narrow screens the sidebar turns
   into a top bar. Three action cards sit at the top:
   - **Upload video**: click to pick a file, or drop an MP4, MOV, M4V, WebM or MKV file on the
     card. Progress and a cancel button show on the card.
   - **Impor dari link** (Import from link): a dialog for a YouTube link (a regular video,
     `youtu.be`, Shorts, or a finished live stream; playlists are rejected) or a Twitch VOD, with
     the quality and a clip focus. Paste a link (⌘V) anywhere on the home page and the dialog
     opens with it filled in.
   - **Fokus klip** (Clip focus, optional, up to 500 characters): steers Gemini, for example
     "funny moments and reactions". It applies to your next upload or import.

   The worker runs two tracks at once. For a link import, it downloads the **audio** first (about
   40 s for a 2.7-hour stream; the project takes the video's title), transcribes it and finds
   clips with Gemini. In parallel it downloads the **video** (up to 1080p), builds a 720p proxy and
   thumbnails, and analyzes faces once the clips and the proxy are both ready. The clip list
   appears before the video finishes, and preview and export turn on when the video is ready. For
   a file upload, the worker extracts the audio and transcribes it while it builds the proxy.

   Projects show as a grid of thumbnail cards (the default) or as a table with thumbnail,
   four-stage status, clip count, best clip score, size and last change. Clicking a card opens its
   clips, or the transcript if no clips exist yet. Cards also show processing status and a
   **Coba lagi** (Retry) button. Switch views with the **Kartu/Tabel** (Cards/Table) toggle at the
   top right, and search titles or sort by newest, name, score, clips or size next to it. Your
   browser remembers the view and sort. The bottom of the sidebar shows disk usage and worker
   status. The app has a light theme only (the "Shade" style) and ignores the system's dark mode.

2. **Project page.** Breadcrumbs, title, duration and resolution, clip focus, and two tabs:
   **Klip | Transkrip** (Clips | Transcript). While processing runs, or after it fails, the tabs
   show a card per processing step with progress, errors and **Coba lagi**. The **Transkrip** tab
   shows the word-level transcript. Click a word to jump to that moment in the video.

3. **Clips tab.** A grid of clips with scores and sub-scores, sorted by score or by time.
   **Cari ulang klip** (Find clips again), at the top right of the project page, lets you change
   the focus and rerun discovery on the same transcript. That calls Gemini again, which costs
   money. Momence keeps the clips you already edited and replaces the rest. The button stays
   disabled while transcription, discovery or reframe runs.

   The **Caption** button on each card opens a dialog where you pick a platform (TikTok, Reels or
   Shorts) and a language. Gemini writes a caption, a second version for A/B testing and 3 to 5
   hashtags from what the clip says. Each part has a **Salin** (Copy) button, and **Siap posting**
   (Ready to post) copies everything. Each request is one small paid Gemini call, and Momence makes
   it only when you press **Buat caption** (Write caption) or **Buat ulang** (Rewrite). Hashtags come
   from the clip's content, not from current trend data. Gemini reads the saved transcript, so it
   still sees words you cut in the editor.

4. **Edit.** A full-height editor with three columns: the **transcript** on the left, the
   **preview** in the middle and a **tool panel** on the right. An icon rail on the right edge
   switches the panel between **Rapikan** (Clean up), **Caption**, **Reframe**, **B-roll** and
   **Teks** (Text), and ↑/↓ moves between them. The **Peta klip** (Clip map) sits underneath and
   shows pauses, fillers, cut sections, B-roll, text bars and the playhead. Click or drag on it to
   jump.
   - Cut words with Backspace or Delete, or select words and press **Potong** (Cut).
     Double-click a word or press Enter to correct its caption text.
   - **Rapikan** handles speech cleanup (pauses and fillers). **Caption** sets the animation
     style, font and color. **Reframe** sets the aspect ratio, Fill or Fit, and face tracking.
     **B-roll** adds Pixabay stock video. **Teks** adds custom text: up to 8 per clip, with a
     layer list (front-most on top), content, Google font, size and color.
   - Text appears and disappears without animation and goes into the export. Drag it in the
     preview to move it. It snaps to the center lines, arrow keys nudge it 1% (5% with ⇧),
     double-click edits it and Delete removes it. On the clip map, drag a text bar to move it in
     time, or drag its edges to change the start and end.
   - Momence keeps your edits as a local draft. Press **Simpan** (Save, ⌘/Ctrl+S) to save them to
     the server.
   - Press **?** (or the keyboard button in the header) for the shortcut list: Space play/pause,
     ⌘Z / ⌘⇧Z undo/redo, ←/→ move the cursor, ⇧←/⇧→ extend the selection, ⌫/Del cut, Enter edit
     a word, Esc clear the selection.
   - Save and render errors show up as a notification at the bottom left and in the header.

5. **Export.** **Export MP4** in the header (enabled once your edits are saved) renders an MP4
   from the saved edits. Progress and a time estimate show in the header, then **Unduh MP4**
   (Download MP4) appears. Rendering the same clip again deletes its old MP4.

6. **Delete a project** from the **…** menu on a project card or row. Momence removes the project
   from the database and deletes its `data/media/<id>/` folder (source video, proxy and renders).
   You can't delete a project while the worker is running one of its jobs.

Failed jobs show a message and a **Coba lagi** button. If the worker dies in the middle of a job,
it reruns that job the next time it starts.

## Data

```
data/
  clipstudio.db          # SQLite (WAL); the web app owns the schema and migrations (drizzle)
  media/<project>/       # source.*, audio.wav, proxy.mp4, renders/<job>.mp4
  models/                # MediaPipe face model
  worker.lock            # single-worker lock
```

To back up, copy the `data/` folder while the web app and the worker are stopped.

### Storage

The database takes a few MB. Videos take the rest. Each project keeps the original video (the
size of the uploaded file), a 720p preview (about 1.5 Mbit/s, or 11 MB per minute) and the
exported MP4s. The dashboard shows each project's size, total usage and free disk space.

- The worker deletes `audio.wav` after transcription and recreates it when needed.
- Rendering the same clip again deletes its old MP4.
- On start, the worker deletes media folders that belong to no project, plus `.part` temp files
  older than 24 hours (leftovers from interrupted uploads or jobs).
- Delete finished projects from the dashboard to free space. MP4s you already downloaded stay
  where you saved them.
- To use an external drive, set the same `CLIPSTUDIO_DATA_DIR` in `web/.env.local` and
  `worker/.env`.

## Development

The UI follows the [DESIGN.md](DESIGN.md) style guide ("Shade": white canvas, charcoal text,
Inter and JetBrains Mono, weight 400, monochrome status colors, violet for the logo and the active
tab).

```
web/      Next.js 15 (UI, API, Remotion), Clean Architecture per module in src/modules
worker/   Python 3.12 (uv), job worker: download-audio, download, ingest, transcribe, discover,
          reframe, render, broll-plan, post-copy
```

### Architecture

Both apps follow a pragmatic Clean Architecture (ports and adapters), split into one module per
feature.

- `domain` holds pure rules, `application` holds use cases and ports, and `infrastructure` holds
  the adapters: database, Gemini, Whisper, ffmpeg, Pixabay and the file system. Next.js routes,
  React components and the worker CLI call use cases and nothing below them.
- Domain and application code never import a framework, an SDK, `fs` or `process.env`.
- Each app wires its adapters in one composition root: `web/src/server/container.ts` and
  `worker/src/clipstudio_worker/bootstrap.py`.
- dependency-cruiser (web) and import-linter (worker) enforce the layer rules.

### Checks

Run these before you merge:

```bash
cd web && npm run lint && npm run typecheck && npm test && npm run format:check
cd worker && uv run ruff check && uv run ruff format --check && uv run pyright \
  && uv run lint-imports && uv run pytest
```

### End-to-end tests

```bash
cd web && npm run test:e2e
```

Playwright starts its own web server on port 3100 with a temporary data folder, a real worker and
a fake Gemini API server, so the run costs nothing and never contacts Gemini. The suite covers:

- uploading an Indonesian text-to-speech video, then the transcript, two scored clips, cutting a
  word, saving, reloading, captions in the preview and an export to a 1080×1920 MP4 whose length
  equals the clip minus the cuts (checked with ffprobe)
- the editor panels (Rapikan, Caption, Reframe, B-roll) and the clip map
- custom text: adding, dragging in the preview and on the clip map, content, font, size, color,
  layer order, the limit of 8, undo, and text in exports at 9:16, 1:1 and 16:9 (the test reads
  text pixels from MP4 frames while the text shows and after it hides)
- an English video uploaded with a clip focus, where the fake Gemini returns one clip titled
  "Fokus: …" and **Cari ulang klip** without a focus replaces it
- the home page: cards link to clips, thumbnails load, the card and table toggle, the "Selesai"
  (Done) status, title search, the sidebar with `aria-current`, and pasting a link to open the
  import dialog
- the project page (breadcrumbs, Klip | Transkrip tabs), the editor's panel rail (↑/↓), and
  deleting a project from the **…** menu, which removes its media folder
- the editor preview in WebKit (Safari's engine), playing forward from frame 0 without looping

The suite needs macOS `say`, ffmpeg, Google Chrome, Playwright's WebKit
(`npx playwright install webkit`, once) and the Whisper model, which downloads on first use. It
deletes its test data when it finishes. Set `CLIPSTUDIO_E2E_KEEP=1` to keep the data. The e2e
server builds into `.next-e2e`, so you can run it next to `npm run dev`.

The live Gemini test costs money, so run it only when you need it:
`CLIPSTUDIO_LIVE_GEMINI=1 uv run pytest tests/integration/test_gemini_clip_suggester.py`.

## Notes

- Momence is for personal, local use. Don't expose its port to the internet. To share a result,
  send the MP4.
- Clean room: I built Momence's behavior from a written spec, without code, assets, APIs or
  branding from other products. Caption fonts come from Google Fonts (OFL), and stock video comes
  from Pixabay, with attribution shown in the editor.
- Environment variables, the database file and internal package names still use `clipstudio`,
  the project's working name.
