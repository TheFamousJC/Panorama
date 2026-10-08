'use strict';
// Dependency-free regression tests. The application runs only in an isolated VM
// with synthetic storage, a minimal DOM double, and a fetch stub (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.dataset = {};
    this.attributes = {};
    this._text = '';
    this._html = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set textContent(value) { this._text = String(value); this.children = []; this._html = ''; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerText(value) { this.textContent = value; }
  get innerText() { return this.textContent; }
  set innerHTML(value) { this._html = value; this._text = ''; this.children = []; }
  get innerHTML() { return this._html; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this._html = ''; this.children = children; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  click() { this.listeners.click?.(); }
}

function fixture() {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
  const shareButton = new Element('button');
  elements.get('share-north-star').checked = true;
  const stored = new Map();
  const alerts = [];
  const writes = [];
  let failKey = null;
  const storage = {
    getItem: key => stored.get(key) ?? null,
    setItem(key, value) {
      if (key === failKey) { failKey = null; throw new Error('Synthetic storage quota error'); }
      writes.push([key, value]); stored.set(key, String(value));
    },
    removeItem: key => stored.delete(key)
  };
  const context = vm.createContext({
    document: {
      body: new Element('body'),
      getElementById(id) { assert.ok(elements.has(id), 'Missing HTML id: ' + id); return elements.get(id); },
      createElement: tag => new Element(tag),
      querySelector: () => shareButton,
      querySelectorAll: () => []
    },
    localStorage: storage,
    navigator: { clipboard: { writeText: async text => { context.copiedText = text; } } },
    window: {},
    alert: text => alerts.push(text),
    confirm: () => true,
    setTimeout: () => 1, clearTimeout() {},
    AbortController,
    fetch: async () => { throw new Error('Network access is forbidden in these tests'); },
    FileReader: class {
      readAsText(file) { this.onload({ target: { result: file.contents } }); }
    }
  });
  vm.runInContext(script, context, { filename: 'index.html (inline script)' });
  return {
    context, elements, stored, alerts, writes,
    run: code => vm.runInContext(code, context),
    set(name, value) { context[name] = JSON.parse(JSON.stringify(value)); },
    failStorageOnce: key => { failKey = key; },
    get: id => elements.get(id),
    snapshot: () => JSON.stringify([...stored.entries()].sort())
  };
}

function dossier(theme = 'Synthetic review') {
  return {
    theme, summary: 'Focus on a small synthetic task.',
    repeatingSnag: { detected: false, name: '', explanation: '' },
    recurringSnags: [], connectedSparks: [],
    workMoves: [{ step: 'Write a test', why: 'Check the workflow' }],
    lifeMoves: [{ step: 'Walk outside', why: 'Take a break' }]
  };
}
const notes = [
  { id: 1, tag: 'work', text: 'SYNTHETIC selected note', date: 'Thu 10:00' },
  { id: 2, tag: 'personal', text: 'SYNTHETIC excluded note', date: 'Thu 11:00' }
];
function seed(f, data = {}) {
  f.set('testVault', { notes, activeDossier: dossier('Original'), history: [], northStar: 'SYNTHETIC priority', ...data });
  f.run('restoreVault(testVault)');
}
function review(f, data) {
  f.get('external-json-input').value = typeof data === 'string' ? data : JSON.stringify(data);
  f.run('loadExternalJson()');
}
function walk(el) { return [el, ...el.children.flatMap(walk)]; }

test('inline script parses, initialization and capture execute with synthetic storage', () => {
  const f = fixture();
  f.run('window.onload()');
  assert.equal(f.run('notes.length'), 0); // First use starts empty; never seed private-looking demo notes.
  assert.equal(f.get('start-dot-share').disabled, true);
  f.get('note-input').value = 'SYNTHETIC new thought';
  f.run('addNote()');
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_notes'))[0].text, 'SYNTHETIC new thought');
  assert.equal(f.run('typeof loadExternalJson'), 'function');
});

test('sharing includes only selected notes and explicitly selected context, without a network request', async () => {
  const f = fixture();
  seed(f, { history: [{ id: 3, date: '2026-10-01', theme: 'SYNTHETIC archived theme', summary: '', notes: [], dossier: dossier() }] });
  f.run('togglePromptStudio()');
  assert.equal(f.get('copy-share-prompt').disabled, true);
  f.run('selectedShareNotes.add(1); renderShareNotes()');
  let prompt = f.get('prompt-preview-box').value;
  assert.match(prompt, /SYNTHETIC selected note/);
  assert.doesNotMatch(prompt, /SYNTHETIC excluded note|SYNTHETIC archived theme/);
  assert.match(prompt, /SYNTHETIC priority/);
  f.get('share-north-star').checked = false;
  f.get('share-history').checked = true;
  f.run('updateSharePrompt()');
  prompt = f.get('prompt-preview-box').value;
  assert.doesNotMatch(prompt, /SYNTHETIC priority/);
  assert.match(prompt, /SYNTHETIC archived theme/);
  await f.run('copyCompiledPrompt()');
  assert.equal(f.context.copiedText, prompt);
  assert.match(f.get('share-copy-status').textContent, /Copied/);
  f.run('selectShareNotes(false)');
  assert.equal(f.get('copy-share-prompt').disabled, true);
});

test('clipboard failure offers a manual-copy fallback', async () => {
  const f = fixture(); seed(f);
  f.context.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  f.run('selectShareNotes(true)');
  await f.run('copyCompiledPrompt()');
  assert.equal(f.get('prompt-preview-box').selected, true);
  assert.match(f.get('share-copy-status').textContent, /manually/);
});

test('malformed JSON and invalid nested schema cannot change the existing dossier', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  const bad = ['{', 'null', '[]', '{}', JSON.stringify({ ...dossier(), workMoves: 'wrong' }),
    JSON.stringify({ ...dossier(), repeatingSnag: { detected: 'yes', name: '', explanation: '' } }),
    JSON.stringify({ ...dossier(), connectedSparks: [{ connection: 'x', idea: {} }] })];
  for (const reply of bad) {
    review(f, reply);
    assert.equal(f.get('apply-dossier').disabled, true);
    assert.equal(f.get('dossier-review').hidden, true);
    f.run('applyExternalDossier()');
    assert.equal(f.snapshot(), before);
    assert.ok(f.get('share-import-status').textContent);
  }
});

test('review, cancel, edited reply, explicit apply, and repeated apply have separate effects', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  const next = dossier('Next synthetic dossier');
  review(f, next);
  assert.equal(f.snapshot(), before, 'Review must not save');
  assert.match(f.get('dossier-review-content').textContent, /Next synthetic dossier/);
  f.run('cancelDossierReview(); applyExternalDossier()');
  assert.equal(f.snapshot(), before);
  review(f, next);
  f.get('external-json-input').value = JSON.stringify(dossier('Edited'));
  f.run('applyExternalDossier()');
  assert.equal(f.snapshot(), before, 'Changing a reviewed reply requires another review');
  review(f, next);
  f.run('applyExternalDossier()');
  const after = f.snapshot();
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_active_dossier')).theme, next.theme);
  assert.deepEqual(JSON.parse(f.stored.get('3sci_panorama_notes')), notes);
  assert.equal(f.stored.get('3sci_panorama_north_star'), 'SYNTHETIC priority');
  assert.equal(f.get('apply-dossier').disabled, true);
  f.run('applyExternalDossier()');
  assert.equal(f.snapshot(), after);
  const writeCount = f.writes.length;
  review(f, next);
  f.run('applyExternalDossier()');
  assert.equal(f.writes.length, writeCount);
  assert.match(f.get('share-import-status').textContent, /already current/);
  review(f, dossier('Cancelled by closing'));
  f.run('closePromptStudio(); applyExternalDossier()');
  assert.equal(f.snapshot(), after);
  assert.equal(f.get('prompt-studio-drawer').style.display, 'none');
});

test('JSON fences are accepted and input changes invalidate the old preview', () => {
  const f = fixture(); seed(f);
  review(f, '\x60\x60\x60json\n' + JSON.stringify(dossier()) + '\n\x60\x60\x60');
  assert.equal(f.get('apply-dossier').disabled, false);
  f.run('invalidateDossierReview()');
  assert.equal(f.get('apply-dossier').disabled, true);
  assert.equal(f.get('dossier-review-content').textContent, '');
});

test('unsafe note, dossier, preview, and archive text remains text; actions use closures', () => {
  const f = fixture();
  const unsafe = '<img src=x onerror="globalThis.compromised=true"> \' );alert(1);// & <script>bad()</script>';
  const dangerous = dossier(unsafe);
  dangerous.summary = unsafe;
  dangerous.repeatingSnag = { detected: true, name: unsafe, explanation: unsafe };
  dangerous.recurringSnags = [unsafe];
  dangerous.connectedSparks = [{ connection: unsafe, idea: unsafe }];
  dangerous.workMoves = [{ step: unsafe, why: unsafe }];
  dangerous.lifeMoves = [{ step: unsafe, why: unsafe }];
  seed(f, { notes: [{ id: 'unsafe-id', tag: unsafe, text: unsafe, date: unsafe }], activeDossier: dangerous,
    history: [{ id: 1, theme: unsafe, summary: unsafe, date: unsafe, notes: [], dossier: dangerous }] });
  f.run('openHistoryModal(); togglePromptStudio()');
  review(f, dangerous);
  for (const id of ['stream-container', 'share-note-list', 'dossier-theme', 'dossier-narrative', 'chronic-body-text',
    'list-friction', 'list-bridges', 'list-venture', 'list-life', 'history-content', 'dossier-review-content']) {
    const tree = walk(f.get(id));
    assert.ok(f.get(id).textContent.includes(unsafe), id + ' must preserve literal text');
    assert.ok(tree.every(el => !el.innerHTML), id + ' must not send user text to innerHTML');
    assert.ok(tree.every(el => !el.attributes.onclick), id + ' must not generate inline handlers');
    assert.ok(tree.every(el => !['IMG', 'SCRIPT'].includes(el.tagName)));
  }
  f.context.generateActionPlan = (kind, context) => { f.context.received = [kind, context]; };
  walk(f.get('list-friction')).find(el => el.tagName === 'BUTTON').click();
  assert.deepEqual(f.context.received, ['Fix', unsafe]);
  assert.equal(f.context.compromised, undefined);
});

test('full vault export/restore round trip preserves active dossier, archives, IDs, and empty North Star', () => {
  const f = fixture();
  const original = { notes, activeDossier: dossier(), history: [{ id: 8, date: 'Thu', theme: 'Earlier', summary: 'Synthetic', notes, dossier: dossier('Earlier') }], northStar: '' };
  seed(f, original);
  const serialized = f.run('JSON.stringify(createVaultBackup())');
  f.set('testVault', { notes: [], activeDossier: null, history: [], northStar: 'Other' });
  f.run('restoreVault(testVault)');
  f.context.backup = serialized;
  f.run('restoreVault(JSON.parse(backup))');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(createVaultBackup())')), original);
  assert.equal(f.get('north-star-input').value, '');
  assert.equal(f.get('dossier-theme').textContent, original.activeDossier.theme);
  f.run('restoreVault({ notes: [], activeDossier: null, northStar: "", history: [] })');
  assert.equal(f.stored.has('3sci_panorama_active_dossier'), false);
  assert.match(f.get('dossier-theme').textContent, /Your next review will appear here/);
});

test('invalid backups do not partially overwrite storage, legacy notes-only backups remain accepted', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  f.set('badVault', { notes: [], history: 'not a list', northStar: 'New' });
  assert.throws(() => f.run('restoreVault(badVault)'), /history/);
  assert.equal(f.snapshot(), before);
  f.set('badVault', { notes: [notes[0], notes[0]], activeDossier: null });
  assert.throws(() => f.run('restoreVault(badVault)'), /unique/);
  assert.equal(f.snapshot(), before);
  f.run('restoreVault({ notes: [] })');
  assert.equal(f.run('notes.length'), 0);
  assert.equal(f.run('currentDossier.theme'), 'Original');
  assert.equal(f.stored.get('3sci_panorama_north_star'), 'SYNTHETIC priority');
});

test('restore cancellation and selecting the same file again work without leaking a pending reply', () => {
  const f = fixture(); seed(f);
  const original = f.snapshot();
  const input = { value: 'same-file.json', files: [{ size: 100, contents: JSON.stringify({ notes: [], activeDossier: null, history: [], northStar: '' }) }] };
  f.context.fileEvent = { target: input };
  f.context.confirm = () => false;
  f.run('handleVaultFileSelect(fileEvent)');
  assert.equal(input.value, '');
  assert.equal(f.snapshot(), original);
  review(f, dossier('Do not apply after restore'));
  f.context.confirm = () => true;
  input.value = 'same-file.json';
  f.run('handleVaultFileSelect(fileEvent); applyExternalDossier()');
  assert.equal(input.value, '');
  assert.equal(f.run('currentDossier'), null);
  assert.equal(f.run('notes.length'), 0);
});

test('storage failures keep the existing dossier and roll back a partially written restore', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  review(f, dossier('Not saved'));
  f.failStorageOnce('3sci_panorama_active_dossier');
  f.run('applyExternalDossier()');
  assert.equal(f.snapshot(), before);
  assert.equal(f.run('currentDossier.theme'), 'Original');
  assert.match(f.get('share-import-status').textContent, /Could not save/);
  f.set('replacement', { notes: [], activeDossier: dossier('Replacement'), history: [], northStar: 'Changed' });
  f.failStorageOnce('3sci_panorama_history');
  assert.throws(() => f.run('restoreVault(replacement)'), /quota/);
  assert.equal(f.snapshot(), before);
  assert.equal(f.run('currentDossier.theme'), 'Original');
});

test('Gemini requests use a real URL, include North Star, and render validated results (fetch mocked)', async () => {
  const f = fixture(); seed(f);
  f.get('top-gemini-key').value = 'synthetic key & never-real';
  const requests = [];
  f.context.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(dossier('Mock Gemini')) }] } }] }) };
  };
  await f.run('runHolisticSynthesis()');
  assert.equal(f.run('currentDossier.theme'), 'Mock Gemini');
  assert.equal(f.get('synth-status').innerText, 'Review with Google AI');
  await f.run('generateActionPlan("Work", "Synthetic task")');
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const url = new URL(request.url);
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    assert.equal(url.searchParams.get('key'), 'synthetic key & never-real');
    assert.equal(request.options.method, 'POST');
  }
  assert.match(requests[0].options.body, /SYNTHETIC priority/);
});

test('archive clears the visible dossier and exports keep expected data and valid year formatting', () => {
  const f = fixture(); seed(f);
  f.context.downloadFile = (content, name, type) => { f.context.download = { content, name, type }; };
  f.run('downloadVaultBackup()');
  assert.equal(f.context.download.name, 'Panorama_Backup.json');
  assert.deepEqual(JSON.parse(f.context.download.content).notes, notes);
  f.run('exportDossierMarkdown()');
  assert.match(f.context.download.content, /Write a test/);
  f.run('exportSingleEventICS("Synthetic", "Description")');
  assert.match(f.context.download.content, /BEGIN:VCALENDAR/);
  assert.equal(f.run('formatICSDate(new Date("2026-10-18T10:15:00Z"))'), '20261018T101500Z');
  f.run('archiveWeekAndStartFresh()');
  assert.equal(f.run('notes.length'), 0);
  assert.equal(f.run('currentDossier'), null);
  assert.match(f.get('dossier-theme').textContent, /Your next review will appear here/);
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_history'))[0].notes.length, 2);
});

test('legacy dossiers with omitted optional sections remain readable without rewriting storage', () => {
  const f = fixture();
  f.stored.set('3sci_panorama_notes', JSON.stringify(notes));
  const legacy = JSON.stringify({ theme: 'Legacy synthetic dossier', summary: 'Previously optional sections' });
  f.stored.set('3sci_panorama_active_dossier', legacy);
  f.run('loadNotes()');
  assert.equal(f.get('dossier-theme').textContent, 'Legacy synthetic dossier');
  assert.equal(f.stored.get('3sci_panorama_active_dossier'), legacy);
  f.set('legacyVault', { notes, activeDossier: { theme: 'Legacy backup', summary: 'Restored' } });
  f.run('restoreVault(legacyVault)');
  assert.equal(f.get('dossier-theme').textContent, 'Legacy backup');
  review(f, { theme: 'Incomplete new reply', summary: 'Must be rejected' });
  assert.equal(f.get('apply-dossier').disabled, true);
});

test('Escape cancels the pending review and releases the background controls', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  f.run('togglePromptStudio()');
  assert.equal(f.get('app-layout-main').inert, true);
  review(f, dossier('Cancelled by Escape'));
  let prevented = false;
  f.context.keyEvent = { key: 'Escape', preventDefault() { prevented = true; } };
  f.run('handleShareKey(keyEvent); applyExternalDossier()');
  assert.equal(prevented, true);
  assert.equal(f.get('app-layout-main').inert, false);
  assert.equal(f.snapshot(), before);
});

test('ChatGPT handoff uses an ordinary safe link without putting selected thoughts in the URL', async () => {
  const f = fixture(); seed(f);
  f.run('togglePromptStudio(); selectShareNotes(true)');
  await f.run('copyCompiledPrompt()');
  const link = html.match(/<a class="btn-action" href="([^"]+)" target="_blank" rel="([^"]+)">Open ChatGPT \(new tab\)<\/a>/);
  assert.ok(link, 'The dialog must provide an accessible ChatGPT link');
  assert.equal(link[1], 'https://chatgpt.com/');
  assert.ok(link[2].includes('noopener') && link[2].includes('noreferrer'));
  assert.match(html, /sign in if prompted/);
  assert.match(f.get('share-copy-status').textContent, /your Dot conversation/);
  assert.equal(f.get('dossier-review').hidden, true);
});

test('keyboard navigation wraps around the new ChatGPT link without trapping it out of the dialog', () => {
  const f = fixture(); seed(f);
  const first = new Element('button');
  const link = new Element('a');
  const last = new Element('button');
  [first, link, last].forEach(el => { el.closest = () => null; });
  f.get('prompt-studio-drawer').querySelectorAll = selector => {
    assert.match(selector, /a\[href\]/);
    return [first, link, last];
  };
  let prevented = false;
  f.context.keyEvent = { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } };
  f.context.document.activeElement = link;
  f.run('handleShareKey(keyEvent)');
  assert.equal(prevented, false, 'Normal traversal from the link must be allowed');
  f.context.document.activeElement = last;
  f.run('handleShareKey(keyEvent)');
  assert.equal(prevented, true);
  assert.equal(first.focused, true);
  f.context.keyEvent.shiftKey = true;
  f.context.document.activeElement = first;
  f.run('handleShareKey(keyEvent)');
  assert.equal(last.focused, true);
});

test('screen navigation and reloading existing data do not migrate or erase stored content', () => {
  const f = fixture(); seed(f);
  f.stored.set('3sci_panorama_key', 'synthetic-old-key');
  f.stored.set('3sci_panorama_tour_seen', 'true');
  const before = f.snapshot();
  f.run('window.onload()');
  for (const page of ['review', 'history', 'settings', 'notes']) {
    f.context.targetPage = page;
    f.run('showPage(targetPage)');
    for (const name of ['notes', 'review', 'history', 'settings']) {
      assert.equal(f.get('page-' + name).hidden, name !== page);
    }
  }
  assert.equal(f.snapshot(), before);
  assert.equal(f.get('north-star-input').value, 'SYNTHETIC priority');
  assert.equal(f.get('review-content').hidden, false);
  assert.equal(f.get('review-empty').hidden, true);
});

test('three-stage journey enforces selection and preserves an interrupted reply across Back', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  f.run('togglePromptStudio(); setShareStep(2)');
  assert.equal(f.run('shareStep'), 1);
  assert.equal(f.get('share-continue').disabled, true);
  f.run('selectedShareNotes.add(1); renderShareNotes(); setShareStep(2)');
  assert.equal(f.run('shareStep'), 2);
  assert.equal(f.get('share-stage-1').hidden, true);
  assert.equal(f.get('share-stage-2').hidden, false);
  assert.equal(f.get('share-stage-3').hidden, true);
  f.run('setShareStep(3)');
  review(f, dossier('Interrupted synthetic reply'));
  f.run('setShareStep(2); setShareStep(1); setShareStep(2); setShareStep(3)');
  assert.equal(f.get('dossier-review').hidden, false);
  assert.match(f.get('external-json-input').value, /Interrupted synthetic reply/);
  assert.equal(f.snapshot(), before, 'Navigation must not apply a reply');
  f.run('closePromptStudio(); togglePromptStudio()');
  assert.equal(f.run('shareStep'), 1);
  assert.equal(f.get('external-json-input').value, '');
  assert.equal(f.get('apply-dossier').disabled, true);
  assert.equal(f.get('dossier-review').hidden, true);
  assert.equal(f.snapshot(), before);
});

test('changing selected context after preview requires a fresh preview', () => {
  const f = fixture(); seed(f);
  f.run('togglePromptStudio(); selectShareNotes(true); setShareStep(3)');
  review(f, dossier('Old context'));
  const before = f.snapshot();
  f.run('setShareStep(1); selectShareNotes(false); applyExternalDossier()');
  assert.equal(f.snapshot(), before);
  assert.equal(f.get('apply-dossier').disabled, true);
  assert.equal(f.get('share-continue').disabled, true);
});

test('saving replacement reviews retains prior review, tags, notes and priority in History once', () => {
  const f = fixture(); seed(f);
  const next = dossier('New review');
  next.workMoves = Array.from({ length: 4 }, (_, i) => ({ step: 'Work ' + i, why: 'Reason ' + i }));
  next.lifeMoves = [{ step: 'Personal step', why: 'Personal reason' }];
  review(f, next); f.run('applyExternalDossier()');
  const history = JSON.parse(f.stored.get('3sci_panorama_history'));
  assert.equal(history.length, 1);
  assert.equal(history[0].dossier.theme, 'Original');
  assert.equal(history[0].kind, 'review');
  assert.deepEqual(history[0].notes, notes);
  assert.equal(history[0].northStar, 'SYNTHETIC priority');
  assert.equal(f.get('next-steps').children.length, 3);
  assert.match(f.get('list-venture').textContent, /Work 3/);
  assert.match(f.get('list-life').textContent, /Personal step/);
  assert.equal(f.get('share-success').hidden, false);
  f.run('finishShare()');
  assert.equal(f.run('currentPage'), 'review');
  assert.equal(f.context.document.body.style.overflow, '');
  review(f, next); f.run('applyExternalDossier()');
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_history')).length, 1);
  f.run('showPage("history")');
  assert.match(f.get('history-content').textContent, /SYNTHETIC selected note/);
  f.get('history-search').value = 'does not exist';
  f.run('renderHistory()');
  assert.match(f.get('history-content').textContent, /No history matches/);
});

test('archiving can be cancelled and rolls back storage errors before clearing anything', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  f.context.confirm = () => false;
  f.run('archiveWeekAndStartFresh()');
  assert.equal(f.snapshot(), before);
  f.context.confirm = () => true;
  f.failStorageOnce('3sci_panorama_notes');
  f.run('archiveWeekAndStartFresh()');
  assert.equal(f.snapshot(), before);
  assert.equal(f.run('notes.length'), 2);
  assert.equal(f.run('currentDossier.theme'), 'Original');
  f.run('archiveWeekAndStartFresh()');
  assert.equal(f.run('currentPage'), 'history');
  assert.equal(f.stored.get('3sci_panorama_north_star'), 'SYNTHETIC priority');
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_history'))[0].kind, 'archive');
});

test('backup round trip includes replacement-review history and preserves unrelated credentials/settings', () => {
  const f = fixture(); seed(f);
  f.stored.set('3sci_panorama_key', 'synthetic-preserved-key');
  f.stored.set('3sci_panorama_pin', '9999');
  review(f, dossier('Second review')); f.run('applyExternalDossier()');
  f.context.backupText = f.run('JSON.stringify(createVaultBackup())');
  const expected = JSON.parse(f.context.backupText);
  assert.ok(!f.context.backupText.includes('synthetic-preserved-key'));
  assert.ok(!f.context.backupText.includes('9999'));
  f.run('restoreVault({ notes: [], activeDossier: null, history: [], northStar: "" }); restoreVault(JSON.parse(backupText))');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(createVaultBackup())')), expected);
  assert.equal(f.stored.get('3sci_panorama_key'), 'synthetic-preserved-key');
  assert.equal(f.stored.get('3sci_panorama_pin'), '9999');
});

test('first review confirmation does not claim a previous review exists', () => {
  const f = fixture(); seed(f, { activeDossier: null });
  review(f, dossier('First synthetic review')); f.run('applyExternalDossier()');
  assert.equal(f.get('share-import-status').textContent, 'Your first review is saved.');
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_history')).length, 0);
  review(f, dossier('Second synthetic review')); f.run('applyExternalDossier()');
  assert.match(f.get('share-import-status').textContent, /previous review is in History/);
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_history')).length, 1);
});

test('backup restore confirmation and success use the new plain-language labels', () => {
  const f = fixture(); seed(f);
  let confirmation = '';
  f.context.confirm = text => { confirmation = text; return true; };
  f.context.fileEvent = { target: { value: 'synthetic.json', files: [{ size: 100, contents: JSON.stringify({
    notes: [], activeDossier: null, history: [], northStar: ''
  }) }] } };
  f.run('handleVaultFileSelect(fileEvent)');
  assert.match(confirmation, /Restore this backup/);
  assert.match(confirmation, /review, history, and today's priority/);
  assert.doesNotMatch(confirmation, /vault|dossier|North Star/i);
  assert.match(f.alerts.at(-1), /Backup restored/);
  assert.match(f.alerts.at(-1), /review and today's priority/);
  assert.doesNotMatch(f.alerts.at(-1), /vault|dossier|North Star/i);
});

test('failed capture and deletion retain saved notes and draft; successful capture reveals the new thought', () => {
  const f = fixture(); seed(f);
  const before = f.snapshot();
  f.get('note-input').value = 'Keep this draft';
  f.failStorageOnce('3sci_panorama_notes'); f.run('addNote()');
  assert.equal(f.snapshot(), before);
  assert.equal(f.get('note-input').value, 'Keep this draft');
  assert.equal(f.run('notes.length'), 2);
  f.failStorageOnce('3sci_panorama_notes'); f.run('deleteNote(1)');
  assert.equal(f.snapshot(), before); assert.equal(f.run('notes.length'), 2);
  f.get('feed-search').value = 'does not match'; f.run("setFeedFilter('personal'); selectTag('work'); addNote()");
  assert.equal(f.run('notes[0].tag'), 'work'); assert.equal(f.run('activeTag'), 'other');
  assert.equal(f.get('note-input').value, ''); assert.equal(f.get('feed-search').value, '');
  assert.match(f.get('stream-container').textContent, /Keep this draft/);
  f.run('addNote()'); assert.equal(f.run('notes.length'), 3);
  assert.match(f.get('note-save-status').textContent, /Write a thought/);
});

test('preview, edit and save give focus to visible states and require another preview after editing', () => {
  const f = fixture(); seed(f); f.run('togglePromptStudio(); selectShareNotes(true); setShareStep(3)');
  const reply = JSON.stringify(dossier('New view'));
  review(f, reply);
  assert.equal(f.get('share-reply-entry').hidden, true);
  assert.equal(f.get('dossier-review-content').focused, true);
  f.run('editReviewedReply()');
  assert.equal(f.get('external-json-input').value, reply);
  assert.equal(f.get('share-reply-entry').hidden, false);
  assert.equal(f.get('apply-dossier').disabled, true);
  f.run('loadExternalJson(); applyExternalDossier()');
  assert.equal(f.get('share-success').focused, true);
  assert.equal(f.get('share-reply-footer').hidden, true);
  f.run('closePromptStudio(); togglePromptStudio()');
  assert.equal(f.get('share-reply-footer').hidden, false);
});

test('secondary dialogs isolate background, wrap keyboard focus and return to their opener', () => {
  const f = fixture(); seed(f);
  const opener = f.get('btn-lock-status'); f.context.document.activeElement = opener;
  f.run('openSecuritySettingsModal()');
  assert.equal(f.get('app-layout-main').inert, true);
  assert.equal(f.get('security-new-pin').focused, true);
  const first = new Element('button'), last = new Element('button');
  first.closest = last.closest = () => null;
  f.get('security-modal').querySelectorAll = () => [first, last];
  f.context.document.activeElement = last;
  let prevented = false;
  f.context.keyEvent = { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } };
  f.run("handleSecondaryKey(keyEvent, 'security-modal')");
  assert.equal(prevented, true); assert.equal(first.focused, true);
  f.context.keyEvent.key = 'Escape'; f.run("handleSecondaryKey(keyEvent, 'security-modal')");
  assert.equal(f.get('app-layout-main').inert, false);
  assert.equal(f.context.document.body.style.overflow, ''); assert.equal(opener.focused, true);
});

test('closing a pending Google draft prevents a late response from overwriting the next draft', async () => {
  const f = fixture(); seed(f); f.get('top-gemini-key').value = 'synthetic';
  let release;
  f.context.fetch = () => new Promise(resolve => { release = resolve; });
  const old = f.run('generateActionPlan("Work", "old context")');
  assert.equal(f.get('copy-draft').disabled, true);
  f.run('closeDraftModal()');
  f.context.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'New draft' }] } }] }) });
  await f.run('generateActionPlan("Work", "new context")');
  release({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Old draft' }] } }] }) });
  await old;
  assert.equal(f.get('draft-output-area').innerText, 'New draft');
  assert.equal(f.get('copy-draft').disabled, false);
  f.context.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  await f.run("copyDraftText(document.getElementById('copy-draft'))");
  assert.match(f.get('draft-copy-status').textContent, /copy it manually/);
});

test('unavailable share extras are hidden and failed priority save retains stored context', () => {
  const f = fixture(); seed(f, { northStar: '', history: [] });
  f.run('togglePromptStudio()');
  assert.equal(f.get('share-priority-option').hidden, true);
  assert.equal(f.get('share-history-option').hidden, true);
  f.failStorageOnce('3sci_panorama_north_star'); f.run("saveNorthStar('Unsaved priority')");
  assert.equal(f.stored.get('3sci_panorama_north_star'), '');
  assert.match(f.get('priority-status').textContent, /Could not save/);
  f.run("saveNorthStar('Saved priority')");
  assert.equal(f.get('share-priority-option').hidden, false);
});

test('search reset and archive feedback reveal results without altering unrelated data', () => {
  const f = fixture(); seed(f);
  f.get('feed-search').value = 'missing'; f.run('renderNotes()');
  const clear = walk(f.get('stream-container')).find(e => e.textContent === 'Clear search and filters');
  assert.ok(clear); clear.click(); assert.equal(f.get('feed-search').value, '');
  f.get('history-search').value = 'missing'; f.run('archiveWeekAndStartFresh()');
  assert.equal(f.get('history-search').value, '');
  assert.match(f.get('history-status').textContent, /archived/);
  assert.match(f.get('history-content').textContent, /Original/);
  assert.equal(f.stored.get('3sci_panorama_north_star'), 'SYNTHETIC priority');
});

test('summary download includes personal suggestions and checklist errors offer a fallback', async () => {
  const f = fixture(); seed(f);
  f.context.downloadFile = content => { f.context.exported = content; };
  f.run('exportDossierMarkdown()');
  assert.match(f.context.exported, /Write a test/); assert.match(f.context.exported, /Walk outside/);
  f.context.navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
  await f.run("copyTaskChecklist(document.getElementById('copy-draft'))");
  assert.match(f.get('review-export-status').textContent, /Download the summary/);
});

test('PIN unlock returns to the visible screen and empty calendar exports explain why no download occurs', () => {
  const f = fixture(); seed(f, { activeDossier: dossier('No work') });
  f.run("showPage('settings'); localStorage.setItem('3sci_panorama_pin', '1234'); checkSecurityLock()");
  f.get('pin-entry-input').value = '1234'; f.run('verifyPin()');
  assert.equal(f.get('settings-title').focused, true); assert.equal(f.get('app-layout-main').inert, false);
  f.run('currentDossier.workMoves = []');
  let downloaded = false; f.context.downloadFile = () => { downloaded = true; };
  f.run('exportFullCalendarICS()');
  assert.equal(downloaded, false); assert.match(f.get('review-export-status').textContent, /no work suggestions/);
});

test('optional writing starters fill only an empty draft and never overwrite or save user content', () => {
  const f = fixture(); seed(f); const before = f.snapshot();
  f.run("useWritingStarter('idea')");
  assert.equal(f.get('note-input').value, 'An idea I keep coming back to is ');
  assert.equal(f.snapshot(), before);
  f.get('note-input').value = 'My unfinished thought';
  f.run("useWritingStarter('worry')");
  assert.equal(f.get('note-input').value, 'My unfinished thought');
  assert.match(f.get('note-save-status').textContent, /already have a thought/);
  f.get('note-input').value = ''; f.run("useWritingStarter('decision')");
  assert.match(f.get('note-input').value, /A decision/);
  assert.equal(f.snapshot(), before);
  f.run("useWritingStarter('invalid')"); assert.equal(f.snapshot(), before);
});

test('new visitors can skip the introduction with Escape and reload without being interrupted again', () => {
  const f = fixture(); f.run('window.onload()');
  assert.equal(f.get('wizard-modal').style.display, 'flex');
  assert.equal(f.run('wizardStep'), 1); assert.equal(f.get('app-layout-main').inert, true);
  f.context.escape = { key: 'Escape', preventDefault() {} }; f.run('handleWizardKey(escape)');
  assert.equal(f.get('wizard-modal').style.display, 'none');
  assert.equal(f.get('app-layout-main').inert, false); assert.equal(f.context.document.body.style.overflow, '');
  assert.equal(f.get('note-input').focused, true); assert.equal(f.run('notes.length'), 0);
  assert.equal(f.stored.get('3sci_panorama_intro_seen'), '1');
  f.run('window.onload()'); assert.equal(f.get('wizard-modal').style.display, 'none');
});

test('existing browser data and the previous tour preference prevent automatic introduction without new writes', () => {
  for (const key of ['notes', 'active_dossier', 'history', 'north_star', 'key', 'pin', 'tour_seen']) {
    const f = fixture(); f.stored.set('3sci_panorama_' + key, ['notes', 'history'].includes(key) ? '[]' : key === 'active_dossier' ? JSON.stringify(dossier()) : '');
    const before = f.snapshot(); f.run('window.onload()');
    assert.notEqual(f.get('wizard-modal').style.display, 'flex'); assert.equal(f.snapshot(), before);
  }
});

test('wizard Back, replay and Finish preserve the current draft and stored content', () => {
  const f = fixture(); seed(f); f.stored.set('3sci_panorama_intro_seen', '1'); const before = f.snapshot();
  f.get('note-input').value = 'Unfinished personal draft';
  f.run('openFaqModal()'); assert.equal(f.get('page-help').hidden, false);
  f.context.document.activeElement = f.get('replay-introduction');
  f.run('openWizardModal(); advanceWizard(); advanceWizard()');
  assert.equal(f.get('wizard-next').textContent, 'Finish'); assert.equal(f.get('wizard-step-3').hidden, false);
  f.run('setWizardStep(2)'); assert.equal(f.get('wizard-heading-2').focused, true);
  assert.equal(f.get('wizard-step-3').hidden, true); assert.equal(f.get('wizard-next').textContent, 'Next');
  f.run('closeWizardModal()'); assert.equal(f.get('replay-introduction').focused, true);
  assert.equal(f.run('currentPage'), 'help');
  f.run('openWizardModal()'); assert.equal(f.run('wizardStep'), 1); assert.equal(f.get('wizard-back').hidden, true);
  f.run('setWizardStep(3); advanceWizard()');
  assert.equal(f.run('currentPage'), 'notes'); assert.equal(f.get('note-input').focused, true);
  assert.equal(f.get('note-input').value, 'Unfinished personal draft'); assert.equal(f.snapshot(), before);
});

test('wizard traps keyboard focus and can always close when its preference cannot be saved', () => {
  const f = fixture(); seed(f); f.run('openWizardModal()');
  const first = new Element('button'), last = new Element('button');
  first.closest = last.closest = () => null; f.get('wizard-modal').querySelectorAll = () => [first, last];
  f.context.document.activeElement = last; let prevented = false;
  f.context.tab = { key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } };
  f.run('handleWizardKey(tab)'); assert.equal(prevented, true); assert.equal(first.focused, true);
  f.context.document.activeElement = first; f.context.tab.shiftKey = true;
  f.run('handleWizardKey(tab)'); assert.equal(last.focused, true);
  const before = f.snapshot(); f.failStorageOnce('3sci_panorama_intro_seen');
  f.run('closeWizardModal()'); assert.equal(f.get('app-layout-main').inert, false);
  assert.equal(f.get('wizard-modal').style.display, 'none'); assert.equal(f.snapshot(), before);
});

test('weekly selection respects local Monday boundaries and keeps undated legacy thoughts available', () => {
  const f = fixture();
  const start = new Date(2026, 9, 5), end = new Date(2026, 9, 12);
  seed(f, { notes: [
    { ...notes[0], id: start.getTime(), createdAt: start.toISOString() },
    { ...notes[1], id: end.getTime(), createdAt: end.toISOString() },
    { ...notes[0], id: 9 },
    { ...notes[0], id: start.getTime() - 1 }
  ] });
  const before = f.snapshot();
  f.run('selectThisWeek(new Date(2026, 9, 9))');
  assert.equal(f.run('selectedShareNotes.size'), 1);
  assert.equal(f.run(`selectedShareNotes.has(${start.getTime()})`), true);
  assert.match(f.get('week-selection-summary').textContent, /no reliable date/);
  assert.equal(f.snapshot(), before);
});

test('Monday plans survive reload, backup and history; failed saves keep the previous plan', () => {
  const f = fixture(); seed(f);
  f.set('newReview', { ...dossier('New'), mondayPlan: [{ step: 'Ship', firstStep: 'Check', doneWhen: 'Published', status: 'open' }] });
  f.run('renderDossier(newReview)');
  f.run("persistPlan(planActions().map(a => ({...a, status: 'done'})))");
  f.run('loadNotes()');
  assert.equal(f.run('planActions()[0].status'), 'done');
  const before = f.snapshot(); f.failStorageOnce('3sci_panorama_active_dossier');
  assert.equal(f.run("persistPlan(planActions().map(a => ({...a, status: 'dropped'})))"), false);
  assert.equal(f.snapshot(), before);
  assert.equal(f.run('planActions()[0].status'), 'done');
  f.run('restoreVault(createVaultBackup())');
  assert.equal(f.run('planActions()[0].doneWhen'), 'Published');
  f.run("renderDossier({...newReview, theme:'Next'})");
  assert.equal(JSON.parse(f.stored.get('3sci_panorama_history'))[0].dossier.mondayPlan[0].status, 'done');
});

test('follow-through respects the latest status and the explicit sharing toggle', () => {
  const f = fixture(); seed(f);
  f.set('old', { ...dossier(), mondayPlan: [{ step: 'Fix', firstStep: '', doneWhen: '', status: 'open' }] });
  f.run('renderDossier(old); persistPlan(planActions().map(a => ({...a, status:"done"})))');
  assert.equal(f.run('unfinishedActions().length'), 0);
  f.run('persistPlan(planActions().map(a => ({...a, status:"deferred"})))');
  assert.equal(f.run('unfinishedActions().length'), 1);
  const context = include => JSON.parse(f.run(`compilePrompt(notes, false, ${include})`).split('CONTEXT:\n')[1].split('\n\nSCHEMA:')[0]);
  assert.equal(context(false).followThrough.length, 0);
  assert.equal(context(true).followThrough[0].status, 'deferred');
});

test('evidence uses only selected local source snapshots and remains after deleting thoughts', () => {
  const f = fixture(); seed(f);
  f.run('selectedShareNotes.add(1)');
  review(f, { ...dossier('Sources'), recurringSnags: ['Delay'], evidence: [{ insight: 'Delay', noteIds: ['1', '2', '999'] }], sourceNotes: [{...notes[0], text:'Fabricated source'}] });
  assert.doesNotMatch(f.get('dossier-review-content').textContent, /Fabricated source|SYNTHETIC excluded note/);
  f.run('applyExternalDossier(); notes = []; paintDossier(currentDossier)');
  assert.match(f.get('list-friction').textContent, /SYNTHETIC selected note/);
  assert.doesNotMatch(f.get('list-friction').textContent, /SYNTHETIC excluded note|Fabricated source/);
  f.run('restoreVault(createVaultBackup())');
  assert.match(f.get('list-friction').textContent, /SYNTHETIC selected note/);
});

test('calendar preview selects actions and validates local dates and durations before export', () => {
  const f = fixture(); seed(f);
  f.run('openCalendarPlanner()');
  assert.equal(f.run('calendarRows.length'), 2);
  f.run("calendarRows[0].date.value='2026-10-12'; calendarRows[0].time.value='09:30'; calendarRows[0].duration.value='60'; calendarRows[1].selected.checked=false");
  const ics = f.run('buildPlannedCalendar(calendarRows)');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /UID:.*@panorama.local/);
  assert.match(ics, /SUMMARY:Write a test/);
  assert.doesNotMatch(ics, /Walk outside/);
  f.run("calendarRows[0].duration.value='0'");
  assert.throws(() => f.run('buildPlannedCalendar(calendarRows)'), /duration/);
  f.run("calendarRows[0].duration.value='45'; calendarRows[0].date.value='2026-02-30'");
  assert.throws(() => f.run('buildPlannedCalendar(calendarRows)'), /date/);
  assert.equal(f.run('nextMonday(new Date(2026,9,9)).getDate()'), 12);
  assert.equal(f.run('nextMonday(new Date(2026,9,12)).getDate()'), 19);
});

test('invalid plan fields and evidence cannot partially restore a backup', () => {
  const f = fixture(); seed(f); const before = f.snapshot();
  f.set('bad', { notes, activeDossier: { ...dossier(), mondayPlan:[{step:'X', firstStep:'', doneWhen:'', status:'mystery'}] } });
  assert.throws(() => f.run('restoreVault(bad)'), /status/);
  assert.equal(f.snapshot(), before);
  f.set('bad', { notes, activeDossier: { ...dossier(), evidence:[{insight:'X',noteIds:[{}]}] } });
  assert.throws(() => f.run('restoreVault(bad)'), /noteId/);
  assert.equal(f.snapshot(), before);
});

test('calendar files escape text and fold Unicode lines without injecting extra events', () => {
  const f = fixture();
  f.run('calendarRows = [{selected:{checked:true},date:{value:"2026-10-12"},time:{value:"10:00"},duration:{value:"45"},action:{step:"Line;comma,\\nBEGIN:VEVENT", firstStep:"שלום".repeat(80),doneWhen:"Done"}}]');
  const ics = f.run('buildPlannedCalendar(calendarRows)');
  assert.equal((ics.match(/(?:^|\r\n)BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /Line\\;comma\\,\\nBEGIN:VEVENT/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
});
