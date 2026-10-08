# Panorama from 3Sci Labs

A place to unload your thoughts and find your next step.

## Start with a thought

Open index.html in a modern browser, or use the existing GitHub Pages site. No build or installation is required. Keep using the same browser and site/file location to retain access to its saved data.

The **Thoughts** screen starts empty for new users. Write what is on your mind and choose **Save thought** (or Ctrl+Enter). Categories and **Today's priority** are optional. Existing thoughts, tags, priorities, reviews, archives, API keys, and PIN settings retain their original storage keys.

A category applies only to the thought being saved and resets afterward. Today's priority is a separate optional control. Failed capture saves keep the draft and existing thoughts unchanged. Search filters clear after saving so the new thought remains visible.

The warm notebook design uses cream paper surfaces, coral capture controls, and a teal Dot handoff. A compact Capture / Reflect / Act guide explains the journey. **Need a starting point?** offers optional writing starters; choosing one only fills an empty draft and never overwrites or saves a thought.

No example thoughts are inserted. On a new browser with no Panorama data or introduction preference, a three-step introduction opens once and can be skipped immediately (including with Escape). Existing users are not interrupted. **Help & FAQ** in the header provides answers and **Show introduction again**. Skip or Finish remembers only the introduction preference; existing notes, settings, and backup formats are unchanged. Voice input is available when the browser supports it.

## Review with My Dot

Use **Share with My Dot** above your saved thoughts. Only one stage is shown at a time:

1. **Choose thoughts.** Select what to share. Today's priority and recent review themes are optional. Review the selected content before continuing.
2. **Take them to Dot.** Copy the prepared message, open ChatGPT, sign in if prompted, and paste the message into your Dot conversation. **View the full message** reveals exactly what will be copied. If clipboard access fails, the app opens and selects that message for manual copying.
3. **Bring back a review.** Paste Dot's complete response, including any code block. **Preview review** shows the proposed result; **Save review** saves it. Back keeps an unfinished reply within the open dialog. Discard this reply, Escape, or closing discards the pending reply without changing saved data. Edit reply returns to the retained text; changing the reply or selected context requires previewing again. Successful save removes the Back action and offers View my review.

Panorama cannot detect ChatGPT login state, send a message to Dot, or receive its response automatically. The ChatGPT link is ordinary navigation with no thoughts or credentials in the URL. The structured response format is specified in the copied message; an arbitrary prose reply is not accepted. This handoff needs no API key.

The sharing dialog is the only scroll container in the flow. The thought list has natural height, and the optional full-message textarea has an explicit minimum height. This avoids the former shrinking list/preview problem on shorter screens.

## Reviews and History

**Latest review** shows a summary and up to three suggested next steps, followed by expandable patterns and all remaining suggestions. No actions are scheduled or sent automatically.

Saving a different review retains the prior review and its thought/priority snapshot in **History**. Reapplying the same review does not create a duplicate. **Archive these thoughts**, under Manage saved thoughts, moves the current thoughts/review into History and clears the active list after confirmation. Today's priority remains. Deleting current thoughts is a separate action.

Dialogs support Escape, keyboard focus containment, and return focus to their opener. Preview and success states receive focus. PIN unlock returns to capture. Draft copy is unavailable until a draft is ready, and late responses cannot overwrite a newer draft.

History shows both existing weekly archives and saved previous reviews. Expand an entry to read its review and original thoughts, or search its contents.

Review exports are under **Copy or download this review**: copy the action list, download a Markdown summary (including your Monday plan), or choose calendar times. Calendar exports do not check availability or sync a calendar.

## From a messy week to Monday

- **Review this week** selects thoughts from the current Monday–Sunday in your local time and opens the existing manual Dot handoff. The selection shows dates and a count; all other thoughts remain available for manual selection. New thoughts save a full timestamp. Older timestamp-based IDs remain usable; thoughts without a reliable date are explicitly left for manual selection.
- **My Monday plan** saves priorities, first steps, definitions of done, and progress (To do, Done, Deferred, Dropped). Use **Save changes** on each action. Add your own actions whenever needed. Older review formats remain supported and show up to three suggestions as editable plan starters.
- **Follow-through:** the optional recent-review context includes unfinished actions from the current plan and History. For repeated action titles, the latest status wins, so completed or dropped actions are not revived from an older review. This context is only copied when the checkbox is selected.
- **Thoughts behind this insight** opens source thought snapshots for bottlenecks and connections. Dot is asked to cite selected thought IDs. Panorama resolves those IDs only against your actual selected thoughts, never against source text supplied by the assistant. Snapshots survive deletion and archiving and are included in backups. Citations make the source inspectable; they do not prove the assistant's interpretation. Old reviews explain when no source citation is available.
- **Choose calendar times** lets you select unfinished actions and edit each date, local start time, and duration before downloading an ICS file. Defaults start next Monday, with two blocks per day. Single-suggestion calendar buttons use the same preview. Import the file into your calendar and check the times there.

The prepared Dot message now requests at most three Monday priorities, supporting thought IDs, and small experiments for product ideas. Existing notes, reviews, archives, and backups remain compatible. Plans and source snapshots live inside the saved review; backup and History retain them.

## Settings

- **Backup & restore:** download notes, active review, history, and priority as a private JSON backup. Restore validates all included fields before replacing them. Empty priority and null review restore correctly; legacy backups retain omitted fields. Storage errors roll back attempted writes before the in-memory view changes.
- **Privacy:** manage the screen-lock PIN and see storage/voice information. The PIN hides the desk; it does not encrypt notes or protect against someone with access to the browser profile.
- **Other review options → Review with Google AI:** configure the Google API key and explicitly send all current thoughts, today's priority, and recent review context to Gemini. Detailed suggestions also offer optional Gemini drafting. The key is stored unencrypted in this browser. Account quota/access and charges apply. No real key is needed for tests.
- **Thought categories & storage:** category distribution and storage footprint.
- **Help & FAQ:** a dedicated header link explains My Dot availability, the manual handoff, optional Google AI, local storage, backup/restore, privacy, and History. The introduction can be replayed at any time.

Data is stored in this browser, without cross-device syncing. Backups omit the API key and PIN but include private thoughts/history; keep them outside this public repository. Voice input may use an online recognition service. The page uses system fonts and a local Dot image; there are no automatic assistant requests or third-party scripts.

## Regression tests

With Node.js 18 or newer:

    node --test tests/panorama.test.cjs

Tests execute the inline script in an isolated Node VM with synthetic storage, a minimal DOM double, and mocked fetch/clipboard/file operations. They cover startup/navigation, stage/back/cancel/repeat flows, selection/privacy, invalid replies, unsafe text, review-history preservation, archive cancellation/storage failures, complete and legacy vault restoration, and existing Gemini/export behavior.

These are runtime logic tests, not a browser-layout or live Gemini test. Browser QA must use a fresh origin/profile and synthetic data. Check the three-stage flow, visible selection checkboxes, full-message preview height, responsive layout, keyboard navigation, and data preservation.

## Dot artwork

The standard default Dot avatar is bundled unchanged as assets/dot-default.png.
Source: [official default Dot asset](https://persistent.oaistatic.com/images/c4b1da2e76451476d06b17712a926d0f46ee88f07f82a098cef84bcb9175e58e.png).
SHA-256: c4b1da2e76451476d06b17712a926d0f46ee88f07f82a098cef84bcb9175e58e.
