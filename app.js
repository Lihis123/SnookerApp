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
  // Per-frame stats accumulator
  frameStats: {
    p0:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, potCount:0, visitTimeMs:0 },
    p1:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, potCount:0, visitTimeMs:0 },
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
}

function resetFrameState(){
  state.redsRemaining = 15;
  state.awaiting      = 'red';
  state.colorSeqIdx   = 0;
  state.undoStack     = [];
  state.frameLog      = [];
  state.visitScore    = 0;
  state.players[0].score = 0; state.players[0].currentBreak = 0;
  state.players[1].score = 0; state.players[1].currentBreak = 0;
  state.frameStats = {
    p0:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, potCount:0, visitTimeMs:0 },
    p1:{ totalPotted:0, highestBreak:0, breaks:[], fouls:0, redsPotsCount:0, visits:0, scoringVisits:0, missEasy:0, missMedium:0, missHard:0, potCount:0, visitTimeMs:0 },
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
  el('p1-score').textContent    = p[0].score;
  el('p2-score').textContent    = p[1].score;
  el('p1-break').textContent    = p[0].currentBreak;
  el('p2-break').textContent    = p[1].currentBreak;
  el('p1-best').textContent     = p[0].bestBreak;
  el('p2-best').textContent     = p[1].bestBreak;
  el('pts-remaining').textContent = ptsLeft() + ' pts left';

  el('player-0-panel').classList.toggle('active-player', cp === 0);
  el('player-1-panel').classList.toggle('active-player', cp === 1);
  el('current-player-label').textContent = p[cp].name + "'s turn";
  el('phase-label').textContent = phaseDesc();

  renderBalls();
  renderFrameLog();
}

function ptsLeft(){
  if(state.awaiting === 'sequence'){
    let s=0;
    for(let i=state.colorSeqIdx;i<COLOR_SEQ.length;i++) s += ballById(COLOR_SEQ[i]).value;
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
        gb.innerHTML = '<span class="ball-name">' + ball.name + '</span><span class="ball-pts">' + ball.value + '</span>';
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
    btn.innerHTML = '<span class="ball-name">' + ball.name + '</span><span class="ball-pts">' + ball.value + '</span>';
    if(on) btn.addEventListener('click', () => potBall(ball));
    c.appendChild(btn);
  });
}

function isBallOn(id){
  if(state.awaiting === 'red')      return id === 'red';
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
    else if(e.type === 'correction') cls += ' log-correction';
    return '<div class="' + cls + '">' +
      '<span class="log-who">' + esc(e.player) + '</span> ' +
      '<span class="log-desc">' + esc(e.desc) + '</span>' +
      (e.pts !== undefined ? '<span class="log-pts">+' + e.pts + '</span>' : '') +
    '</div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function addLog(type, player, desc, pts){
  state.frameLog.push({ type, player, desc, pts });
}

// ─── Potting ──────────────────────────────────────────────────────────────────

function potBall(ball){
  // Guard against stale click events (e.g. rapid double-clicks)
  if(!isBallOn(ball.id)) return;

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
  if(ball.id === 'red') state.frameStats[sk].redsPotsCount++;

  addLog('pot', pl.name, 'potted ' + ball.name, ball.value);

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
    if(state.colorSeqIdx >= COLOR_SEQ.length){
      // Last ball potted — frame over
      renderGame();
      endFrameAutomatically();
      return;
    }
  }

  renderGame();
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

function undoLastBall(){
  if(!state.undoStack.length) return;
  restoreSnapshot(state.undoStack.pop());
  if(state.frameLog.length) state.frameLog.pop();
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
    frameStats: {
      p0:{...state.frameStats.p0, breaks:[...state.frameStats.p0.breaks]},
      p1:{...state.frameStats.p1, breaks:[...state.frameStats.p1.breaks]},
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
  state.frameStats = {
    p0:{...s.frameStats.p0, breaks:[...s.frameStats.p0.breaks]},
    p1:{...s.frameStats.p1, breaks:[...s.frameStats.p1.breaks]},
  };
}

// ─── Visit / break management ─────────────────────────────────────────────────

let _missTimer = null;
let _missCountdownInterval = null;

function endBreak(){
  // Show miss difficulty picker for 10 seconds
  commitVisit();
  const cp   = state.currentPlayer;
  const name = state.players[cp].name;

  // Pre-commit the visit so stats are right, then show picker
  showMissPicker(cp, name);
}

function showMissPicker(cp, name){
  const panel  = el('miss-picker');
  const label  = el('miss-who-label');
  const countdown = el('miss-countdown');
  label.textContent = name + ' missed — how difficult?';
  panel.classList.remove('hidden');

  let secs = 5;
  countdown.textContent = secs + 's';

  _missCountdownInterval = setInterval(() => {
    secs--;
    countdown.textContent = secs + 's';
    if(secs <= 0){
      clearInterval(_missCountdownInterval);
      _missCountdownInterval = null;
    }
  }, 1000);

  _missTimer = setTimeout(() => {
    _missTimer = null;
    commitMiss(cp, 'unknown');
  }, 5000);
}

function selectMissDifficulty(difficulty){
  if(_missTimer)             { clearTimeout(_missTimer); _missTimer = null; }
  if(_missCountdownInterval) { clearInterval(_missCountdownInterval); _missCountdownInterval = null; }
  const cp = state.currentPlayer;
  commitMiss(cp, difficulty);
}

function commitMiss(cp, difficulty){
  el('miss-picker').classList.add('hidden');
  const sk = cp === 0 ? 'p0' : 'p1';
  const diffLabel = { easy:'Easy miss', medium:'Medium miss', hard:'Hard miss', unknown:'Miss' };

  if(difficulty === 'easy')   state.frameStats[sk].missEasy++;
  else if(difficulty === 'medium') state.frameStats[sk].missMedium++;
  else if(difficulty === 'hard')   state.frameStats[sk].missHard++;

  const label = diffLabel[difficulty] || 'Miss';
  addLog('miss', state.players[cp].name, label, undefined);

  state.players[cp].currentBreak = 0;
  if(state.awaiting === 'color'){
    if(state.redsRemaining === 0){ state.awaiting = 'sequence'; state.colorSeqIdx = 0; }
    else state.awaiting = 'red';
  }
  state.currentPlayer = 1 - cp;
  state.players[state.currentPlayer].currentBreak = 0;
  state.visitScore = 0;
  state.undoStack  = [];
  state._visitStartMs = Date.now();
  renderGame();
}

function switchPlayer(){
  commitVisit();
  const cp = state.currentPlayer;
  state.players[cp].currentBreak = 0;
  state.currentPlayer = 1 - cp;
  state.players[state.currentPlayer].currentBreak = 0;
  state.visitScore = 0;
  state.undoStack  = [];
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

function showFoulPanel(){ el('foul-panel').classList.remove('hidden'); }
function hideFoulPanel() { el('foul-panel').classList.add('hidden'); }

function applyFoul(value){
  hideFoulPanel();
  const cp  = state.currentPlayer;
  const opp = 1 - cp;
  const sk  = cp === 0 ? 'p0' : 'p1';
  const osk = cp === 0 ? 'p1' : 'p0';

  commitVisit();

  state.players[opp].score += value;
  state.frameStats[sk].fouls++;
  addLog('foul', state.players[cp].name, 'foul — ' + value + ' pts awarded to ' + state.players[opp].name, undefined);

  state.players[cp].currentBreak = 0;
  state.currentPlayer = opp;
  state.players[opp].currentBreak = 0;
  state.visitScore = 0;
  if(state.awaiting === 'color'){
    if(state.redsRemaining === 0){ state.awaiting = 'sequence'; state.colorSeqIdx = 0; }
    else state.awaiting = 'red';
  }
  state.undoStack = [];
  state._visitStartMs = Date.now();
  renderGame();
}

// ─── Frame ending ─────────────────────────────────────────────────────────────

function endFrameAutomatically(){ resolveFrame(); }

function confirmEndFrame(){
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

function showFrameSummary(f){
  const p  = state.players;
  const ov = el('frame-summary-overlay');

  el('fs-title').textContent = 'Frame ' + f.frameNum + ' — ' + p[f.winner].name + ' wins!';
  el('fs-score').textContent = f.p0Score + ' – ' + f.p1Score;
  el('fs-frames').textContent = 'Frames: ' + p[0].frames + ' – ' + p[1].frames;

  const p0s = f.stats.p0, p1s = f.stats.p1;
  const avgB = sk => { const bs = f.stats[sk].breaks; return bs.length ? Math.round(bs.reduce((a,b)=>a+b,0)/bs.length) : 0; };
  const sp0 = p0s.visits > 0 ? Math.round((p0s.scoringVisits||0) / p0s.visits * 100) : 0;
  const sp1 = p1s.visits > 0 ? Math.round((p1s.scoringVisits||0) / p1s.visits * 100) : 0;
  const fsr = (v0, v1, lbl, loWins) => {
    const n0 = parseFloat(v0), n1 = parseFloat(v1);
    const w0c = !loWins ? (n0 > n1 ? ' sr-win' : '') : (n0 < n1 ? ' sr-win' : '');
    const w1c = !loWins ? (n1 > n0 ? ' sr-win' : '') : (n1 < n0 ? ' sr-win' : '');
    return '<div class="stat-row"><span class="sr-val'+w0c+'">'+v0+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+v1+'</span></div>';
  };
  const p0Pots = p0s.potCount || 0, p1Pots = p1s.potCount || 0;
  const mRow = (n0, n1, t0, t1, lbl) => {
    const fmt = (n, t) => t > 0 ? n + ' (' + Math.round(n * 100 / t) + '%)' : String(n);
    const w0c = n0 < n1 ? ' sr-win' : '';
    const w1c = n1 < n0 ? ' sr-win' : '';
    return '<div class="stat-row"><span class="sr-val'+w0c+'">'+fmt(n0,t0)+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+fmt(n1,t1)+'</span></div>';
  };

  el('fs-stats').innerHTML =
    '<div class="card-names-row"><span>' + esc(p[0].name) + '</span><span></span><span>' + esc(p[1].name) + '</span></div>' +
    '<div class="card-stats">' +
    fsr(f.p0Score, f.p1Score, 'Total points') +
    fsr(f.p0Best || p0s.highestBreak || 0, f.p1Best || p1s.highestBreak || 0, 'Best break') +
    fsr(avgB('p0'), avgB('p1'), 'Avg break') +
    fsr(p0s.breaks.filter(b=>b>=100).length, p1s.breaks.filter(b=>b>=100).length, '100+ breaks') +
    fsr(p0s.breaks.filter(b=>b>=50&&b<100).length, p1s.breaks.filter(b=>b>=50&&b<100).length, '50+ breaks') +
    fsr((p0s.visits||0) + ' (' + fmtTime(p0s.visitTimeMs||0) + ')', (p1s.visits||0) + ' (' + fmtTime(p1s.visitTimeMs||0) + ')', 'Visits') +
    fsr(sp0+'%', sp1+'%', 'Scoring visit %') +
    fsr(p0s.redsPotsCount||0, p1s.redsPotsCount||0, 'Reds potted') +
    fsr(p0Pots, p1Pots, 'Total shots') +
    fsr(p0s.fouls, p1s.fouls, 'Fouls', true) +
    mRow(p0s.missEasy||0, p1s.missEasy||0, p0Pots, p1Pots, 'Easy misses') +
    mRow(p0s.missMedium||0, p1s.missMedium||0, p0Pots, p1Pots, 'Medium misses') +
    mRow(p0s.missHard||0, p1s.missHard||0, p0Pots, p1Pots, 'Hard misses') +
    '</div>';

  ov.classList.remove('hidden');
}

function startNextFrame(){
  el('frame-summary-overlay').classList.add('hidden');
  const nextBreaker = state.completedFrames.length % 2 === 0 ? 0 : 1;
  state.currentPlayer = nextBreaker;
  resetFrameState();
  renderGame();
}

function endMatchFromSummary(){
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

    // Build per-frame expandable blocks
    const frameBreakdown = (() => {
      const frames = m.frames || [];
      if(!frames.length) return '';
      const fsr2 = (v0,v1,lbl,loWins) => {
        const n0=parseFloat(v0),n1=parseFloat(v1);
        const w0c=!loWins?(n0>n1?' sr-win':''):(n0<n1?' sr-win':'');
        const w1c=!loWins?(n1>n0?' sr-win':''):(n1<n0?' sr-win':'');
        return '<div class="stat-row"><span class="sr-val'+w0c+'">'+v0+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+v1+'</span></div>';
      };
      const items = frames.map((f,fi) => {
        const fw0 = f.winner === 0;
        const winName = fw0 ? esc(m.p0Name) : esc(m.p1Name);
        const p0s = (f.stats && f.stats.p0) || {};
        const p1s = (f.stats && f.stats.p1) || {};
        const p0b = p0s.breaks || [], p1b = p1s.breaks || [];
        const avgB = bs => bs.length ? Math.round(bs.reduce((a,b)=>a+b,0)/bs.length) : 0;
        const sp0 = p0s.visits > 0 ? Math.round((p0s.scoringVisits||0)/p0s.visits*100) : 0;
        const sp1 = p1s.visits > 0 ? Math.round((p1s.scoringVisits||0)/p1s.visits*100) : 0;
        const fp0Pots = p0s.potCount||0, fp1Pots = p1s.potCount||0;
        const mRow2 = (n0, n1, t0, t1, lbl) => {
          const fmt = (n, t) => t > 0 ? n + ' (' + Math.round(n*100/t) + '%)' : String(n);
          const w0c = n0 < n1 ? ' sr-win' : '';
          const w1c = n1 < n0 ? ' sr-win' : '';
          return '<div class="stat-row"><span class="sr-val'+w0c+'">'+fmt(n0,t0)+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+fmt(n1,t1)+'</span></div>';
        };
        const key = i+'-'+fi;
        const statsHtml =
          '<div class="card-names-row"><span>'+esc(m.p0Name)+'</span><span></span><span>'+esc(m.p1Name)+'</span></div>'+
          '<div class="card-stats">'+
          fsr2(f.p0Score,f.p1Score,'Total points')+
          fsr2(f.p0Best||p0s.highestBreak||0,f.p1Best||p1s.highestBreak||0,'Best break')+
          fsr2(avgB(p0b),avgB(p1b),'Avg break')+
          fsr2(p0b.filter(b=>b>=100).length,p1b.filter(b=>b>=100).length,'100+ breaks')+
          fsr2(p0b.filter(b=>b>=50&&b<100).length,p1b.filter(b=>b>=50&&b<100).length,'50+ breaks')+
          fsr2((p0s.visits||0)+' ('+fmtTime(p0s.visitTimeMs||0)+')',(p1s.visits||0)+' ('+fmtTime(p1s.visitTimeMs||0)+')','Visits')+
          fsr2(sp0+'%',sp1+'%','Scoring visit %')+
          fsr2(p0s.redsPotsCount||0,p1s.redsPotsCount||0,'Reds potted')+
          fsr2(fp0Pots,fp1Pots,'Total shots')+
          fsr2(p0s.fouls||0,p1s.fouls||0,'Fouls',true)+
          mRow2(p0s.missEasy||0,p1s.missEasy||0,fp0Pots,fp1Pots,'Easy misses')+
          mRow2(p0s.missMedium||0,p1s.missMedium||0,fp0Pots,fp1Pots,'Medium misses')+
          mRow2(p0s.missHard||0,p1s.missHard||0,fp0Pots,fp1Pots,'Hard misses')+
          '</div>';
        return '<div class="frame-detail-item">'+
          '<button class="btn-frame-detail" onclick="toggleFrameDetail(\''+key+'\')">'+
            'Frame '+f.frameNum+' &mdash; '+winName+' wins &nbsp;'+f.p0Score+'&ndash;'+f.p1Score+
          '</button>'+
          '<div id="fdi-'+key+'" class="frame-detail-stats hidden">'+statsHtml+'</div>'+
        '</div>';
      }).join('');
      return '<div class="frame-breakdown">'+
        '<button class="btn-frames-toggle" onclick="toggleFrames('+i+')">&#9658; Frames ('+frames.length+')</button>'+
        '<div id="fd-'+i+'" class="frames-detail hidden">'+items+'</div>'+
      '</div>';
    })();

    const sr = (v0,v1,lbl,loWins) => {
      const w0c = !loWins ? (v0>v1?' sr-win':'') : (v0<v1?' sr-win':'');
      const w1c = !loWins ? (v1>v0?' sr-win':'') : (v1<v0?' sr-win':'');
      return '<div class="stat-row">'+
        '<span class="sr-val'+w0c+'">'+v0+'</span>'+
        '<span class="sr-lbl">'+lbl+'</span>'+
        '<span class="sr-val'+w1c+'">'+v1+'</span>'+
      '</div>';
    };
    const mRowSr = (n0, n1, t0, t1, lbl) => {
      const fmt = (n, t) => t > 0 ? n + ' (' + Math.round(n*100/t) + '%)' : String(n);
      const w0c = n0 < n1 ? ' sr-win' : '';
      const w1c = n1 < n0 ? ' sr-win' : '';
      return '<div class="stat-row"><span class="sr-val'+w0c+'">'+fmt(n0,t0)+'</span><span class="sr-lbl">'+lbl+'</span><span class="sr-val'+w1c+'">'+fmt(n1,t1)+'</span></div>';
    };

    return '<div class="history-card" id="hcard-'+i+'">'+
      '<div class="card-date">'+m.date+' '+m.time+' &middot; '+total+' frame'+(total!==1?'s':'')+'</div>'+
      '<div class="card-result">'+
        '<span class="card-player p1 '+(w0?'winner':'')+'">'+esc(m.p0Name)+'</span>'+
        '<span class="card-score">'+m.p0Frames+'&thinsp;–&thinsp;'+m.p1Frames+'</span>'+
        '<span class="card-player p2 '+(w1?'winner':'')+'">'+esc(m.p1Name)+'</span>'+
      '</div>'+
      '<div class="card-names-row"><span>'+esc(m.p0Name)+'</span><span></span><span>'+esc(m.p1Name)+'</span></div>'+
      '<div class="card-stats">'+
        sr(m.p0Total||0, m.p1Total||0, 'Total points')+
        sr(m.p0Best||0,  m.p1Best||0,  'Best break')+
        sr(m.p0Avg||0,   m.p1Avg||0,   'Avg break')+
        sr(m.p0Centuries||0, m.p1Centuries||0, '100+ breaks')+
        sr(m.p0Fifties||0,   m.p1Fifties||0,   '50+ breaks')+
        sr((m.p0Visits||0)+' ('+fmtTime(m.p0VisitTimeMs||0)+')', (m.p1Visits||0)+' ('+fmtTime(m.p1VisitTimeMs||0)+')', 'Visits')+
        sr(((m.p0Visits||0)>0?Math.round((m.p0ScoringVisits||0)*100/(m.p0Visits||1))+'%':'0%'), ((m.p1Visits||0)>0?Math.round((m.p1ScoringVisits||0)*100/(m.p1Visits||1))+'%':'0%'), 'Scoring visit %')+
        sr(m.p0RedsPotted||0, m.p1RedsPotted||0, 'Reds potted')+
        sr(m.p0PotCount||0, m.p1PotCount||0, 'Total shots')+
        sr(m.p0Fouls||0, m.p1Fouls||0, 'Fouls', true)+
        mRowSr(m.p0MissEasy||0, m.p1MissEasy||0, m.p0PotCount||0, m.p1PotCount||0, 'Easy misses')+
        mRowSr(m.p0MissMedium||0, m.p1MissMedium||0, m.p0PotCount||0, m.p1PotCount||0, 'Medium misses')+
        mRowSr(m.p0MissHard||0, m.p1MissHard||0, m.p0PotCount||0, m.p1PotCount||0, 'Hard misses')+
      '</div>'+
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
  const cp = state.currentPlayer;
  el('corr-cur-name').textContent  = state.players[cp].name + ' score:';
  el('corr-cur-score').textContent = state.players[cp].score;
  el('corr-reds').textContent      = state.redsRemaining;
  el('correct-panel').classList.remove('hidden');
}
function hideCorrectPanel(){ el('correct-panel').classList.add('hidden'); }

function applyCorrection(type){
  const p  = state.players;
  const cp = state.currentPlayer;
  let desc = '';
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
  } else if(type === 'remove-pt'){
    p[cp].score = Math.max(0, p[cp].score - 1);
    el('corr-cur-score').textContent = p[cp].score;
    desc = '-1 pt from ' + p[cp].name + ' (now ' + p[cp].score + ')';
  }
  if(desc) addLog('correction', 'Correction', desc, undefined);
  // update score display live without closing panel
  const scoreElId = cp === 0 ? 'p1-score' : 'p2-score';
  el(scoreElId).textContent = p[cp].score;
  el('pts-remaining').textContent = ptsLeft() + ' pts left';
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
