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
  assert.equal(f.run('notes.length'), 5); // Only the checked-in demo notes.
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
  assert.match(f.get('dossier-theme').textContent, /Will Show Up Here/);
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
  assert.match(f.get('dossier-theme').textContent, /Will Show Up Here/);
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
