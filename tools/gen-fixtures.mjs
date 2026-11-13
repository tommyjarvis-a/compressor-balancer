// Regenerates the small synthetic STEP fixtures in test/fixtures from test/fixtures.mjs.
import { writeFileSync } from 'node:fs';
import { toStep } from '../src/step-export.js';
import { FIX } from '../test/fixtures.mjs';
for (const [k, ts] of Object.entries(FIX)) writeFileSync(new URL(`../test/fixtures/${k}.stp`, import.meta.url), toStep(ts, { name: k, unit: k.endsWith('metre') ? 'm' : 'mm' }).replace(/'\d{4}-\d\d-\d\dT[\d:]+'/, "'2026-01-01T00:00:00'"));
