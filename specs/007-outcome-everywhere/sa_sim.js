// R005 log-order simulation — extracts the REAL SignalAudio state machine from app.js (no copy-drift),
// stubs playback, and drives the signal orderings that killed the old model. Asserts FR-021/FR-022.
const fs = require('fs');
const src = fs.readFileSync('/Users/Henry/iona-app/www/app.js', 'utf8');

const start = src.indexOf('const SA_RING_CAP_MS');
const end = src.indexOf('function _saPlayOnce(src)');
if (start < 0 || end < 0 || end <= start) { console.error('SLICE FAIL'); process.exit(1); }
// slice2: the REAL gap-bed (pacing rules under test) — declared after the playback fns in app.js
const s2 = src.indexOf('async function _saStartGapBed');
const e2 = src.indexOf('async function _saCachedSrc');
if (s2 < 0 || e2 < 0 || e2 <= s2) { console.error('SLICE2 FAIL'); process.exit(1); }
let slice = src.slice(start, end) + '\n' + src.slice(s2, e2);
// slice3: the 007 chip mirror (fast-ack settle + straggler freeze under test) — eval'd lazily in the B cells
const s3 = src.indexOf('let _escScreenRun');
const e3 = src.indexOf('function showEscalationActiveState');
if (s3 < 0 || e3 < 0 || e3 <= s3) { console.error('SLICE3 FAIL'); process.exit(1); }
const CHIP_SLICE = src.slice(s3, e3);

// The slice needs SA_STATIC_BASE (defined above the slice in app.js)
const preamble = `const SA_STATIC_BASE = 'audio/signal/';\n`;

const LOG = [];            // every clip "played" in order
const CACHE_HITS = [];     // every _saCachedSrc key requested
global.window = global;

eval(preamble + slice + `
// ── stubs (reassign the real bindings — declarations are mutable bindings) ──
global.__realGapBed = _saStartGapBed;   // keep the REAL bed for the pacing tests
_saPlayOnce = async (s) => { LOG.push('play:' + String(s).replace('audio/signal/','static:')); };
_saPlayReach = async (s) => { LOG.push('reach:' + String(s).replace('audio/signal/','static:')); };
_saStartGapBed = async () => { LOG.push('gapbed'); };
_saReachLoop = async () => { LOG.push('ringloop'); };
_saPause = async (ms) => { await new Promise(r => setTimeout(r, 2)); };
_saCachedSrc = async (k) => { CACHE_HITS.push(k); return 'clip:' + k; };
_saAckSrc = async (n) => 'ackclip:' + n;
_saJoinClipSrc = async (kind, name) => 'joinclip:' + kind + ':' + name;   // 009 T013 — join-phase card clip (stub)
_teardownCallAudioNow = async () => { LOG.push('teardown'); };   // 009 R-009-31 #13 — native drop-time audio teardown (stub); defined above the slice in app.js
_saExhaustedClip = () => 'exhausted_both.mp3';
global.__apply = _saApply;
global.__state = () => _saState;
global.__reset = _saReset;
global.__bump = _saBump;
global.__epoch = () => _saEpoch;
global.__setSpoken = (p) => { _saSpokenDone = p; };   // atomic-clip boundary is eval-lexical — stubs register via this
global.__joinPending = _saJoinPending;   // 009 T013 — the bridge_join_* pushes drive these (not _saApply)
global.__joined = _saJoined;
global.__joinFailed = _saJoinFailed;
global.__dropped = _saDropped;
`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const adv = (seq, phase, extra = {}) => __apply(Object.assign({
  kind: 'advance', phase, runToken: 'tokA', runTs: 1000,
  attemptSeq: seq, index: seq % 100, sweep: Math.floor(seq / 100), channel: 'call', outcome: null,
}, extra));

let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }
function reset() { LOG.length = 0; CACHE_HITS.length = 0; __reset(null, 0); }

(async () => {
  // ── T1: THE FIX — ring-stop BEFORE outcome (the two-ended discard case) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 });
  await sleep(20);                    // handover completes
  adv(100, 'dialing'); await sleep(20);
  adv(100, 'ended');                  // outcome-less ring-stop → gap
  await sleep(20);
  adv(100, 'ended', { outcome: 'declined' });   // the REAL outcome, arriving in phase 'gap'
  await sleep(20);
  check('T1 ring-stop→outcome: resolution SPOKEN (old model discarded it)',
    LOG.some(l => l === 'play:clip:0_outcome_declined'));
  check('T1 record holds outcome', __state().attempts[100].outcome === 'declined' && __state().attempts[100].resolutionSpoken);

  // ── T2: outcome BEFORE ring-stop (reverse order converges) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  adv(100, 'ended', { outcome: 'no_answer' }); await sleep(20);
  const spoke1 = LOG.filter(l => l === 'play:clip:0_outcome_no_answer').length;
  adv(100, 'ended');                  // late ring-stop — must be inert
  await sleep(20);
  const spoke2 = LOG.filter(l => l === 'play:clip:0_outcome_no_answer').length;
  check('T2 outcome→ring-stop: spoken exactly once, ring-stop inert', spoke1 === 1 && spoke2 === 1);

  // ── T3: AMD moment — L4 speaks; terminal voicemail ended adds nothing (L5 fallback-only) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  adv(100, 'amd', { outcome: 'voicemail' }); await sleep(20);
  check('T3 AMD moment spoken', LOG.some(l => l === 'play:clip:0_amd'));
  adv(100, 'ended');                                  // connect ring-stop after amd — inert (phase already gap)
  adv(100, 'ended', { outcome: 'voicemail' });        // terminal — must NOT speak L5
  await sleep(20);
  check('T3 L5 fallback NOT spoken after L4', !LOG.some(l => l.includes('0_outcome_voicemail')));

  // ── T4: last/only-contact voicemail via AMD → complete speaks exhausted only ──
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'exhausted' });
  await sleep(20);
  check('T4 exhausted terminal after narrated last-attempt', LOG.some(l => l.includes('static:exhausted_both.mp3')));
  check('T4 no duplicate resolution at terminal', !LOG.some(l => l.includes('0_outcome_voicemail')));

  // ── T5: L5 fallback when the AMD signal was LOST ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  adv(100, 'ended');                                  // ring-stop (connected)
  await sleep(20);
  adv(100, 'ended', { outcome: 'voicemail' });        // terminal; amd never arrived
  await sleep(20);
  check('T5 L5 voicemail fallback spoken (AMD lost)', LOG.some(l => l === 'play:clip:0_outcome_voicemail'));

  // ── T6: late outcome after the NEXT attempt began → merged, never spoken (FR-022) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  adv(101, 'dialing'); await sleep(20);               // moved on with NO ended for 100
  LOG.length = 0;
  adv(100, 'ended', { outcome: 'declined' });         // straggler outcome for the prior attempt
  await sleep(20);
  check('T6 late outcome merged to record', __state().attempts[100].outcome === 'declined');
  check('T6 late outcome never spoken', !LOG.some(l => l.includes('0_outcome_declined')));

  // ── T7: start beats — L2 same sweep / L3 new sweep; resolution leads only when unspoken ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  adv(100, 'ended', { outcome: 'no_answer' }); await sleep(20);   // resolution spoken in gap
  LOG.length = 0;
  adv(101, 'dialing'); await sleep(20);
  check('T7 same-sweep start = trying_now, no replay, no gap beat',
    LOG.some(l => l === 'play:clip:1_trying_now') && !LOG.some(l => l.includes('outcome')) && !LOG.some(l => l.includes('gap.mp3')));
  adv(101, 'ended', { outcome: 'no_answer' }); await sleep(20);
  LOG.length = 0;
  adv(200, 'dialing'); await sleep(20);               // sweep 2, contact 0
  check('T7 new-sweep start = trying_again', LOG.some(l => l === 'play:clip:0_trying_again'));

  // ── T8: outcome UNKNOWN at next dialing (lost signal) → neutral gap beat, never a wrong claim ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  LOG.length = 0;
  adv(101, 'dialing'); await sleep(20);               // no ended ever arrived for 100
  check('T8 neutral gap beat before next start (FR-010)',
    LOG[0] === 'play:static:gap.mp3' && LOG.some(l => l === 'play:clip:1_trying_now') && !LOG.some(l => l.includes('outcome')));

  // ── T9: fast-ack — complete cuts everything, ack terminal plays ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'acknowledged', contactName: 'John' });
  await sleep(20);
  check('T9 fast-ack terminal', LOG.some(l => l === 'play:ackclip:John') && __state().terminal === true);

  // ── T10: unnarrated last-attempt outcome at complete → resolution THEN exhausted (never-silent) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  __state().attempts[100].outcome = 'sms_sent';       // outcome landed but never narrated (e.g. raced the complete)
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'exhausted' });
  await sleep(20);
  const ri = LOG.findIndex(l => l === 'play:clip:0_outcome_sms_sent');
  const xi = LOG.findIndex(l => l.includes('exhausted_both'));
  check('T10 complete speaks resolution then exhausted', ri >= 0 && xi > ri);

  // ── P1: post-AMD bed = L17 at cadence, repeatable, NEVER gap.mp3 (captain L17 amendment) ──
  reset();
  __state().attemptSeq = 100;
  __state().attempts[100] = { index: 1, sweep: 1, channel: 'call', outcome: 'voicemail', amdSpoken: true, resolutionSpoken: true };
  let e = __bump();
  const bed1 = __realGapBed(e);
  await sleep(60);            // several cadence cycles at the 2ms stub pause
  __bump();                    // next attempt's advance arrives — bed dies
  await bed1;
  const l17plays = LOG.filter(l => l === 'reach:clip:1_vm_hold').length;
  check('P1 post-AMD: L17 repeats at cadence (' + l17plays + 'x)', l17plays >= 2);
  check('P1 post-AMD: L9 never plays', !LOG.some(l => l.includes('gap.mp3')));

  // ── P2: POST-OUTCOME gap = BED-ONLY, L9 never (L9 FINAL RULING, run 3) ──
  // The outcome line was SPOKEN (resolutionSpoken) → the gap until the next attempt-open or the
  // terminal carries no L9. This case previously asserted "L9 exactly once" — the rule defect run 3 heard.
  reset();
  __state().attemptSeq = 100;
  __state().attempts[100] = { index: 0, sweep: 1, channel: 'call', outcome: 'no_answer', amdSpoken: false, resolutionSpoken: true };
  LOG.length = 0;
  e = __bump();
  const bed2 = __realGapBed(e);
  await sleep(60);
  __bump();
  await bed2;
  const l9post = LOG.filter(l => l === 'reach:static:gap.mp3').length;
  check('P2 post-outcome gap: NO L9 over many cycles (' + l9post + 'x)', l9post === 0);

  // ── P2b: emergency-fallback gap (nothing narrated — e.g. outcome clip missing) = L9 exactly ONCE ──
  reset();
  __state().attemptSeq = 100;
  __state().attempts[100] = { index: 0, sweep: 1, channel: 'call', outcome: 'no_answer', amdSpoken: false, resolutionSpoken: false };
  LOG.length = 0;
  e = __bump();
  const bed2b = __realGapBed(e);
  await sleep(60);
  __bump();
  await bed2b;
  const l9fb = LOG.filter(l => l === 'reach:static:gap.mp3').length;
  check('P2b emergency-fallback gap: L9 exactly once, never loops (' + l9fb + 'x)', l9fb === 1);

  // ── P3: post-AMD with L17 clip MISSING = silent bed (never L9, never a wrong line) ──
  reset();
  __state().attemptSeq = 100;
  __state().attempts[100] = { index: 2, sweep: 1, channel: 'call', outcome: 'voicemail', amdSpoken: true, resolutionSpoken: true };
  const savedCached = _saCachedSrc;
  _saCachedSrc = async (k) => (k === '2_vm_hold' ? null : 'clip:' + k);
  LOG.length = 0;
  e = __bump();
  const bed3 = __realGapBed(e);
  await sleep(60);
  __bump();
  await bed3;
  _saCachedSrc = savedCached;
  check('P3 post-AMD clip-miss: silence (no L9, no L17)', !LOG.some(l => l.startsWith('reach:')));

  // ── N1: connectHold bed — R-009-28 (owner overturn of R1 silence): the connect gap CONTINUES the settled
  //        attempt-line ("Trying to reach {name}") + fake-ring cadence pre-amd (NOTHING NEW, NOT dead silence),
  //        still NO L9 ever; upgrades to L17 MID-BED when amdSpoken lands (R1 fix survives) ──
  reset();
  __state().attemptSeq = 100;
  __state().attempts[100] = { index: 1, sweep: 1, channel: 'call', outcome: null, amdSpoken: false, resolutionSpoken: false };
  LOG.length = 0;
  e = __bump();
  const bedN = __realGapBed(e, { connectHold: true });
  await sleep(30);                                   // several reach ticks (ring + attempt-line), amd NOT yet landed
  const preFlip = LOG.filter(l => l.startsWith('reach:')).length;
  __state().attempts[100].amdSpoken = true;          // the late amd signal lands mid-bed
  await sleep(40);
  __bump();
  await bedN;
  check('N1 connectHold R-009-28: attempt-line+ring (not silence), NO L9 pre-amd', preFlip > 0 && LOG.some(l => l === 'reach:static:uk_ring.wav') && LOG.some(l => l === 'reach:clip:1_attempt') && !LOG.some(l => l.includes('gap.mp3')));
  check('N1 bed upgrades to L17 mid-bed on amd landing', LOG.some(l => l === 'reach:clip:1_vm_hold'));

  // ── N2: full reducer flow — ring-stop first, amd LATE (the R1 heard sequence can't recur) ──
  reset();
  _saStartGapBed = __realGapBed;   // the ordering test needs the REAL bed (the stub hid the L17 loop)
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(101, 'dialing'); await sleep(20);
  LOG.length = 0;
  adv(101, 'ended');                                 // connect ring-stop → connectHold bed (silent)
  await sleep(30);                                   // > several bed ticks — old model played L9 here
  adv(101, 'amd', { outcome: 'voicemail' });         // amd lands late
  await sleep(30);
  check('N2 ring-stop→late-amd: no L9 in the connect gap', !LOG.some(l => l.includes('gap.mp3')));
  check('N2 L4 then L17 hold', LOG.some(l => l === 'play:clip:1_amd') && LOG.some(l => l === 'reach:clip:1_vm_hold'));

  // ── N3: L9 REFINED RULING, pre-terminal cell — full reducer, LAST attempt's outcome ended carries
  // more_sweeps=false (the engine's final-contact stamp) → bed-only → exhausted terminal, NO L9 ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(202, 'dialing'); await sleep(20);               // sweep 2, final contact
  LOG.length = 0;
  adv(202, 'ended', { outcome: 'no_answer', moreSweeps: false });   // resolution spoken → pre-terminal bed
  await sleep(40);                                    // many bed ticks — run 3 heard L9 here
  const l9beforeTerminal = LOG.filter(l => l === 'reach:static:gap.mp3').length;
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'exhausted' });
  await sleep(20);
  check('N3 final outcome (more_sweeps=false) → bed → terminal: NO L9 (' + l9beforeTerminal + 'x)',
    l9beforeTerminal === 0 && !LOG.some(l => l === 'reach:static:gap.mp3'));
  check('N3 resolution spoken once, then exhausted terminal',
    LOG.filter(l => l === 'play:clip:2_outcome_no_answer').length === 1 && LOG.some(l => l.includes('exhausted_both')));

  // ── N3b: flag ABSENT (legacy / non-final emit) → same bed-only pre-terminal (safe default, back-compat) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(202, 'dialing'); await sleep(20);
  LOG.length = 0;
  adv(202, 'ended', { outcome: 'no_answer' });        // NO flag at all
  await sleep(40);
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'exhausted' });
  await sleep(20);
  check('N3b absent flag = safe default: NO L9 → terminal', !LOG.some(l => l === 'reach:static:gap.mp3') && LOG.some(l => l.includes('exhausted_both')));

  // ── N4: inter-sweep mask cell — sweep-1 final outcome ended carries more_sweeps=true → L9 IS the mask
  // (standard cadence, repeats) until sweep-2's attempt-open (L3), which cuts it ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(102, 'dialing'); await sleep(20);               // sweep 1, last contact
  LOG.length = 0;
  adv(102, 'ended', { outcome: 'no_answer', moreSweeps: true });    // another sweep follows → mask gap
  await sleep(40);                                    // the between-sweeps window
  const l9mask = LOG.filter(l => l === 'reach:static:gap.mp3').length;
  const preOpen = LOG.length;
  adv(200, 'dialing'); await sleep(20);               // sweep 2 opens
  const l9afterOpen = LOG.slice(preOpen).filter(l => l === 'reach:static:gap.mp3').length;
  check('N4 inter-sweep (more_sweeps=true): L9 masks at cadence (' + l9mask + 'x ≥ 2)', l9mask >= 2);
  check('N4 sweep-2 opens with trying_again and the mask stops', LOG.some(l => l === 'play:clip:0_trying_again') && l9afterOpen === 0);

  // ── N4b: inter-sweep WITHOUT the flag (legacy engine) → bed-only, still opens sweep 2 (back-compat) ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(102, 'dialing'); await sleep(20);
  LOG.length = 0;
  adv(102, 'ended', { outcome: 'no_answer' });        // NO flag
  await sleep(40);
  const l9legacy = LOG.filter(l => l === 'reach:static:gap.mp3').length;
  adv(200, 'dialing'); await sleep(20);
  check('N4b absent flag inter-sweep: bed-only (' + l9legacy + 'x)', l9legacy === 0);
  check('N4b sweep-2 still opens with trying_again', LOG.some(l => l === 'play:clip:0_trying_again'));

  // ═══ ATOMIC-CLIP RULING (R009 final matrix) — spoken lines are never cut; successors queue to the
  // clip boundary. Swap in SLOW registering stubs (real durations) for these cells only. ═══
  const _fastPlayOnce = _saPlayOnce, _fastPlayReach = _saPlayReach;
  const norm = (s) => String(s).replace('audio/signal/', 'static:');
  _saPlayOnce = (s) => {
    if (!s) return Promise.resolve();
    LOG.push('start:' + norm(s));
    const p = new Promise(r => setTimeout(() => { LOG.push('end:' + norm(s)); r(); }, 15));
    __setSpoken(p);                  // mirrors the real registration (eval-lexical binding)
    return p;
  };
  _saPlayReach = (s, ep, spoken) => {
    if (!s || ep !== __epoch()) return Promise.resolve();
    LOG.push('start:' + norm(s));
    const p = new Promise(r => setTimeout(() => { LOG.push('end:' + norm(s)); r(); }, 10));
    if (spoken) __setSpoken(p);      // mirrors the real registration (spoken reach lines only)
    return p;
  };
  // atomicity assert: every started clip reaches its end before any other clip starts
  function atomicOk() {
    let open = null;
    for (const l of LOG) {
      if (l.startsWith('start:')) { if (open) return false; open = l.slice(6); }
      else if (l.startsWith('end:')) { if (open !== l.slice(4)) return false; open = null; }
    }
    return true;
  }

  // ── A1: attempt-open push lands MID-resolution-clip → line completes, L2 queues to the boundary ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(40);
  adv(100, 'dialing'); await sleep(40);
  LOG.length = 0;
  adv(100, 'ended', { outcome: 'no_answer' });        // resolution clip starts (15ms)
  await sleep(3);                                     // mid-clip…
  adv(101, 'dialing');                                // …the next attempt-open arrives
  await sleep(80);
  const endRes = LOG.indexOf('end:clip:0_outcome_no_answer');
  const startNext = LOG.findIndex(l => l === 'start:clip:1_trying_now');
  check('A1 mid-clip push: resolution completes (never cut)', endRes >= 0);
  check('A1 next line queued to the boundary', startNext > endRes && atomicOk());

  // ── A2: complete lands MID-outcome-clip → terminal waits on the outcome line ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(40);
  adv(100, 'dialing'); await sleep(40);
  LOG.length = 0;
  adv(100, 'ended', { outcome: 'no_answer', moreSweeps: false });   // resolution clip starts
  await sleep(3);                                     // mid-clip…
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'exhausted' });
  await sleep(120);
  const endRes2 = LOG.indexOf('end:clip:0_outcome_no_answer');
  const startTerm = LOG.findIndex(l => l.startsWith('start:') && l.includes('exhausted_both'));
  check('A2 terminal queues to the outcome line (never cut)', endRes2 >= 0 && startTerm > endRes2);
  check('A2 no truncation in any cell (no overlapping clips)', atomicOk());
  _saPlayOnce = _fastPlayOnce; _saPlayReach = _fastPlayReach;   // restore fast stubs

  // ═══ #5 FAST-ACK CHIP — the complete settles the screen; the straggler ended never repaints ═══
  global.CHIP = {};
  global.setContactStatus = (i, s) => { CHIP[i] = s; };
  eval(CHIP_SLICE);
  escalationScreenReset(null);
  escalationScreenAdvance({ run_token: 'R1', contact_index: '0', attempt_seq: '100', phase: 'dialing', channel: 'call' });
  check('B1 fast-ack: dialing paints active', CHIP[0] === 'active');
  escalationScreenComplete({ outcome: 'acknowledged' });
  check('B1 fast-ack: chip shows Reached at the terminal', CHIP[0] === 'reached');
  escalationScreenAdvance({ run_token: 'R1', contact_index: '0', attempt_seq: '100', phase: 'ended', outcome: 'no_answer' });
  check('B1 straggler ended never repaints the settled chip (trace case)', CHIP[0] === 'reached');
  escalationScreenAdvance({ run_token: 'R2', contact_index: '0', attempt_seq: '100', phase: 'dialing', channel: 'call' });
  check('B2 a NEW run unfreezes the mirror', CHIP[0] === 'active');

  // ═══ 009 (T013) JOIN-PHASE TRANSITIONS — states ONLY a live-call (hands-free accept) episode enters,
  // driven by the bridge_join_* pushes (NOT _saApply). Mode-only extension of the ONE machine (FR-018e). ═══

  // ── J1: join_pending → joined. A contact accepted mid-reaching: reaching audio STOPS, reducer marks the
  // live-call phase; join-confirmed lands → joined (device silent — the conversation is the audio). ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  LOG.length = 0;
  __joinPending();
  check('J1 join_pending: reducer marks the live-call phase + stops reaching (terminal-for-reaching)',
    __state().joinPhase === 'join_pending' && __state().terminal === true);
  __joined();
  check('J1 joined: phase settles to joined, device stays silent (no clip played)',
    __state().joinPhase === 'joined' && !LOG.some(l => l.startsWith('play:') || l.startsWith('reach:')));

  // ── J2: join_pending → join_failed. The 8s boundary closed the held contact before the member joined →
  // speak the local N4 failed_join clip (name-bearing, offline-safe). ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  __joinPending();
  LOG.length = 0;
  await __joinFailed('John'); await sleep(20);
  check('J2 join_failed: phase set + N4 line spoken locally (name-bearing)',
    __state().joinPhase === 'join_failed' && LOG.some(l => l === 'play:joinclip:failed_join:John'));
  // R-009-32 ④ (generalized #13) — the drop-time audio teardown now precedes the N4 clip too (parity with N5),
  // so the N4 line lands on a clean media route.
  check('J2 ④: audio teardown precedes the N4 clip',
    LOG.indexOf('teardown') >= 0 && LOG.indexOf('teardown') < LOG.indexOf('play:joinclip:failed_join:John'));

  // ── J3: joined → dropped. A live joined call dropped (008 territory, post-`joined`) → speak the local N5
  // dropped clip (name-bearing, offline-safe). ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  __joinPending(); __joined();
  LOG.length = 0;
  await __dropped('John'); await sleep(20);
  check('J3 dropped (post-joined): phase set + N5 line spoken locally (name-bearing)',
    __state().joinPhase === 'dropped' && LOG.some(l => l === 'play:joinclip:dropped:John'));
  // R-009-31 #13 — the drop-time audio teardown (route/mode reset + volume restore) runs BEFORE the N5 clip,
  // so the line lands on a clean media route (owner: "no audio at all" on a mid-call drop). Assert ordering.
  check('J3 #13: drop-time audio teardown precedes the N5 clip',
    LOG.indexOf('teardown') >= 0 && LOG.indexOf('teardown') < LOG.indexOf('play:joinclip:dropped:John'));

  // ── J4: a live-call episode ABSORBS a trailing escalation_complete. The engine fires it when the joined
  // call ends (to retire the feature-005 liveness), but the bridge card owns the terminal — the reducer must
  // NOT speak the Signal ack over a conversation the member actually had. Control: a NO-join escalation
  // (joinPhase null — Signal, or hands-free exhaustion) still speaks its terminal. ──
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  __joinPending(); __joined();
  LOG.length = 0;
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'acknowledged', contactName: 'John' });
  await sleep(20);
  check('J4 joined episode absorbs trailing escalation_complete (no Signal ack over a real conversation)',
    !LOG.some(l => l.startsWith('play:ackclip') || l.includes('ack_generic')));
  reset();
  __apply({ kind: 'started', runToken: 'tokA', runTs: 1000 }); await sleep(20);
  adv(100, 'dialing'); await sleep(20);
  __apply({ kind: 'complete', runToken: 'tokA', runTs: 1000, outcome: 'acknowledged', contactName: 'John' });
  await sleep(20);
  check('J4 control: a NO-join escalation still speaks the ack terminal (joinPhase null)',
    LOG.some(l => l === 'play:ackclip:John'));

  // R-009-27 addendum — no-raw-labels-on-surfaces (the #4 honesty law, grep-enforced). Wire/push vocabulary
  // (join_failed / acknowledged / exhausted / no_answer / sms_sent) must NEVER be set as user-facing surface
  // text — surfaces always MAP raw labels to human copy. Grep the app.js source: no textContent/innerText/
  // setMsg assignment may embed a raw-label LITERAL. (join_failed is D's new wire label — reads true in traces,
  // must never reach a surface.)
  {
    const RAW = ['join_failed', 'acknowledged', 'exhausted', 'no_answer', 'sms_sent'];
    const leak = src.split('\n')
      .filter((l) => /\.(textContent|innerText)\s*=|setMsg\(/.test(l))
      .find((l) => RAW.some((r) => l.includes("'" + r + "'") || l.includes('"' + r + '"')));
    check('no raw wire-labels rendered on member surfaces (#4 law, grep)', !leak, leak ? leak.trim() : '');
  }

  // R-009-34 FIX H (app belt) — join-confirmation watchdog wiring (grep-enforced; the 10s timer + DOM render
  // are out of the reducer slice, so assert the wiring is intact): the belt is ARMED after _joinConference in
  // the trigger handler, CLEARED in both the confirmed and failed handlers, and its timeout renders N4
  // (_showFailedJoinTerminal) ONLY when the join is still pending (never overrides a real outcome).
  {
    const armed   = /_joinConference\(_jtConf\);\s*\n\s*_armJoinConfirmTimeout/.test(src);
    const fnBody  = (src.match(/function _armJoinConfirmTimeout[\s\S]*?\n}/) || [''])[0];
    const guarded = /_saState\.joinPhase\s*!==\s*'join_pending'/.test(fnBody) && /_showFailedJoinTerminal/.test(fnBody);
    const cleared = (src.match(/_clearJoinConfirmTimeout\(\)/g) || []).length >= 3;   // confirmed + failed + cleanup
    check('FIX H belt: join-confirm watchdog armed-on-join, guarded N4 render, cleared on resolve (grep)',
      armed && guarded && cleared);
  }

  // R-009-35 A — belt-never-races: the belt must be a TRUE last resort, timed comfortably PAST the server's
  // ~12s with-phone failed-join (8s admit-verify watchdog + FCM). At 10s it front-ran the primary and won with
  // worse data (buttonless N4) + a destructive early hangup (R-009-34 ③). Assert the constant is ≥ 18s.
  {
    const m = src.match(/JOIN_CONFIRM_TIMEOUT_MS\s*=\s*(\d+)/);
    const ms = m ? parseInt(m[1], 10) : 0;
    check('R-009-35 A belt-never-races: JOIN_CONFIRM_TIMEOUT_MS ≥ 18000 (server primary always wins)', ms >= 18000);
  }

  console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
