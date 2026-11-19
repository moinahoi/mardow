// node src/board.test.js — round-trip check for the board file format.
import assert from 'node:assert/strict';
import { isBoard, parseBoard, serializeBoard, newBoard, progress } from './board.js';

const md = `---
mardow: board
---

Ein Satz vorab.

## Offen

- Logo entwerfen
  Details zur Karte,
  zweite Zeile.

  - [ ] Farben
  - [x] Skizzen

- Texte schreiben

## In Arbeit

## Erledigt

- Domain
`;

assert.ok(isBoard(md));
assert.ok(!isBoard('# Nur eine Notiz\n'));
const b = parseBoard(md);
assert.equal(b.intro, 'Ein Satz vorab.');
assert.deepEqual(b.columns.map((c) => c.title), ['Offen', 'In Arbeit', 'Erledigt']);
assert.deepEqual(b.columns[0].cards.map((c) => c.title), ['Logo entwerfen', 'Texte schreiben']);
assert.equal(b.columns[0].cards[0].details, 'Details zur Karte,\nzweite Zeile.\n\n- [ ] Farben\n- [x] Skizzen');
assert.deepEqual(progress(b.columns[0].cards[0].details), [1, 2]);
assert.equal(progress(''), null);
assert.equal(serializeBoard(b), md);

// Moving a card and re-serializing keeps everything readable and parseable.
b.columns[2].cards.unshift(b.columns[0].cards.shift());
const moved = parseBoard(serializeBoard(b));
assert.deepEqual(moved.columns[2].cards.map((c) => c.title), ['Logo entwerfen', 'Domain']);
assert.equal(moved.columns[2].cards[0].details, b.columns[2].cards[0].details);

assert.deepEqual(parseBoard(newBoard(['A', 'B'])).columns.map((c) => c.title), ['A', 'B']);
console.log('board.test.js ok');
