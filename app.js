/* ═══════════════════════════════════════════
   Snooker Score Tracker  —  app.js
   ═══════════════════════════════════════════ */
'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const BALLS = [
  { id:'red',    name:'Red',    value:1, bg:'#cc2200', fg:'#fff' },
  { id:'yellow', name:'Yellow', value:2, bg:'#c8a800', fg:'#222' },
  { id:'green',  name:'Green',  value:3, bg:'#1a8a2a', fg:'#fff' },
  { id:'brown',  name:'Brown',  value:4, bg:'#7b3f00', fg:'#fff' },
  { id:'blue',   name:'Blue',   value:5, bg:'#1a4fcc', fg:'#fff' },
  { id:'pink',   name:'Pink',   value:6, bg:'#c43060', fg:'#fff' },
  { id:'black',  name:'Black',  value:7, bg:'#111',    fg:'#fff' },
];

const COLOR_SEQ = ['yellow','green','brown','blue','pink','black'];
const STORAGE_KEY = 'snookerMatchHistory_v2';

function fmtTime(ms){
  const s = Math.round((ms||0) / 1000);
  if(s < 60) return s + 's';
  const m = Math.floor(s/60), r = s % 60;
  return m + 'm ' + (r < 10 ? '0' : '') + r + 's';
}

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  players: [
    { name:'Player 1', frames:0, score:0, currentBreak:0, bestBreak:0 },
    { name:'Player 2', frames:0, score:0, currentBreak:0, bestBreak:0 },
  ],
  currentPlayer: 0,
  redsRemaining: 15,
  // awaiting: 'red' | 'color' | 'sequence'
  awaiting: 'red',
  colorSeqIdx: 0,
  undoStack: [],
  // Live frame log entries
  frameLog: [],
  // Accumulate breaks for current visit
  visitScore: 0,
  // Balls potted in the current player's active visit (cleared on turn end)
  currentTurnBalls: [],
  // Per-frame stats accumulator
  frameStats: {
    p0:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, safetyShots:0, potCount:0, visitTimeMs:0, pottedByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}, missCountByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0} },
    p1:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, safetyShots:0, potCount:0, visitTimeMs:0, pottedByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}, missCountByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0} },
  },
  // Completed frames saved for history
  completedFrames: [],
  matchSaved: false,
  matchHistory: [],
};

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init(){
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if(s) state.matchHistory = JSON.parse(s);
  } catch(_){ state.matchHistory = []; }
})();

// ─── Screens ──────────────────────────────────────────────────────────────────

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el('screen-'+id).classList.add('active');
}
function showHistory(){ renderHistory(); showScreen('history'); }
function showSetup()  { showScreen('setup'); }

// ─── Setup ────────────────────────────────────────────────────────────────────

function startMatch(){
  const p1 = el('player1-name').value.trim() || 'Player 1';
  const p2 = el('player2-name').value.trim() || 'Player 2';
  state.players = [
    { name:p1, frames:0, score:0, currentBreak:0, bestBreak:0 },
    { name:p2, frames:0, score:0, currentBreak:0, bestBreak:0 },
  ];
  state.currentPlayer  = 0;
  state.completedFrames = [];
  state.matchSaved     = false;
  resetFrameState();
  renderGame();
  showScreen('game');
  startVisitTimer();
}

let _visitTimerInterval = null;
function startVisitTimer(){
  if(_visitTimerInterval) return;
  _visitTimerInterval = setInterval(updateVisitTimer, 250);
  updateVisitTimer();
}
function updateVisitTimer(){
  const elt = el('visit-timer');
  if(!elt) return;
  const start = state._visitStartMs || Date.now();
  const diff = Date.now() - start;
  elt.textContent = fmtTime(diff < 0 ? 0 : diff);
}

function resetFrameState(){
  state.redsRemaining = 15;
  state.awaiting      = 'red';
  state.colorSeqIdx   = 0;
  state.undoStack     = [];
  state.frameLog      = [];
  state.visitScore    = 0;
  state.currentTurnBalls = [];
  state.players[0].score = 0; state.players[0].currentBreak = 0;
  state.players[1].score = 0; state.players[1].currentBreak = 0;
  state.frameStats = {
    p0:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, safetyShots:0, potCount:0, visitTimeMs:0, pottedByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}, missCountByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0} },
    p1:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, safetyShots:0, potCount:0, visitTimeMs:0, pottedByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}, missCountByColor:{red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0} },
  };
  state._visitStartMs = Date.now();
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderGame(){
  const p  = state.players;
  const cp = state.currentPlayer;
  const frameNum = state.completedFrames.length + 1;

  el('frame-label').textContent = 'Frame ' + frameNum;
  el('p1-frames').textContent   = p[0].frames;
  el('p2-frames').textContent   = p[1].frames;
  el('p1-name-display').textContent = p[0].name;
  el('p2-name-display').textContent = p[1].name;
  el('p1-break') && (el('p1-break').textContent = p[0].currentBreak);
  el('p2-break') && (el('p2-break').textContent = p[1].currentBreak);
  el('p1-best')  && (el('p1-best').textContent  = p[0].bestBreak);
  el('p2-best')  && (el('p2-best').textContent  = p[1].bestBreak);
  el('p1-score').textContent    = p[0].score;
  el('p2-score').textContent    = p[1].score;
  el('pts-remaining').textContent = ptsLeft() + ' pts left';

  el('player-0-panel').classList.toggle('active-player', cp === 0);
  el('player-1-panel').classList.toggle('active-player', cp === 1);
  el('current-player-label').textContent = p[cp].name + "'s turn";
  el('phase-label').textContent = phaseDesc();

  // Turn balls strip in log header
  const logHeader = el('frame-log-header');
  if(logHeader){
    const tbHtml = (state.currentTurnBalls||[]).map(bid => {
      const b = ballById(bid);
      return b ? '<span class="turn-ball" style="background:'+b.bg+';color:'+b.fg+'"></span>' : '';
    }).join('');
    logHeader.innerHTML = 'Log' + (tbHtml ? '<span class="turn-balls-strip">' + tbHtml + '</span>' : '');
  }

  // Eliminated: trailing player can't catch up even if they pot everything remaining
  const pts = ptsLeft();
  const s0 = p[0].score, s1 = p[1].score;
  el('player-0-panel').classList.toggle('eliminated-player', s0 < s1 && pts + s0 < s1);
  el('player-1-panel').classList.toggle('eliminated-player', s1 < s0 && pts + s1 < s0);

  renderBalls();
  renderFrameLog();
}

function ptsLeft(){
  if(state.awaiting === 'sequence'){
    let s=0;
    for(let i=state.colorSeqIdx;i<COLOR_SEQ.length;i++){
      const b = ballById(COLOR_SEQ[i]);
      if(b) s += b.value;
    }
    return s;
  }
  return state.redsRemaining * 8 + 27;
}

function phaseDesc(){
  if(state.awaiting === 'red')
    return state.redsRemaining + ' red' + (state.redsRemaining !== 1 ? 's' : '') + ' on table';
  if(state.awaiting === 'color'){
    const r = state.redsRemaining;
    return 'Pot a colour' + (r > 0 ? ' — ' + r + ' red' + (r !== 1 ? 's' : '') + ' left' : ' — colours only');
  }
  if(state.colorSeqIdx >= COLOR_SEQ.length) return 'Frame complete';
  const b = ballById(COLOR_SEQ[state.colorSeqIdx]);
  return 'Colours: pot ' + b.name + ' (' + b.value + ')';
}

function renderBalls(){
  const c = el('ball-buttons');
  c.innerHTML = '';
  BALLS.forEach(ball => {
    if(ball.id === 'red' && state.redsRemaining === 0) return;
    // In sequence phase, grey out colours already cleared from the table
    if(state.awaiting === 'sequence' && ball.id !== 'red'){
      const idx = COLOR_SEQ.indexOf(ball.id);
      if(idx >= 0 && idx < state.colorSeqIdx){
        const gb = document.createElement('button');
        gb.className = 'ball-btn ball-potted';
        gb.style.cssText = 'background:' + ball.bg + ';color:' + ball.fg;
        c.appendChild(gb);
        return;
      }
    }
    const on = isBallOn(ball.id);
    const btn = document.createElement('button');
    btn.className = 'ball-btn' + (on ? '' : ' disabled');
    btn.style.cssText = 'background:' + ball.bg + ';color:' + ball.fg;
    if(on){
      btn.style.borderColor = 'rgba(255,255,255,0.75)';
      btn.style.boxShadow = '0 0 16px ' + ball.bg + 'aa,0 5px 12px rgba(0,0,0,0.5),inset 0 2px 5px rgba(255,255,255,0.18)';
    }
    btn.innerHTML = '';
    if(on) btn.addEventListener('click', () => potBall(ball));
    c.appendChild(btn);
  });
}

function isBallOn(id){
  if(state.awaiting === 'red')      return id === 'red' && state.redsRemaining > 0;
  // During colour phase, extra reds may also be potted (multiple reds in one shot)
  if(state.awaiting === 'color')    return id !== 'red' || state.redsRemaining > 0;
  if(state.awaiting === 'sequence') return id === COLOR_SEQ[state.colorSeqIdx];
  return false;
}

// ─── Frame log ────────────────────────────────────────────────────────────────

function renderFrameLog(){
  const box = el('frame-log-list');
  if(!box) return;
  box.innerHTML = state.frameLog.map(e => {
    let cls = 'log-entry';
    if(e.type === 'foul')       cls += ' log-foul';
    else if(e.type === 'miss')  cls += ' log-miss';
    else if(e.type === 'safety') cls += ' log-safety';
    else if(e.type === 'correction') cls += ' log-correction';
    if(e.playerIdx === 0) cls += ' log-p0';
    else if(e.playerIdx === 1) cls += ' log-p1';
    let descHtml;
    if(e.type === 'pot' && e.ballId){
      const b = ballById(e.ballId);
      const style = b ? 'background:'+b.bg+';color:'+b.fg+';' : '';
      descHtml = 'potted <span class="log-ball" style="'+style+'">' + esc(e.desc) + '</span>';
    } else {
      descHtml = esc(e.desc);
    }
    return '<div class="' + cls + '">' +
      '<span class="log-who">' + esc(e.player) + '</span> ' +
      '<span class="log-desc">' + descHtml + '</span>' +
      (e.pts !== undefined ? '<span class="log-pts">+' + e.pts + '</span>' : '') +
    '</div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function addLog(type, player, desc, pts, playerIdx, ballId){
  state.frameLog.push({ type, player, desc, pts, playerIdx, ballId });
}

// ─── Potting ──────────────────────────────────────────────────────────────────

function potBall(ball){
  // Guard against stale click events (e.g. rapid double-clicks)
  if(!isBallOn(ball.id)) return;
  // Cancel any open miss picker / panels — user is potting instead
  cancelMissPicker();
  hideFoulPanel();

  const cp  = state.currentPlayer;
  const pl  = state.players[cp];
  const sk  = cp === 0 ? 'p0' : 'p1';

  state.undoStack.push(snapshot());

  pl.score        += ball.value;
  pl.currentBreak += ball.value;
  state.visitScore += ball.value;
  if(pl.currentBreak > pl.bestBreak) pl.bestBreak = pl.currentBreak;

  state.frameStats[sk].totalPotted += ball.value;
  state.frameStats[sk].potCount++;
  if(!state.frameStats[sk].pottedByColor) state.frameStats[sk].pottedByColor = {red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0};
  state.frameStats[sk].pottedByColor[ball.id]++;
  if(ball.id === 'red') state.frameStats[sk].redsPotsCount++;
  state.currentTurnBalls.push(ball.id);

  addLog('pot', pl.name, ball.name, ball.value, cp, ball.id);

  // Advance phase
  if(state.awaiting === 'red'){
    state.redsRemaining--;
    state.awaiting = 'color';
  } else if(state.awaiting === 'color'){
    if(ball.id === 'red'){
      // Another red potted on the same shot — stay in colour-nomination phase
      state.redsRemaining--;
    } else if(state.redsRemaining === 0){
      state.awaiting    = 'sequence';
      state.colorSeqIdx = 0;
    } else {
      state.awaiting = 'red';
    }
  } else if(state.awaiting === 'sequence'){
    state.colorSeqIdx++;
  }

  renderGame();

  // Snooker rule: frame ends when the final black is potted (last ball in sequence).
  if(state.awaiting === 'sequence' && state.colorSeqIdx >= COLOR_SEQ.length){
    endFrameAutomatically();
  }
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

function undoLastBall(){
  if(!state.undoStack.length) return;
  // Always cancel any pending UI (miss picker, panels) on undo
  cancelMissPicker();
  hideFoulPanel();
  hideCorrectPanel();
  restoreSnapshot(state.undoStack.pop());
  renderGame();
}

function snapshot(){
  return {
    players:     state.players.map(p=>({...p})),
    currentPlayer: state.currentPlayer,
    redsRemaining: state.redsRemaining,
    awaiting:    state.awaiting,
    colorSeqIdx: state.colorSeqIdx,
    visitScore:  state.visitScore,
    _visitStartMs: state._visitStartMs,
    frameLog:    state.frameLog.map(e=>({...e})),
    currentTurnBalls: [...(state.currentTurnBalls||[])],
    frameStats: {
      p0:{...state.frameStats.p0, breaks:[...state.frameStats.p0.breaks], pottedByColor:{...(state.frameStats.p0.pottedByColor||{})}, missCountByColor:{...(state.frameStats.p0.missCountByColor||{})}},
      p1:{...state.frameStats.p1, breaks:[...state.frameStats.p1.breaks], pottedByColor:{...(state.frameStats.p1.pottedByColor||{})}, missCountByColor:{...(state.frameStats.p1.missCountByColor||{})}},
    },
  };
}

function restoreSnapshot(s){
  state.players        = s.players.map(p=>({...p}));
  state.currentPlayer  = s.currentPlayer;
  state.redsRemaining  = s.redsRemaining;
  state.awaiting       = s.awaiting;
  state.colorSeqIdx    = s.colorSeqIdx;
  state.visitScore     = s.visitScore;
  state._visitStartMs  = s._visitStartMs || Date.now();
  state.frameLog       = (s.frameLog || []).map(e=>({...e}));
  state.currentTurnBalls = [...(s.currentTurnBalls||[])];
  state.frameStats = {
    p0:{...s.frameStats.p0, breaks:[...s.frameStats.p0.breaks], pottedByColor:{...(s.frameStats.p0.pottedByColor||{})}, missCountByColor:{...(s.frameStats.p0.missCountByColor||{})}},
    p1:{...s.frameStats.p1, breaks:[...s.frameStats.p1.breaks], pottedByColor:{...(s.frameStats.p1.pottedByColor||{})}, missCountByColor:{...(s.frameStats.p1.missCountByColor||{})}},
  };
}

// ─── Visit / break management ─────────────────────────────────────────────────

let _missTimer = null;
let _missCountdownInterval = null;

function cancelMissPicker(){
  if(_missTimer)             { clearTimeout(_missTimer); _missTimer = null; }
  if(_missCountdownInterval) { clearInterval(_missCountdownInterval); _missCountdownInterval = null; }
  const mp = el('miss-picker');
  if(mp) mp.classList.add('hidden');
}

function endBreak(){
  // Ignore if miss picker already up (prevent double-trigger)
  const mp = el('miss-picker');
  if(mp && !mp.classList.contains('hidden')) return;
  // Close other panels
  hideFoulPanel();
  hideCorrectPanel();

  const cp   = state.currentPlayer;
  const name = state.players[cp].name;
  showMissPicker(cp, name);
}

function showMissPicker(cp, name){
  // Defensive: clear any previous timers
  if(_missTimer)             { clearTimeout(_missTimer); _missTimer = null; }
  if(_missCountdownInterval) { clearInterval(_missCountdownInterval); _missCountdownInterval = null; }

  const panel  = el('miss-picker');
  const label  = el('miss-who-label');
  const countdown = el('miss-countdown');
  label.textContent = name + ' missed — how difficult?';
  panel.classList.remove('hidden');

  let secs = 5;
  countdown.textContent = secs + 's';

  _missCountdownInterval = setInterval(() => {
    secs--;
    countdown.textContent = (secs < 0 ? 0 : secs) + 's';
    if(secs <= 0){
      clearInterval(_missCountdownInterval);
      _missCountdownInterval = null;
    }
  }, 1000);

  _missTimer = setTimeout(() => {
    _missTimer = null;
    // Only fire if picker is still visible (i.e. not cancelled)
    if(!panel.classList.contains('hidden')){
      commitMiss(cp, 'safety');
    }
  }, 5000);
}

function selectMissDifficulty(difficulty){
  // Only accept if miss picker is currently visible
  const mp = el('miss-picker');
  if(!mp || mp.classList.contains('hidden')) return;
  cancelMissPicker();
  const cp = state.currentPlayer;
  commitMiss(cp, difficulty);
}

function commitMiss(cp, difficulty){
  cancelMissPicker();

  // Snapshot BEFORE state change so we can undo this miss/safety
  state.undoStack.push(snapshot());

  // Now commit the visit (accumulate time, count visit)
  commitVisit();

  const sk = cp === 0 ? 'p0' : 'p1';
  const diffLabel = { easy:'Easy miss', medium:'Medium miss', hard:'Hard miss', safety:'Safety shot' };

  if(difficulty === 'easy')   state.frameStats[sk].missEasy++;
  else if(difficulty === 'medium') state.frameStats[sk].missMedium++;
  else if(difficulty === 'hard')   state.frameStats[sk].missHard++;
  else if(difficulty === 'safety') state.frameStats[sk].safetyShots++;

  // Track which specific color was missed (reds and sequence colors only)
  if(difficulty !== 'safety'){
    const mc = state.awaiting === 'red' ? 'red' : (state.awaiting === 'sequence' ? COLOR_SEQ[state.colorSeqIdx] : null);
    if(mc && state.frameStats[sk].missCountByColor)
      state.frameStats[sk].missCountByColor[mc] = (state.frameStats[sk].missCountByColor[mc] || 0) + 1;
  }
  state.currentTurnBalls = [];

  const label = diffLabel[difficulty] || 'Safety shot';
  addLog(difficulty === 'safety' ? 'safety' : 'miss', state.players[cp].name, label, undefined, cp);

  state.players[cp].currentBreak = 0;
  if(state.awaiting === 'color'){
    if(state.redsRemaining === 0){ state.awaiting = 'sequence'; state.colorSeqIdx = 0; }
    else state.awaiting = 'red';
  }
  // Snooker rule: if a miss occurs when only the black is left (sequence idx 5)
  // and scores are not equal, the frame ends.
  if(state.awaiting === 'sequence' && state.colorSeqIdx === COLOR_SEQ.length - 1){
    const s0 = state.players[0].score, s1 = state.players[1].score;
    if(s0 !== s1){
      renderGame();
      endFrameAutomatically();
      return;
    }
  }
  state.currentPlayer = 1 - cp;
  state.players[state.currentPlayer].currentBreak = 0;
  state.visitScore = 0;
  state._visitStartMs = Date.now();
  renderGame();
}

function switchPlayer(){
  cancelMissPicker();
  hideFoulPanel();
  hideCorrectPanel();

  // Snapshot BEFORE the switch so we can undo
  state.undoStack.push(snapshot());

  commitVisit();
  state.currentTurnBalls = [];
  const cp = state.currentPlayer;
  state.players[cp].currentBreak = 0;
  state.currentPlayer = 1 - cp;
  state.players[state.currentPlayer].currentBreak = 0;
  state.visitScore = 0;
  state._visitStartMs = Date.now();
  if(state.awaiting === 'color'){
    if(state.redsRemaining === 0){ state.awaiting = 'sequence'; state.colorSeqIdx = 0; }
    else state.awaiting = 'red';
  }
  renderGame();
}

function commitVisit(countAsVisit){
  const cp  = state.currentPlayer;
  const sk  = cp === 0 ? 'p0' : 'p1';
  const val = state.visitScore;
  const now = Date.now();
  if(state._visitStartMs){
    state.frameStats[sk].visitTimeMs += (now - state._visitStartMs);
  }
  state._visitStartMs = now;
  if(countAsVisit !== false){
    state.frameStats[sk].visits++;
    if(val > 0) state.frameStats[sk].scoringVisits++;
  }
  if(val > 0){
    state.frameStats[sk].breaks.push(val);
    if(val > state.frameStats[sk].highestBreak) state.frameStats[sk].highestBreak = val;
  }
}

// ─── Fouls ────────────────────────────────────────────────────────────────────

function showFoulPanel(){
  const fp = el('foul-panel');
  if(!fp.classList.contains('hidden')){ fp.classList.add('hidden'); return; }
  // Close other panels first
  cancelMissPicker();
  hideCorrectPanel();
  fp.classList.remove('hidden');
}
function hideFoulPanel() { const fp=el('foul-panel'); if(fp) fp.classList.add('hidden'); }

function applyFoul(value){
  hideFoulPanel();
  cancelMissPicker();
  const cp  = state.currentPlayer;
  const opp = 1 - cp;
  const sk  = cp === 0 ? 'p0' : 'p1';

  // Snapshot BEFORE foul so we can undo
  state.undoStack.push(snapshot());

  commitVisit();
  state.currentTurnBalls = [];

  state.players[opp].score += value;
  state.frameStats[sk].fouls++;
  addLog('foul', state.players[cp].name, 'foul — ' + value + ' pts to ' + state.players[opp].name, value, cp);

  state.players[cp].currentBreak = 0;
  state.currentPlayer = opp;
  state.players[opp].currentBreak = 0;
  state.visitScore = 0;
  if(state.awaiting === 'color'){
    if(state.redsRemaining === 0){ state.awaiting = 'sequence'; state.colorSeqIdx = 0; }
    else state.awaiting = 'red';
  }
  state._visitStartMs = Date.now();
  renderGame();
}

// ─── Frame ending ─────────────────────────────────────────────────────────────

function endFrameAutomatically(){ cancelMissPicker(); hideFoulPanel(); hideCorrectPanel(); resolveFrame(); }

function confirmEndFrame(){
  cancelMissPicker(); hideFoulPanel(); hideCorrectPanel();
  const p  = state.players;
  const s0 = p[0].score, s1 = p[1].score;
  if(s0 === s1){
    showTieBreakDialog(p[0].name, p[1].name);
    return;
  }
  const lead = s0 > s1 ? 0 : 1;
  showConfirm(
    'End frame?\n' + p[lead].name + ' leads ' + Math.max(s0,s1) + ' \u2013 ' + Math.min(s0,s1),
    'End Frame', () => resolveFrame()
  );
}

function confirmConcede(){
  cancelMissPicker(); hideFoulPanel(); hideCorrectPanel();
  const cp  = state.currentPlayer;
  const opp = 1 - cp;
  showConfirm(
    state.players[cp].name + ' concedes?\n' + state.players[opp].name + ' wins the frame.',
    'Concede', () => resolveFrame(opp)
  );
}

function resolveFrame(forcedWinner){
  commitVisit(false); // flush break without counting as a new visit
  const p = state.players;
  let winner;
  if(forcedWinner !== undefined){
    winner = forcedWinner;
  } else if(p[0].score !== p[1].score){
    winner = p[0].score > p[1].score ? 0 : 1;
  } else {
    showTieBreakDialog(p[0].name, p[1].name);
    return;
  }
  finaliseFrame(winner);
}

function showTieBreakDialog(n0, n1){
  el('confirm-message').textContent = 'Scores tied!\nRe-spot black — who potted it?';
  el('confirm-yes-btn').textContent = n0;
  _confirmCallback = () => finaliseFrame(0);
  const db = el('confirm-dialog').querySelector('.dialog-buttons');
  if(!el('tb2')){
    const b = document.createElement('button');
    b.id = 'tb2'; b.className = 'btn-dialog-yes'; b.style.background = '#1a4fcc';
    b.textContent = n1;
    b.addEventListener('click', () => { b.remove(); hideConfirm(); finaliseFrame(1); });
    db.appendChild(b);
  }
  el('confirm-dialog').classList.remove('hidden');
}

function finaliseFrame(winner){
  const p   = state.players;
  const p0s = state.frameStats.p0;
  const p1s = state.frameStats.p1;

  p[winner].frames++;

  const frameRecord = {
    frameNum: state.completedFrames.length + 1,
    p0Score:  p[0].score,
    p1Score:  p[1].score,
    p0Best:   p0s.highestBreak,
    p1Best:   p1s.highestBreak,
    winner,
    stats:{
      p0:{ ...p0s, breaks:[...p0s.breaks] },
      p1:{ ...p1s, breaks:[...p1s.breaks] },
    },
    log: [...state.frameLog],
  };

  state.completedFrames.push(frameRecord);

  showFrameSummary(frameRecord);
}

// ─── Frame summary overlay ────────────────────────────────────────────────────

// Returns categorized stats HTML for a player vs player comparison.
// p0s, p1s are stat objects, p0Score/p1Score are scores, p0Best/p1Best best breaks.
function buildStatsHtml(p0Name, p1Name, p0s, p1s, p0Score, p1Score, p0Best, p1Best){
  const avgB = bs => bs && bs.length ? Math.round(bs.reduce((a,b)=>a+b,0)/bs.length) : 0;
  const p0b = (p0s.breaks)||[], p1b = (p1s.breaks)||[];
  const sp0 = (p0s.visits||0) > 0 ? Math.round((p0s.scoringVisits||0)/p0s.visits*100) : 0;
  const sp1 = (p1s.visits||0) > 0 ? Math.round((p1s.scoringVisits||0)/p1s.visits*100) : 0;
  const p0Pots = p0s.potCount || 0, p1Pots = p1s.potCount || 0;
  const p0Pc = p0s.pottedByColor || {}, p1Pc = p1s.pottedByColor || {};
  const p0mc = p0s.missCountByColor || {}, p1mc = p1s.missCountByColor || {};

  // Per-color accuracy row: shows X% (pots / (pots + misses)) for that specific color
  const accuracyRow = (n0, n1, m0, m1, lbl) => {
    const t0 = n0 + m0, t1 = n1 + m1;
    const fmt = (n, t) => t === 0 ? (n > 0 ? String(n) : '\u2013') : Math.round(n*100/t)+'%';
    const r0 = t0 > 0 ? n0/t0 : 0, r1 = t1 > 0 ? n1/t1 : 0;
    const w0c = r0 > r1 ? ' sr-win' : '', w1c = r1 > r0 ? ' sr-win' : '';
    return '<div class="stat-row"><span class="sr-val'+w0c+'">'+fmt(n0,t0)+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+fmt(n1,t1)+'</span></div>';
  };

  // Pot %: pots / (pots + intentional misses + fouls); safety excluded
  const p0Attempts = p0Pots + (p0s.missEasy||0) + (p0s.missMedium||0) + (p0s.missHard||0) + (p0s.fouls||0);
  const p1Attempts = p1Pots + (p1s.missEasy||0) + (p1s.missMedium||0) + (p1s.missHard||0) + (p1s.fouls||0);
  const potPct0 = p0Attempts > 0 ? Math.round(p0Pots * 100 / p0Attempts) + '%' : 'N/A';
  const potPct1 = p1Attempts > 0 ? Math.round(p1Pots * 100 / p1Attempts) + '%' : 'N/A';

  // Positional %: of all pots, how many led to another pot in the same visit
  // = (potCount - scoringVisits) / potCount
  const posPots0 = Math.max(0, p0Pots - (p0s.scoringVisits||0));
  const posPots1 = Math.max(0, p1Pots - (p1s.scoringVisits||0));
  const posPct0 = p0Pots > 0 ? Math.round(posPots0 * 100 / p0Pots) + '%' : 'N/A';
  const posPct1 = p1Pots > 0 ? Math.round(posPots1 * 100 / p1Pots) + '%' : 'N/A';

  const sr = (v0, v1, lbl, loWins) => {
    const n0 = parseFloat(v0), n1 = parseFloat(v1);
    const w0c = !loWins ? (n0 > n1 ? ' sr-win' : '') : (n0 < n1 ? ' sr-win' : '');
    const w1c = !loWins ? (n1 > n0 ? ' sr-win' : '') : (n1 < n0 ? ' sr-win' : '');
    return '<div class="stat-row"><span class="sr-val'+w0c+'">'+v0+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+v1+'</span></div>';
  };
  const pctRow = (n0, n1, t0, t1, lbl, loWins) => {
    const fmt = (n, t) => t > 0 ? n + ' (' + Math.round(n*100/t) + '%)' : String(n);
    const w0c = !loWins ? (n0 > n1 ? ' sr-win' : '') : (n0 < n1 ? ' sr-win' : '');
    const w1c = !loWins ? (n1 > n0 ? ' sr-win' : '') : (n1 < n0 ? ' sr-win' : '');
    return '<div class="stat-row"><span class="sr-val'+w0c+'">'+fmt(n0,t0)+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+fmt(n1,t1)+'</span></div>';
  };
  const head = (label) => '<div class="stat-section">'+label+'</div>';

  // Visits section: "N (Xm Ys)" per player, label "Visits – total time"\n  const visitsSubhead = (v0, v1, ms0, ms1) => {\n    const totalTime = fmtTime((ms0||0) + (ms1||0));\n    const fmt = (v, ms) => (v||0) + ' (' + fmtTime(ms||0) + ')';\n    const w0c = (v0||0) > (v1||0) ? ' sr-win' : '';\n    const w1c = (v1||0) > (v0||0) ? ' sr-win' : '';\n    return '<div class=\"stat-section\" style=\"display:flex;justify-content:space-between;align-items:baseline;\">'+\n      '<span class=\"sr-val'+w0c+'\" style=\"min-width:54px;text-align:center;font-size:0.72rem;\">'+fmt(v0,ms0)+'</span>'+\n      '<span style=\"flex:1;text-align:center;letter-spacing:1.2px;\">Visits &ndash; '+totalTime+'</span>'+\n      '<span class=\"sr-val'+w1c+'\" style=\"min-width:54px;text-align:center;font-size:0.72rem;\">'+fmt(v1,ms1)+'</span>'+\n      '</div>';\n  };

  // Color accuracy row: shows "N (X%)" count with percentage from attempts
  const colorAccRow = (n0, n1, m0, m1, lbl) => {
    const t0 = n0 + m0, t1 = n1 + m1;
    const fmt = (n, t) => t === 0 ? (n > 0 ? String(n) : '\u2013') : n + ' ('+Math.round(n*100/t)+'%)';
    const r0 = t0 > 0 ? n0/t0 : 0, r1 = t1 > 0 ? n1/t1 : 0;
    const w0c = (n0 > n1 || r0 > r1) && (n0 > 0 || n1 > 0) ? ' sr-win' : '';
    const w1c = (n1 > n0 || r1 > r0) && (n0 > 0 || n1 > 0) ? ' sr-win' : '';
    return '<div class="stat-row"><span class="sr-val'+w0c+'">'+fmt(n0,t0)+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+fmt(n1,t1)+'</span></div>';
  };

  return '<div class="card-names-row"><span>'+esc(p0Name)+'</span><span></span><span>'+esc(p1Name)+'</span></div>' +
    '<div class="card-stats">' +
      head('Score') +
      sr(p0Score||0, p1Score||0, 'Total points') +
      head('Breaks') +
      sr(p0Best||p0s.highestBreak||0, p1Best||p1s.highestBreak||0, 'Best break') +
      sr(avgB(p0b), avgB(p1b), 'Avg break') +
      sr(p0b.filter(b=>b>=20).length, p1b.filter(b=>b>=20).length, '20+ breaks') +
      visitsSubhead(p0s.visits, p1s.visits, p0s.visitTimeMs, p1s.visitTimeMs) +
      sr(sp0+'%', sp1+'%', 'Scoring visit %') +
      head('Pots') +
      sr(potPct0, potPct1, 'Pot %') +
      sr(posPct0, posPct1, 'Positional %') +
      sr(
        p0Pots + (p0s.missEasy||0) + (p0s.missMedium||0) + (p0s.missHard||0) + (p0s.safetyShots||0) + (p0s.fouls||0),
        p1Pots + (p1s.missEasy||0) + (p1s.missMedium||0) + (p1s.missHard||0) + (p1s.safetyShots||0) + (p1s.fouls||0),
        'Total shots') +
      sr(p0Pots, p1Pots, 'Total pots') +
      colorAccRow(p0Pc.red||0,    p1Pc.red||0,    p0mc.red||0,    p1mc.red||0,    'Reds') +
      colorAccRow(p0Pc.yellow||0, p1Pc.yellow||0, p0mc.yellow||0, p1mc.yellow||0, 'Yellows') +
      colorAccRow(p0Pc.green||0,  p1Pc.green||0,  p0mc.green||0,  p1mc.green||0,  'Greens') +
      colorAccRow(p0Pc.brown||0,  p1Pc.brown||0,  p0mc.brown||0,  p1mc.brown||0,  'Browns') +
      colorAccRow(p0Pc.blue||0,   p1Pc.blue||0,   p0mc.blue||0,   p1mc.blue||0,   'Blues') +
      colorAccRow(p0Pc.pink||0,   p1Pc.pink||0,   p0mc.pink||0,   p1mc.pink||0,   'Pinks') +
      colorAccRow(p0Pc.black||0,  p1Pc.black||0,  p0mc.black||0,  p1mc.black||0,  'Blacks') +
      head('Misses & Safety') +
      pctRow(p0s.missEasy||0,   p1s.missEasy||0,   p0Pots, p1Pots, 'Easy misses',   true) +
      pctRow(p0s.missMedium||0, p1s.missMedium||0, p0Pots, p1Pots, 'Medium misses', true) +
      pctRow(p0s.missHard||0,   p1s.missHard||0,   p0Pots, p1Pots, 'Hard misses',   true) +
      sr(p0s.safetyShots||0, p1s.safetyShots||0, 'Safety shots') +
      sr(p0s.fouls||0, p1s.fouls||0, 'Fouls', true) +
    '</div>';
}

function showFrameSummary(f){
  const p  = state.players;
  const ov = el('frame-summary-overlay');

  el('fs-title').textContent = 'Frame ' + f.frameNum + ' — ' + p[f.winner].name + ' wins!';
  el('fs-score').textContent = f.p0Score + ' – ' + f.p1Score;
  el('fs-frames').textContent = 'Frames: ' + p[0].frames + ' – ' + p[1].frames;

  el('fs-stats').innerHTML = buildStatsHtml(p[0].name, p[1].name, f.stats.p0, f.stats.p1, f.p0Score, f.p1Score, f.p0Best, f.p1Best);

  ov.classList.remove('hidden');
}

function startNextFrame(){
  cancelMissPicker(); hideFoulPanel(); hideCorrectPanel();
  el('frame-summary-overlay').classList.add('hidden');
  const nextBreaker = state.completedFrames.length % 2 === 0 ? 0 : 1;
  state.currentPlayer = nextBreaker;
  resetFrameState();
  renderGame();
}

function endMatchFromSummary(){
  cancelMissPicker(); hideFoulPanel(); hideCorrectPanel();
  el('frame-summary-overlay').classList.add('hidden');
  saveMatch();
}

// ─── Match end ────────────────────────────────────────────────────────────────

function saveMatch(){
  if(state.matchSaved) return;
  state.matchSaved = true;

  const p = state.players;
  const cf = state.completedFrames;

  const allP0 = cf.flatMap(f => f.stats.p0.breaks);
  const allP1 = cf.flatMap(f => f.stats.p1.breaks);
  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;

  // determine match winner by frames
  const matchWinner = p[0].frames > p[1].frames ? 0 : p[1].frames > p[0].frames ? 1 : -1;

  const record = {
    date:     new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    time:     new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
    p0Name:   p[0].name,
    p1Name:   p[1].name,
    p0Frames: p[0].frames,
    p1Frames: p[1].frames,
    winner:   matchWinner,
    p0Best:   Math.max(0,...cf.map(f=>f.p0Best)),
    p1Best:   Math.max(0,...cf.map(f=>f.p1Best)),
    p0Total:  cf.reduce((s,f)=>s+f.p0Score,0),
    p1Total:  cf.reduce((s,f)=>s+f.p1Score,0),
    p0Avg:    avg(allP0),
    p1Avg:    avg(allP1),
    p0Centuries: cf.reduce((s,f)=>s+(f.stats.p0.breaks.filter(b=>b>=100).length),0),
    p1Centuries: cf.reduce((s,f)=>s+(f.stats.p1.breaks.filter(b=>b>=100).length),0),
    p0Fifties:   cf.reduce((s,f)=>s+(f.stats.p0.breaks.filter(b=>b>=50&&b<100).length),0),
    p1Fifties:   cf.reduce((s,f)=>s+(f.stats.p1.breaks.filter(b=>b>=50&&b<100).length),0),
    p0Fouls:  cf.reduce((s,f)=>s+f.stats.p0.fouls,0),
    p1Fouls:  cf.reduce((s,f)=>s+f.stats.p1.fouls,0),
    p0MissEasy:   cf.reduce((s,f)=>s+(f.stats.p0.missEasy||0),0),
    p1MissEasy:   cf.reduce((s,f)=>s+(f.stats.p1.missEasy||0),0),
    p0MissMedium: cf.reduce((s,f)=>s+(f.stats.p0.missMedium||0),0),
    p1MissMedium: cf.reduce((s,f)=>s+(f.stats.p1.missMedium||0),0),
    p0MissHard:   cf.reduce((s,f)=>s+(f.stats.p0.missHard||0),0),
    p1MissHard:   cf.reduce((s,f)=>s+(f.stats.p1.missHard||0),0),
    p0PotCount:   cf.reduce((s,f)=>s+(f.stats.p0.potCount||0),0),
    p1PotCount:   cf.reduce((s,f)=>s+(f.stats.p1.potCount||0),0),
    p0Visits:     cf.reduce((s,f)=>s+(f.stats.p0.visits||0),0),
    p1Visits:     cf.reduce((s,f)=>s+(f.stats.p1.visits||0),0),
    p0ScoringVisits: cf.reduce((s,f)=>s+(f.stats.p0.scoringVisits||0),0),
    p1ScoringVisits: cf.reduce((s,f)=>s+(f.stats.p1.scoringVisits||0),0),
    p0RedsPotted: cf.reduce((s,f)=>s+(f.stats.p0.redsPotsCount||0),0),
    p1RedsPotted: cf.reduce((s,f)=>s+(f.stats.p1.redsPotsCount||0),0),
    p0VisitTimeMs: cf.reduce((s,f)=>s+(f.stats.p0.visitTimeMs||0),0),
    p1VisitTimeMs: cf.reduce((s,f)=>s+(f.stats.p1.visitTimeMs||0),0),
    p0PottedByColor: cf.reduce((acc,f)=>{ const pc=(f.stats.p0.pottedByColor)||{}; for(const k in pc) acc[k]=(acc[k]||0)+pc[k]; return acc; }, {red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}),
    p1PottedByColor: cf.reduce((acc,f)=>{ const pc=(f.stats.p1.pottedByColor)||{}; for(const k in pc) acc[k]=(acc[k]||0)+pc[k]; return acc; }, {red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}),
    p0MissCountByColor: cf.reduce((acc,f)=>{ const mc=(f.stats.p0.missCountByColor)||{}; for(const k in mc) acc[k]=(acc[k]||0)+mc[k]; return acc; }, {red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}),
    p1MissCountByColor: cf.reduce((acc,f)=>{ const mc=(f.stats.p1.missCountByColor)||{}; for(const k in mc) acc[k]=(acc[k]||0)+mc[k]; return acc; }, {red:0,yellow:0,green:0,brown:0,blue:0,pink:0,black:0}),
    p0SafetyShots: cf.reduce((s,f)=>s+(f.stats.p0.safetyShots||0),0),
    p1SafetyShots: cf.reduce((s,f)=>s+(f.stats.p1.safetyShots||0),0),
    frames:   cf,
  };

  state.matchHistory.unshift(record);
  persistHistory();

  // Take the player straight to the history page (full stats)
  showHistory();
}

function confirmAbandon(){
  showConfirm('Abandon match?\nProgress will not be saved.', 'Abandon', () => showSetup());
}

// ─── History ──────────────────────────────────────────────────────────────────

function renderHistory(){
  const list = el('history-list');
  if(!state.matchHistory.length){
    list.innerHTML = '<div class="history-empty">No matches yet.</div>';
    return;
  }
  list.innerHTML = state.matchHistory.map((m,i) => {
    const w0 = m.winner === 0, w1 = m.winner === 1;
    const total = m.p0Frames + m.p1Frames;
    const frames = m.frames || [];

    // Build the per-frame stats list (all expanded together)
    const frameItems = frames.map(f => {
      const p0s = (f.stats && f.stats.p0) || {};
      const p1s = (f.stats && f.stats.p1) || {};
      const winName = f.winner === 0 ? esc(m.p0Name) : esc(m.p1Name);
      return '<div class="frame-detail-item">'+
          '<div class="frame-detail-title">Frame '+f.frameNum+' &mdash; '+winName+' wins &nbsp;'+f.p0Score+'&ndash;'+f.p1Score+'</div>'+
          '<div class="frame-detail-stats">'+
            buildStatsHtml(m.p0Name, m.p1Name, p0s, p1s, f.p0Score, f.p1Score, f.p0Best, f.p1Best)+
          '</div>'+
        '</div>';
    }).join('');

    const frameBreakdown = frames.length ? '<div class="frame-breakdown">'+
      '<button class="btn-frames-toggle" onclick="toggleFrames('+i+')">&#9658; Frames ('+frames.length+')</button>'+
      '<div id="fd-'+i+'" class="frames-detail hidden">'+frameItems+'</div>'+
    '</div>' : '';

    // Aggregate pseudo-stat objects so buildStatsHtml works at match level
    const aggP0 = {
      breaks: frames.flatMap(f => (f.stats && f.stats.p0 && f.stats.p0.breaks) || []),
      highestBreak: m.p0Best||0,
      visits: m.p0Visits||0,
      scoringVisits: m.p0ScoringVisits||0,
      visitTimeMs: m.p0VisitTimeMs||0,
      potCount: m.p0PotCount||0,
      pottedByColor: m.p0PottedByColor || {},
      missCountByColor: m.p0MissCountByColor || {},
      missEasy: m.p0MissEasy||0,
      missMedium: m.p0MissMedium||0,
      missHard: m.p0MissHard||0,
      safetyShots: m.p0SafetyShots||0,
      fouls: m.p0Fouls||0,
      redsPotsCount: m.p0RedsPotted||0,
    };
    const aggP1 = {
      breaks: frames.flatMap(f => (f.stats && f.stats.p1 && f.stats.p1.breaks) || []),
      highestBreak: m.p1Best||0,
      visits: m.p1Visits||0,
      scoringVisits: m.p1ScoringVisits||0,
      visitTimeMs: m.p1VisitTimeMs||0,
      potCount: m.p1PotCount||0,
      pottedByColor: m.p1PottedByColor || {},
      missCountByColor: m.p1MissCountByColor || {},
      missEasy: m.p1MissEasy||0,
      missMedium: m.p1MissMedium||0,
      missHard: m.p1MissHard||0,
      safetyShots: m.p1SafetyShots||0,
      fouls: m.p1Fouls||0,
      redsPotsCount: m.p1RedsPotted||0,
    };

    return '<div class="history-card" id="hcard-'+i+'">'+
      '<div class="card-date">'+m.date+' '+m.time+' &middot; '+total+' frame'+(total!==1?'s':'')+'</div>'+
      '<div class="card-result">'+
        '<span class="card-player p1 '+(w0?'winner':'')+'">'+esc(m.p0Name)+'</span>'+
        '<span class="card-score">'+m.p0Frames+'&thinsp;–&thinsp;'+m.p1Frames+'</span>'+
        '<span class="card-player p2 '+(w1?'winner':'')+'">'+esc(m.p1Name)+'</span>'+
      '</div>'+
      buildStatsHtml(m.p0Name, m.p1Name, aggP0, aggP1, m.p0Total||0, m.p1Total||0, m.p0Best||0, m.p1Best||0) +
      frameBreakdown+
    '</div>';
  }).join('');
}

function toggleFrames(i){
  const d = el('fd-'+i);
  const b = el('hcard-'+i).querySelector('.btn-frames-toggle');
  if(!d) return;
  const h = d.classList.toggle('hidden');
  b.innerHTML = (h ? '&#9658;' : '&#9660;') + ' Frames (' + (d.children.length) + ')';
}

function toggleFrameDetail(key){
  const d = el('fdi-'+key);
  if(!d) return;
  const btn = d.previousElementSibling;
  const nowHidden = d.classList.toggle('hidden');
  if(btn) btn.classList.toggle('open', !nowHidden);
}

// ─── Frame correction ─────────────────────────────────────────────────────────

function showCorrectPanel(){
  if(!el('correct-panel').classList.contains('hidden')){
    hideCorrectPanel();
    return;
  }
  cancelMissPicker();
  hideFoulPanel();
  const cp = state.currentPlayer;
  el('corr-cur-name').textContent  = state.players[cp].name + ' score:';
  el('corr-cur-score').textContent = state.players[cp].score;
  el('corr-reds').textContent      = state.redsRemaining;
  el('correct-panel').classList.remove('hidden');
}
function hideCorrectPanel(){ const cp=el('correct-panel'); if(cp) cp.classList.add('hidden'); }

function applyCorrection(type){
  const p  = state.players;
  const cp = state.currentPlayer;
  let desc = '';
  // Snapshot BEFORE so corrections can be undone
  const snap = snapshot();
  if(type === 'add-red' && state.redsRemaining < 15){
    state.redsRemaining++;
    el('corr-reds').textContent = state.redsRemaining;
    desc = 'Added 1 red (' + state.redsRemaining + ' on table)';
  } else if(type === 'remove-red' && state.redsRemaining > 0){
    state.redsRemaining--;
    el('corr-reds').textContent = state.redsRemaining;
    desc = 'Removed 1 red (' + state.redsRemaining + ' on table)';
  } else if(type === 'add-pt'){
    p[cp].score++;
    el('corr-cur-score').textContent = p[cp].score;
    desc = '+1 pt to ' + p[cp].name + ' (now ' + p[cp].score + ')';
  } else if(type === 'remove-pt' && p[cp].score > 0){
    p[cp].score = Math.max(0, p[cp].score - 1);
    el('corr-cur-score').textContent = p[cp].score;
    desc = '-1 pt from ' + p[cp].name + ' (now ' + p[cp].score + ')';
  }
  if(!desc) return; // no-op (e.g. tried to remove past 0)
  state.undoStack.push(snap);
  addLog('correction', 'Correction', desc, undefined);
  // update score display live without closing panel
  el('p1-score').textContent = p[0].score;
  el('p2-score').textContent = p[1].score;
  el('pts-remaining').textContent = ptsLeft() + ' pts left';
  el('phase-label').textContent = phaseDesc();
  renderFrameLog();
}

function confirmClearHistory(){
  if(!state.matchHistory.length) return;
  showConfirm('Clear all history?', 'Clear', () => { state.matchHistory=[]; persistHistory(); renderHistory(); });
}

function persistHistory(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state.matchHistory)); }catch(_){}
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

let _confirmCallback = null;

function showConfirm(msg, label, cb){
  const old = el('tb2'); if(old) old.remove();
  el('confirm-message').textContent = msg;
  el('confirm-yes-btn').textContent = label || 'OK';
  _confirmCallback = cb;
  el('confirm-dialog').classList.remove('hidden');
}
function hideConfirm(){
  const old = el('tb2'); if(old) old.remove();
  el('confirm-dialog').classList.add('hidden');
  _confirmCallback = null;
}
el('confirm-yes-btn').addEventListener('click', () => {
  const cb = _confirmCallback; hideConfirm(); if(cb) cb();
});

// ─── Utils ────────────────────────────────────────────────────────────────────

function el(id){ return document.getElementById(id); }
function ballById(id){ return BALLS.find(b => b.id === id); }
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Fuzz / abuse test ────────────────────────────────────────────────────────
// Open browser console and run: fuzzTest()  or  fuzzTest(2000)
// Simulates random button-bashing and validates state invariants.
window.fuzzTest = function(iterations){
  iterations = iterations || 1000;
  // Seed match if not started
  if(!el('screen-game').classList.contains('active')){
    el('player1-name').value = 'Fuzz1';
    el('player2-name').value = 'Fuzz2';
    startMatch();
  }
  const fails = [];
  const check = (cond, msg, ctx) => { if(!cond) fails.push({ msg, ctx, iter: i }); };

  const actions = [
    () => { const b = BALLS[Math.floor(Math.random()*BALLS.length)]; potBall(b); return 'pot ' + b.id; },
    () => { endBreak(); return 'endBreak'; },
    () => { const d = ['easy','medium','hard'][Math.floor(Math.random()*3)]; selectMissDifficulty(d); return 'miss ' + d; },
    () => { const v = 4 + Math.floor(Math.random()*4); applyFoul(v); return 'foul ' + v; },
    () => { showFoulPanel(); return 'toggleFoul'; },
    () => { showCorrectPanel(); return 'toggleCorrect'; },
    () => { const t = ['add-red','remove-red','add-pt','remove-pt'][Math.floor(Math.random()*4)]; applyCorrection(t); return 'corr ' + t; },
    () => { switchPlayer(); return 'switch'; },
    () => { undoLastBall(); return 'undo'; },
  ];
  let i = 0;
  for(i=0; i<iterations; i++){
    let action = 'unknown';
    try {
      action = actions[Math.floor(Math.random()*actions.length)]();
    } catch(e){
      fails.push({ msg: 'EXCEPTION: ' + e.message, ctx: action, iter: i });
      break;
    }
    // Invariants
    check(state.players[0].score >= 0, 'P0 score negative', state.players[0].score);
    check(state.players[1].score >= 0, 'P1 score negative', state.players[1].score);
    check(state.redsRemaining >= 0 && state.redsRemaining <= 15, 'redsRemaining out of range', state.redsRemaining);
    check(['red','color','sequence'].includes(state.awaiting), 'invalid awaiting', state.awaiting);
    check(state.colorSeqIdx >= 0 && state.colorSeqIdx <= COLOR_SEQ.length, 'colorSeqIdx out of range', state.colorSeqIdx);
    check([0,1].includes(state.currentPlayer), 'invalid currentPlayer', state.currentPlayer);
    check(!Number.isNaN(state.players[0].score) && !Number.isNaN(state.players[1].score), 'NaN score', null);
    // pottedByColor matches potCount
    for(const sk of ['p0','p1']){
      const fs = state.frameStats[sk];
      const sum = Object.values(fs.pottedByColor||{}).reduce((a,b)=>a+b,0);
      check(sum === fs.potCount, 'pottedByColor sum != potCount for '+sk, { sum, potCount: fs.potCount });
      check(fs.visitTimeMs >= 0, 'visitTimeMs negative for '+sk, fs.visitTimeMs);
      check(fs.visits >= fs.scoringVisits, 'scoringVisits > visits for '+sk, fs);
    }
    if(fails.length > 5) break;
    // Reset frame if completed (overlay shown) so loop continues
    if(!el('frame-summary-overlay').classList.contains('hidden')){
      startNextFrame();
    }
  }
  // Cleanup pending timers
  cancelMissPicker();
  hideFoulPanel();
  hideCorrectPanel();
  if(!el('confirm-dialog').classList.contains('hidden')) hideConfirm();
  console.log('Fuzz test complete after ' + i + ' iterations.');
  if(fails.length){
    console.error('FAILURES (' + fails.length + '):');
    fails.forEach(f => console.error('  iter ' + f.iter + ': ' + f.msg, f.ctx));
  } else {
    console.log('%c\u2713 All invariants held', 'color:lime;font-weight:bold');
  }
  return { iterations: i, fails };
};
