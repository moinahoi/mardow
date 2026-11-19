import { Crepe } from '@milkdown/crepe';
import { $prose, $inputRule } from '@milkdown/kit/utils';
import { remarkStringifyOptionsCtx, editorViewOptionsCtx, editorViewCtx } from '@milkdown/kit/core';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Plugin, PluginKey, TextSelection, AllSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '@fontsource/geist/latin-700.css'; // bundled for the sidebar's "Hello!" only
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { dict, defaultLang } from './i18n.js';
import { renderSettings } from './settings.js';
import { newBoard, isBoard } from './board.js';
import { slashIcons as si, toolbarIcons, listIcons, tableIcons, linkTooltipIcons, codeIcons } from './icons.js';
import { createBoardView } from './boardview.js';
import { createCodeView } from './codeview.js';
import { TYPES, currentType, selectBlock, turnInto } from './turninto.js';
import { plainText, listStart } from './plaintext.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const titleOf = (p) => p.split('/').pop().slice(0, -3);
const folderOf = (p) => (p.includes('/') ? p.split('/')[0] : '');
const isMac = navigator.platform.startsWith('Mac');
const key = (k) => (isMac ? `⌘${k}` : `Ctrl+${k}`);

const icon = {
  compose: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5M9 3h6l-1 7 4 4H6l4-4Z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  finder: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  folderPlus: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 11v5M9.5 13.5h5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>',
  wrap: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4M4 18h5"/><path d="m15 16-2 2 2 2"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
};

const state = {
  cfg: {},
  tree: { root: [], folders: [], order: [] },
  current: null, // relative path of the open note
  file: null, // absolute path of an open single file (outside any notes folder); excludes `current`
  activeFolder: '', // where "new note" goes
  collapsed: new Set(),
  query: '',
  results: [],
  renaming: null, // folder name being renamed inline
};
let t = dict(defaultLang());
const langOf = () => (state.cfg.lang && state.cfg.lang !== 'system' ? state.cfg.lang : defaultLang());
const allNotes = () => [...state.tree.root, ...state.tree.folders.flatMap((f) => f.notes)];

// ---------- API ----------
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function toast(err) {
  console.error(err);
  const el = $('#toast');
  el.textContent = err.message ?? String(err);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 4000);
}

// ---------- Saving ----------
// All writes run through one queue so saves and renames never overtake each other.
let queue = Promise.resolve();
let pending = null; // unsaved markdown of the current note
let lastSaved = ''; // file content as last read or written
let baseline = ''; // editor markdown that matches lastSaved; differs => unsaved local edits
let saveTimer, renameTimer;
let titleDirty = false;

const enqueue = (fn) => (queue = queue.then(fn).catch(toast));

// Milkdown writes empty trailing paragraphs as "<br />"; keep the files clean.
const tidy = (md) => md.replace(/(\s*<br \/>)+\s*$/, '').trimEnd() + (md.trim() ? '\n' : '');

function scheduleSave(md) {
  clearTimeout(saveTimer);
  // Milkdown reports a change right after loading; without a real edit the file must stay byte for byte as it was.
  if (tidy(md) === baseline) return void (pending = null);
  pending = tidy(md);
  saveTimer = setTimeout(flush, 400);
}

function flush() {
  clearTimeout(saveTimer);
  if (titleDirty) renameCurrent();
  const content = pending;
  pending = null;
  const [url, path] = state.file ? ['/api/file', state.file] : ['/api/note', state.current];
  if (content !== null && content !== lastSaved && path) {
    lastSaved = baseline = content;
    enqueue(() => api('PUT', url, { path, content }));
  }
  return queue;
}

// Saved per notes folder in config.json, so the app reopens it on the next start or switch (a stale path is just skipped).
function rememberNote() {
  if (!state.current || state.cfg.lastNotes?.[state.cfg.vault] === state.current) return;
  api('PUT', '/api/config', { lastNote: state.current }).then((cfg) => { state.cfg = cfg; }).catch(toast);
}

function renameCurrent() {
  clearTimeout(renameTimer);
  titleDirty = false;
  const title = $('#title').value.trim() || t.untitled;
  enqueue(async () => {
    const from = state.current;
    if (!from || titleOf(from) === title) return;
    const { path } = await api('POST', '/api/note/rename', { path: from, title });
    state.current = path;
    rememberNote();
    if (document.activeElement !== $('#title')) $('#title').value = titleOf(path);
    await loadTree();
  });
}

// ---------- Editor ----------
let crepe = null;
const darkMode = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => state.cfg.theme === 'dark' || (state.cfg.theme !== 'light' && darkMode.matches);
let appliedDark = null;

function applyTheme() {
  const explicit = ['light', 'dark'].includes(state.cfg.theme) ? state.cfg.theme : null;
  // Tauri: title bar, traffic lights and native dialogs follow too (no-op in a browser).
  window.__TAURI_INTERNALS__?.invoke('plugin:window|set_theme', { label: 'main', value: explicit }).catch(() => {});
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (appliedDark !== null && dark !== appliedDark && crepe && state.current) mountEditor(crepe.getMarkdown()); // code-block colours
  appliedDark = dark;
}
darkMode.addEventListener('change', applyTheme);
applyTheme(); // before the config arrives, so the first paint already matches the system
let openToken = 0;
let opening = null; // path being loaded by openNote

// The block handle's plus inserts an empty paragraph and opens the menu. If the user backs out
// (Esc, or moves the cursor elsewhere) without typing or picking a block, drop that paragraph again.
let plusPressed = false;
const plusViews = new Set(); // note editor and card-details editor
const plusKey = new PluginKey('mardow-plus');
const emptyPara = (node) => node?.type.name === 'paragraph' && node.content.size === 0;
// Deletes the empty paragraph at pos, or the list item (and list) that holds nothing else: in a list the plus adds a whole item.
function dropEmpty(tr, pos) {
  const $pos = tr.doc.resolve(pos);
  let d = $pos.depth;
  while (d > 0 && /list/.test($pos.node(d).type.name) && $pos.node(d).childCount === 1) d--;
  const from = d === $pos.depth ? pos : $pos.before(d + 1);
  tr.delete(from, d === $pos.depth ? pos + tr.doc.nodeAt(pos).nodeSize : $pos.after(d + 1));
  // Back to the line the plus was clicked on, not into the next one (an empty trailing line would show the placeholder).
  return tr.setSelection(TextSelection.near(tr.doc.resolve(from), -1));
}
const dropUnusedPlusLine = $prose(() => new Plugin({
  key: plusKey,
  state: {
    init: () => null,
    apply: (tr, pos) => (tr.getMeta(plusKey) !== undefined ? tr.getMeta(plusKey) : pos == null ? null : tr.mapping.map(pos)),
  },
  appendTransaction(trs, __, state) {
    const { $from } = state.selection;
    // Wait for the insert itself: WebKit can dispatch a selection-only transaction first (on focus).
    if (plusPressed && trs.some((tr) => tr.docChanged) && emptyPara($from.parent)) {
      plusPressed = false;
      return state.tr.setMeta(plusKey, $from.before());
    }
    const pos = plusKey.getState(state);
    if (pos == null) return null;
    const node = state.doc.nodeAt(pos);
    if (!emptyPara(node)) return state.tr.setMeta(plusKey, null); // typed something or chose a block type
    if ($from.pos > pos && $from.pos < pos + node.nodeSize) return null; // still in it
    return dropEmpty(state.tr, pos).setMeta(plusKey, null);
  },
  view: (v) => { plusViews.add(v); return { destroy: () => plusViews.delete(v) }; },
}));
document.addEventListener('pointerup', (e) => {
  if (e.target.closest('.milkdown-block-handle .operation-item:first-child')) {
    plusPressed = true;
    setTimeout(() => { plusPressed = false; }); // Crepe inserts synchronously; don't let a no-op click linger
  }
}, true); // capture: runs before Crepe's own handler inserts the paragraph
// Registered before Crepe's slash menu listener, which swallows Esc (preventDefault) so ProseMirror never sees it.
// An open slash menu on an empty line can only come from the plus, so Esc drops that line even if tracking missed it.
window.addEventListener('keydown', (e) => {
  const plusView = [...plusViews].find((v) => v.hasFocus());
  if (e.key !== 'Escape' || !plusView) return;
  const { state } = plusView;
  const { $from } = state.selection;
  const menuOpen = document.querySelector('.milkdown-slash-menu[data-show="true"]');
  let pos = plusKey.getState(state);
  if (!emptyPara(pos == null ? null : state.doc.nodeAt(pos))) pos = menuOpen && emptyPara($from.parent) ? $from.before() : null;
  if (pos == null || state.doc.childCount === 1) return;
  plusView.dispatch(dropEmpty(state.tr, pos).setMeta(plusKey, null));
}, true);

// "->", "-->" and "—>" (macOS turns "--" into "—") become an arrow while typing; ⌘Z brings the text back.
const arrows = $inputRule(() => new InputRule(/(?:--?|—)>$/, (state, _, start, end) =>
  state.doc.resolve(start).marks().some((m) => m.type.name === 'inlineCode') ? null : state.tr.insertText('→', start, end)));

// "[] ", "[ ] " or "[x] " at the start of a line makes a checklist item, also outside a list
// (Milkdown's own rule only fires inside a list item and needs the space between the brackets).
const taskList = $inputRule(() => new InputRule(/^\[(\s?|x|X)\]\s$/, (state, match, start, end) => {
  const checked = match[1].toLowerCase() === 'x';
  const tr = state.tr.delete(start, end);
  const $s = tr.doc.resolve(start);
  for (let d = $s.depth; d > 0; d--) {
    const node = $s.node(d);
    if (node.type.name === 'list_item') return node.attrs.checked != null ? null : tr.setNodeMarkup($s.before(d), undefined, { ...node.attrs, checked });
  }
  const range = $s.blockRange();
  const { bullet_list, list_item } = state.schema.nodes;
  return range ? tr.wrap(range, [{ type: bullet_list }, { type: list_item, attrs: { checked } }]) : null;
}));

// Enter on a checked item splits it and the new item copies "checked"; a fresh empty item starts unchecked.
// The growing doc tells a split apart from a click on the checkbox, which only changes the attribute.
// List numbers sit outside the text, so the browser highlights them only between the selection's ends
// (the "1." of a fully selected list stayed blank). Mark every list item the selection touches instead.
const selectedItems = $prose(() => new Plugin({
  props: {
    decorations({ doc, selection }) {
      if (selection.empty) return null;
      const marks = [];
      doc.nodesBetween(selection.from, selection.to, (node, pos) => {
        if (node.type.name === 'list_item') marks.push(Decoration.node(pos, pos + node.nodeSize, { class: 'sel-item' }));
      });
      return DecorationSet.create(doc, marks);
    },
  },
}));

const uncheckNewItem = $prose(() => new Plugin({
  appendTransaction(trs, old, state) {
    if (!trs.some((tr) => tr.docChanged) || state.doc.content.size <= old.doc.content.size) return;
    const { $from, empty } = state.selection;
    if (!empty || $from.parent.content.size || $from.depth < 2) return;
    const item = $from.node(-1);
    if (item.type.name !== 'list_item' || item.attrs.checked !== true || item.firstChild !== $from.parent) return;
    const i = $from.index(-2); // only a split leaves a checked sibling right above; "[x] " alone must stay checked
    if (i === 0 || $from.node(-2).child(i - 1).attrs.checked !== true) return;
    return state.tr.setNodeMarkup($from.before(-1), undefined, { ...item.attrs, checked: false });
  },
}));

// The handle sits at the text's left edge for every block, also for indented list items.
let handleBlock = null; // block the handle currently belongs to, for "turn into"
function handleAtLeftEdge({ active, editorDom }) {
  handleBlock = active;
  const r = active.el.getBoundingClientRect();
  const left = editorDom.getBoundingClientRect().left + parseFloat(getComputedStyle(editorDom).paddingLeft);
  return { x: left, y: r.top, left, top: r.top, right: left + r.width, bottom: r.bottom, width: r.width, height: r.height };
}

// A click on the six-dot handle (no drag) opens "turn into" for that line; holding and dragging still moves it.
let turnView = null;
window.addEventListener('click', (e) => {
  const handle = e.target.closest?.('.milkdown-block-handle .operation-item:last-child');
  const view = handle && handleBlock && [...plusViews].find((v) => v.dom.contains(handleBlock.el));
  if (!view) return;
  e.stopPropagation(); // the app's own click handler would close the menu right away
  if (!selectBlock(view, handleBlock.$pos.pos)) return;
  turnView = view;
  const cur = currentType(view.state);
  const label = { text: t.text, h1: t.heading(1), h2: t.heading(2), h3: t.heading(3), quote: t.quote, bullet: t.bulletList, ordered: t.orderedList, task: t.taskList, code: t.codeBlock };
  const icons = { ...si, bullet: si.bulletList, ordered: si.orderedList, task: si.taskList, code: si.codeBlock };
  openMenu(handle, TYPES.map((k) => `<button class="item with-icon ${k === cur ? 'current' : ''}" data-action="turn-into" data-type="${k}">${icons[k]}<span>${esc(label[k])}</span></button>`).join(''));
}, true);

// Shared by the note editor and the card-details editor.
function makeEditor(root, markdown, placeholder = t.editorPlaceholder) {
  const c = new Crepe({
    root,
    defaultValue: markdown,
    features: {
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.Latex]: false,
      [Crepe.Feature.AI]: false,
      [Crepe.Feature.TopBar]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: placeholder, mode: 'block' },
      // Crepe's default code theme is always dark; follow the system instead.
      [Crepe.Feature.CodeMirror]: { theme: isDark() ? oneDark : syntaxHighlighting(defaultHighlightStyle), ...codeIcons },
      [Crepe.Feature.Toolbar]: toolbarIcons,
      [Crepe.Feature.ListItem]: listIcons,
      [Crepe.Feature.Table]: tableIcons,
      [Crepe.Feature.LinkTooltip]: linkTooltipIcons,
      [Crepe.Feature.BlockEdit]: {
        // Thin plus and a six-dot grip, like Notion (Crepe's defaults are heavy filled icons).
        handleAddIcon: '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        blockHandle: { getPosition: handleAtLeftEdge },
        handleDragIcon: '<svg viewBox="0 0 24 24">' + [9, 15].flatMap((x) => [6, 12, 18].map((y) => `<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor" stroke="none"/>`)).join('') + '</svg>',
        textGroup: {
          label: t.text,
          text: { label: t.text, icon: si.text },
          h1: { label: t.heading(1), icon: si.h1 }, h2: { label: t.heading(2), icon: si.h2 }, h3: { label: t.heading(3), icon: si.h3 },
          h4: null, h5: null, h6: null,
          quote: { label: t.quote, icon: si.quote },
          divider: { label: t.divider, icon: si.divider },
        },
        listGroup: {
          label: t.lists,
          bulletList: { label: t.bulletList, icon: si.bulletList },
          orderedList: { label: t.orderedList, icon: si.orderedList },
          taskList: { label: t.taskList, icon: si.taskList },
        },
        advancedGroup: { label: t.advanced, image: null, math: null, codeBlock: { label: t.codeBlock, icon: si.codeBlock }, table: { label: t.table, icon: si.table } },
      },
    },
  });
  c.editor.use(dropUnusedPlusLine).use(arrows).use(taskList).use(uncheckNewItem).use(selectedItems);
  // Plain-text clipboard without Markdown syntax. A view prop, because those win over Milkdown's clipboard plugin.
  c.editor.config((ctx) => ctx.update(editorViewOptionsCtx, (o) => ({
    ...o,
    clipboardTextSerializer: (slice, view) => {
      const { $from, $to, from, to } = view.state.selection;
      if ($from.sameParent($to) && $from.parent.isTextblock) return view.state.doc.textBetween(from, to, '\n', '\n'); // within one line: just the text
      return plainText(slice.content, listStart(slice, $from));
    },
  })));
  // remark writes "*" bullets by default; "-" is what people (and most files) use, so edits don't restyle every list.
  c.editor.config((ctx) => ctx.update(remarkStringifyOptionsCtx, (o) => ({ ...o, bullet: '-' })));
  return c;
}

// ---------- Boards ----------
const boardView = createBoardView($('#board'), {
  t: new Proxy({}, { get: (_, k) => t[k] }), // follows language switches
  esc,
  onChange: (md) => scheduleSave(md),
  openCard: (ci, ki) => openCard(ci, ki).catch(toast),
  openMenu: (anchor, ci) => openMenu(anchor, item('rename-col', t.rename, `data-col="${ci}"`) + item('delete-col', t.deleteColumn, `data-col="${ci}"`, 'danger')),
});

// Markdown of what is on screen right now; compared with `baseline` to detect unsaved edits.
const currentMarkdown = () => (codeView.active ? codeView.value() : boardView.active ? tidy(boardView.markdown()) : crepe ? tidy(crepe.getMarkdown()) : null);

// A file with "mardow: board" frontmatter opens as a board, everything else in the text editor.
async function showContent(md) {
  codeView.clear();
  $('#code').hidden = true;
  $('#editor').hidden = false;
  if (isBoard(md)) {
    const old = crepe;
    crepe = null;
    await old?.destroy();
    $('#editor').innerHTML = '';
    boardView.load(md);
    baseline = currentMarkdown();
  } else {
    await mountEditor(md);
  }
  $('#doc').classList.toggle('is-board', boardView.active);
}

async function mountEditor(markdown) {
  const old = crepe;
  crepe = null;
  await old?.destroy();
  boardView.clear();
  const host = $('#editor');
  host.innerHTML = '';
  const c = makeEditor(host, markdown);
  c.on((l) => l.markdownUpdated((_, md) => { if (crepe === c) scheduleSave(md); }));
  await c.create();
  baseline = tidy(c.getMarkdown());
  crepe = c;
}

function showDoc(visible) {
  $('#doc').hidden = !visible;
  $('#empty').hidden = visible;
}

async function openNote(path) {
  const token = ++openToken;
  opening = path;
  await flush();
  const { content } = await api('GET', `/api/note?path=${encodeURIComponent(path)}`).finally(() => {
    if (token === openToken) opening = null;
  });
  if (token !== openToken) return;
  state.current = path;
  state.file = null;
  $('#title').readOnly = false;
  rememberNote();
  state.activeFolder = folderOf(path);
  state.collapsed.delete(state.activeFolder);
  lastSaved = content;
  $('#title').value = titleOf(path);
  renderInfo();
  showDoc(true);
  await showContent(content);
  renderList();
}

// A single file from outside the notes folders: Markdown in the editor, any other text in the code view.
const fileName = (p) => p.split('/').pop();
async function openFile(path) {
  const token = ++openToken;
  await flush();
  const { content } = await api('GET', `/api/file?path=${encodeURIComponent(path)}`);
  if (token !== openToken) return;
  state.current = null;
  state.file = path;
  lastSaved = content;
  $('#title').value = fileName(path);
  $('#title').readOnly = true; // renaming would touch a folder Mardow doesn't own
  renderInfo();
  showDoc(true);
  if (/\.(md|markdown)$/i.test(path)) {
    await showContent(content);
  } else {
    const old = crepe;
    crepe = null;
    await old?.destroy();
    boardView.clear();
    $('#doc').classList.remove('is-board');
    $('#editor').hidden = true;
    $('#code').hidden = false;
    baseline = content;
    $('#code-lang').textContent = codeView.show(content, fileName(path), isDark(), !!state.cfg.wrap) ?? t.plainText;
    renderWrapBtn();
  }
  renderList();
}

function renderWrapBtn() {
  const btn = $('#wrap-btn');
  btn.innerHTML = icon.wrap;
  btn.title = t.wordWrap;
  btn.setAttribute('aria-label', t.wordWrap);
  btn.setAttribute('aria-pressed', String(!!state.cfg.wrap));
}

const codeView = createCodeView($('#code-body'), (text) => {
  pending = text; // saved as typed, no Markdown tidying
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
});

async function closeNote() {
  openToken++;
  state.current = null;
  state.file = null;
  $('#title').readOnly = false;
  codeView.clear();
  $('#code').hidden = true;
  $('#editor').hidden = false;
  pending = null;
  titleDirty = false;
  cardAt = null;
  if (cardDialog.open) cardDialog.close();
  await crepe?.destroy();
  crepe = null;
  boardView.clear();
  showDoc(false);
  renderList();
}

// The watcher fires for our own writes too; only reload when the file differs from what we saved.
async function onExternalChange() {
  if (state.cfg.vault) await loadTree();
  const path = state.file ?? state.current; // a single file or a note
  if (!path) return;
  await queue;
  const url = state.file ? '/api/file' : '/api/note';
  const saved = lastSaved;
  const clean = () => path === (state.file ?? state.current) && pending === null && !titleDirty && lastSaved === saved
    && !cardDialog.open && currentMarkdown() === baseline; // no local edits, not even ones still in Milkdown's debounce
  if (!clean()) return;
  try {
    const { content } = await api('GET', `${url}?path=${encodeURIComponent(path)}`);
    if (clean() && content !== saved) {
      lastSaved = content;
      if (!codeView.active) return void (await showContent(content));
      baseline = content;
      codeView.replace(content);
    }
  } catch {
    if (path === (state.file ?? state.current)) closeNote(); // deleted or renamed elsewhere
  }
}

// ---------- Sidebar ----------
async function loadTree() {
  state.tree = await api('GET', '/api/tree');
  renderList();
  renderInfo();
}

// "Erstellt heute, 11:52 · Bearbeitet gestern, 18:03" under the title; full date on hover.
function when(ms) {
  const d = new Date(ms);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((day(new Date()) - day(d)) / 864e5);
  const time = d.toLocaleTimeString(langOf(), { hour: '2-digit', minute: '2-digit' });
  if (daysAgo === 0) return `${t.today}, ${time}`;
  if (daysAgo === 1) return `${t.yesterday}, ${time}`;
  return d.toLocaleString(langOf(), { dateStyle: 'medium', timeStyle: 'short' });
}

function renderInfo() {
  if (state.file) return void ($('#note-info').innerHTML = `<span>${esc(t.looseFileInfo)}</span>`);
  const n = allNotes().find((x) => x.path === state.current);
  const full = (ms) => new Date(ms).toLocaleString(langOf(), { dateStyle: 'full', timeStyle: 'medium' });
  const part = (label, ms) => `<span title="${esc(full(ms))}">${esc(label)} ${esc(when(ms))}</span>`;
  $('#note-info').innerHTML = n ? `${part(t.created, n.created)}<span class="dot">·</span>${part(t.edited, n.mtime)}` : '';
}

// Pinned notes stay on top in every order. "manual" follows the dragged order; new notes come first there.
function sorted(notes) {
  const rank = new Map(state.tree.order.map((p, i) => [p, i]));
  const by = {
    alpha: (a, b) => a.title.localeCompare(b.title),
    created: (a, b) => b.created - a.created,
    manual: (a, b) => (rank.get(a.path) ?? -1) - (rank.get(b.path) ?? -1) || b.created - a.created,
    recent: (a, b) => b.mtime - a.mtime,
  }[state.cfg.sort] ?? ((a, b) => b.mtime - a.mtime);
  return [...notes].sort((a, b) => (b.pinned - a.pinned) || by(a, b));
}

function noteRow(n, snippet) {
  return `<div class="note ${n.path === state.current ? 'active' : ''} ${n.important ? 'important' : ''}" data-action="open" data-path="${esc(n.path)}" draggable="${!snippet && !state.query}">
    <span class="note-title">${n.pinned ? `<i class="pin">${icon.pin}</i>` : ''}${n.board ? `<i class="kind">${icon.board}</i>` : ''}${esc(n.title)}</span>
    ${snippet ? `<span class="snippet">${esc(snippet)}</span>` : ''}
    <button class="icon small" data-action="note-menu" data-path="${esc(n.path)}">${icon.more}</button>
  </div>`;
}

function folderBlock(name, notes) {
  const isRoot = name === '';
  const open = !state.collapsed.has(name);
  const label = state.renaming === name && !isRoot
    ? `<input class="rename" value="${esc(name)}" data-folder="${esc(name)}" />`
    : `<span class="folder-name">${esc(isRoot ? t.notes : name)}</span>`;
  return `<section class="folder ${open ? 'open' : ''} ${state.activeFolder === name ? 'active' : ''}">
    <div class="folder-head" data-action="toggle" data-folder="${esc(name)}">
      <i class="chev">${icon.chevron}</i>${label}<span class="count">${notes.length}</span>
      <button class="icon small" data-action="new-board" data-folder="${esc(name)}" title="${esc(t.newBoard)}">${icon.board}</button>
      <button class="icon small" data-action="new-note" data-folder="${esc(name)}" title="${esc(t.newNote)} (${key('N')})">${icon.compose}</button>
      ${isRoot ? '' : `<button class="icon small" data-action="folder-menu" data-folder="${esc(name)}">${icon.more}</button>`}
    </div>
    ${open ? `<div class="notes" data-folder="${esc(name)}">${sorted(notes.filter((n) => !n.important)).map((n) => noteRow(n)).join('')}</div>` : ''}
  </section>`;
}

// Important notes leave their folder and are listed here, above everything else.
function importantBlock() {
  const notes = allNotes().filter((n) => n.important);
  if (!notes.length) return '';
  const open = !state.collapsed.has(IMPORTANT);
  return `<section class="folder important-section ${open ? 'open' : ''}">
    <div class="folder-head" data-action="toggle" data-folder="${IMPORTANT}">
      <i class="chev">${icon.chevron}</i><i class="star">${icon.star}</i><span class="folder-name">${esc(t.important)}</span><span class="count">${notes.length}</span>
    </div>
    ${open ? `<div class="notes" data-important>${sorted(notes).map((n) => noteRow(n)).join('')}</div>` : ''}
  </section>`;
}
const IMPORTANT = '/important'; // section key; folder names can't contain "/" 

function renderFiles() {
  const files = state.cfg.files ?? [];
  $('#files').hidden = !files.length;
  $('#files').innerHTML = `<div class="files-head">${icon.file}<span>${esc(t.looseFiles)}</span></div>${files.map((f) => {
    const data = `data-file="${esc(f)}"`;
    return `<div class="note ${f === state.file ? 'active' : ''}" data-action="open-file" ${data}><span class="note-title">${esc(fileName(f))}</span>
      <button class="icon small" data-action="close-file" ${data} title="${esc(t.closeFile)}" aria-label="${esc(t.closeFile)}">${icon.close}</button></div>`;
  }).join('')}`;
}

function renderList() {
  renderFiles();
  const list = $('#list');
  if (document.activeElement?.matches('.rename')) return; // don't wipe a name being typed

  if (state.query) {
    list.innerHTML = state.results.length
      ? `<div class="notes results">${state.results.map((n) => noteRow(n, n.snippet)).join('')}</div>`
      : `<p class="muted">${esc(t.noResults)}</p>`;
    return;
  }
  list.innerHTML = importantBlock() + folderBlock('', state.tree.root) + state.tree.folders.map((f) => folderBlock(f.name, f.notes)).join('');
  const input = list.querySelector('.rename');
  if (input) { input.focus(); input.select(); }
}

async function newNote(folder = state.activeFolder, content = '', title = t.untitled) {
  await flush();
  const { path } = await api('POST', '/api/note', { folder, title });
  if (content) await api('PUT', '/api/note', { path, content });
  state.collapsed.delete(folder);
  await loadTree();
  await openNote(path);
  $('#title').focus();
  $('#title').select();
}

async function commitFolderRename(input) {
  const from = input.dataset.folder;
  const to = input.value.trim();
  state.renaming = null;
  if (!to || to === from) return renderList();
  await flush();
  enqueue(async () => {
    const { name } = await api('POST', '/api/folder/rename', { name: from, newName: to });
    if (state.current && folderOf(state.current) === from) { state.current = `${name}/${titleOf(state.current)}.md`; rememberNote(); }
    if (state.activeFolder === from) state.activeFolder = name;
    await loadTree();
  });
}

// ---------- Popup menu ----------
function openMenu(anchor, html) {
  const menu = $('#menu');
  menu.innerHTML = html;
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8);
  const top = r.bottom + menu.offsetHeight > window.innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom + 4;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}
const closeMenu = () => ($('#menu').hidden = true);
const item = (action, label, data = '', cls = '') => `<button class="item ${cls}" data-action="${action}" ${data}>${esc(label)}</button>`;

function noteMenu(anchor, path) {
  const note = allNotes().find((n) => n.path === path);
  const data = `data-path="${esc(path)}"`;
  openMenu(anchor, item('pin', note?.pinned ? t.unpin : t.pin, data) + item('important', note?.important ? t.unmarkImportant : t.markImportant, data)
    + '<hr>' + item('delete-note', t.delete, data, 'danger'));
}

function folderMenu(anchor, name) {
  const data = `data-folder="${esc(name)}"`;
  openMenu(anchor, item('collapse-others', t.collapseOthers, data) + item('expand-all', t.expandAll)
    + '<hr>' + item('rename-folder', t.rename, data) + item('delete-folder', t.delete, data, 'danger'));
}

// ---------- Settings window ----------
let settingsSection = 'general';
const settingsDialog = $('#settings');

function renderSettingsDialog() {
  settingsDialog.innerHTML = renderSettings({ t, cfg: state.cfg, active: settingsSection, esc });
}

function openSettings() {
  renderSettingsDialog();
  if (!settingsDialog.open) settingsDialog.showModal();
}
window.mardowOpenSettings = openSettings; // called by the native menu (Mardow › Settings…, ⌘,)

async function saveSetting(key, value) {
  state.cfg = await api('PUT', '/api/config', { [key]: value });
  if (key === 'lang') applyLang();
  if (key === 'theme') applyTheme();
  renderList();
  renderInfo();
  if (settingsDialog.open) renderSettingsDialog();
}

settingsDialog.addEventListener('change', (e) => {
  const key = e.target.dataset.setting;
  if (key) saveSetting(key, e.target.value).catch(toast);
});
// Click on the dimmed backdrop closes (the dialog element itself is only hit outside its content).
settingsDialog.addEventListener('click', (e) => { if (e.target === settingsDialog) settingsDialog.close(); });

// ---------- Card details ----------
const cardDialog = $('#card');
let cardEditor = null;
let cardAt = null; // [column, card] being edited

async function openCard(ci, ki) {
  const card = boardView.card(ci, ki);
  if (!card) return;
  cardAt = [ci, ki];
  cardDialog.innerHTML = `<div class="card-window">
    <div class="card-head">
      <span class="card-col">${icon.board}${esc(boardView.column(ci).title)}</span>
      <button class="icon" data-action="close-card" title="${esc(t.close)} (Esc)">${icon.close}</button>
    </div>
    <div class="card-body">
      <textarea id="card-title" rows="1" spellcheck="false">${esc(card.title)}</textarea>
      <div class="card-label">${esc(t.details)}</div>
      <div id="card-editor" class="md-editor"></div>
    </div>
    <div class="card-foot"><button class="btn danger" data-action="delete-card">${esc(t.deleteCard)}</button></div>
  </div>`;
  cardDialog.showModal();
  const title = $('#card-title');
  title.style.height = `${title.scrollHeight}px`;
  const ed = makeEditor($('#card-editor'), card.details, t.detailsPlaceholder);
  cardEditor = ed;
  await ed.create();
  if (cardEditor !== ed) await ed.destroy(); // closed while it was still loading
}

cardDialog.addEventListener('close', async () => {
  const ed = cardEditor;
  cardEditor = null;
  if (cardAt) {
    const [ci, ki] = cardAt;
    cardAt = null;
    const card = boardView.card(ci, ki);
    const title = $('#card-title').value.replace(/\s+/g, ' ').trim() || card?.title;
    const details = ed ? tidy(ed.getMarkdown()).trim() : card?.details;
    if (card && (title !== card.title || details !== card.details)) boardView.updateCard(ci, ki, { title, details });
  }
  await ed?.destroy();
});
cardDialog.addEventListener('click', (e) => { if (e.target === cardDialog) cardDialog.close(); });
// The editor swallows Esc, so the dialog never gets its cancel; close it here unless Esc is meant for an open editor menu.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !cardDialog.open) return;
  if (cardDialog.querySelector('.milkdown-slash-menu[data-show="true"], .milkdown-toolbar[data-show="true"]')) return;
  e.preventDefault();
  cardDialog.close();
}, true);
cardDialog.addEventListener('input', (e) => {
  if (e.target.id === 'card-title') { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }
});
cardDialog.addEventListener('keydown', (e) => {
  if (e.target.id === 'card-title' && e.key === 'Enter') { e.preventDefault(); $('#card-editor .ProseMirror')?.focus(); }
});

// ---------- Events ----------
const actions = {
  'new-note': (el) => newNote(el.dataset.folder ?? state.activeFolder),
  'new-folder': async () => {
    const { name } = await api('POST', '/api/folder', { name: t.newFolder });
    state.renaming = name;
    await loadTree();
  },
  open: (el) => openNote(el.dataset.path),
  toggle: (el) => {
    const f = el.dataset.folder;
    if (f !== IMPORTANT) state.activeFolder = f;
    state.collapsed.has(f) ? state.collapsed.delete(f) : state.collapsed.add(f);
    renderList();
  },
  'note-menu': (el) => noteMenu(el, el.dataset.path),
  'folder-menu': (el) => folderMenu(el, el.dataset.folder),
  'turn-into': (el) => { turnInto(turnView, el.dataset.type); turnView.focus(); },
  settings: () => openSettings(),
  'close-settings': () => settingsDialog.close(),
  'settings-section': (el) => { settingsSection = el.dataset.section; renderSettingsDialog(); },
  'set-setting': (el) => saveSetting(el.dataset.key, el.dataset.value),
  pin: async (el) => {
    const note = allNotes().find((n) => n.path === el.dataset.path);
    await api('POST', '/api/note/pin', { path: el.dataset.path, pinned: !note?.pinned });
    await loadTree();
  },
  important: async (el) => {
    const note = allNotes().find((n) => n.path === el.dataset.path);
    await api('POST', '/api/note/important', { path: el.dataset.path, important: !note?.important });
    await loadTree();
  },
  'delete-note': async (el) => {
    const path = el.dataset.path;
    await flush();
    await api('DELETE', `/api/note?path=${encodeURIComponent(path)}`);
    if (path === state.current) await closeNote();
    await loadTree();
  },
  'collapse-others': (el) => {
    const keep = el.dataset.folder;
    state.collapsed = new Set(['', ...state.tree.folders.map((f) => f.name)].filter((f) => f !== keep));
    renderList();
  },
  'expand-all': () => { state.collapsed.clear(); renderList(); },
  'rename-folder': (el) => { state.renaming = el.dataset.folder; renderList(); },
  'delete-folder': async (el) => {
    const name = el.dataset.folder;
    if (!confirm(t.deleteFolderConfirm(name))) return;
    await flush();
    await api('DELETE', `/api/folder?name=${encodeURIComponent(name)}`);
    if (state.current && folderOf(state.current) === name) await closeNote();
    if (state.activeFolder === name) state.activeFolder = '';
    await loadTree();
  },
  'reveal-vault': () => api('POST', '/api/reveal-vault', {}),
  'new-board': (el) => newNote(el.dataset.folder ?? state.activeFolder, newBoard([t.colTodo, t.colDoing, t.colDone]), t.newBoard),
  'rename-col': (el) => boardView.editColumn(Number(el.dataset.col)),
  'delete-col': (el) => {
    const ci = Number(el.dataset.col);
    const col = boardView.column(ci);
    if (col.cards.length && !confirm(t.deleteColumnConfirm(col.title, col.cards.length))) return;
    boardView.deleteColumn(ci);
  },
  'close-card': () => cardDialog.close(),
  'delete-card': () => {
    const [ci, ki] = cardAt;
    cardAt = null;
    cardDialog.close();
    boardView.deleteCard(ci, ki);
  },
  'open-file': (el) => openFile(el.dataset.file),
  'toggle-wrap': async () => {
    state.cfg = await api('PUT', '/api/config', { wrap: !state.cfg.wrap });
    codeView.setWrap(state.cfg.wrap);
    renderWrapBtn();
  },
  'close-file': async (el) => {
    if (el.dataset.file === state.file) { await flush(); await closeNote(); }
    state.cfg = await api('POST', '/api/file/close', { path: el.dataset.file });
    renderFiles();
  },
  'vault-menu': (el) => {
    const short = (p) => p.replace(/^\/Users\/[^/]+(?=\/|$)/, '~');
    const rows = (state.cfg.vaults ?? []).map((p) => {
      const cur = p === state.cfg.vault;
      const data = `data-path="${esc(p)}"`;
      return `<div class="vault-row"><button class="item ${cur ? 'current' : ''}" data-action="switch-vault" ${data} title="${esc(p)}">
        <span>${esc(p.split('/').pop() || p)}</span><small>${esc(short(p))}</small></button>
        ${cur ? '' : `<button class="icon small" data-action="forget-vault" ${data} title="${esc(t.removeVault)}" aria-label="${esc(t.removeVault)}">${icon.close}</button>`}</div>`;
    });
    openMenu(el, `${rows.join('')}<hr>${item('pick-vault', t.addVault)}`);
  },
  'switch-vault': async (el) => {
    if (el.dataset.path === state.cfg.vault) return;
    await flush(); // the open note still belongs to the old folder
    await switchVault(await api('PUT', '/api/config', { vault: el.dataset.path }));
  },
  'forget-vault': async (el) => { state.cfg = await api('POST', '/api/forget-vault', { path: el.dataset.path }); },
  'pick-vault': async () => {
    await flush();
    const cfg = await api('POST', '/api/pick-vault', {});
    if (cfg.vault !== state.cfg.vault) await switchVault(cfg);
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!e.target.closest('#menu') || el) closeMenu();
  if (!el || e.target.closest('.rename')) return;
  e.stopPropagation();
  try { await actions[el.dataset.action]?.(el); } catch (err) { toast(err); }
});

$('#list').addEventListener('contextmenu', (e) => {
  const note = e.target.closest('.note');
  const folder = e.target.closest('.folder-head');
  if (note) { e.preventDefault(); noteMenu({ getBoundingClientRect: () => ({ left: e.clientX, top: e.clientY, bottom: e.clientY }) }, note.dataset.path); }
  else if (folder?.dataset.folder) { e.preventDefault(); folderMenu({ getBoundingClientRect: () => ({ left: e.clientX, top: e.clientY, bottom: e.clientY }) }, folder.dataset.folder); }
});

// ---------- Drag notes in the sidebar: reorder, move to another folder, into or out of "Important" ----------
let dragNote = null;

function noteDropTarget(e) {
  if (!dragNote) return null;
  const row = e.target.closest('.note[data-path]');
  const section = e.target.closest('.folder');
  if (!section) return null;
  const important = section.classList.contains('important-section');
  const folder = important ? null : section.querySelector('.folder-head').dataset.folder;
  if (row && row.dataset.path !== dragNote) {
    const r = row.getBoundingClientRect();
    return { row, important, folder, before: e.clientY < r.top + r.height / 2 };
  }
  return row ? null : { head: section.querySelector('.folder-head'), important, folder };
}

const clearNoteMarks = () => $('#list').querySelectorAll('.drop-before, .drop-after, .drop-into')
  .forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into'));

$('#list').addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.note[draggable="true"]');
  if (!row) return;
  dragNote = row.dataset.path;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ''); // WebKit only starts a drag with some data
  requestAnimationFrame(() => row.classList.add('dragging'));
});
$('#list').addEventListener('dragover', (e) => {
  const tg = noteDropTarget(e);
  if (!tg) return;
  e.preventDefault();
  clearNoteMarks();
  if (tg.row) tg.row.classList.add(tg.before ? 'drop-before' : 'drop-after');
  else tg.head.classList.add('drop-into');
});
$('#list').addEventListener('dragleave', (e) => { if (!$('#list').contains(e.relatedTarget)) clearNoteMarks(); });
$('#list').addEventListener('dragend', () => {
  dragNote = null;
  clearNoteMarks();
  $('#list').querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
});
$('#list').addEventListener('drop', (e) => {
  const tg = noteDropTarget(e);
  const path = dragNote;
  clearNoteMarks();
  if (!tg) return;
  e.preventDefault();
  dropNote(path, tg).catch(toast);
});

async function dropNote(path, tg) {
  const note = allNotes().find((n) => n.path === path);
  // The order the sidebar shows now, for every note (collapsed folders too), so "manual" starts from it.
  const order = [allNotes().filter((n) => n.important), state.tree.root.filter((n) => !n.important),
    ...state.tree.folders.map((f) => f.notes.filter((n) => !n.important))].flatMap((g) => sorted(g).map((n) => n.path));
  order.splice(order.indexOf(path), 1);
  if (tg.row) {
    order.splice(order.indexOf(tg.row.dataset.path) + (tg.before ? 0 : 1), 0, path);
  } else {
    const first = order.findIndex((p) => (tg.important ? allNotes().find((n) => n.path === p)?.important : folderOf(p) === tg.folder));
    order.splice(first === -1 ? order.length : first, 0, path); // dropped on a heading: top of that group
  }
  await flush();
  let target = path;
  if (!tg.important && folderOf(path) !== tg.folder) {
    ({ path: target } = await api('POST', '/api/note/move', { path, folder: tg.folder }));
    order[order.indexOf(path)] = target;
    if (state.current === path) { state.current = target; rememberNote(); }
  }
  if (tg.important !== !!note?.important) await api('POST', '/api/note/important', { path: target, important: tg.important });
  await api('POST', '/api/order', { order });
  if (state.cfg.sort !== 'manual') state.cfg = await api('PUT', '/api/config', { sort: 'manual' });
  if (!tg.important) state.collapsed.delete(tg.folder);
  await loadTree();
}

$('#list').addEventListener('keydown', (e) => {
  if (!e.target.matches('.rename')) return;
  if (e.key === 'Enter') e.target.blur();
  if (e.key === 'Escape') { state.renaming = null; renderList(); }
});
$('#list').addEventListener('focusout', (e) => {
  if (e.target.matches('.rename') && state.renaming !== null) commitFolderRename(e.target).catch(toast);
});

$('#title').addEventListener('input', () => {
  titleDirty = true;
  clearTimeout(renameTimer);
  renameTimer = setTimeout(() => { renameCurrent(); }, 800);
});
$('#title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    $('#editor .ProseMirror')?.focus();
  }
});
$('#title').addEventListener('blur', () => { if (titleDirty) renameCurrent(); });

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.query = e.target.value.trim();
    state.results = state.query ? await api('GET', `/api/search?q=${encodeURIComponent(state.query)}`).catch((err) => (toast(err), [])) : [];
    renderList();
  }, 150);
});

window.addEventListener('beforeunload', () => {
  // Last-chance save when the window closes; keepalive lets the request outlive the page.
  if (pending !== null && pending !== lastSaved && state.current) {
    fetch('/api/note', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: state.current, content: pending }) });
  }
});

// ---------- Resizable sidebar ----------
const SIDEBAR = { min: 180, max: 480, default: 260 };
const resizer = $('#sidebar-resizer');
const clampWidth = (w) => Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, w)));
const setSidebarWidth = (w) => {
  const width = clampWidth(w);
  document.documentElement.style.setProperty('--sidebar-w', `${width}px`);
  resizer.setAttribute('aria-valuenow', width);
  return width;
};
const saveSidebarWidth = (w) => api('PUT', '/api/config', { sidebarWidth: w }).then((cfg) => (state.cfg = cfg)).catch(toast);

resizer.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  resizer.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  let width = $('#sidebar').offsetWidth;
  const move = (ev) => { width = setSidebarWidth(ev.clientX); }; // sidebar starts at x = 0
  resizer.addEventListener('pointermove', move);
  resizer.addEventListener('pointerup', () => {
    resizer.removeEventListener('pointermove', move);
    document.body.classList.remove('resizing');
    saveSidebarWidth(width);
  }, { once: true });
});
resizer.addEventListener('dblclick', () => saveSidebarWidth(setSidebarWidth(SIDEBAR.default)));
resizer.addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -10, ArrowRight: 10 }[e.key];
  if (!step) return;
  e.preventDefault();
  saveSidebarWidth(setSidebarWidth($('#sidebar').offsetWidth + step));
});

// ---------- Keyboard shortcuts ----------
// ⌘A outside a text field selects the open note's content only, never the sidebar, title or dates.
function selectContent() {
  if (codeView.active) return codeView.selectAll();
  const view = crepe?.editor.action((ctx) => ctx.get(editorViewCtx));
  if (!view) return;
  view.focus();
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
}

const editing = () => !!document.activeElement?.closest('input, textarea, select, [contenteditable="true"]');

function focusSearch() {
  $('#search').focus();
  $('#search').select();
}

// Previous/next note in the order the sidebar currently shows (respects sort, collapsed folders, search).
function stepNote(dir) {
  const paths = [...document.querySelectorAll('#list .note')].map((n) => n.dataset.path);
  const from = opening ?? state.current; // a note still loading counts as current, so fast repeats keep stepping
  const next = from ? paths[paths.indexOf(from) + dir] : paths[0];
  if (next) return openNote(next);
}

// [modifiers, KeyboardEvent.code, action, only-if]. Codes, not keys: ⌥ changes e.key on macOS ("⌥S" = "ß").
const shortcuts = [
  ['mod', 'KeyN', () => newNote()],
  ['mod+alt', 'KeyN', () => newNote()], // browsers reserve ⌘N for a new window
  ['mod+shift', 'KeyN', () => actions['new-folder']()],
  ['mod', 'KeyK', focusSearch],
  ['mod+shift', 'KeyF', focusSearch],
  ['mod', 'KeyS', () => { if (crepe) scheduleSave(crepe.getMarkdown()); return flush(); }], // skip Milkdown's debounce
  ['mod', 'Comma', openSettings, null, 'always'],
  ['mod+alt', 'KeyS', () => document.body.classList.toggle('sidebar-hidden')],
  ['mod+alt', 'ArrowUp', () => stepNote(-1)],
  ['mod+alt', 'ArrowDown', () => stepNote(1)],
  ['mod', 'KeyA', selectContent, () => !editing()],
  ['mod', 'Backspace', () => actions['delete-note']({ dataset: { path: state.current } }), () => state.current && !editing()],
];

window.addEventListener('keydown', (e) => {
  const mods = [(isMac ? e.metaKey : e.ctrlKey) && 'mod', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean).join('+');
  const hit = shortcuts.find(([m, code, , when]) => m === mods && code === e.code && (!when || when()));
  // Note shortcuts need a vault and stay off while the settings window is open; ⌘, works always.
  if (!hit || (hit[4] !== 'always' && (!state.cfg.vault || settingsDialog.open || cardDialog.open))) return;
  e.preventDefault();
  e.stopPropagation();
  closeMenu();
  Promise.resolve(hit[2]()).catch(toast);
}, true); // capture: runs before the editor sees the key

$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = '';
    state.query = '';
    renderList();
    $('#editor .ProseMirror')?.focus() ?? e.target.blur();
  } else if (e.key === 'Enter') {
    const first = $('#list .note');
    if (first) openNote(first.dataset.path).catch(toast);
  }
});

// ---------- Boot ----------
function applyLang() {
  t = dict(langOf());
  document.documentElement.lang = langOf();
  $('#search').placeholder = t.search;
  $('#title').placeholder = t.titlePlaceholder;
  $('#new-folder').innerHTML = icon.folderPlus;
  $('#new-folder').title = `${t.newFolder} (${isMac ? '⇧⌘N' : 'Ctrl+Shift+N'})`;
  $('#search').title = key('K');
  $('#settings-btn').innerHTML = icon.gear;
  $('#reveal-btn').innerHTML = icon.finder;
  $('#vault-path').setAttribute('aria-label', t.switchVault);
  $('#reveal-btn').title = t.revealInFinder;
  $('#reveal-btn').setAttribute('aria-label', t.revealInFinder);
  resizer.setAttribute('aria-label', t.resizeSidebar);
  resizer.title = t.resizeSidebarHint;
  $('#settings-btn').title = `${t.settings} (${key(',')})`;
  $('#empty').innerHTML = `<p>${esc(t.emptyEditor)}</p>`;
  $('#welcome').innerHTML = `<h1>${esc(t.welcome)}</h1><p>${esc(t.welcomeText)}</p>
    <button class="primary" data-action="pick-vault">${esc(t.pickFolder)}</button>
    <form id="path-form"><input name="path" required placeholder="${esc(t.orPath)} – ~/Notes" /><button>${esc(t.open)}</button></form>`;
  if (crepe && state.current) mountEditor(crepe.getMarkdown()); // relabel slash menu
  boardView.rerender();
}

async function switchVault(cfg) {
  state.cfg = cfg;
  await closeNote();
  state.activeFolder = '';
  state.collapsed.clear(); // folder names belong to the old notes folder
  state.query = '';
  state.results = [];
  $('#search').value = '';
  const ready = !!cfg.vault;
  $('#welcome').hidden = ready;
  $('#sidebar').hidden = !ready;
  $('#empty').hidden = !ready;
  // Home shown as "~"; CSS cuts long paths at the start so the folder name stays visible.
  $('#vault-path').title = cfg.vault ?? '';
  $('#vault-path [dir]').textContent = (cfg.vault ?? '').replace(/^\/Users\/[^/]+(?=\/|$)/, '~');
  if (!ready) return;
  await loadTree();
  const last = cfg.lastNotes?.[cfg.vault];
  if (last && allNotes().some((n) => n.path === last)) await openNote(last);
}

$('#welcome').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await switchVault(await api('PUT', '/api/config', { vault: e.target.path.value })); } catch (err) { toast(err); }
});

// The Tauri window loads the page with ?desktop (hidden title bar, traffic lights over the sidebar).
if (new URLSearchParams(location.search).has('desktop')) document.body.classList.add('desktop');

// A file arrived via Open With or a Finder drop (the server keeps it until asked, so a cold start gets it too).
async function takeOpened() {
  const { path, skipped, config } = await api('POST', '/api/take-opened', {});
  state.cfg = config;
  renderFiles();
  if (skipped.length) toast(new Error(t.skippedFiles(skipped)));
  if (path) await openFile(path);
}

new EventSource('/api/events').onmessage = (e) => {
  if (e.data === 'open') return void takeOpened().catch(toast);
  clearTimeout(onExternalChange.timer);
  onExternalChange.timer = setTimeout(() => onExternalChange().catch(toast), 200);
};

// Files dragged in from Finder: accept them here so WebKit neither navigates to the file nor lets the editor
// insert it; the desktop app reads the paths natively (file_drop.rs) and announces them as "open".
const fileDrag = (e) => e.dataTransfer?.types.includes('Files');
document.addEventListener('dragover', (e) => {
  if (!fileDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('file-drag');
}, true);
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('file-drag'); }, true);
document.addEventListener('drop', (e) => {
  document.body.classList.remove('file-drag');
  if (!fileDrag(e)) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

state.cfg = await api('GET', '/api/config');
setSidebarWidth(state.cfg.sidebarWidth ?? SIDEBAR.default);
applyTheme();
applyLang();
await switchVault(state.cfg).catch(toast);
await takeOpened().catch(toast);
