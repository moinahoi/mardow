// Self-test for URL detection: `node src/links.test.js` (part of `npm test`).
import assert from 'node:assert/strict';
import { findUrls, openable } from './links.js';

const hrefs = (t) => findUrls(t).map((u) => [t.slice(u.start, u.end), u.href]);

assert.deepEqual(hrefs('Siehe https://example.com/a?b=1.'), [['https://example.com/a?b=1', 'https://example.com/a?b=1']]);
assert.deepEqual(hrefs('(www.mardow.dev) und http://x.de, fertig'), [['www.mardow.dev', 'https://www.mardow.dev'], ['http://x.de', 'http://x.de']]);
assert.deepEqual(hrefs('https://de.wikipedia.org/wiki/Bar_(Einheit)'), [['https://de.wikipedia.org/wiki/Bar_(Einheit)', 'https://de.wikipedia.org/wiki/Bar_(Einheit)']]);
assert.deepEqual(hrefs('kein Link: example.com, https://'), []);
assert.ok(openable('https://a.b') && openable('mailto:a@b.c') && !openable('file:///etc') && !openable('javascript:x') && !openable(undefined));
console.log('links.test.js ok');
