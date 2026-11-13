import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyRef, restoreSession, exportAssemblyCG, holdStale, cgKey, savedWasStale } from '../src/bodies.js';

const box = (name, vol, bbox, extra = {}) => ({ name, vol: { m: vol }, bbox, sign: 1, rho: 7850, src: 'default', on: true, file: 'fixture.stp', ...extra });
const shaft = () => box('shaft', 11300, [0, 0, 0, 12, 12, 120]);
const pocket = () => box('REMOVE_pocket', 200, [0, 0, 4, 1, 1, 6], { sign: -1 });
const slug = () => box('slug', 50, [3, 0, 0, 8, 5, 5]);
const remSlug = () => box('REMOVE_slug', 50, [3, 0, 0, 8, 5, 5], { sign: -1 });
const other = (n, i) => box('test.stp #' + (i + 1), 1000 + i * 100, [i, 0, 0, i + 1, 10, 10], { file: 'test.stp' });

const FLAG = ['current', 'stale', 'legacy'];
const FILE = [true, false];
const COUNT = [false, true];
const TWIN = [false, true];
const DENS = [false, true];

function setup({ sameFile, countChanged, remTwin }) {
  // Saved assembly is the 3-body fixture, or the 4-body set (slug + REMOVE_slug) when both
  // a twin and a body-count change are under test (the M6 4→3 case).
  const savedBodies = (remTwin && countChanged) ? [shaft(), pocket(), slug(), remSlug()] : [shaft(), pocket(), slug()];
  let current;
  if (sameFile) {
    if (!countChanged && !remTwin) current = [shaft(), pocket(), slug()];
    else if (!countChanged && remTwin) current = [shaft(), pocket(), remSlug()];
    else if (countChanged && !remTwin) current = [shaft(), pocket()]; // slug removed
    else current = [shaft(), pocket(), remSlug()]; // 4-body session onto the 3-body file without slug
  } else {
    current = [other(3, 0), other(3, 1), other(3, 2)];
    if (countChanged) current = current.slice(0, 2);
    if (remTwin) {
      if (!countChanged) current[2] = remSlug();
      else current = current.concat(remSlug());
    }
  }
  return { savedBodies, current };
}

function sessionFor(dims) {
  const { savedBodies, current } = setup(dims);
  const bodies = savedBodies.map((b, i) => {
    const rec = { ...bodyRef(b, i), on: b.on, rho: b.rho, src: b.src };
    if (dims.densEdit && b.name === 'shaft') { rec.rho = 2700; rec.src = 'user'; }
    return rec;
  });
  // CG is shaft + pocket (indices 0,1 in every saved set). Numbers: if the session is
  // exported current after a density edit, they reflect 2700; if stale/legacy after a
  // density edit, they are the pre-edit 93-ish placeholder; otherwise the default-rho value.
  const usedEditedRho = dims.densEdit && dims.flag === 'current';
  const c = usedEditedRho ? [-0.201, 0, 30.201] : [-0.067, 0, 30.067];
  const mass = usedEditedRho ? 31.316 : 93.444;
  const assemblyCG = { c, mass, count: 2, bodies: [0, 1].map(i => bodyRef(savedBodies[i], i)) };
  if (dims.flag === 'current') assemblyCG.stale = false;
  else if (dims.flag === 'stale') assemblyCG.stale = true;
  // legacy: omit the flag
  return { bodies, assemblyCG, tools: [], current };
}

function expectOf(dims, session) {
  const exact = dims.sameFile && !dims.countChanged && !dims.remTwin;
  const dropped = !exact;
  const stale = dropped || dims.flag !== 'current';
  const show = !dropped;
  // Densities: each saved record that matches is applied; unmatched current bodies stay at 7850.
  // Selection: shaft+pocket when those exist on the current file (same-file cases); else none.
  const wantRho = {};
  return { exact, dropped, stale, show, mass: show ? session.assemblyCG.mass : null, c: show ? session.assemblyCG.c : null };
}

function nameOf(d) {
  return [
    d.flag,
    d.sameFile ? 'same-file' : 'other-file',
    d.countChanged ? 'count-changed' : 'count-same',
    d.remTwin ? 'REMOVE-twin' : 'no-twin',
    d.densEdit ? 'density-edited' : 'density-default',
  ].join(' / ');
}

const cases = [];
for (const flag of FLAG)
  for (const sameFile of FILE)
    for (const countChanged of COUNT)
      for (const remTwin of TWIN)
        for (const densEdit of DENS)
          cases.push({ flag, sameFile, countChanged, remTwin, densEdit });

test(`H3 restore/stale matrix (${cases.length} cases)`, () => {
  let passed = 0;
  for (const dims of cases) {
    const label = nameOf(dims);
    const sess = sessionFor(dims);
    const current = sess.current.map(b => ({ ...b })); // fresh defaults
    const out = restoreSession({ bodies: sess.bodies, assemblyCG: sess.assemblyCG, tools: [] }, current);
    const exp = expectOf(dims, sess);

    assert.equal(!!out.cg.stale, exp.stale, `${label}: stale after load`);
    assert.equal(!!out.cg.dropped, exp.dropped, `${label}: dropped`);
    if (exp.show) {
      assert.deepEqual(out.cg.c, exp.c, `${label}: CG numbers kept`);
      assert.equal(out.cg.m, exp.mass, `${label}: mass kept`);
      assert.ok(!out.cg.dropped && out.cg.c, `${label}: marker shown (numbers present)`);
    } else {
      assert.equal(out.cg.c, null, `${label}: CG numbers dropped`);
      assert.equal(out.cg.m, null, `${label}: mass dropped`);
    }

    if (exp.exact && dims.flag === 'current') {
      assert.equal(out.cg.notice || '', '', `${label}: no notice when current`);
    } else {
      assert.ok(out.cg.notice, `${label}: notice shown`);
      if (exp.exact && dims.flag === 'stale') assert.match(out.cg.notice, /saved assembly CG was stale/, label);
      if (exp.exact && dims.flag === 'legacy') assert.match(out.cg.notice, /did not record whether the assembly CG was current/, label);
      if (dims.sameFile && dims.countChanged) assert.match(out.cg.notice, /body count changed/, label);
    }

    // Densities: shaft 2700 applied only when the saved shaft matches a current shaft.
    const byName = Object.fromEntries(current.map(b => [b.name, b]));
    if (dims.sameFile) {
      assert.equal(byName.shaft.rho, dims.densEdit ? 2700 : 7850, `${label}: shaft density`);
      assert.equal(byName.REMOVE_pocket.rho, 7850, `${label}: pocket density`);
      if (byName.slug) assert.equal(byName.slug.rho, 7850, `${label}: slug density`);
      if (byName.REMOVE_slug) assert.equal(byName.REMOVE_slug.rho, 7850, `${label}: REMOVE_slug not given slug's density`);
    } else {
      for (const b of current) {
        if (b.name === 'REMOVE_slug' || b.file === 'test.stp') assert.equal(b.rho, 7850, `${label}: ${b.name} untouched`);
      }
    }

    // Selection: shaft + pocket on same-file (they always match when present); empty on another file.
    if (dims.sameFile) {
      const names = out.sels.map(i => current[i].name);
      assert.deepEqual(names, ['shaft', 'REMOVE_pocket'], `${label}: selection`);
    } else {
      assert.deepEqual(out.sels, [], `${label}: no selection on another file`);
    }

    // Re-export after restore: flag round-trips (dropped sessions omit assemblyCG).
    const exported = out.exported;
    if (exp.dropped) {
      assert.equal(exported, undefined, `${label}: dropped CG omitted from re-export`);
    } else {
      assert.ok(exported, `${label}: re-export writes assemblyCG`);
      assert.equal(!!exported.stale, exp.stale, `${label}: re-export stale flag`);
      assert.ok('stale' in exported, `${label}: stale flag present`);
      const again = restoreSession({ bodies: sess.bodies, assemblyCG: exported, tools: [] }, current.map(b => ({ ...b, rho: 7850, src: 'default' })));
      assert.equal(!!again.cg.stale, exp.stale, `${label}: flag round-trip`);
      assert.equal(!!again.cg.dropped, false, `${label}: exact re-export not dropped`);
      assert.deepEqual(again.cg.c, exp.c, `${label}: numbers round-trip`);
    }
    passed++;
  }
  assert.equal(passed, cases.length);
});

test('H3: a session exported while the CG is stale restores it as stale, not current', () => {
  // Tester case D: Calculate CG on shaft+pocket, then shaft → 2700, export stale:true, restore same file.
  const saved = [shaft(), pocket(), slug()];
  saved[0].rho = 2700; saved[0].src = 'user';
  const session = {
    bodies: saved.map((b, i) => ({ ...bodyRef(b, i), on: b.on, rho: b.rho, src: b.src })),
    assemblyCG: { c: [-0.067, 0, 30.067], mass: 93.444, count: 2, bodies: [0, 1].map(i => bodyRef(saved[i], i)), stale: true },
    tools: [],
  };
  const current = [shaft(), pocket(), slug()];
  const out = restoreSession(session, current);
  assert.equal(out.cg.stale, true);
  assert.equal(out.cg.dropped, false);
  assert.deepEqual(out.cg.c, [-0.067, 0, 30.067]);
  assert.equal(out.cg.m, 93.444);
  assert.equal(current[0].rho, 2700);
  assert.match(out.cg.notice, /saved assembly CG was stale/);
  assert.equal(out.exported.stale, true);
});

test('export writes the stale flag truthfully after a density, selection or body-set change', () => {
  const bodies = [shaft(), pocket(), slug()];
  const sels = [0, 1];
  const fresh = { c: [-0.067, 0, 30.067], m: 93.444, n: 2, names: ['shaft', 'REMOVE_pocket'], indices: sels, key: cgKey(sels, bodies), stale: false, dropped: false };
  assert.equal(exportAssemblyCG(fresh, bodies, sels).stale, false);

  bodies[0].rho = 2700;
  const afterDens = holdStale(fresh, cgKey(sels, bodies));
  assert.equal(afterDens.stale, true);
  assert.equal(exportAssemblyCG(afterDens, bodies, sels).stale, true);

  bodies[0].rho = 7850;
  const afterSel = holdStale({ ...fresh, stale: false, key: cgKey([0, 1], bodies) }, cgKey([0], bodies));
  assert.equal(afterSel.stale, true);
  assert.equal(exportAssemblyCG(afterSel, bodies, [0]).stale, true);

  const afterBody = holdStale({ ...fresh, stale: false, key: cgKey(sels, bodies) }, cgKey(sels, bodies.concat(slug())));
  assert.equal(afterBody.stale, true);
  assert.equal(exportAssemblyCG(afterBody, bodies, sels).stale, true);

  assert.equal(exportAssemblyCG({ ...fresh, dropped: true }, bodies, sels), undefined);
  assert.equal(savedWasStale({ c: [0, 0, 0], mass: 1 }), true);
  assert.equal(savedWasStale({ c: [0, 0, 0], mass: 1, stale: false }), false);
  assert.equal(savedWasStale({ c: [0, 0, 0], mass: 1, stale: true }), true);
});
