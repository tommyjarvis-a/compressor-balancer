import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueNames, bodyRef, asSaved, matchBodies, fingerprintMatch, FINGERPRINT, baseName, restoreCG, holdStale } from '../src/bodies.js';

const box = (name, vol, bbox, extra = {}) => ({ name, vol: { m: vol }, bbox, sign: 1, rho: 7850, file: 'dup.stp', ...extra });
// Three distinct solids that could all be named the same (the test.stp situation).
const A = box('part', 1000, [0, 0, 0, 10, 10, 10]);
const B = box('part', 2000, [20, 0, 0, 40, 10, 10]);
const C = box('part', 500, [0, 20, 0, 5, 30, 5]);

test('L7: duplicate display names get #1…#n; unique names are left alone', () => {
  const dup = uniqueNames([{ name: 'test.stp' }, { name: 'test.stp' }, { name: 'test.stp' }]);
  assert.deepEqual(dup.map(b => b.name), ['test.stp #1', 'test.stp #2', 'test.stp #3']);
  const one = uniqueNames([{ name: 'shaft' }, { name: 'rotor' }]);
  assert.deepEqual(one.map(b => b.name), ['shaft', 'rotor']);
  const next = uniqueNames([{ name: 'test.stp' }, { name: 'test.stp' }], dup);
  assert.deepEqual(next.map(b => b.name), ['test.stp #4', 'test.stp #5']);
  const collide = uniqueNames([{ name: 'shaft' }], [{ name: 'shaft' }]);
  assert.equal(collide[0].name, 'shaft #1');
});

test('M4: match by index + volume/bbox when every body has the same name', () => {
  const current = uniqueNames([A, B, C].map(b => ({ ...b, bbox: b.bbox.slice() })));
  assert.deepEqual(current.map(b => b.name), ['part #1', 'part #2', 'part #3']);
  const saved = current.map((b, i) => ({ ...bodyRef(b, i), rho: [2700, 7850, 8900][i], src: 'user', on: true }));
  // same order, identical names if we pretend uniquify hasn't run on the session (raw 'part')
  const raw = [A, B, C].map((b, i) => ({ ...bodyRef({ ...b, name: 'part' }, i), rho: saved[i].rho, src: 'user', on: true }));
  const m = matchBodies(raw, current);
  assert.deepEqual(m.map, [0, 1, 2]);
  assert.equal(m.stale, false);
  assert.equal(m.notice, '');
});

test('M4: reordered bodies still match by fingerprint, not by the stale index or the shared name', () => {
  const current = uniqueNames([C, A, B].map(b => ({ ...b }))); // was [A,B,C], now [C,A,B]
  const saved = [A, B, C].map((b, i) => ({ ...bodyRef({ ...b, name: 'part' }, i), rho: 2700 + i }));
  const m = matchBodies(saved, current);
  assert.deepEqual(m.map, [1, 2, 0]); // A→1, B→2, C→0
  assert.equal(m.stale, false);
});

test('M4: a changed or missing body is not applied and the match is stale with a notice', () => {
  const current = [A, B]; // C is gone; B's volume was changed
  const saved = [A, { ...B, vol: { m: 99999 }, bbox: B.bbox }, C].map((b, i) => bodyRef({ ...b, name: 'part' }, i));
  const m = matchBodies(saved, current);
  assert.equal(m.map[0], 0);
  assert.equal(m.map[1], -1);
  assert.equal(m.map[2], -1);
  assert.equal(m.stale, true);
  assert.match(m.notice, /no fingerprint match/);
});

test('M4: two identical fingerprints with the same name are ambiguous when the index no longer fits', () => {
  const twin = box('part', 1000, [0, 0, 0, 10, 10, 10]); // same fingerprint as A
  const current = [twin, box('other', 2000, [20, 0, 0, 40, 10, 10])];
  // saved A was at index 1, but index 1 is now a different solid; A and twin are identical
  const saved = [bodyRef({ ...A, name: 'part' }, 1)];
  const m = matchBodies(saved, current);
  // fingerprint of A matches only twin (index 0), uniquely — should succeed by fingerprint
  assert.deepEqual(m.map, [0]);
  assert.equal(m.stale, false);
  // but two twins and a stale index → ambiguous
  const two = [twin, { ...A, name: 'part' }];
  const amb = matchBodies([bodyRef({ ...A, name: 'part' }, 5)], two);
  assert.deepEqual(amb.map, [-1]);
  assert.equal(amb.stale, true);
  assert.match(amb.notice, /ambiguous fingerprint/);
});

test('M4: legacy name-only sessions still restore unique names, but not duplicates', () => {
  const current = [box('shaft', 100, [0, 0, 0, 1, 1, 1]), box('rotor', 200, [2, 0, 0, 3, 1, 1])];
  const ok = matchBodies(['shaft', 'rotor'], current);
  assert.deepEqual(ok.map, [0, 1]);
  assert.equal(ok.stale, false);
  const dups = [box('test.stp', 100, [0, 0, 0, 1, 1, 1]), box('test.stp', 200, [2, 0, 0, 3, 1, 1])];
  const bad = matchBodies(['test.stp', 'test.stp'], dups);
  assert.deepEqual(bad.map, [-1, -1]);
  assert.equal(bad.stale, true);
  assert.match(bad.notice, /ambiguous name/);
});

test('fingerprint tolerances: a tiny volume/bbox change still matches; a large one does not', () => {
  const b = A, close = { ...A, vol: { m: A.vol.m * (1 + FINGERPRINT.vol * 0.1) }, bbox: A.bbox.map((v, i) => v + (i < 3 ? -0.001 : 0.001)) };
  assert.equal(fingerprintMatch(bodyRef(b, 0), close), true);
  assert.equal(fingerprintMatch(bodyRef(b, 0), { ...A, vol: { m: A.vol.m * 1.5 } }), false);
});

test('M6: a REMOVE_ twin with the same volume and bbox is not matched', () => {
  const shaft = box('shaft', 100, [0, 0, 0, 2, 2, 10]);
  const pocket = box('REMOVE_pocket', 20, [0, 0, 4, 1, 1, 6], { sign: -1 });
  const slug = box('slug', 50, [3, 0, 0, 8, 5, 5], { rho: 2700 });
  const remSlug = box('REMOVE_slug', 50, [3, 0, 0, 8, 5, 5], { sign: -1 });
  // 4-body session (slug at index 2 with ρ 2700) loaded onto the 3-body file without slug
  const saved = [shaft, pocket, slug, remSlug].map((b, i) => ({ ...bodyRef(b, i), rho: b.rho }));
  const current = [shaft, pocket, remSlug];
  const m = matchBodies(saved, current);
  assert.deepEqual(m.map, [0, 1, -1, 2], JSON.stringify(m));
  assert.equal(m.stale, true);
  assert.ok(m.unmatched.includes(2));
  // the 2700 must not be considered a match for REMOVE_slug
  assert.equal(fingerprintMatch(saved[2], remSlug), false);
  assert.equal(fingerprintMatch(saved[3], remSlug), true);
});

test('M6: adding or removing a body leaves unmatched records untouched; CG is stale with a notice', () => {
  const current = uniqueNames([A, B].map(b => ({ ...b }))); // C removed
  const saved = [A, B, C].map((b, i) => bodyRef({ ...b, name: 'part' }, i));
  const m = matchBodies(saved, current);
  assert.deepEqual(m.map, [0, 1, -1]);
  assert.equal(m.stale, true);
  assert.match(m.notice, /no fingerprint match|no body matching/);
  const rest = restoreCG(m, { c: [1, 2, 3], mass: 99 }, { saved: 3, current: 2 });
  assert.equal(rest.keep, false);
  assert.equal(rest.dropped, true);
  assert.equal(rest.stale, true);
  assert.deepEqual(rest.sels, [0, 1]); // partial selection kept
  assert.equal(rest.c, null);
  // adding a body: saved A,B onto A,B,C — extra current body is untouched; CG is stale because the set changed
  const cur3 = uniqueNames([A, B, C].map(b => ({ ...b })));
  const add = matchBodies([A, B].map((b, i) => bodyRef({ ...b, name: 'part' }, i)), cur3);
  assert.deepEqual(add.map, [0, 1]);
  assert.equal(add.stale, false); // all saved records matched; the extra body is simply untouched
  const addCG = restoreCG(add, { c: [1, 2, 3], mass: 99 }, { saved: 2, current: 3 });
  assert.equal(addCG.keep, false);
  assert.equal(addCG.stale, true);
  assert.match(addCG.notice, /body count changed/);
});

test('M6: a unique base name blocks a fingerprint match to a different name', () => {
  const shaft = box('shaft', 1000, [0, 0, 0, 10, 10, 10]);
  const other = box('rotor', 1000, [0, 0, 0, 10, 10, 10]); // same fingerprint, unique other name
  const m = matchBodies([bodyRef(shaft, 0)], [other]);
  assert.deepEqual(m.map, [-1]);
  assert.equal(m.stale, true);
  assert.equal(baseName('test.stp #3'), 'test.stp');
  assert.equal(baseName('shaft'), 'shaft');
  // unique names that agree still match
  const ok = matchBodies([bodyRef(shaft, 0)], [shaft]);
  assert.deepEqual(ok.map, [0]);
  assert.equal(ok.stale, false);
});

test('H2: after a mismatched restore, holdStale does not clear the flag (load completion)', () => {
  const current = [box('shaft', 10, [0, 0, 0, 1, 1, 1]), box('rotor', 20, [2, 0, 0, 3, 1, 1])];
  const foreign = [box('test.stp #1', 100, [0, 0, 0, 10, 10, 10]), box('test.stp #2', 200, [10, 0, 0, 20, 5, 5])];
  const m = matchBodies(foreign.map((b, i) => bodyRef(b, i)), current);
  assert.equal(m.stale, true);
  const rest = restoreCG(m, { c: [-0.085, -0.402, 73.512], mass: 1161.399 });
  assert.equal(rest.keep, false);
  assert.equal(rest.dropped, true);
  assert.equal(rest.c, null);
  // simulate loadSession then loadFiles → update → touchCG, with a key that now matches the (empty) selection
  const key = rest.sels.map(String).join(',') + '#' + current.length;
  const cg = { dropped: true, stale: true, notice: rest.notice, key, c: rest.c, m: rest.m };
  const after = holdStale(cg, key);
  assert.equal(after.stale, true, 'touchCG must not clear stale when the key still matches');
  assert.equal(after.dropped, true);
  // a later selection change may also mark stale, but still must not invent a current result
  const later = holdStale(after, '0:shaft:7850:1:10#2');
  assert.equal(later.stale, true);
});

test('H2: a cross-file session leaves the CG dropped and stale; only calc-style reset clears it', () => {
  const fixture = [box('shaft', 11300, [0, 0, 0, 12, 12, 120]), box('rotor', 1e5, [-30, -30, 0, 30, 30, 40])];
  const teststp = Array.from({ length: 9 }, (_, i) => box('test.stp #' + (i + 1), 1000 + i * 100, [i, 0, 0, i + 1, 10, 10]));
  const m = matchBodies(teststp.map((b, i) => bodyRef(b, i)), fixture);
  assert.ok(m.map.every(i => i < 0));
  const rest = restoreCG(m, { c: [0.65, 0.66, 56.86], mass: 1656 });
  assert.equal(rest.keep, false);
  assert.equal(rest.stale, true);
  assert.equal(rest.dropped, true);
  const kept = restoreCG({ map: [0, 1], stale: false, notice: '' }, { c: [1, 2, 3], mass: 50 });
  assert.equal(kept.keep, true);
  assert.equal(kept.stale, false);
  assert.deepEqual(kept.c, [1, 2, 3]);
  // the only way stale becomes false is a successful Calculate CG (caller sets stale: false)
  const fresh = { ...kept, key: 'ok', stale: false, dropped: false };
  assert.equal(holdStale(fresh, 'ok').stale, false);
  assert.equal(holdStale({ ...fresh, stale: true }, 'ok').stale, true);
});
