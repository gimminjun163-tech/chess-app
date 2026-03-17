import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CHESS LOGIC
// ============================================================
const PIECES = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

const INIT_BOARD = () => {
  const b = Array(8).fill(null).map(() => Array(8).fill(null));
  const order = ["R","N","B","Q","K","B","N","R"];
  order.forEach((p,i) => { b[0][i] = "b"+p; b[7][i] = "w"+p; });
  for (let i=0;i<8;i++) { b[1][i]="bP"; b[6][i]="wP"; }
  return b;
};

function inBounds(r,c){return r>=0&&r<8&&c>=0&&c<8;}
function color(p){return p?p[0]:null;}
function enemy(p,side){return p&&color(p)!==side;}

function getLegalMoves(board, r, c, lastMove, castleRights) {
  const piece = board[r][c];
  if (!piece) return [];
  const side = color(piece);
  const type = piece[1];
  const moves = [];
  const opp = side==="w"?"b":"w";

  const push = (nr,nc,extra={}) => {
    if (!inBounds(nr,nc)) return;
    const t = board[nr][nc];
    if (t && color(t)===side) return;
    moves.push({from:[r,c],to:[nr,nc],...extra});
  };

  const slide = (dirs) => {
    for (const [dr,dc] of dirs) {
      let nr=r+dr,nc=c+dc;
      while(inBounds(nr,nc)){
        const t=board[nr][nc];
        if(t&&color(t)===side) break;
        moves.push({from:[r,c],to:[nr,nc]});
        if(t) break;
        nr+=dr; nc+=dc;
      }
    }
  };

  if(type==="R") slide([[1,0],[-1,0],[0,1],[0,-1]]);
  else if(type==="B") slide([[1,1],[1,-1],[-1,1],[-1,-1]]);
  else if(type==="Q") slide([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
  else if(type==="N") {
    for(const [dr,dc] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]])
      push(r+dr,c+dc);
  }
  else if(type==="K") {
    for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]])
      push(r+dr,c+dc);
    // Castling
    const homeRow = side==="w"?7:0;
    if(r===homeRow&&c===4) {
      if(castleRights[side].kingSide &&
         !board[homeRow][5]&&!board[homeRow][6]&&board[homeRow][7]===side+"R") {
        moves.push({from:[r,c],to:[homeRow,6],castle:"k"});
      }
      if(castleRights[side].queenSide &&
         !board[homeRow][3]&&!board[homeRow][2]&&!board[homeRow][1]&&board[homeRow][0]===side+"R") {
        moves.push({from:[r,c],to:[homeRow,2],castle:"q"});
      }
    }
  }
  else if(type==="P") {
    const dir = side==="w"?-1:1;
    const startRow = side==="w"?6:1;
    const promRow = side==="w"?0:7;
    // Forward
    if(inBounds(r+dir,c)&&!board[r+dir][c]) {
      const prom = r+dir===promRow;
      moves.push({from:[r,c],to:[r+dir,c],...(prom?{promote:true}:{})});
      if(r===startRow&&!board[r+dir*2][c])
        moves.push({from:[r,c],to:[r+dir*2,c],doublePush:true});
    }
    // Captures
    for(const dc of [-1,1]) {
      const nr=r+dir,nc=c+dc;
      if(!inBounds(nr,nc)) continue;
      const prom = nr===promRow;
      if(board[nr][nc]&&color(board[nr][nc])===opp)
        moves.push({from:[r,c],to:[nr,nc],...(prom?{promote:true}:{})});
      // En passant
      if(lastMove&&lastMove.doublePush&&lastMove.to[0]===r&&lastMove.to[1]===nc)
        moves.push({from:[r,c],to:[nr,nc],enPassant:true});
    }
  }
  return moves;
}

function applyMove(board, move, promPiece="Q") {
  const nb = board.map(r=>[...r]);
  const [fr,fc]=move.from,[tr,tc]=move.to;
  const piece = nb[fr][fc];
  const side = color(piece);
  nb[tr][tc]=piece;
  nb[fr][fc]=null;
  if(move.castle==="k"){nb[tr][tc-1]=side+"R";nb[tr][7]=null;}
  if(move.castle==="q"){nb[tr][tc+1]=side+"R";nb[tr][0]=null;}
  if(move.enPassant){nb[fr][tc]=null;}
  if(move.promote){nb[tr][tc]=side+promPiece;}
  return nb;
}

function isInCheck(board, side) {
  let kr=-1,kc=-1;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++)
    if(board[r][c]===side+"K"){kr=r;kc=c;}
  if(kr<0) return true;
  const opp=side==="w"?"b":"w";
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    if(color(board[r][c])!==opp) continue;
    const ms=getLegalMoves(board,r,c,null,{w:{kingSide:false,queenSide:false},b:{kingSide:false,queenSide:false}});
    if(ms.some(m=>m.to[0]===kr&&m.to[1]===kc)) return true;
  }
  return false;
}

function getValidMoves(board, r, c, lastMove, castleRights) {
  const piece = board[r][c];
  if(!piece) return [];
  const side = color(piece);
  const pseudo = getLegalMoves(board,r,c,lastMove,castleRights);
  return pseudo.filter(m=>{
    const nb=applyMove(board,m);
    if(isInCheck(nb,side)) return false;
    if(m.castle) {
      // Cannot castle if king passes through an attacked square
      const midC = m.castle==="k"?5:3;
      const nb2=applyMove(board,{from:m.from,to:[m.from[0],midC]});
      if(isInCheck(nb2,side)) return false;
    }
    return true;
  });
}

function getAllValidMoves(board, side, lastMove, castleRights) {
  const all=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++)
    if(color(board[r][c])===side)
      all.push(...getValidMoves(board,r,c,lastMove,castleRights));
  return all;
}

function updateCastleRights(rights, board, move) {
  const nr = JSON.parse(JSON.stringify(rights));
  const piece = board[move.from[0]][move.from[1]];
  if(!piece) return nr;
  const s = color(piece);
  if(piece[1]==="K"){nr[s].kingSide=false;nr[s].queenSide=false;}
  if(piece[1]==="R"){
    if(move.from[1]===7) nr[s].kingSide=false;
    if(move.from[1]===0) nr[s].queenSide=false;
  }
  return nr;
}

// ============================================================
// AI — Minimax + Alpha-Beta + Learned Evaluation Weights
// ============================================================

// Piece-square tables (기본값, 학습으로 조정됨)
const PST_BASE = {
  P: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [ 5,  5, 10, 25, 25, 10,  5,  5],
    [ 0,  0,  0, 20, 20,  0,  0,  0],
    [ 5, -5,-10,  0,  0,-10, -5,  5],
    [ 5, 10, 10,-20,-20, 10, 10,  5],
    [ 0,  0,  0,  0,  0,  0,  0,  0],
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  R: [
    [ 0,  0,  0,  0,  0,  0,  0,  0],
    [ 5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [ 0,  0,  0,  5,  5,  0,  0,  0],
  ],
  Q: [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [ -5,  0,  5,  5,  5,  5,  0, -5],
    [  0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20],
  ],
  K: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [ 20, 20,  0,  0,  0,  0, 20, 20],
    [ 20, 30, 10,  0,  0, 10, 30, 20],
  ],
};

const BASE_PIECE_VAL = { P:100, N:320, B:330, R:500, Q:900, K:20000 };

// ============================================================
// Q-TABLE AI
// ============================================================
function boardToKey(board, side) {
  return board.map(r=>r.map(c=>c||".").join("")).join("|")+side;
}
function moveToKey(m) {
  return `${m.from[0]}${m.from[1]}${m.to[0]}${m.to[1]}${m.castle||""}${m.promote||""}`;
}
function evalMaterial(board, side) {
  const vals = {P:1,N:3,B:3,R:5,Q:9,K:0};
  let score=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c]; if(!p) continue;
    score += color(p)===side ? (vals[p[1]]||0) : -(vals[p[1]]||0);
  }
  return score;
}

class QTableAI {
  constructor(name) {
    this.name = name;
    this.type = "qtable";
    this.trainCount = 0;
    this.qtable = {};
    this.epsilon = 0.3;
    this.alpha = 0.1;
    this.gamma = 0.9;
    this.depth = 0; // unused, for compat
  }
  getQ(state, mkey) {
    if(!this.qtable[state]) return 0;
    return this.qtable[state][mkey]||0;
  }
  setQ(state, mkey, val) {
    if(!this.qtable[state]) this.qtable[state]={};
    this.qtable[state][mkey]=val;
  }
  chooseMove(board, side, lastMove, castleRights, explore=true) {
    const moves = getAllValidMoves(board, side, lastMove, castleRights);
    if(!moves.length) return null;
    const state = boardToKey(board, side);
    if(explore && Math.random()<this.epsilon)
      return moves[Math.floor(Math.random()*moves.length)];
    let best=null, bestQ=-Infinity;
    for(const m of moves) {
      const q=this.getQ(state,moveToKey(m));
      if(q>bestQ){bestQ=q;best=m;}
    }
    return best||moves[Math.floor(Math.random()*moves.length)];
  }
  learnFromGame(winner, history) {
    history.forEach(({state,mkey,s,nextState,nextMoves,immediate})=>{
      const oldQ = this.getQ(state, mkey);
      let maxNext = 0;
      if(nextMoves&&nextMoves.length)
        maxNext = Math.max(...nextMoves.map(m=>this.getQ(nextState,moveToKey(m))));
      let reward = immediate*0.1;
      if(winner===s) reward+=10;
      else if(winner&&winner!==s) reward-=10;
      const newQ = oldQ + this.alpha*(reward + this.gamma*maxNext - oldQ);
      this.setQ(state, mkey, newQ);
    });
    this.trainCount++;
  }
  serialize() {
    const keys = Object.keys(this.qtable);
    const trimmed = {};
    keys.slice(-2000).forEach(k=>{trimmed[k]=this.qtable[k];});
    return { name:this.name, type:"qtable", trainCount:this.trainCount, qtable:trimmed, epsilon:this.epsilon };
  }
  static deserialize(data) {
    const ai = new QTableAI(data.name);
    ai.trainCount = data.trainCount||0;
    ai.qtable = data.qtable||{};
    if(data.epsilon) ai.epsilon = data.epsilon;
    return ai;
  }
}

function playGameQTable(ai, maxMoves=200) {
  let board = INIT_BOARD(), side="w", lastMove=null;
  let castleRights = {w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}};
  const history = [];
  for(let i=0;i<maxMoves;i++) {
    const moves = getAllValidMoves(board, side, lastMove, castleRights);
    if(!moves.length) {
      const inCheck = isInCheck(board, side);
      const winner = inCheck ? (side==="w"?"b":"w") : null;
      ai.learnFromGame(winner, history);
      return winner;
    }
    const state = boardToKey(board, side);
    const move = ai.chooseMove(board, side, lastMove, castleRights, true);
    if(!move) break;
    const mkey = moveToKey(move);
    const nb = applyMove(board, move);
    const newCR = updateCastleRights(castleRights, board, move);
    const opp = side==="w"?"b":"w";
    const oppMoves = getAllValidMoves(nb, opp, move, newCR);
    const nextState = boardToKey(nb, opp);
    const immediate = evalMaterial(nb, side) - evalMaterial(board, side);
    history.push({state,mkey,s:side,nextState,nextMoves:oppMoves,immediate});
    lastMove=move; board=nb; castleRights=newCR; side=opp;
  }
  ai.learnFromGame(null, history);
  return null;
}


class ChessAI {
  constructor(name) {
    this.name = name;
    this.type = "minimax";
    this.trainCount = 0;
    // 학습 가중치: 각 기물 가치 보정 (BASE에 더해짐)
    this.weights = {
      pieceBonus: { P:0, N:0, B:0, R:0, Q:0 },  // 기물 가치 보정
      pstScale: 1.0,        // piece-square table 스케일
      mobilityWeight: 0.1,  // 기동성 가중치
      centerControl: 0.1,   // 중앙 통제 가중치
    };
    this.depth = 3; // Minimax 탐색 깊이 (학습으로 조정 안 함)
    // TD-Learning용 경기 기록
    this._gameHistory = [];
  }

  // ── 평가 함수 ──
  evaluate(board, side) {
    const opp = side === "w" ? "b" : "w";
    let score = 0;
    let mobility = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const ps = color(p);
        const pt = p[1];
        const baseVal = BASE_PIECE_VAL[pt] + (this.weights.pieceBonus[pt] || 0);

        // PST: 흑은 행을 뒤집어서 적용
        const pstRow = ps === "w" ? r : 7 - r;
        const pstVal = PST_BASE[pt] ? PST_BASE[pt][pstRow][c] * this.weights.pstScale : 0;

        const sign = ps === side ? 1 : -1;
        score += sign * (baseVal + pstVal);

        // 기동성
        if (pt !== "K") {
          const moves = getLegalMoves(board, r, c, null,
            {w:{kingSide:false,queenSide:false}, b:{kingSide:false,queenSide:false}});
          mobility += sign * moves.length * this.weights.mobilityWeight * 10;
        }

        // 중앙 통제 보너스 (d4,d5,e4,e5)
        if (r >= 3 && r <= 4 && c >= 3 && c <= 4) {
          score += sign * this.weights.centerControl * 20;
        }
      }
    }
    return score + mobility;
  }

  // ── Minimax + Alpha-Beta ──
  minimax(board, depth, alpha, beta, maximizing, side, lastMove, castleRights) {
    const moves = getAllValidMoves(board, side, lastMove, castleRights);

    if (depth === 0 || !moves.length) {
      if (!moves.length) {
        if (isInCheck(board, side)) {
          return maximizing ? -999999 : 999999;
        }
        return 0; // 스테일메이트
      }
      return this.evaluate(board, maximizing ? side : (side === "w" ? "b" : "w"));
    }

    // Move ordering: 캡처 먼저
    const sorted = moves.slice().sort((a, b) => {
      const av = board[a.to[0]][a.to[1]] ? BASE_PIECE_VAL[board[a.to[0]][a.to[1]][1]] || 0 : 0;
      const bv = board[b.to[0]][b.to[1]] ? BASE_PIECE_VAL[board[b.to[0]][b.to[1]][1]] || 0 : 0;
      return bv - av;
    });

    const opp = side === "w" ? "b" : "w";

    if (maximizing) {
      let maxEval = -Infinity;
      for (const m of sorted) {
        const nb = applyMove(board, m);
        const newCR = updateCastleRights(castleRights, board, m);
        const ev = this.minimax(nb, depth - 1, alpha, beta, false, opp, m, newCR);
        if (ev > maxEval) maxEval = ev;
        if (ev > alpha) alpha = ev;
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of sorted) {
        const nb = applyMove(board, m);
        const newCR = updateCastleRights(castleRights, board, m);
        const ev = this.minimax(nb, depth - 1, alpha, beta, true, opp, m, newCR);
        if (ev < minEval) minEval = ev;
        if (ev < beta) beta = ev;
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  // ── 최선의 수 선택 ──
  chooseMove(board, side, lastMove, castleRights, explore = false) {
    const moves = getAllValidMoves(board, side, lastMove, castleRights);
    if (!moves.length) return null;

    // 탐색(학습 중 랜덤 탐색)
    if (explore && Math.random() < 0.15) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    const opp = side === "w" ? "b" : "w";
    let bestMove = null;
    let bestVal = -Infinity;

    const sorted = moves.slice().sort((a, b) => {
      const av = board[a.to[0]][a.to[1]] ? BASE_PIECE_VAL[board[a.to[0]][a.to[1]][1]] || 0 : 0;
      const bv = board[b.to[0]][b.to[1]] ? BASE_PIECE_VAL[board[b.to[0]][b.to[1]][1]] || 0 : 0;
      return bv - av;
    });

    for (const m of sorted) {
      const nb = applyMove(board, m);
      const newCR = updateCastleRights(castleRights, board, m);
      const val = this.minimax(nb, this.depth - 1, -Infinity, Infinity, false, opp, m, newCR);
      if (val > bestVal) { bestVal = val; bestMove = m; }
    }
    return bestMove || moves[0];
  }

  // ── TD학습: 게임 결과로 가중치 업데이트 ──
  recordPosition(board, side) {
    this._gameHistory.push({ score: this.evaluate(board, side), side });
  }

  learnFromGame(winner) {
    // 게임 결과에 따라 가중치 미세 조정
    const lr = 0.005;
    const reward = winner === "w" ? 1 : winner === "b" ? -1 : 0;

    // 이긴 쪽이 중시한 요소를 강화
    if (Math.abs(reward) > 0) {
      // 기물 가치 소폭 조정 (클리핑으로 발산 방지)
      const keys = ["P","N","B","R","Q"];
      for (const k of keys) {
        const delta = lr * reward * (Math.random() - 0.45); // 약간의 노이즈
        this.weights.pieceBonus[k] = Math.max(-50, Math.min(50,
          this.weights.pieceBonus[k] + delta * BASE_PIECE_VAL[k] * 0.01));
      }
      this.weights.pstScale = Math.max(0.5, Math.min(2.0,
        this.weights.pstScale + lr * reward * 0.1));
      this.weights.mobilityWeight = Math.max(0, Math.min(0.5,
        this.weights.mobilityWeight + lr * reward * 0.05));
      this.weights.centerControl = Math.max(0, Math.min(0.5,
        this.weights.centerControl + lr * reward * 0.05));
    }

    this._gameHistory = [];
    this.trainCount++;
  }

  serialize() {
    return {
      name: this.name,
      type: "minimax",
      trainCount: this.trainCount,
      weights: this.weights,
      depth: this.depth,
    };
  }

  static deserialize(data) {
    const ai = new ChessAI(data.name);
    ai.trainCount = data.trainCount || 0;
    if (data.weights) ai.weights = data.weights;
    if (data.depth) ai.depth = data.depth;
    return ai;
  }
}

// ── 빠른 학습용 셀프플레이 ──
function playGame(ai, maxMoves = 160) {
  if(ai.type==="qtable") return playGameQTable(ai, maxMoves);
  let board = INIT_BOARD();
  let side = "w";
  let lastMove = null;
  let castleRights = { w:{kingSide:true,queenSide:true}, b:{kingSide:true,queenSide:true} };

  for (let i = 0; i < maxMoves; i++) {
    const moves = getAllValidMoves(board, side, lastMove, castleRights);
    if (!moves.length) {
      const inCheck = isInCheck(board, side);
      const winner = inCheck ? (side === "w" ? "b" : "w") : null;
      ai.learnFromGame(winner);
      return winner;
    }
    const move = ai.chooseMove(board, side, lastMove, castleRights, true);
    if (!move) break;
    const nb = applyMove(board, move);
    castleRights = updateCastleRights(castleRights, board, move);
    lastMove = move;
    board = nb;
    side = side === "w" ? "b" : "w";
  }
  ai.learnFromGame(null);
  return null;
}

// ============================================================
// WORKER FACTORY
// ============================================================
function createTrainWorker() {
  const worker = new Worker('/chess-worker.js');
  return worker;
}


// ============================================================
// SUPABASE
// ============================================================
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function supaFetch(path, opts={}) {
  const headers = { "Content-Type":"application/json", "apikey":SUPA_KEY, "Authorization":"Bearer "+supaToken(), ...opts.headers };
  const res = await fetch(SUPA_URL+path, {...opts, headers});
  if(!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.message||res.statusText); }
  return res.json().catch(()=>null);
}
function supaToken() { return _supaToken||SUPA_KEY; }
let _supaToken = null;
let _supaUser = null;

async function authSignUp(email, password, username) {
  const r = await fetch(SUPA_URL+"/auth/v1/signup", {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
    body: JSON.stringify({email, password, options:{data:{username}}})
  });
  const d = await r.json();
  if(d.error) throw new Error(d.error.message||d.error);
  return d;
}

async function authSignIn(email, password) {
  const r = await fetch(SUPA_URL+"/auth/v1/token?grant_type=password", {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
    body: JSON.stringify({email, password})
  });
  const d = await r.json();
  if(d.error) throw new Error(d.error.message||d.error);
  _supaToken = d.access_token;
  _supaUser = d.user;
  return d;
}

async function authSignOut() {
  await fetch(SUPA_URL+"/auth/v1/logout", {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":"Bearer "+_supaToken}
  }).catch(()=>{});
  _supaToken = null; _supaUser = null;
  localStorage.removeItem("chess_session");
}

async function restoreSession() {
  try {
    const s = JSON.parse(localStorage.getItem("chess_session")||"null");
    if(!s) return null;
    // refresh token
    const r = await fetch(SUPA_URL+"/auth/v1/token?grant_type=refresh_token", {
      method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
      body: JSON.stringify({refresh_token: s.refresh_token})
    });
    const d = await r.json();
    if(d.error) { localStorage.removeItem("chess_session"); return null; }
    _supaToken = d.access_token;
    _supaUser = d.user;
    localStorage.setItem("chess_session", JSON.stringify({refresh_token: d.refresh_token}));
    return d.user;
  } catch { return null; }
}

async function saveSession(data) {
  localStorage.setItem("chess_session", JSON.stringify({refresh_token: data.refresh_token}));
}

async function getProfile(userId) {
  const d = await supaFetch(`/rest/v1/profiles?id=eq.${userId}&select=*`);
  return d?.[0]||null;
}

async function getLeaderboard() {
  return supaFetch(`/rest/v1/profiles?select=username,rating,wins,losses,draws&order=rating.desc&limit=20`);
}

// Bot CRUD via Supabase
async function loadBotsFromDB(userId) {
  try {
    const rows = await supaFetch(`/rest/v1/bots?user_id=eq.${userId}&select=*`);
    const result = {};
    for(const row of rows||[]) {
      const ai = row.type==="qtable" ? QTableAI.deserialize({...row.data, name:row.name, type:"qtable", trainCount:row.train_count})
        : ChessAI.deserialize({...row.data, name:row.name, type:"minimax", trainCount:row.train_count});
      ai._dbId = row.id;
      result[row.name] = ai;
    }
    return result;
  } catch(e) { console.error("loadBotsFromDB", e); return {}; }
}

async function saveBotToDB(userId, ai) {
  const body = {
    user_id: userId,
    name: ai.name,
    type: ai.type,
    train_count: ai.trainCount,
    data: ai.serialize(),
    updated_at: new Date().toISOString(),
  };
  if(ai._dbId) {
    await supaFetch(`/rest/v1/bots?id=eq.${ai._dbId}`, {method:"PATCH", body:JSON.stringify(body)});
  } else {
    const rows = await supaFetch(`/rest/v1/bots`, {method:"POST", headers:{"Prefer":"return=representation"}, body:JSON.stringify(body)});
    if(rows?.[0]) ai._dbId = rows[0].id;
  }
}

// Rating calculation (Elo)
function calcElo(ratingA, ratingB, resultA) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(K * (resultA - expected));
}

// Online room helpers
async function createRoom(userId, mode, code=null) {
  const body = { white_id: userId, status:"waiting", mode, board: INIT_BOARD(), turn:"w",
    castle_rights:{w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}},
    ...(code?{code}:{}) };
  const rows = await supaFetch(`/rest/v1/rooms`, {method:"POST", headers:{"Prefer":"return=representation"}, body:JSON.stringify(body)});
  return rows?.[0];
}

async function joinRoom(roomId, userId) {
  await supaFetch(`/rest/v1/rooms?id=eq.${roomId}`, {method:"PATCH",
    body:JSON.stringify({black_id:userId, status:"playing", updated_at:new Date().toISOString()})});
}

async function findWaitingRoom(userId) {
  const rows = await supaFetch(`/rest/v1/rooms?status=eq.waiting&mode=eq.random&white_id=neq.${userId}&select=*&limit=1`);
  return rows?.[0]||null;
}

async function pollRoom(roomId) {
  const rows = await supaFetch(`/rest/v1/rooms?id=eq.${roomId}&select=*`);
  return rows?.[0]||null;
}

async function pushMove(roomId, board, turn, lastMove, castleRights, result=null, winnerId=null, whiteChange=0, blackChange=0) {
  const body = { board, turn, last_move:lastMove, castle_rights:castleRights, updated_at:new Date().toISOString(),
    ...(result?{result, status:"finished", winner_id:winnerId, white_rating_change:whiteChange, black_rating_change:blackChange}:{}) };
  await supaFetch(`/rest/v1/rooms?id=eq.${roomId}`, {method:"PATCH", body:JSON.stringify(body)});
}

async function updateRating(userId, delta) {
  const profile = await getProfile(userId);
  if(!profile) return;
  const newRating = Math.max(100, profile.rating + delta);
  const update = {rating: newRating, updated_at: new Date().toISOString()};
  if(delta > 0) update.wins = (profile.wins||0)+1;
  else if(delta < 0) update.losses = (profile.losses||0)+1;
  else update.draws = (profile.draws||0)+1;
  await supaFetch(`/rest/v1/profiles?id=eq.${userId}`, {method:"PATCH", body:JSON.stringify(update)});
}

// ============================================================
// STORAGE (localStorage for offline / demo)
// ============================================================
const STORAGE_KEY = "chess_ai_bots";

function loadBotsLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"); //
    return Object.fromEntries(Object.entries(d).map(([k,v])=>{
      if(v.type==="qtable") return [k, QTableAI.deserialize(v)];
      return [k, ChessAI.deserialize(v)];
    }));
  } catch(e) { return {}; }
}

function saveBotsLocal(bots) {
  try {
    const d = Object.fromEntries(Object.entries(bots).map(([k,v])=>[k,v.serialize()]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch(e) { alert("저장 실패: " + e.message); }
}

// ============================================================
// BOARD THEMES
// ============================================================
const THEMES = {
  wood: {
    name:"목재", light:"#f0d9b5", dark:"#b58863", border:"#3d2208",
    lastLight:"#cdd26a", lastDark:"#aaa23a", sel:"#f6f669",
    labelColor:"#c9a96e", texture: "wood"
  },
  plastic: {
    name:"플라스틱", light:"#eeeeee", dark:"#3d85c8", border:"#1a4a7a",
    lastLight:"#a8d8f0", lastDark:"#2a6099", sel:"#ffff88",
    labelColor:"#aaccee", texture: "plastic"
  },
  neon: {
    name:"형광", light:"#1a1a2e", dark:"#16213e", border:"#0f3460",
    lastLight:"#00ff8844", lastDark:"#00cc6644", sel:"#ff006644",
    labelColor:"#00ff88", texture: "neon"
  },
  chessdotcom: {
    name:"체스닷컴", light:"#eeeed2", dark:"#769656", border:"#4a6741",
    lastLight:"#f6f669", lastDark:"#baca2b", sel:"#f6f669",
    labelColor:"#769656", texture: "chessdotcom"
  },
};

// ============================================================
// PIECE VALUES (for captured pieces display)
// ============================================================
const PIECE_VAL_DISPLAY = {P:1, N:3, B:3, R:5, Q:9, K:0};

function getCaptured(board) {
  const init = {P:8,N:2,B:2,R:2,Q:1,K:1};
  const onBoard = {wP:0,wN:0,wB:0,wR:0,wQ:0,wK:0,bP:0,bN:0,bB:0,bR:0,bQ:0,bK:0};
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]) onBoard[board[r][c]]=(onBoard[board[r][c]]||0)+1;
  const capturedByWhite = []; // black pieces captured (shown by white)
  const capturedByBlack = []; // white pieces captured (shown by black)
  for(const t of ["P","N","B","R","Q"]) {
    const wMissing = init[t] - (onBoard["w"+t]||0);
    const bMissing = init[t] - (onBoard["b"+t]||0);
    for(let i=0;i<bMissing;i++) capturedByWhite.push("b"+t);
    for(let i=0;i<wMissing;i++) capturedByBlack.push("w"+t);
  }
  return {capturedByWhite, capturedByBlack};
}

function getMaterialScore(capturedByWhite, capturedByBlack) {
  const sum = arr => arr.reduce((s,p)=>s+(PIECE_VAL_DISPLAY[p[1]]||0),0);
  return sum(capturedByWhite) - sum(capturedByBlack);
}

// ============================================================
// BOARD COMPONENT
// ============================================================
function ChessBoard({ board, selected, highlights, onSquareClick, lastMoveSq, animPiece, theme="wood", flipped=false }) {
  const t = THEMES[theme]||THEMES.wood;
  const files = flipped?["h","g","f","e","d","c","b","a"]:["a","b","c","d","e","f","g","h"];
  const ranks = flipped?["1","2","3","4","5","6","7","8"]:["8","7","6","5","4","3","2","1"];
  const displayBoard = flipped ? [...board].reverse().map(r=>[...r].reverse()) : board;

  const isNeon = theme==="neon";

  return (
    <div style={{
      display:"inline-block",
      border:`6px solid ${t.border}`,
      borderRadius:4,
      boxShadow: isNeon
        ? `0 0 30px ${t.labelColor}44, 0 8px 40px #0009`
        : "0 8px 40px #0009, 0 2px 8px #0006",
      background:t.border,
    }}>
      <div style={{display:"grid",gridTemplateColumns:"20px repeat(8,60px)",gridTemplateRows:"repeat(8,60px) 20px"}}>
        {ranks.map((rank,ri)=>(
          <div key={rank} style={{gridColumn:1,gridRow:ri+1,display:"flex",alignItems:"center",justifyContent:"center",
            color:t.labelColor,fontSize:11,fontFamily:"Georgia,serif",fontWeight:"bold"}}>{rank}</div>
        ))}
        {files.map((file,fi)=>(
          <div key={file} style={{gridColumn:fi+2,gridRow:9,display:"flex",alignItems:"center",justifyContent:"center",
            color:t.labelColor,fontSize:11,fontFamily:"Georgia,serif",fontWeight:"bold"}}>{file}</div>
        ))}
        {displayBoard.map((row,ri)=>row.map((piece,ci)=>{
          const actualR = flipped?7-ri:ri;
          const actualC = flipped?7-ci:ci;
          const isLight=(ri+ci)%2===0;
          const isSel=selected&&selected[0]===actualR&&selected[1]===actualC;
          const isHl=highlights.some(h=>h[0]===actualR&&h[1]===actualC);
          const isLast=lastMoveSq&&lastMoveSq.some(s=>s[0]===actualR&&s[1]===actualC);
          const isAnimTarget=animPiece&&animPiece.to[0]===actualR&&animPiece.to[1]===actualC;

          let bg = isLight?t.light:t.dark;
          if(isLast) bg = isLight?t.lastLight:t.lastDark;
          if(isSel) bg = t.sel;
          if(isHl&&!isSel) bg = isLight?t.lastLight+"aa":t.lastDark+"aa";

          return (
            <div key={`${ri}-${ci}`} style={{
              gridColumn:ci+2,gridRow:ri+1,width:60,height:60,background:bg,
              cursor:isHl||piece?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",
              position:"relative",transition:"background 0.15s",userSelect:"none",
              ...(isNeon&&piece?{boxShadow:`inset 0 0 8px ${t.labelColor}22`}:{})
            }} onClick={()=>onSquareClick(actualR,actualC)}>
              {isHl&&!piece&&(
                <div style={{width:20,height:20,borderRadius:"50%",
                  background:isNeon?`${t.labelColor}44`:"rgba(0,0,0,0.18)",
                  border:isNeon?`2px solid ${t.labelColor}88`:"none",
                  pointerEvents:"none"}}/>
              )}
              {isHl&&piece&&(
                <div style={{position:"absolute",inset:0,
                  border:isNeon?`3px solid ${t.labelColor}88`:"4px solid rgba(0,0,0,0.25)",
                  borderRadius:"50%",boxSizing:"border-box",pointerEvents:"none"}}/>
              )}
              {piece&&(
                <span style={{fontSize:40,lineHeight:1,
                  filter:isNeon
                    ? `drop-shadow(0 0 6px ${piece[0]==="w"?"#fff":"#88f"}) drop-shadow(0 1px 2px #000c)`
                    : "drop-shadow(0 1px 2px #0008)",
                  animation:isAnimTarget?"pieceSlide 0.25s ease-out":"none",
                  display:"block",zIndex:2,
                }}>
                  {PIECES[piece]}
                </span>
              )}
            </div>
          );
        }))}
      </div>
      <style>{`@keyframes pieceSlide{from{transform:scale(1.15);opacity:0.7}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

// ============================================================
// CAPTURED PIECES BAR
// ============================================================
function CapturedBar({ pieces, score, side, label }) {
  const sorted = [...pieces].sort((a,b)=>(PIECE_VAL_DISPLAY[b[1]]||0)-(PIECE_VAL_DISPLAY[a[1]]||0));
  const myScore = side==="w"?Math.max(0,score):Math.max(0,-score);
  return (
    <div style={{display:"flex",alignItems:"center",gap:6,minHeight:28,padding:"4px 0"}}>
      <span style={{color:"#7c6040",fontSize:12,minWidth:60,fontFamily:"Georgia,serif"}}>{label}</span>
      <div style={{display:"flex",flexWrap:"wrap",gap:1,flex:1}}>
        {sorted.map((p,i)=>(
          <span key={i} style={{fontSize:18,lineHeight:1,filter:"drop-shadow(0 1px 1px #0006)"}}>{PIECES[p]}</span>
        ))}
      </div>
      {myScore>0&&<span style={{color:"#c9a96e",fontSize:13,fontWeight:"bold",minWidth:24}}>+{myScore}</span>}
    </div>
  );
}

// ============================================================
// PAWN PROMOTION DIALOG
// ============================================================
function PromotionDialog({ side, onChoose, theme="wood" }) {
  const pieces = ["Q","R","B","N"];
  return (
    <div style={{
      position:"fixed",inset:0,background:"#000a",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000
    }}>
      <div style={{
        background:"#1a0e06",border:"2px solid #c9a96e",borderRadius:12,
        padding:"24px 32px",textAlign:"center",boxShadow:"0 0 60px #0009"
      }}>
        <p style={{color:"#c9a96e",fontSize:16,marginBottom:16,fontFamily:"Georgia,serif"}}>폰 승진 — 기물 선택</p>
        <div style={{display:"flex",gap:12}}>
          {pieces.map(p=>(
            <button key={p} onClick={()=>onChoose(p)} style={{
              width:64,height:64,fontSize:40,background:"#2d1a0a",border:"2px solid #7c4a1e",
              borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#c9a96e"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#7c4a1e"}
            >
              {PIECES[side+p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AUTH SCREENS
// ============================================================
function AuthScreen({ onLogin, onDemo }) {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setError(""); setLoading(true);
    try {
      if(isSignup) {
        if(!username.trim()) throw new Error("닉네임을 입력하세요");
        const data = await authSignUp(email, password, username.trim());
        if(data.user) {
          // auto sign in after signup
          const loginData = await authSignIn(email, password);
          await saveSession(loginData);
          onLogin(loginData.user);
        } else {
          setError("이메일 확인 후 로그인하세요");
        }
      } else {
        const data = await authSignIn(email, password);
        await saveSession(data);
        onLogin(data.user);
      }
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06 0%,#2d1a0a 50%,#1a0e06 100%)",
      fontFamily:"Georgia,serif"
    }}>
      <div style={{
        padding:"48px 56px",background:"linear-gradient(145deg,#2d1a0a,#1a0e06)",
        border:"2px solid #7c4a1e",borderRadius:12,
        boxShadow:"0 0 60px #0009, inset 0 0 40px #00000060",
        width:"90%",maxWidth:440,textAlign:"center"
      }}>
        <div style={{fontSize:56,marginBottom:8}}>♟</div>
        <h1 style={{color:"#c9a96e",fontSize:32,margin:"0 0 4px",letterSpacing:3}}>CHESS AI</h1>
        <p style={{color:"#7c6040",fontSize:13,marginBottom:32,letterSpacing:1}}>
          {isSignup?"새 계정 만들기":"로그인"}
        </p>

        {isSignup&&(
          <input value={username} onChange={e=>setUsername(e.target.value)}
            placeholder="닉네임"
            style={inputStyle}/>
        )}
        <input value={email} onChange={e=>setEmail(e.target.value)}
          placeholder="이메일" type="email"
          onKeyDown={e=>e.key==="Enter"&&handle()}
          style={inputStyle}/>
        <input value={password} onChange={e=>setPassword(e.target.value)}
          placeholder="비밀번호" type="password"
          onKeyDown={e=>e.key==="Enter"&&handle()}
          style={{...inputStyle,marginBottom:8}}/>

        {error&&<p style={{color:"#e07070",fontSize:13,marginBottom:12}}>{error}</p>}

        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <button onClick={handle} disabled={loading}
            style={{...btnStyle("#7c4a1e","#c9a96e"),flex:2,opacity:loading?0.6:1}}>
            {loading?"...":(isSignup?"회원가입":"로그인")}
          </button>
          {!isSignup&&(
            <button onClick={onDemo} style={{...btnStyle("#2d1a0a","#7c6040"),flex:1,fontSize:13}}>
              데모 계정
            </button>
          )}
        </div>

        <button onClick={()=>{setIsSignup(!isSignup);setError("");}}
          style={{background:"none",border:"none",color:"#7c6040",cursor:"pointer",fontSize:13,textDecoration:"underline"}}>
          {isSignup?"이미 계정이 있으신가요? 로그인":"계정이 없으신가요? 회원가입"}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width:"100%",padding:"12px 16px",background:"#2d1a0a",border:"1px solid #7c4a1e",
  borderRadius:6,color:"#c9a96e",fontSize:15,fontFamily:"Georgia,serif",
  boxSizing:"border-box",outline:"none",marginBottom:12,display:"block"
};

function btnStyle(bg,fg) {
  return {
    padding:"13px 24px",background:bg,color:fg,
    border:`1px solid ${fg}44`,borderRadius:6,
    fontSize:15,fontFamily:"Georgia,serif",cursor:"pointer",
    letterSpacing:1,transition:"all 0.2s",boxShadow:"0 2px 8px #0004",
  };
}

// ============================================================
// MAIN MENU (after login)
// ============================================================
function MainMenu({ user, profile, onAI, onPvPOffline, onPvPOnline, onLeaderboard, onLogout, theme, onThemeChange }) {
  const isDemo = user==="demo";
  const rankLabel = (r)=> r>=2000?"🏆 마스터":r>=1600?"💎 다이아몬드":r>=1400?"🥇 골드":r>=1200?"🥈 실버":"🥉 브론즈";

  return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20
    }}>
      {/* Profile Card */}
      <div style={{
        background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"24px 40px",marginBottom:20,textAlign:"center",
        boxShadow:"0 0 40px #0008",minWidth:360,maxWidth:480,width:"100%"
      }}>
        <div style={{fontSize:40,marginBottom:8}}>{isDemo?"👤":"♛"}</div>
        <h2 style={{color:"#c9a96e",margin:"0 0 4px",fontSize:22,letterSpacing:1}}>
          {isDemo?"데모 계정":profile?.username||"로딩 중..."}
        </h2>
        {!isDemo&&profile&&(
          <>
            <div style={{color:"#c9a96e",fontSize:18,fontWeight:"bold",marginBottom:4}}>
              {rankLabel(profile.rating)} {profile.rating}점
            </div>
            <div style={{color:"#7c6040",fontSize:13}}>
              {profile.wins}승 {profile.losses}패 {profile.draws}무
            </div>
          </>
        )}
        {isDemo&&<div style={{color:"#7c6040",fontSize:13}}>순위 없음 · 오프라인 전용</div>}

        {/* Theme selector */}
        <div style={{marginTop:16,display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          {Object.entries(THEMES).map(([key,t])=>(
            <button key={key} onClick={()=>onThemeChange(key)}
              style={{
                padding:"6px 12px",fontSize:12,
                background:theme===key?"#7c4a1e":"#2d1a0a",
                color:theme===key?"#c9a96e":"#7c6040",
                border:`1px solid ${theme===key?"#c9a96e":"#7c4a1e44"}`,
                borderRadius:20,cursor:"pointer",fontFamily:"Georgia,serif"
              }}>{t.name}</button>
          ))}
        </div>
      </div>

      {/* Buttons */}
      <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:360}}>
        <button onClick={onAI} style={btnStyle("#1a3a5c","#6ab4f5")}>
          🤖 AI 모드
        </button>
        <button onClick={onPvPOffline} style={btnStyle("#2d5a27","#7ec876")}>
          ♟ Player vs Player (오프라인)
        </button>
        <button onClick={()=>isDemo?alert("온라인 대전은 계정이 필요합니다.\n회원가입 후 이용하세요!"):onPvPOnline()}
          style={{...btnStyle(isDemo?"#1a1a1a":"#5a1a5c",isDemo?"#444":"#e06af5"),opacity:isDemo?0.5:1}}>
          🌐 Player vs Player (온라인){isDemo?" 🔒":""}
        </button>
        <button onClick={onLeaderboard} style={btnStyle("#3a2a0a","#c9a96e")}>
          🏆 순위표
        </button>
        <button onClick={onLogout} style={{...btnStyle("#2a1a0a","#7c6040"),fontSize:13}}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

// ============================================================
// LEADERBOARD SCREEN
// ============================================================
function LeaderboardScreen({ onBack, currentProfile }) {
  const [rows, setRows] = useState([]);
  useEffect(()=>{ getLeaderboard().then(d=>setRows(d||[])); },[]);
  const rankLabel=(r)=>r>=2000?"🏆":r>=1600?"💎":r>=1400?"🥇":r>=1200?"🥈":"🥉";
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"32px 40px",width:"100%",maxWidth:500,boxShadow:"0 0 40px #0008"}}>
        <h2 style={{color:"#c9a96e",textAlign:"center",fontSize:24,marginBottom:24,letterSpacing:2}}>🏆 순위표</h2>
        {rows.map((r,i)=>(
          <div key={i} style={{
            display:"flex",alignItems:"center",gap:12,padding:"10px 16px",marginBottom:6,
            background:r.username===currentProfile?.username?"#2d1a0a":"#1a1208",
            border:`1px solid ${r.username===currentProfile?.username?"#c9a96e":"#7c4a1e22"}`,
            borderRadius:8,color:"#c9a96e"
          }}>
            <span style={{width:28,color:"#7c6040",fontSize:14}}>{i+1}</span>
            <span style={{fontSize:16}}>{rankLabel(r.rating)}</span>
            <span style={{flex:1,fontSize:15}}>{r.username}</span>
            <span style={{fontSize:15,fontWeight:"bold"}}>{r.rating}</span>
            <span style={{color:"#7c6040",fontSize:12}}>{r.wins}W/{r.losses}L</span>
          </div>
        ))}
        {rows.length===0&&<p style={{color:"#7c6040",textAlign:"center"}}>아직 데이터가 없습니다.</p>}
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%",marginTop:16}}>← 뒤로</button>
      </div>
    </div>
  );
}

// ============================================================
// PVP OFFLINE SCREEN
// ============================================================
function PvPOfflineScreen({ onBack, theme }) {
  const [board, setBoard] = useState(INIT_BOARD());
  const [turn, setTurn] = useState("w");
  const [selected, setSelected] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [lastMoveSq, setLastMoveSq] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [castleRights, setCastleRights] = useState({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
  const [animPiece, setAnimPiece] = useState(null);
  const [status, setStatus] = useState("playing");
  const [message, setMessage] = useState("");
  const [promotion, setPromotion] = useState(null); // {move, side}
  const [flipped, setFlipped] = useState(false);

  const {capturedByWhite, capturedByBlack} = getCaptured(board);
  const score = getMaterialScore(capturedByWhite, capturedByBlack);

  const doMove = (b, move, side, cr, promPiece="Q") => {
    const nb = applyMove(b, move, promPiece);
    const newCR = updateCastleRights(cr, b, move);
    setAnimPiece({to:move.to});
    setTimeout(()=>setAnimPiece(null),300);
    setLastMoveSq([move.from, move.to]);
    setLastMove(move);
    setCastleRights(newCR);
    setBoard(nb);
    setSelected(null); setHighlights([]);
    const opp = side==="w"?"b":"w";
    setTurn(opp);
    const nextMoves = getAllValidMoves(nb, opp, move, newCR);
    if(!nextMoves.length) {
      const inChk = isInCheck(nb, opp);
      setStatus(inChk?`checkmate_${side}`:"stalemate");
      setMessage(inChk?(side==="w"?"백(White) 승리!":"흑(Black) 승리!"):"스테일메이트 (무승부)");
    }
  };

  const handleClick = (r, c) => {
    if(status!=="playing"||promotion) return;
    const b = board, cr = castleRights, lm = lastMove;
    if(selected) {
      const move = getValidMoves(b,selected[0],selected[1],lm,cr).find(m=>m.to[0]===r&&m.to[1]===c);
      if(move) {
        if(move.promote) { setPromotion({move, side:turn}); return; }
        doMove(b, move, turn, cr);
        setSelected(null); setHighlights([]); return;
      }
    }
    if(b[r][c]&&color(b[r][c])===turn) {
      setSelected([r,c]);
      setHighlights(getValidMoves(b,r,c,lm,cr).map(m=>m.to));
    } else { setSelected(null); setHighlights([]); }
  };

  const reset = () => {
    setBoard(INIT_BOARD()); setTurn("w"); setSelected(null); setHighlights([]);
    setLastMoveSq(null); setLastMove(null);
    setCastleRights({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
    setStatus("playing"); setMessage(""); setPromotion(null);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      {promotion&&<PromotionDialog side={promotion.side} theme={theme} onChoose={p=>{
        doMove(board, promotion.move, promotion.side, castleRights, p);
        setPromotion(null);
      }}/>}

      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:10,
        padding:"12px 20px",marginBottom:12,textAlign:"center",boxShadow:"0 0 30px #0007"}}>
        <span style={{color:"#c9a96e",fontSize:16}}>♟ 오프라인 대전</span>
        <span style={{color:"#7c6040",fontSize:13,marginLeft:12}}>
          {status==="playing"?(turn==="w"?"⬜ 백의 차례":"⬛ 흑의 차례"):message}
        </span>
      </div>

      {/* Captured by white (black's pieces) - shown above board */}
      <div style={{width:500,maxWidth:"95vw",marginBottom:4}}>
        <CapturedBar pieces={capturedByWhite} score={score} side="w" label={flipped?"흑":"백"} />
      </div>

      <ChessBoard board={board} selected={selected} highlights={highlights}
        onSquareClick={handleClick} lastMoveSq={lastMoveSq} animPiece={animPiece}
        theme={theme} flipped={flipped}/>

      {/* Captured by black */}
      <div style={{width:500,maxWidth:"95vw",marginTop:4}}>
        <CapturedBar pieces={capturedByBlack} score={score} side="b" label={flipped?"백":"흑"} />
      </div>

      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={onBack} style={btnStyle("#7c4a1e","#c9a96e")}>← 뒤로</button>
        <button onClick={()=>setFlipped(f=>!f)} style={btnStyle("#2d1a2a","#c06af5")}>🔄 뒤집기</button>
        {status!=="playing"&&<button onClick={reset} style={btnStyle("#2d5a27","#7ec876")}>다시 시작</button>}
      </div>
    </div>
  );
}

// ============================================================
// PVP ONLINE SCREEN
// ============================================================
function PvPOnlineScreen({ onBack, user, profile, theme }) {
  const [phase, setPhase] = useState("lobby"); // lobby|waiting|playing|result
  const [matchMode, setMatchMode] = useState(null); // random|room
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [room, setRoom] = useState(null);
  const [mySide, setMySide] = useState("w");
  const [board, setBoard] = useState(INIT_BOARD());
  const [turn, setTurn] = useState("w");
  const [selected, setSelected] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [lastMoveSq, setLastMoveSq] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [castleRights, setCastleRights] = useState({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
  const [animPiece, setAnimPiece] = useState(null);
  const [status, setStatus] = useState("playing");
  const [message, setMessage] = useState("");
  const [ratingChange, setRatingChange] = useState(null);
  const [oppProfile, setOppProfile] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const pollRef = useRef(null);
  const roomRef = useRef(null);

  const {capturedByWhite, capturedByBlack} = getCaptured(board);
  const score = getMaterialScore(capturedByWhite, capturedByBlack);

  const startPoll = useCallback((roomId) => {
    if(pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async()=>{
      try {
        const r = await pollRoom(roomId);
        if(!r) return;
        roomRef.current = r;
        if(r.status==="playing"&&phase==="waiting") setPhase("playing");
        if(r.board) setBoard(r.board);
        if(r.turn) setTurn(r.turn);
        if(r.last_move) { setLastMoveSq([r.last_move.from, r.last_move.to]); setLastMove(r.last_move); }
        if(r.castle_rights) setCastleRights(r.castle_rights);
        if(r.status==="finished") {
          clearInterval(pollRef.current);
          const myChange = mySide==="w"?r.white_rating_change:r.black_rating_change;
          setRatingChange(myChange);
          setMessage(r.winner_id===user.id?"승리! 🎉":r.winner_id?`패배 😞`:"무승부");
          setStatus("finished");
          setPhase("result");
          if(r.winner_id===user.id) await updateRating(user.id, myChange);
          else if(r.winner_id) await updateRating(user.id, myChange);
          else await updateRating(user.id, 0);
        }
      } catch(e) { console.error("poll error", e); }
    }, 1000);
  }, [phase, mySide, user.id]);

  useEffect(()=>()=>{ if(pollRef.current) clearInterval(pollRef.current); },[]);

  const startRandom = async() => {
    setMatchMode("random"); setPhase("waiting");
    try {
      const existing = await findWaitingRoom(user.id);
      if(existing) {
        await joinRoom(existing.id, user.id);
        setRoom(existing); setMySide("b");
        const opp = await getProfile(existing.white_id);
        setOppProfile(opp);
        setPhase("playing");
        startPoll(existing.id);
      } else {
        const newRoom = await createRoom(user.id, "random");
        setRoom(newRoom); setMySide("w");
        startPoll(newRoom.id);
      }
    } catch(e) { alert("매칭 실패: "+e.message); setPhase("lobby"); }
  };

  const createRoomCode = async() => {
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    try {
      const newRoom = await createRoom(user.id, "room", code);
      setRoom(newRoom); setMySide("w"); setRoomCode(code); setPhase("waiting");
      startPoll(newRoom.id);
    } catch(e) { alert("방 생성 실패: "+e.message); }
  };

  const joinByCode = async() => {
    try {
      const rows = await supaFetch(`/rest/v1/rooms?code=eq.${inputCode.toUpperCase()}&status=eq.waiting&select=*`);
      const r = rows?.[0];
      if(!r) { alert("방을 찾을 수 없습니다."); return; }
      await joinRoom(r.id, user.id);
      setRoom(r); setMySide("b");
      const opp = await getProfile(r.white_id);
      setOppProfile(opp);
      setPhase("playing");
      startPoll(r.id);
    } catch(e) { alert("참가 실패: "+e.message); }
  };

  const handleClick = async(r, c) => {
    if(status!=="playing"||turn!==mySide||promotion) return;
    const b=board, cr=castleRights, lm=lastMove;
    if(selected) {
      const move=getValidMoves(b,selected[0],selected[1],lm,cr).find(m=>m.to[0]===r&&m.to[1]===c);
      if(move) {
        if(move.promote){ setPromotion({move,side:mySide}); return; }
        await sendMove(move, "Q");
        return;
      }
    }
    if(b[r][c]&&color(b[r][c])===mySide){
      setSelected([r,c]);
      setHighlights(getValidMoves(b,r,c,lm,cr).map(m=>m.to));
    } else { setSelected(null); setHighlights([]); }
  };

  const sendMove = async(move, promPiece="Q") => {
    const b=board, cr=castleRights;
    const nb=applyMove(b,move,promPiece);
    const newCR=updateCastleRights(cr,b,move);
    const opp=mySide==="w"?"b":"w";
    setAnimPiece({to:move.to});
    setTimeout(()=>setAnimPiece(null),300);
    setLastMoveSq([move.from,move.to]);
    setLastMove(move);
    setCastleRights(newCR);
    setBoard(nb);
    setSelected(null); setHighlights([]);
    setTurn(opp);

    const nextMoves=getAllValidMoves(nb,opp,move,newCR);
    let result=null, winnerId=null, wChange=0, bChange=0;
    if(!nextMoves.length){
      const inChk=isInCheck(nb,opp);
      result=inChk?"checkmate":"stalemate";
      if(inChk){
        winnerId=user.id;
        const oppId=mySide==="w"?roomRef.current?.black_id:roomRef.current?.white_id;
        const oppProf=oppId?await getProfile(oppId):null;
        const myRating=profile?.rating||1200;
        const oppRating=oppProf?.rating||1200;
        const delta=calcElo(myRating,oppRating,1);
        if(mySide==="w"){ wChange=delta; bChange=-delta; }
        else { bChange=delta; wChange=-delta; }
      }
    }
    try {
      await pushMove(room.id,nb,opp,move,newCR,result,winnerId,wChange,bChange);
    } catch(e){ console.error("pushMove error",e); }
    setPromotion(null);
  };

  // Lobby
  if(phase==="lobby") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"32px 40px",width:"100%",maxWidth:440,boxShadow:"0 0 40px #0008",textAlign:"center"}}>
        <h2 style={{color:"#c9a96e",fontSize:22,marginBottom:4}}>🌐 온라인 대전</h2>
        <p style={{color:"#7c6040",fontSize:13,marginBottom:28}}>{profile?.username} · {profile?.rating}점</p>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
          <button onClick={startRandom} style={btnStyle("#5a1a5c","#e06af5")}>
            🎲 랜덤 매칭
          </button>
          <button onClick={createRoomCode} style={btnStyle("#1a3a5c","#6ab4f5")}>
            🏠 방 만들기
          </button>
          <div style={{display:"flex",gap:8}}>
            <input value={inputCode} onChange={e=>setInputCode(e.target.value)}
              placeholder="방 코드 입력" style={{...inputStyle,margin:0,flex:1,fontSize:13}}/>
            <button onClick={joinByCode} style={{...btnStyle("#2d5a27","#7ec876"),padding:"12px 16px",fontSize:13}}>
              참가
            </button>
          </div>
        </div>
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>← 뒤로</button>
      </div>
    </div>
  );

  // Waiting
  if(phase==="waiting") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif"}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"40px 60px",textAlign:"center",boxShadow:"0 0 40px #0008"}}>
        <div style={{fontSize:48,marginBottom:16,animation:"spin 2s linear infinite"}}>⏳</div>
        <p style={{color:"#c9a96e",fontSize:18,marginBottom:8}}>상대 대기 중...</p>
        {roomCode&&<p style={{color:"#7c6040",fontSize:14}}>방 코드: <span style={{color:"#c9a96e",fontWeight:"bold",letterSpacing:3}}>{roomCode}</span></p>}
        <button onClick={()=>{ if(pollRef.current)clearInterval(pollRef.current); setPhase("lobby"); }}
          style={{...btnStyle("#7c4a1e","#c9a96e"),marginTop:20}}>취소</button>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // Result
  if(phase==="result") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif"}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"40px 60px",textAlign:"center",boxShadow:"0 0 40px #0008",minWidth:320}}>
        <div style={{fontSize:60,marginBottom:12}}>{message.includes("승리")?"🏆":message.includes("패배")?"😞":"🤝"}</div>
        <h2 style={{color:"#c9a96e",fontSize:28,marginBottom:8}}>{message}</h2>
        {ratingChange!==null&&(
          <div style={{fontSize:20,color:ratingChange>0?"#7ec876":ratingChange<0?"#e07070":"#c9a96e",fontWeight:"bold",marginBottom:8}}>
            {ratingChange>0?"+":""}{ratingChange} 점
          </div>
        )}
        {oppProfile&&<p style={{color:"#7c6040",fontSize:14}}>상대: {oppProfile.username} ({oppProfile.rating}점)</p>}
        <div style={{display:"flex",gap:10,marginTop:24,justifyContent:"center"}}>
          <button onClick={()=>setPhase("lobby")} style={btnStyle("#1a3a5c","#6ab4f5")}>다시 매칭</button>
          <button onClick={onBack} style={btnStyle("#3d2208","#c9a96e")}>← 뒤로</button>
        </div>
      </div>
    </div>
  );

  // Playing
  const flipped = mySide==="b";
  const oppId = mySide==="w"?room?.black_id:room?.white_id;
  const myTurn = turn===mySide;

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:"20px 0"}}>
      {promotion&&<PromotionDialog side={promotion.side} theme={theme} onChoose={p=>{sendMove(promotion.move,p);setPromotion(null);}}/>}

      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:10,
        padding:"12px 24px",marginBottom:12,textAlign:"center"}}>
        <span style={{color:"#c9a96e",fontSize:15}}>
          {profile?.username}({profile?.rating}) vs {oppProfile?.username||"상대"}({oppProfile?.rating||"?"})
        </span>
        <span style={{color:myTurn?"#7ec876":"#7c6040",fontSize:13,marginLeft:12}}>
          {myTurn?"내 차례":"상대 차례"}
        </span>
      </div>

      <div style={{width:500,maxWidth:"95vw",marginBottom:4}}>
        <CapturedBar pieces={flipped?capturedByBlack:capturedByWhite} score={score}
          side={flipped?"b":"w"} label={flipped?"나":"상대"} />
      </div>

      <ChessBoard board={board} selected={selected} highlights={highlights}
        onSquareClick={handleClick} lastMoveSq={lastMoveSq} animPiece={animPiece}
        theme={theme} flipped={flipped}/>

      <div style={{width:500,maxWidth:"95vw",marginTop:4}}>
        <CapturedBar pieces={flipped?capturedByWhite:capturedByBlack} score={score}
          side={flipped?"w":"b"} label={flipped?"상대":"나"} />
      </div>

      <button onClick={()=>{ if(pollRef.current)clearInterval(pollRef.current); onBack(); }}
        style={{...btnStyle("#7c4a1e","#c9a96e"),marginTop:16}}>← 나가기</button>
    </div>
  );
}

// ============================================================
// AI MODE SCREENS
// ============================================================
// ============================================================
// SCREENS
// ============================================================

// --- Home Screen ---
function HomeScreen({ onLoad, onNew, onBack }) {
  return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06 0%,#2d1a0a 50%,#1a0e06 100%)",
      fontFamily:"Georgia,serif"
    }}>
      <div style={{
        padding:"48px 64px",
        background:"linear-gradient(145deg,#2d1a0a,#1a0e06)",
        border:"2px solid #7c4a1e",
        borderRadius:12,
        boxShadow:"0 0 60px #0009, inset 0 0 40px #00000060",
        textAlign:"center",
        maxWidth:460,width:"90%"
      }}>
        <div style={{fontSize:56,marginBottom:8}}>🤖</div>
        <h1 style={{color:"#c9a96e",fontSize:30,margin:"0 0 8px",letterSpacing:3}}>AI 모드</h1>
        <p style={{color:"#7c6040",fontSize:13,marginBottom:32,letterSpacing:1}}>강화학습 체스 엔진</p>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={onLoad} style={btnStyle("#7c4a1e","#c9a96e")}>📂 불러오기</button>
          <button onClick={onNew} style={btnStyle("#2d5a27","#7ec876")}>✨ 새로운 AI 만들기</button>
          <button onClick={onBack} style={{...btnStyle("#2a1a0a","#7c6040"),fontSize:13}}>← 메인 메뉴</button>
        </div>
      </div>
    </div>
  );
}

// --- Load Screen ---
function LoadScreen({ onBack, onSelect, bots }) {
  const names = Object.keys(bots||{});
  return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06 0%,#2d1a0a 100%)",
      fontFamily:"Georgia,serif"
    }}>
      <div style={{
        padding:"40px 60px",
        background:"#1a0e06",
        border:"2px solid #7c4a1e",
        borderRadius:12,
        boxShadow:"0 0 60px #0009",
        minWidth:360,maxWidth:500,width:"90%"
      }}>
        <h2 style={{color:"#c9a96e",fontSize:24,marginBottom:24,textAlign:"center",letterSpacing:2}}>
          AI 목록
        </h2>
        {names.length===0&&(
          <p style={{color:"#7c6040",textAlign:"center"}}>저장된 AI가 없습니다.</p>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
          {names.map(n=>(
            <div key={n} onClick={()=>onSelect(bots[n])} style={{
              padding:"14px 20px",
              background:"#2d1a0a",
              border:"1px solid #7c4a1e44",
              borderRadius:8,cursor:"pointer",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              color:"#c9a96e",
              transition:"background 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.background="#3d2a14"}
            onMouseLeave={e=>e.currentTarget.style.background="#2d1a0a"}
            >
              <span style={{fontSize:16}}>{n}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{
                  fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:"bold",letterSpacing:0.5,
                  background: bots[n].type==="qtable"?"#1a3a5c":"#3a1a5c",
                  color: bots[n].type==="qtable"?"#6ab4f5":"#c06af5",
                  border: `1px solid ${bots[n].type==="qtable"?"#6ab4f544":"#c06af544"}`
                }}>{bots[n].type==="qtable"?"Q-Table":"Minimax"}</span>
                <span style={{color:"#7c6040",fontSize:13}}>학습 {bots[n].trainCount}회</span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>
          ← 뒤로
        </button>
      </div>
    </div>
  );
}

// --- New AI Screen ---
function NewAIScreen({ onBack, onCreate }) {
  const [step, setStep] = useState("name"); // "name" | "type"
  const [name, setName] = useState("");

  const engineInfo = {
    minimax: {
      title: "Minimax + Alpha-Beta",
      color: "#c06af5",
      bg: "#3a1a5c",
      icon: "🧠",
      desc: "수 앞을 내다보며 최선의 수를 계산. 기본부터 강하고 학습으로 더 정교해짐.",
      pros: ["학습 0회부터 합리적으로 둠", "수 탐색 깊이 조절 가능", "실제 체스 전략 구사"],
    },
    qtable: {
      title: "Q-Table",
      color: "#6ab4f5",
      bg: "#1a3a5c",
      icon: "📊",
      desc: "경험을 표로 기억하며 학습. 많이 학습할수록 익숙한 국면에서 강해짐.",
      pros: ["학습 데이터가 명시적으로 쌓임", "특정 패턴에 특화 가능", "단순하고 직관적"],
    },
  };

  if(step==="name") return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",
      fontFamily:"Georgia,serif"
    }}>
      <div style={{
        padding:"40px 60px",background:"#1a0e06",
        border:"2px solid #7c4a1e",borderRadius:12,
        boxShadow:"0 0 60px #0009",minWidth:360,width:"90%",maxWidth:460
      }}>
        <h2 style={{color:"#c9a96e",fontSize:24,marginBottom:24,textAlign:"center"}}>
          새 AI 이름
        </h2>
        <input
          value={name}
          onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&setStep("type")}
          placeholder="AI 이름 입력..."
          style={{
            width:"100%",padding:"12px 16px",
            background:"#2d1a0a",border:"1px solid #7c4a1e",borderRadius:6,
            color:"#c9a96e",fontSize:16,fontFamily:"Georgia,serif",
            boxSizing:"border-box",outline:"none",marginBottom:16
          }}
          autoFocus
        />
        <div style={{display:"flex",gap:12}}>
          <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),flex:1}}>
            ← 뒤로
          </button>
          <button
            onClick={()=>name.trim()&&setStep("type")}
            disabled={!name.trim()}
            style={{...btnStyle("#2d5a27","#7ec876"),flex:1,opacity:name.trim()?1:0.5}}
          >
            다음 →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",
      fontFamily:"Georgia,serif",padding:"20px"
    }}>
      <div style={{
        padding:"40px 48px",background:"#1a0e06",
        border:"2px solid #7c4a1e",borderRadius:12,
        boxShadow:"0 0 60px #0009",width:"90%",maxWidth:560,textAlign:"center"
      }}>
        <h2 style={{color:"#c9a96e",fontSize:22,marginBottom:4}}>AI 엔진 선택</h2>
        <p style={{color:"#7c6040",fontSize:13,marginBottom:28}}>
          <span style={{color:"#c9a96e"}}>{name}</span> 의 학습 방식을 선택하세요
        </p>
        <div style={{display:"flex",gap:16,marginBottom:28}}>
          {Object.entries(engineInfo).map(([key, info])=>(
            <div key={key} onClick={()=>onCreate(name.trim(), key)}
              style={{
                flex:1,padding:"24px 16px",
                background:info.bg,
                border:`2px solid ${info.color}44`,
                borderRadius:10,cursor:"pointer",
                transition:"all 0.2s",textAlign:"left",
              }}
              onMouseEnter={e=>{e.currentTarget.style.border=`2px solid ${info.color}`;e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.border=`2px solid ${info.color}44`;e.currentTarget.style.transform="translateY(0)";}}
            >
              <div style={{fontSize:32,marginBottom:8}}>{info.icon}</div>
              <div style={{color:info.color,fontSize:13,fontWeight:"bold",marginBottom:8,letterSpacing:0.5}}>
                {info.title}
              </div>
              <div style={{color:"#9a8060",fontSize:12,marginBottom:12,lineHeight:1.6}}>
                {info.desc}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {info.pros.map((p,i)=>(
                  <div key={i} style={{color:"#7c6040",fontSize:11}}>✓ {p}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={()=>setStep("name")} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>
          ← 이름 다시 입력
        </button>
      </div>
    </div>
  );
}

// --- AI Dashboard ---
function AIDashboard({ ai, onSave, onBack, theme="wood" }) {
  const [mode, setMode] = useState(null); // "train","watch","pvp"
  const [playerSide, setPlayerSide] = useState("w");
  const [trainCount, setTrainCount] = useState(ai.trainCount);
  const [depth, setDepth] = useState(ai.depth||3);

  const updateCount = useCallback(()=>setTrainCount(ai.trainCount),[ai]);

  if(!mode) return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",
      fontFamily:"Georgia,serif"
    }}>
      <div style={{
        padding:"40px 60px",background:"#1a0e06",
        border:"2px solid #7c4a1e",borderRadius:12,
        boxShadow:"0 0 60px #0009",minWidth:380,maxWidth:520,width:"90%",textAlign:"center"
      }}>
        <h2 style={{color:"#c9a96e",fontSize:28,marginBottom:6,letterSpacing:2}}>{ai.name}</h2>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{
            fontSize:11,padding:"3px 10px",borderRadius:10,fontWeight:"bold",
            background: ai.type==="qtable"?"#1a3a5c":"#3a1a5c",
            color: ai.type==="qtable"?"#6ab4f5":"#c06af5",
            border: `1px solid ${ai.type==="qtable"?"#6ab4f566":"#c06af566"}`
          }}>{ai.type==="qtable"?"📊 Q-Table":"🧠 Minimax + Alpha-Beta"}</span>
          <span style={{color:"#7c6040",fontSize:13}}>학습 {trainCount}회</span>
        </div>
        {ai.type==="minimax"&&(
          <p style={{color:"#7c6040",fontSize:13,marginBottom:4}}>
            탐색 깊이:
            <select value={depth} onChange={e=>{const d=parseInt(e.target.value);ai.depth=d;setDepth(d);}}
              style={{marginLeft:6,background:"#2d1a0a",color:"#c9a96e",border:"1px solid #7c4a1e",
                borderRadius:4,padding:"2px 6px",fontFamily:"Georgia,serif",fontSize:13,cursor:"pointer"}}>
              <option value={2}>2 (빠름)</option>
              <option value={3}>3 (기본)</option>
              <option value={4}>4 (강함)</option>
            </select>
          </p>
        )}
        {ai.type==="minimax"&&ai.weights&&(
          <p style={{color:"#7c6040",fontSize:11,marginBottom:20}}>
            기물 보정: P{ai.weights.pieceBonus.P>0?"+":""}{ai.weights.pieceBonus.P.toFixed(1)}
            {" N"}{ai.weights.pieceBonus.N>0?"+":""}{ai.weights.pieceBonus.N.toFixed(1)}
            {" B"}{ai.weights.pieceBonus.B>0?"+":""}{ai.weights.pieceBonus.B.toFixed(1)}
            {" R"}{ai.weights.pieceBonus.R>0?"+":""}{ai.weights.pieceBonus.R.toFixed(1)}
            {" Q"}{ai.weights.pieceBonus.Q>0?"+":""}{ai.weights.pieceBonus.Q.toFixed(1)}
            {" · PST×"}{ai.weights.pstScale.toFixed(2)}
          </p>
        )}
        {ai.type==="qtable"&&(
          <p style={{color:"#7c6040",fontSize:11,marginBottom:20}}>
            Q-Table 항목 수: {Object.keys(ai.qtable||{}).length.toLocaleString()}개
            {" · "}탐색율(ε): {(ai.epsilon*100).toFixed(0)}%
          </p>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:24}}>
          <button onClick={()=>setMode("train")} style={btnStyle("#1a3a5c","#6ab4f5")}>
            ⚡ AI vs. AI (관전 X) — 빠른 학습
          </button>
          <button onClick={()=>setMode("watch")} style={btnStyle("#3a1a5c","#c06af5")}>
            👁 AI vs. AI (관전) — 관전 모드
          </button>
          <div>
            <div style={{color:"#7c6040",fontSize:13,marginBottom:8}}>Player vs. AI — AI 색상 선택</div>
            <div style={{display:"flex",gap:10,justifyContent:"center",marginBottom:10}}>
              {["w","b"].map(s=>(
                <button key={s} onClick={()=>setPlayerSide(s==="w"?"b":"w")}
                  style={{
                    ...btnStyle(playerSide===s?"#5a3a1a":"#2d1a0a","#c9a96e"),
                    flex:1, fontSize:13,
                    border:`1px solid ${playerSide===s?"#c9a96e":"#7c4a1e44"}`
                  }}>
                  {s==="w"?"AI = 백(선공)":"AI = 흑(후공)"}
                </button>
              ))}
            </div>
            <button onClick={()=>setMode("pvp")} style={btnStyle("#2d5a27","#7ec876")}>
              ♟ Player vs. AI
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{onSave(ai);}} style={{...btnStyle("#5a3a0a","#c9a96e"),flex:1}}>
            💾 저장 후 홈
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <GameScreen
      ai={ai}
      mode={mode}
      aiSide={playerSide}
      onBack={()=>{setMode(null);updateCount();}}
      onTrainUpdate={updateCount}
      theme={theme}
    />
  );
}

// ============================================================
// GAME SCREEN
// ============================================================
function GameScreen({ ai, mode, aiSide, onBack, onTrainUpdate, theme="wood" }) {
  const [board, setBoard] = useState(INIT_BOARD());
  const [turn, setTurn] = useState("w");
  const [selected, setSelected] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [lastMoveSq, setLastMoveSq] = useState(null);
  const [lastMoveRef, setLastMoveRef] = useState(null);
  const [castleRights, setCastleRights] = useState({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
  const [status, setStatus] = useState("playing");
  const [animPiece, setAnimPiece] = useState(null);
  const [trainDisplay, setTrainDisplay] = useState(ai.trainCount);
  const [running, setRunning] = useState(true);
  const [message, setMessage] = useState("");
  const stateHist = useRef([]);
  const runRef = useRef(true);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  const crRef = useRef(castleRights);
  const lmRef = useRef(null);
  const trainBatch = useRef(0);

  boardRef.current = board;
  turnRef.current = turn;
  crRef.current = castleRights;
  lmRef.current = lastMoveRef;

  // Helper: apply a move and update state
  const applyMoveState = useCallback((b, move, side, cr, lm, learn=true) => {
    const nb = applyMove(b, move);
    const newCR = updateCastleRights(cr, b, move);
    const opp = side==="w"?"b":"w";
    const oppMoves = getAllValidMoves(nb, opp, move, newCR);

    setAnimPiece({to:move.to});
    setTimeout(()=>setAnimPiece(null),300);
    setLastMoveSq([move.from, move.to]);
    setLastMoveRef(move);
    setCastleRights(newCR);
    setBoard(nb);

    const newTurn = opp;
    setTurn(newTurn);

    if(!oppMoves.length) {
      const inChk = isInCheck(nb, opp);
      const winner = inChk?side:null;
      if(learn && ai) {
        ai.learnFromGame(winner);
      }
      setStatus(winner?`checkmate_${winner}`:"stalemate");
      setMessage(winner?(winner==="w"?"백(White) 승리!":"흑(Black) 승리!"):"스테일메이트 (무승부)");
      return {nb, newCR, newTurn, ended:true};
    }
    return {nb, newCR, newTurn, ended:false};
  }, [ai]);

  // === TRAIN MODE (Web Worker — non-blocking, runs in background) ===
  useEffect(()=>{
    if(mode!=="train") return;
    const worker = createTrainWorker();

    worker.onmessage = (e) => {
      const { type, trainCount, weights, ai: aiData } = e.data;
      if (type === "progress") {
        ai.trainCount = trainCount;
        if (e.data.aiType === "qtable" && e.data.qtable) {
          ai.qtable = e.data.qtable;
        } else if (e.data.weights) {
          ai.weights = e.data.weights;
        }
        setTrainDisplay(trainCount);
        onTrainUpdate();
      }
      if (type === "done" || type === "weights") {
        if (aiData) {
          ai.trainCount = aiData.trainCount;
          if (aiData.type === "qtable") ai.qtable = aiData.qtable;
          else ai.weights = aiData.weights;
        }
        setTrainDisplay(ai.trainCount);
        onTrainUpdate();
      }
    };

    worker.postMessage({ type: "init", data: { ai: ai.serialize() } });

    return () => {
      worker.postMessage({ type: "stop" });
      // Apply final weights when stopping
      worker.onmessage = (e) => {
        if (e.data.type === "done" && e.data.ai) {
          ai.trainCount = e.data.ai.trainCount;
          if (e.data.ai.type === "qtable") ai.qtable = e.data.ai.qtable;
          else ai.weights = e.data.ai.weights;
          onTrainUpdate();
        }
        worker.terminate();
      };
      setTimeout(() => { if(worker._blobUrl) URL.revokeObjectURL(worker._blobUrl); worker.terminate(); }, 2000);
    };
  },[mode, ai, onTrainUpdate]);

  // === WATCH MODE ===
  useEffect(()=>{
    if(mode!=="watch") return;
    runRef.current=true;
    stateHist.current=[];
    let timeout;

    const doAiMove = ()=>{
      if(!runRef.current) return;
      const b=boardRef.current;
      const s=turnRef.current;
      const cr=crRef.current;
      const lm=lmRef.current;
      const moves=getAllValidMoves(b,s,lm,cr);
      if(!moves.length){
        // game over, restart
        setTimeout(()=>{
          if(!runRef.current) return;
          setBoard(INIT_BOARD());
          setTurn("w");
          setLastMoveSq(null);
          setLastMoveRef(null);
          setCastleRights({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
          setStatus("playing");
          setMessage("");
          stateHist.current=[];
          timeout=setTimeout(doAiMove,600);
        },1500);
        return;
      }
      const move=ai.chooseMove(b,s,lm,cr,true);
      if(!move) return;
      const {ended}=applyMoveState(b,move,s,cr,lm,true);
      if(ended){
        setTrainDisplay(ai.trainCount);
        onTrainUpdate();
        setTimeout(()=>{
          if(!runRef.current) return;
          setBoard(INIT_BOARD());
          setTurn("w");
          setLastMoveSq(null);
          setLastMoveRef(null);
          setCastleRights({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
          setStatus("playing");
          setMessage("");
          stateHist.current=[];
          timeout=setTimeout(doAiMove,600);
        },2000);
        return;
      }
      timeout=setTimeout(doAiMove,500);
    };
    timeout=setTimeout(doAiMove,600);
    return ()=>{runRef.current=false;clearTimeout(timeout);};
  },[mode,ai,applyMoveState,onTrainUpdate]);

  // === PVP MODE: AI responds after player move ===
  const aiTurnRef = useRef(false);
  useEffect(()=>{
    if(mode!=="pvp") return;
    if(status!=="playing") return;
    if(turn!==aiSide) return;
    if(aiTurnRef.current) return;
    aiTurnRef.current=true;
    const b=boardRef.current;
    const cr=crRef.current;
    const lm=lmRef.current;
    const timeout=setTimeout(()=>{
      const move=ai.chooseMove(b,aiSide,lm,cr,false);
      if(!move){aiTurnRef.current=false;return;}
      applyMoveState(b,move,aiSide,cr,lm,true);
      setTrainDisplay(ai.trainCount);
      onTrainUpdate();
      aiTurnRef.current=false;
    },600);
    return ()=>{clearTimeout(timeout);aiTurnRef.current=false;};
  },[mode,turn,aiSide,ai,applyMoveState,status,onTrainUpdate]);

  const handleSquareClick = useCallback((r,c)=>{
    if(mode!=="pvp") return;
    if(status!=="playing") return;
    const playerSide = aiSide==="w"?"b":"w";
    if(turn!==playerSide) return;
    const b=boardRef.current;
    const cr=crRef.current;
    const lm=lmRef.current;

    if(selected){
      const move=highlights.map(h=>({h})).length>0&&
        getValidMoves(b,selected[0],selected[1],lm,cr).find(m=>m.to[0]===r&&m.to[1]===c);
      if(move){
        applyMoveState(b,move,playerSide,cr,lm,false);
        setSelected(null);setHighlights([]);
        return;
      }
    }
    if(b[r][c]&&color(b[r][c])===playerSide){
      setSelected([r,c]);
      const ms=getValidMoves(b,r,c,lm,cr);
      setHighlights(ms.map(m=>m.to));
    } else {
      setSelected(null);setHighlights([]);
    }
  },[mode,status,aiSide,turn,selected,highlights,applyMoveState]);

  const isTrain = mode==="train";

  return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",
      fontFamily:"Georgia,serif",padding:"20px 0"
    }}>
      <div style={{
        background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"24px 32px",marginBottom:20,textAlign:"center",
        boxShadow:"0 0 40px #0008"
      }}>
        <h2 style={{color:"#c9a96e",margin:"0 0 4px",fontSize:22}}>{ai.name}</h2>
        <div style={{color:"#7c6040",fontSize:13}}>
          학습 수: <span style={{color:"#c9a96e",fontWeight:"bold"}}>{trainDisplay}</span>
          {" · "}
          {mode==="train"&&"AI vs AI 빠른 학습"}
          {mode==="watch"&&"AI vs AI 관전"}
          {mode==="pvp"&&`Player vs AI · AI = ${aiSide==="w"?"백(선공)":"흑(후공)"}`}
        </div>
      </div>

      {isTrain?(
        <div style={{
          background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
          padding:"40px 60px",textAlign:"center",boxShadow:"0 0 40px #0008",minWidth:340
        }}>
          <div style={{fontSize:60,marginBottom:12,animation:"spin 2s linear infinite"}}>⚙️</div>
          <p style={{color:"#c9a96e",fontSize:18,marginBottom:4}}>백그라운드 학습 중</p>
          <p style={{color:"#7c6040",fontSize:13,marginBottom:4}}>다른 탭을 봐도 학습이 계속됩니다.</p>
          <p style={{color:"#7c6040",fontSize:13,marginBottom:16}}>Worker 스레드에서 Minimax 셀프플레이 진행 중</p>
          <div style={{margin:"8px 0 24px",fontSize:36,color:"#c9a96e",fontWeight:"bold",
            textShadow:"0 0 20px #c9a96e44"}}>{trainDisplay}<span style={{fontSize:16,color:"#7c6040",marginLeft:6}}>회</span></div>
          <button onClick={onBack} style={{...btnStyle("#7c4a1e","#c9a96e"),width:"100%"}}>
            ■ 학습 중단 및 돌아가기
          </button>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      ):(
        <>
          {message&&(
            <div style={{
              background:"#2d1a0a",border:"1px solid #c9a96e",borderRadius:8,
              padding:"12px 28px",marginBottom:16,color:"#c9a96e",fontSize:18,fontWeight:"bold",
              animation:"fadeIn 0.4s ease"
            }}>{message}</div>
          )}
          {mode==="pvp"&&turn!==(aiSide==="w"?"b":"w")&&status==="playing"&&(
            <div style={{color:"#7c6040",fontSize:13,marginBottom:8}}>AI가 생각 중...</div>
          )}
          {mode==="pvp"&&turn===(aiSide==="w"?"b":"w")&&status==="playing"&&(
            <div style={{color:"#c9a96e",fontSize:13,marginBottom:8}}>당신의 차례입니다</div>
          )}
          <ChessBoard
            board={board}
            selected={selected}
            highlights={highlights}
            onSquareClick={handleSquareClick}
            lastMoveSq={lastMoveSq}
            animPiece={animPiece}
            theme={theme}
          />
          <div style={{marginTop:20,display:"flex",gap:12}}>
            <button onClick={onBack} style={btnStyle("#7c4a1e","#c9a96e")}>
              ← 돌아가기
            </button>
            {status!=="playing"&&mode==="pvp"&&(
              <button onClick={()=>{
                setBoard(INIT_BOARD());setTurn("w");setSelected(null);setHighlights([]);
                setLastMoveSq(null);setLastMoveRef(null);setStatus("playing");setMessage("");
                setCastleRights({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
                stateHist.current=[];
              }} style={btnStyle("#2d5a27","#7ec876")}>
                다시 시작
              </button>
            )}
          </div>
        </>
      )}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [authState, setAuthState] = useState("loading"); // loading|auth|app
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState("menu"); // menu|ai|pvp_offline|pvp_online|leaderboard
  const [theme, setTheme] = useState(()=>localStorage.getItem("chess_theme")||"wood");

  // Restore session on mount
  useEffect(()=>{
    restoreSession().then(async u=>{
      if(u){ setUser(u); const p=await getProfile(u.id); setProfile(p); setAuthState("app"); }
      else setAuthState("auth");
    });
  },[]);

  const handleThemeChange = (t) => { setTheme(t); localStorage.setItem("chess_theme",t); };

  const handleLogin = async(u) => {
    setUser(u);
    const p = await getProfile(u.id);
    setProfile(p);
    setAuthState("app");
    setScreen("menu");
  };

  const handleDemo = () => {
    setUser("demo");
    setProfile(null);
    setAuthState("app");
    setScreen("menu");
  };

  const handleLogout = async() => {
    if(user!=="demo") await authSignOut();
    setUser(null); setProfile(null); setAuthState("auth"); setScreen("menu");
  };

  if(authState==="loading") return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#1a0e06",color:"#c9a96e",fontFamily:"Georgia,serif",fontSize:24}}>
      ♟ 로딩 중...
    </div>
  );

  if(authState==="auth") return <AuthScreen onLogin={handleLogin} onDemo={handleDemo}/>;

  if(screen==="leaderboard") return <LeaderboardScreen onBack={()=>setScreen("menu")} currentProfile={profile}/>;
  if(screen==="pvp_offline") return <PvPOfflineScreen onBack={()=>setScreen("menu")} theme={theme}/>;
  if(screen==="pvp_online") return <PvPOnlineScreen onBack={()=>setScreen("menu")} user={user} profile={profile} theme={theme}/>;

  if(screen==="ai") return <AIRoot user={user} profile={profile} onBack={()=>setScreen("menu")} theme={theme}/>;

  return (
    <MainMenu
      user={user} profile={profile}
      onAI={()=>setScreen("ai")}
      onPvPOffline={()=>setScreen("pvp_offline")}
      onPvPOnline={()=>setScreen("pvp_online")}
      onLeaderboard={()=>setScreen("leaderboard")}
      onLogout={handleLogout}
      theme={theme}
      onThemeChange={handleThemeChange}
    />
  );
}

// AI Root — wraps old AI flow with DB support
function AIRoot({ user, profile, onBack, theme }) {
  const isDemo = user==="demo";
  const [screen, setScreen] = useState("home"); // home|load|new|dashboard
  const [currentAI, setCurrentAI] = useState(null);
  const [bots, setBots] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(()=>{
    if(!loaded) {
      if(isDemo) { setBots(loadBotsLocal()); setLoaded(true); }
      else loadBotsFromDB(user.id).then(b=>{ setBots(b); setLoaded(true); });
    }
  },[loaded, isDemo, user]);

  const handleLoad = (ai) => { setCurrentAI(ai); setScreen("dashboard"); };
  const handleNew = (name, engineType="minimax") => {
    const existing = bots[name];
    if(existing){ setCurrentAI(existing); setScreen("dashboard"); return; }
    const ai = engineType==="qtable" ? new QTableAI(name) : new ChessAI(name);
    setCurrentAI(ai);
    setScreen("dashboard");
  };
  const handleSave = async(ai) => {
    const nb = {...bots, [ai.name]:ai};
    setBots(nb);
    if(isDemo) saveBotsLocal(nb);
    else { try { await saveBotToDB(user.id, ai); } catch(e){ alert("저장 실패: "+e.message); return; } }
    setScreen("home"); setCurrentAI(null);
  };

  if(!loaded) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#1a0e06",color:"#c9a96e",fontFamily:"Georgia,serif"}}>불러오는 중...</div>
  );

  if(screen==="home") return <HomeScreen onLoad={()=>setScreen("load")} onNew={()=>setScreen("new")} onBack={onBack}/>;
  if(screen==="load") return <LoadScreen onBack={()=>setScreen("home")} onSelect={handleLoad} bots={bots}/>;
  if(screen==="new") return <NewAIScreen onBack={()=>setScreen("home")} onCreate={handleNew}/>;
  if(screen==="dashboard"&&currentAI) return (
    <AIDashboard ai={currentAI} onSave={handleSave} onBack={()=>{ setScreen("home"); setCurrentAI(null); }} theme={theme}/>
  );
  return <HomeScreen onLoad={()=>setScreen("load")} onNew={()=>setScreen("new")} onBack={onBack}/>;
}
