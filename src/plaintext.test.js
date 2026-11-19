// Self-test for the clipboard plain text: `node src/plaintext.test.js` (part of `npm test`).
import assert from 'node:assert/strict';
import { Schema, Slice } from '@milkdown/kit/prose/model';
import { plainText, listStart } from './plaintext.js';

// The node names and attributes Milkdown's commonmark/GFM schema uses.
const s = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 } } },
    ordered_list: { group: 'block', content: 'list_item+', attrs: { order: { default: 1 } } },
    bullet_list: { group: 'block', content: 'list_item+' },
    list_item: { content: 'block+', attrs: { checked: { default: null } } },
    hr: { group: 'block' },
    hard_break: { group: 'inline', inline: true },
    text: { group: 'inline' },
  },
  marks: { link: { attrs: { href: {} } } },
});
const p = (...c) => s.node('paragraph', null, c.map((x) => (typeof x === 'string' ? s.text(x) : x)));
const li = (attrs, ...c) => s.node('list_item', attrs, c);
const link = s.text('Link', [s.mark('link', { href: 'https://example.com' })]);

const doc = s.node('doc', null, [
  s.node('heading', null, [s.text('Liste')]),
  s.node('ordered_list', null, [li(null, p('Erster')), li(null, p('Zweiter mit ', link)), li(null, p('Dritter'))]),
  s.node('bullet_list', null, [li({ checked: true }, p('erledigt')), li({ checked: false }, p('offen')), li(null, p('Punkt'), s.node('bullet_list', null, [li(null, p('eingerückt'))]))]),
  p('Zeile', s.node('hard_break'), 'zwei'),
]);

assert.equal(plainText(doc.content), 'Liste\n\n1. Erster\n2. Zweiter mit Link\n3. Dritter\n\n☑ erledigt\n☐ offen\n• Punkt\n  • eingerückt\n\nZeile\nzwei');

// Items 2–3 selected: numbering goes on from 2, not 1. The list sits after the heading (7 = heading size).
const from = 7 + 1 + doc.child(1).child(0).nodeSize + 2; // inside item 2's paragraph
const to = 7 + doc.child(1).nodeSize - 3;
const slice = doc.slice(from, to, true); // like selection.content() when copying
assert.equal(plainText(slice.content, listStart(slice, doc.resolve(from))), '2. Zweiter mit Link\n3. Dritter');

// Inside one line: just the text.
assert.equal(plainText(doc.slice(2, 5).content), 'ist');
assert.equal(plainText(Slice.empty.content), '');
console.log('plaintext.test.js ok');
