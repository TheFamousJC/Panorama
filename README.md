# Panorama from 3Sci Labs

> **Daily Thoughts & Ideas Synthesizer**
> A local thought scratchpad with a manual JC's Dot review workflow and optional Gemini analysis.

## Quick start

Open index.html in a modern browser such as Chrome or Edge. No build, installation, or Node runtime is needed to use the app. Keep using the same browser and file location to retain access to its existing local storage.

Capture tagged thoughts with **Save Thought** or **Ctrl+Enter**, search/filter the feed, and set today's North Star. Dictation is available when supported by the browser.

## Share with JC's Dot

1. Open **Share with JC's Dot** and select individual thoughts, or choose **Select all thoughts**. No thoughts are selected initially; selections last only for the current page session.
2. Choose whether to include the North Star (initially on) and themes/recurring snags from the last three archived weeks (initially off).
3. Review the exact prompt, then **Copy prompt for JC's Dot**. Paste it into JC's Dot, ChatGPT, or Claude yourself. If clipboard access is blocked, the app selects the prompt for manual copying.
4. Paste the assistant's JSON reply and choose **Review reply**. Invalid JSON or an invalid dossier structure shows an error without changing your current dossier.
5. Inspect the proposed summary and actions, then choose **Apply reviewed dossier**. **Cancel review**, Escape, or closing the dialog discards the pending reply. Editing a reply requires reviewing it again. Applying an identical dossier does not create duplicates.

There is no automatic assistant connection, background transmission, or credential requirement for this workflow. Applying a reply replaces only the current dossier; thoughts, archived weeks, and North Star are preserved. Notes and assistant output display as plain text, including text that looks like HTML.

## Existing analysis and exports

- **Connect The Dots** explicitly sends all current notes, the North Star, and recent snag history to Google's Gemini API using your browser-stored Google API key.
- Gemini synthesis and action drafting use gemini-3.8-flash and the documented LOW thinking level. See Google's [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and [ThinkingConfig reference](https://ai.google.dev/api/generate-content#thinkingconfig). Model access, quota, charges, and availability depend on your Google account. Synthesis has a seven-second request timeout; action drafting uses the same corrected endpoint.
- **Copy Todo List** copies a Markdown checklist. The summary export helper creates a Markdown summary. Calendar controls download .ics focus blocks at preset times; they do not check availability or sync a calendar.
- **Finish Week & Start Fresh** archives the current notes/dossier and clears the active desk. It does not automatically carry questions forward.

## Vault and privacy

**Vault → Download Vault Backup** exports notes, the active dossier, history, and North Star as JSON. Restore validates the complete file before asking to replace its included fields. It restores the active dossier and can clear an empty North Star or null dossier. Older notes-only backups retain fields they omit. Existing storage keys and note IDs are preserved. Malformed files are rejected; selecting the same file again after cancelling is supported.

Notes, the API key, and the PIN remain in this browser's localStorage, without encryption. The PIN hides the desk; it is not protection against someone with access to the browser profile or developer tools. Backups omit the API key and PIN but include personal notes/history: keep them private and outside this public Git repository. The manual handoff shares only what you choose to paste into your assistant, subject to that provider's settings. Google fonts load externally, and browser dictation may use an online speech service.

## Regression tests

With Node.js 18 or newer:

    node --test tests/panorama.test.cjs

The dependency-free tests execute the inline application script in a Node VM with a minimal DOM double, synthetic localStorage, and mocked fetch/clipboard/file operations. They cover selection/privacy boundaries, reply validation, review/apply/cancel/repeat behavior, unsafe text, complete and legacy vault restores, storage failures, Gemini request construction, and archive/export behavior. They never read a real browser profile or contact an AI provider.

These are runtime logic tests, not real-browser layout, clipboard-permission, download, or live Gemini tests. For a browser smoke test, use a separate browser profile or fresh local origin containing only synthetic data; exercise the sharing flow, malformed reply, cancel, repeat apply, and vault export/restore before using personal notes.
