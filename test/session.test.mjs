import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueNames, bodyRef, asSaved, matchBodies, fingerprintMatch, FINGERPRINT } from '../src/bodies.js';

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
