#!/usr/bin/env node
/* Regression lock — RULING 2026-07-21: "the cancel control must NEVER appear on any terminal card."
 *
 *   node specs/010-universal-cancel-window/verify_terminal_teardown.js
 *
 * WHY THIS IS A STATIC LOCK, STATED HONESTLY. The defect was structural, not behavioural: two terminal
 * renderers written before the 010 control simply never learned it existed. The thing worth locking is
 * therefore the STRUCTURE — that revealing the shared terminal card and tearing down the live-calling
 * controls remain ONE act. That is exactly what a future contributor would break, and it is checkable
 * without a device. It does NOT replace the on-device cell (a contact pressing 1 → the "I've reached"
 * card), which is gated separately because it reaches the reaching engine.
 *
 * A lock that cannot fail is not a lock: every cell below was proven to FAIL against the pre-fix shape
 * before being trusted (see the revert-proof note at the foot of this file).
 */

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'www', 'app.js');
const src = fs.readFileSync(APP, 'utf8');

let pass = 0;
const failures = [];
function cell(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(`${name} — ${detail}`); console.log(`  FAIL  ${name} — ${detail}`); }
}

// Body of a top-level function, by name.
//
// THE PARAMETER LIST MUST BE SKIPPED BEFORE LOOKING FOR THE BODY. A first draft took the next '{' after
// the signature, which for `showSuccessTerminal({ leadCopy, ... })` is the DESTRUCTURING brace — so the
// "body" was the parameter pattern and the cell reported a missing helper call against a tree that was
// correct. It failed loudly rather than passing wrongly, but a lock that cries wolf is only marginally
// better than one that sleeps: walk the parens to their match, THEN take the body brace.
function bodyOf(name) {
  const sig = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = sig.exec(src);
  if (!m) return null;
  let p = src.indexOf('(', m.index), pd = 0, close = -1;
  for (let j = p; j < src.length; j++) {
    if (src[j] === '(') pd++;
    else if (src[j] === ')') { pd--; if (pd === 0) { close = j; break; } }
  }
  if (close < 0) return null;
  let i = src.indexOf('{', close);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// Comments are stripped before any "does X call Y" assertion — otherwise a mention of the call in a
// comment would satisfy a cell that the code does not. (This is the mutation that first slipped past a
// draft of this lock: the explanatory comment in showTerminalState names _hideStopControl().)
function code(s) {
  return (s || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const REVEAL = /document\.getElementById\(['"]alarm-terminal-card['"]\)\.classList\.remove\(/g;

console.log('Terminal-teardown lock (ruling 2026-07-21)\n');

// ── 1. ONE reveal point ─────────────────────────────────────────────────────────────────────────────
// The whole guarantee rests on there being a single place the terminal card is revealed. If a second
// appears, the invariant is no longer structural and this lock is worthless — so this cell comes first.
const reveals = code(src).match(REVEAL) || [];
cell('exactly one raw reveal of #alarm-terminal-card in app.js',
  reveals.length === 1, `found ${reveals.length}`);

// ── 2. …and it lives inside the helper ──────────────────────────────────────────────────────────────
const helper = bodyOf('_showTerminalCard');
cell('_showTerminalCard() exists', !!helper, 'function not found');
cell('the single reveal is inside _showTerminalCard()',
  !!helper && (code(helper).match(REVEAL) || []).length === 1,
  'the reveal is not in the helper');

// ── 3. The teardown happens BEFORE the reveal ───────────────────────────────────────────────────────
// Order is asserted, not assumed. A helper that revealed first and tore down after would still leave a
// frame in which the card is drawn with the control up — the exact "draws before the hide runs" mechanism
// that Step 0 ruled out as the cause and which must not be introduced by the fix.
const hIdx = helper ? code(helper).indexOf('_hideStopControl()') : -1;
const rIdx = helper ? code(helper).search(REVEAL) : -1;
cell('_showTerminalCard() tears down BEFORE it reveals',
  hIdx >= 0 && rIdx >= 0 && hIdx < rIdx,
  `hide@${hIdx} reveal@${rIdx}`);

// ── 4. Every terminal renderer goes through the helper ──────────────────────────────────────────────
// The five that draw the shared terminal card. _showServiceTestTerminal is included deliberately: it was
// MISSED by the Step 0 source pass and found only by counting reveal sites, which is the entire argument
// for a choke point over per-card teardowns.
for (const fn of ['showTerminalState', 'showSuccessTerminal', 'showBridgeTerminalState',
                  '_deviceDialTerminal', '_showServiceTestTerminal']) {
  const b = bodyOf(fn);
  cell(`${fn}() draws its card via _showTerminalCard()`,
    !!b && code(b).includes('_showTerminalCard()'),
    b ? 'does not call the helper' : 'function not found');
}

// ── 5. NO REGRESSION on the live calling screen ─────────────────────────────────────────────────────
// The ruling is "never on a terminal", not "never". The control must still appear on Oran's Promise and
// must still be armed there — a fix that simply deleted the control would pass every cell above.
const active = bodyOf('showEscalationActiveState');
cell('showEscalationActiveState() still SHOWS the control (live screen intact)',
  !!active && code(active).includes('_showStopControl()'),
  'the live calling screen no longer shows the control');

const show = bodyOf('_showStopControl');
cell('_showStopControl() still un-hides the control and locks the nav',
  !!show && code(show).includes("classList.remove('hidden')") && code(show).includes('_lockNav(true)'),
  'the show path is no longer intact');

// ── 6. The other teardown routes survive ────────────────────────────────────────────────────────────
// These pre-date the ruling and are load-bearing for cases the terminal card never reaches: press-1 on a
// live bridge, the member's own Confirm tap, and THE single dismissal path.
const idle = bodyOf('showAlarmIdleReset');
cell('showAlarmIdleReset() still tears down (the single dismissal path)',
  !!idle && code(idle).includes('_hideStopControl()'),
  'dismissal-path teardown lost');
cell('press-1 on a live bridge still tears down',
  code(src).includes("_setBridgeState('in_call')") &&
  /_setBridgeState\('in_call'\);[\s\S]{0,200}?_hideStopControl\(\)/.test(code(src)),
  'the press-1 teardown is gone or has moved out of range');

// ── result ──────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(`  ✗ ${f}`)); process.exit(1); }
console.log('Terminal teardown locked: the cancel control cannot be drawn on any terminal card.');

/* REVERT-PROOF — each cell was confirmed to FAIL against a deliberately broken tree, not merely to pass
 * against a good one:
 *   1. restore the raw reveal in showSuccessTerminal        → cells 1 and 4 fail
 *   2. reveal first, tear down after, inside the helper     → cell 3 fails
 *   3. drop the helper call from _showServiceTestTerminal   → cell 4 fails
 *   4. delete _showStopControl() from showEscalationActive  → cell 5 fails (the "fix" that removes the
 *                                                             control entirely must not pass)
 *   5. drop _hideStopControl() from showAlarmIdleReset      → cell 6 fails
 * Mutation 4 is the one that matters most: without cell 5 this lock would have rewarded deleting the
 * feature. A draft also passed cell 4 for showTerminalState purely on the strength of its explanatory
 * COMMENT naming _hideStopControl — which is why comments are stripped before any call assertion.
 */
