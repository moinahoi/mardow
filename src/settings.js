// Settings window content. To add a setting: add a field to a section (labels go in i18n.js).
// The server stores any simple value under its key in config.json, so no backend change is needed;
// read it anywhere as `state.cfg.<key> ?? <default>`.
//
// Field types: 'select' and 'segmented' (options: [value, label][]),
// 'keys' (display only; keys: one or more key combos, e.g. [['⌥', '⌘', '↑'], ['⌥', '⌘', '↓']]).

import { version } from '../package.json'; // release.sh bumps it together with the app version

// Mac symbols in the list; other platforms (web version) see Ctrl/Alt/Shift.
const isMac = navigator.platform.startsWith('Mac');
const keyName = (k) => (isMac ? k : ({ '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift', '⌫': 'Backspace' })[k] ?? k);

const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const icons = {
  general: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  appearance: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  shortcuts: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
};

export const sections = (t) => [
  {
    id: 'general',
    label: t.general,
    fields: [
      { key: 'lang', label: t.language, type: 'select', default: 'system',
        options: [['system', t.system], ['de', 'Deutsch'], ['en', 'English']] },
      { key: 'sort', label: t.sort, hint: t.sortHint, type: 'select', default: 'recent',
        options: [['recent', t.sortRecent], ['created', t.sortCreated], ['alpha', t.sortAlpha], ['manual', t.sortManual]] },
    ],
  },
  {
    id: 'appearance',
    label: t.appearance,
    fields: [
      { key: 'theme', label: t.theme, hint: t.themeHint, type: 'segmented', default: 'system',
        options: [['system', t.system], ['light', t.light], ['dark', t.dark]] },
    ],
  },
  {
    // shortcut: hand-kept copy of the `shortcuts` list in main.js and the editor's keymap; update both together.
    id: 'shortcuts',
    label: t.shortcuts,
    fields: [
      { label: t.newNote, hint: t.newNoteBrowserHint, keys: [['⌘', 'N']] },
      { label: t.newFolder, keys: [['⇧', '⌘', 'N']] },
      { label: t.search, keys: [['⌘', 'K'], ['⇧', '⌘', 'F']] },
      { label: t.prevNextNote, keys: [['⌥', '⌘', '↑'], ['⌥', '⌘', '↓']] },
      { label: t.saveNow, keys: [['⌘', 'S']] },
      { label: t.trashNote, hint: t.trashNoteHint, keys: [['⌘', '⌫']] },
      { label: t.toggleSidebar, keys: [['⌥', '⌘', 'S']] },
      { label: t.settings, keys: [['⌘', ',']] },
      { label: t.slashMenu, keys: [['/']] },
      { label: t.bold, keys: [['⌘', 'B']] },
      { label: t.italic, keys: [['⌘', 'I']] },
      { label: t.inlineCode, keys: [['⌘', 'E']] },
      { label: t.headings, keys: [['⌥', '⌘', '1–3']] },
      { label: t.undoRedo, keys: [['⌘', 'Z'], ['⇧', '⌘', 'Z']] },
    ].map((f) => ({ ...f, type: 'keys' })),
  },
];

export function renderSettings({ t, cfg, active, esc }) {
  const all = sections(t);
  const section = all.find((s) => s.id === active) ?? all[0];
  const value = (f) => cfg[f.key] ?? f.default;

  const control = (f) => {
    if (f.type === 'select') {
      return `<select data-setting="${f.key}" aria-label="${esc(f.label)}">${f.options
        .map(([v, l]) => `<option value="${esc(v)}" ${v === value(f) ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select>`;
    }
    if (f.type === 'segmented') {
      return `<div class="segmented" role="radiogroup" aria-label="${esc(f.label)}">${f.options
        .map(([v, l]) => `<button role="radio" aria-checked="${v === value(f)}" data-action="set-setting" data-key="${f.key}" data-value="${esc(v)}">${esc(l)}</button>`)
        .join('')}</div>`;
    }
    if (f.type === 'keys') {
      return `<div class="keys">${f.keys
        .map((combo) => combo.map((k) => `<kbd>${esc(keyName(k))}</kbd>`).join(''))
        .join('<span class="or">/</span>')}</div>`;
    }
    return '';
  };

  return `<div class="settings-window">
    <header class="settings-head">
      <h2>${esc(t.settings)}</h2>
      <button class="icon" data-action="close-settings" title="${esc(t.close)}" aria-label="${esc(t.close)}">${icons.close}</button>
    </header>
    <div class="settings-body">
      <nav class="settings-nav">${all
        .map((s) => `<button class="${s.id === section.id ? 'active' : ''}" data-action="settings-section" data-section="${s.id}">${icons[s.id] ?? ''}<span>${esc(s.label)}</span></button>`)
        .join('')}<div class="settings-version">Mardow ${esc(version)}</div></nav>
      <div class="settings-pane">
        <h3>${esc(section.label)}</h3>
        ${section.fields
          .map((f) => `<div class="setting-row ${f.type === 'keys' ? 'compact' : ''}">
            <div class="setting-text"><div class="setting-label">${esc(f.label)}</div>${f.hint ? `<p>${esc(f.hint)}</p>` : ''}</div>
            <div class="setting-control">${control(f)}</div>
          </div>`)
          .join('')}
      </div>
    </div>
  </div>`;
}
