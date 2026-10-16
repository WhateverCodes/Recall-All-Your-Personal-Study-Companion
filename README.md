# Recall-All

A personal study companion for Windows and Chrome/Edge. Recall-All collects likely-read material from websites you approve, creates AI practice questions, and keeps your study history and scores locally.

This is the clean v1.0.0 source snapshot. It contains no personal study records, saved API credentials, speech models, or installed dependencies.

## Features

- Per-site permission and a draggable, minimizable owl with start/stop controls.
- Reading-time estimates based on visible content, scrolling and activity; visible video playback contributes while viewing is enabled.
- Summaries grouped by source page, revision periods, and topic selection.
- AI practice with difficulty selection, multiple choice, true/false and short answers.
- Saved answers, daily/weekly scores, named tests, shuffled retakes, PDF printing and mistake review.
- Question feedback to exclude unsuitable questions from automatic mistake review.
- Optional local audio transcription, separate audio controls, and YouTube timestamp links when playback positions are available.
- Backup and restore without exporting saved provider credentials.

## Requirements

- Windows with Chrome or Edge.
- Node.js 22 or newer, available in your terminal.
- Your own supported AI-provider API key for AI practice. Provider quotas and charges apply; a free tier is not guaranteed.
- Optional audio transcription: Python 3.11 or 3.12 with the Windows `py` launcher, internet for the one-time download, and sufficient disk space and memory.

## Start the dashboard

1. Clone or download this repository and extract it to a permanent folder.
2. Install Node.js if needed.
3. Double-click **startdashboard.cmd**. It starts the server and opens the dashboard in your default browser. Use Chrome or Edge for audio sharing.
4. Keep its command window running while studying. The address is `http://127.0.0.1:43127/`.

The web dashboard uses Node's built-in modules and does not require `npm install`. Run only one Recall-All server at a time. If another copy is already running, the launcher opens that copy; close its command window before switching project folders.

## Load the extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**, select **Load unpacked**, and choose this repository's **extension** folder.
3. Open an ordinary website and refresh it. Choose **Allow this site** or **Always allow this site** on the owl.
4. Use **Start viewing** when needed. Viewing starts paused after the local app restarts.

The manifest includes a public extension identity key, not an API credential. Keep it together with `extension-id.json` so the extension and local server recognize each other.

## Connect AI

Open **Connections**, select the provider/model, enter your own API key, and connect. Gemini is the primary personal workflow; other provider adapters are included. Generation sends selected study text to that provider under the dashboard's consent settings. Never put your key in source code or commit it to GitHub.

Remembering a key requires explicit consent to local plain-text storage. It is saved under `data/`, excluded by `.gitignore`. This repository does not provide a key or shared API quota.

## Learn from audio

1. Open **Connections → Set up local transcription** and wait for the one-time download.
2. Select **Start audio**, choose the video tab or supported screen source, and enable **Share audio** in the browser picker.
3. Keep the dashboard tab open. Use the owl's separate audio pause/resume control, or **Stop audio** to end sharing.

For YouTube links, first permit the video page and start viewing. Select the detected video under **YouTube timestamps**, then share that same tab's audio. Timestamp links apply to new recordings with known playback positions.

Audio is transcribed locally using faster-whisper. Raw audio is processed in memory; transcript text is saved locally and can be sent to the configured AI provider when generating practice. Starting the owl alone does not start audio capture.

## Scores and exports

Scores groups tests by their original date/name, with attempt counts and the latest score. Open a test to review earlier attempts or use the browser print dialog to save a PDF. Connections contains backup/restore controls. Backups contain private learning records; keep them outside the repository. Restoring replaces history after confirmation and saves a local recovery copy.

## Privacy and limitations

- `data/` is created on first use and contains personal information. Do not upload it.
- Study time estimates activity, not learning. Video time requires visible, advancing playback on the focused, approved page with viewing enabled. Audio transcription alone does not count study time.
- Native Word, PowerPoint and Adobe windows are not captured. Browser internal pages, built-in PDF viewers and embedded frames may not support collection.
- Questions and transcripts can be inaccurate. Evidence checks and feedback do not guarantee correctness.
- The optional Electron shell is experimental. The Chrome/Edge dashboard is the supported audio workflow.
- This is a personal learning project, not a browser-store release or hosted service.

## Development

```sh
npm test
```

Tests use temporary synthetic data and local HTTP servers; no real API key is needed. They cover permissions, capture, scoring, retakes, question validation, audio controls, backups and history models.

Optional desktop shell:

```sh
npm ci
npm start
```

After setting up local transcription, optional decoder tests on Windows:

```powershell
.\data\speech-runtime\Scripts\python.exe -m unittest discover -s tests -p test_audio_decoder.py
```

## Structure

- `extension/`: browser worker, capture, owl and permission controls.
- `ui/`: dashboard, quizzes, history and audio sharing.
- `server.cjs`: local API and persistence.
- `audio/`: transcription setup, worker and sessions.
- `tests/`: checks with synthetic fixtures.
- `desktop/`: optional Electron shell.

## Publish this snapshot

Upload this folder's contents as the repository root, including `.gitignore`. Do not add the separate personal `study-owl` folder or its ZIP. Review the file list before committing. Create a GitHub release tagged `v1.0.0` to preserve this snapshot. No open-source licence has been selected; add one if you want to grant reuse rights.
