// Regenerates the small synthetic STEP fixtures in test/fixtures from test/fixtures.mjs.
import { writeFileSync } from 'node:fs';
import { FIX, fixtureStep } from '../test/fixtures.mjs';
for (const k of Object.keys(FIX)) writeFileSync(new URL(`../test/fixtures/${k}.stp`, import.meta.url), fixtureStep(k));
