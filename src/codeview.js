// VS Code-like view for single files that aren't Markdown: line numbers, syntax colors by file name,
// current line, bracket matching, search (⌘F). CodeMirror is already in the bundle through Crepe.
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, keymap } from '@codemirror/view';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { LanguageDescription, syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';

// Colors come from Mardow's own variables, so the frame matches light and dark mode; oneDark only adds token colors.
const frame = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: '13px' },
  '.cm-scroller': { fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", lineHeight: '1.6' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--violet)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--muted)', border: 'none', paddingLeft: '6px' },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--side)', color: 'var(--text)', borderColor: 'var(--line)' },
});

export function createCodeView(parent, onChange) {
  let view = null;
  const lang = new Compartment();
  const wrap = new Compartment();

  return {
    get active() { return !!view; },
    value: () => view.state.doc.toString(),

    // Returns the detected language name (null for plain text).
    show(content, fileName, dark, wrapLines) {
      view?.destroy();
      view = new EditorView({
        parent,
        state: EditorState.create({
          doc: content,
          extensions: [
            lineNumbers(), foldGutter(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
            indentOnInput(), bracketMatching(), highlightActiveLine(), highlightSelectionMatches(),
            dark ? oneDark : syntaxHighlighting(defaultHighlightStyle),
            Prec.highest(frame), // over oneDark's own background and gutter colors
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
            lang.of([]),
            wrap.of(wrapLines ? EditorView.lineWrapping : []),
            EditorView.updateListener.of((u) => { if (u.docChanged) onChange(u.state.doc.toString()); }),
          ],
        }),
      });
      // Grammars load on demand (separate chunks), so an unknown or plain file costs nothing.
      const desc = LanguageDescription.matchFilename(languages, fileName);
      const shown = view;
      if (desc) desc.load().then((support) => { if (view === shown) view.dispatch({ effects: lang.reconfigure(support) }); });
      return desc?.name ?? null;
    },

    setWrap(on) {
      view?.dispatch({ effects: wrap.reconfigure(on ? EditorView.lineWrapping : []) });
    },

    // New text from outside; keeps the cursor where it was as far as the new text allows.
    replace(content) {
      const head = Math.min(view.state.selection.main.head, content.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, selection: { anchor: head } });
    },

    selectAll() {
      view.focus();
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    },

    clear() {
      view?.destroy();
      view = null;
    },
  };
}
