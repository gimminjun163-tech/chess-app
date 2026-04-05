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
// DRAW DETECTION
// ============================================================

// 기물 부족 무승부 (체크메이트 불가능한 기물 조합)
function isInsufficientMaterial(board) {
  const pieces = [];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p = board[r][c];
    if(p && p[1]!=="K") pieces.push({type:p[1], color:p[0], r, c});
  }
  // 기물이 0개: K vs K
  if(pieces.length===0) return true;
  // 기물 1개
  if(pieces.length===1) {
    const p = pieces[0];
    if(p.type==="N"||p.type==="B") return true; // K+N vs K or K+B vs K
  }
  // 기물 2개: K+B vs K+B (같은 색 칸)
  if(pieces.length===2) {
    const [a,b] = pieces;
    if(a.type==="B"&&b.type==="B") {
      const sameSquareColor = (a.r+a.c)%2===(b.r+b.c)%2;
      if(sameSquareColor) return true;
    }
  }
  return false;
}

// 보드 해시 (3회 반복 감지용)
function boardHash(board, turn, castleRights) {
  const cr = castleRights;
  return board.map(r=>r.map(c=>c||".").join("")).join("|")
    +turn
    +(cr.w.kingSide?"1":"0")+(cr.w.queenSide?"1":"0")
    +(cr.b.kingSide?"1":"0")+(cr.b.queenSide?"1":"0");
}

// 무승부 이유 체크 (게임 상태 기반)
function checkDrawReason(board, turn, castleRights, lastMove, positionHistory, halfMoveClock) {
  // 스테일메이트: getAllValidMoves에서 처리됨 (호출부에서 판단)
  // 기물 부족
  if(isInsufficientMaterial(board)) return "기물 부족";
  // 50수 규칙
  if(halfMoveClock>=100) return "50수 규칙"; // half-move clock
  // 3회 반복
  const hash = boardHash(board, turn, castleRights);
  const count = (positionHistory[hash]||0);
  if(count>=3) return "3회 동형 반복";
  return null;
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
  if(!SUPA_URL || !SUPA_KEY) throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  const r = await fetch(SUPA_URL+"/auth/v1/signup", {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
    body: JSON.stringify({email, password, options:{data:{username}}})
  });
  const d = await r.json();
  if(d.error) throw new Error(d.error.message||d.error_description||JSON.stringify(d.error));
  return d;
}

async function authSignIn(email, password) {
  if(!SUPA_URL || !SUPA_KEY) throw new Error("Supabase 환경변수가 설정되지 않았습니다. Vercel에서 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 확인하세요.");
  const r = await fetch(SUPA_URL+"/auth/v1/token?grant_type=password", {
    method:"POST", headers:{"Content-Type":"application/json","apikey":SUPA_KEY},
    body: JSON.stringify({email, password})
  });
  const d = await r.json();
  if(d.error) throw new Error(d.error.message||d.error_description||JSON.stringify(d.error));
  if(!d.access_token) throw new Error("로그인 응답 오류: " + JSON.stringify(d));
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
    const rows = await supaFetch(`/rest/v1/bots?user_id=eq.${userId}&select=*&order=updated_at.desc`);
    const result = {};
    for(const row of rows||[]) {
      const ai = row.type==="qtable" ? QTableAI.deserialize({...row.data, name:row.name, type:"qtable", trainCount:row.train_count})
        : ChessAI.deserialize({...row.data, name:row.name, type:"minimax", trainCount:row.train_count});
      ai._dbId = row.id;
      ai._isShared = row.is_shared||false;
      ai._sharedAt = row.shared_at;
      result[row.name] = ai;
    }
    return result;
  } catch(e) { console.error("loadBotsFromDB", e); return {}; }
}

async function saveBotToDB(userId, ai) {
  const serialized = ai.serialize();
  // Q-table이 너무 크면 2000개로 제한
  if(serialized.qtable) {
    const keys = Object.keys(serialized.qtable);
    if(keys.length > 2000) {
      const trimmed = {};
      keys.slice(-2000).forEach(k=>{ trimmed[k]=serialized.qtable[k]; });
      serialized.qtable = trimmed;
    }
  }
  const body = {
    user_id: userId,
    name: ai.name,
    type: ai.type,
    train_count: ai.trainCount,
    data: serialized,
    is_shared: ai._isShared||false,
    updated_at: new Date().toISOString(),
  };
  if(ai._dbId) {
    await supaFetch(`/rest/v1/bots?id=eq.${ai._dbId}`, {method:"PATCH", body:JSON.stringify(body)});
  } else {
    const rows = await supaFetch(`/rest/v1/bots`, {
      method:"POST",
      headers:{"Prefer":"return=representation"},
      body:JSON.stringify(body)
    });
    if(rows?.[0]) ai._dbId = rows[0].id;
  }
}

// 봇 이름 변경
async function renameBotInDB(dbId, newName) {
  await supaFetch(`/rest/v1/bots?id=eq.${dbId}`, {method:"PATCH",
    body:JSON.stringify({name:newName, updated_at:new Date().toISOString()})});
}

// 봇 삭제
async function deleteBotFromDB(dbId) {
  await supaFetch(`/rest/v1/bots?id=eq.${dbId}`, {method:"DELETE"});
}

// 공유 토글
async function toggleShareBot(dbId, shared) {
  await supaFetch(`/rest/v1/bots?id=eq.${dbId}`, {method:"PATCH",
    body:JSON.stringify({is_shared:shared, shared_at:shared?new Date().toISOString():null})});
}

// 공유된 봇 목록 불러오기
async function loadSharedBots() {
  try {
    const rows = await supaFetch(`/rest/v1/bots?is_shared=eq.true&select=id,name,type,train_count,data,user_id,shared_at&order=shared_at.desc&limit=50`);
    return (rows||[]).map(row => {
      const ai = row.type==="qtable"
        ? QTableAI.deserialize({...row.data, name:row.name, type:"qtable", trainCount:row.train_count})
        : ChessAI.deserialize({...row.data, name:row.name, type:"minimax", trainCount:row.train_count});
      ai._dbId = row.id;
      ai._ownerId = row.user_id;
      ai._isShared = true;
      ai._sharedAt = row.shared_at;
      return ai;
    });
  } catch(e) { console.error("loadSharedBots", e); return []; }
}

// 리믹스: 공유된 봇을 내 것으로 복사
async function remixBot(userId, sourceAi, newName) {
  const ai = sourceAi.type==="qtable"
    ? QTableAI.deserialize({...sourceAi.serialize(), name:newName})
    : ChessAI.deserialize({...sourceAi.serialize(), name:newName});
  ai.trainCount = sourceAi.trainCount;
  await saveBotToDB(userId, ai);
  return ai;
}

// Rating calculation (Elo)
function calcElo(ratingA, ratingB, resultA) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(K * (resultA - expected));
}

// ============================================================
// LEVEL SYSTEM
// ============================================================
const LEVELS = [
  // Bronze
  {tier:"Bronze",  num:1, min:0,    max:199,  color:"#cd7f32", bg:"#3a1a00"},
  {tier:"Bronze",  num:2, min:200,  max:399,  color:"#cd7f32", bg:"#3a1a00"},
  {tier:"Bronze",  num:3, min:400,  max:599,  color:"#cd7f32", bg:"#3a1a00"},
  {tier:"Bronze",  num:4, min:600,  max:799,  color:"#cd7f32", bg:"#3a1a00"},
  {tier:"Bronze",  num:5, min:800,  max:999,  color:"#cd7f32", bg:"#3a1a00"},
  // Silver
  {tier:"Silver",  num:1, min:1000, max:1099, color:"#aaaaaa", bg:"#2a2a2a"},
  {tier:"Silver",  num:2, min:1100, max:1199, color:"#aaaaaa", bg:"#2a2a2a"},
  {tier:"Silver",  num:3, min:1200, max:1299, color:"#aaaaaa", bg:"#2a2a2a"},
  {tier:"Silver",  num:4, min:1300, max:1399, color:"#aaaaaa", bg:"#2a2a2a"},
  {tier:"Silver",  num:5, min:1400, max:1499, color:"#aaaaaa", bg:"#2a2a2a"},
  // Gold
  {tier:"Gold",    num:1, min:1500, max:1599, color:"#ffd700", bg:"#3a2e00"},
  {tier:"Gold",    num:2, min:1600, max:1699, color:"#ffd700", bg:"#3a2e00"},
  {tier:"Gold",    num:3, min:1700, max:1799, color:"#ffd700", bg:"#3a2e00"},
  {tier:"Gold",    num:4, min:1800, max:1899, color:"#ffd700", bg:"#3a2e00"},
  {tier:"Gold",    num:5, min:1900, max:1999, color:"#ffd700", bg:"#3a2e00"},
  // Platinum
  {tier:"Platinum",num:1, min:2000, max:2099, color:"#00e5cc", bg:"#003a35"},
  {tier:"Platinum",num:2, min:2100, max:2199, color:"#00e5cc", bg:"#003a35"},
  {tier:"Platinum",num:3, min:2200, max:2299, color:"#00e5cc", bg:"#003a35"},
  {tier:"Platinum",num:4, min:2300, max:2399, color:"#00e5cc", bg:"#003a35"},
  {tier:"Platinum",num:5, min:2400, max:2499, color:"#00e5cc", bg:"#003a35"},
  // Diamond
  {tier:"Diamond", num:1, min:2500, max:2599, color:"#00bfff", bg:"#001a3a"},
  {tier:"Diamond", num:2, min:2600, max:2699, color:"#00bfff", bg:"#001a3a"},
  {tier:"Diamond", num:3, min:2700, max:2799, color:"#00bfff", bg:"#001a3a"},
  {tier:"Diamond", num:4, min:2800, max:2899, color:"#00bfff", bg:"#001a3a"},
  {tier:"Diamond", num:5, min:2900, max:2999, color:"#00bfff", bg:"#001a3a"},
  // Ruby
  {tier:"Ruby",    num:1, min:3000, max:3099, color:"#ff4466", bg:"#3a0010"},
  {tier:"Ruby",    num:2, min:3100, max:3199, color:"#ff4466", bg:"#3a0010"},
  {tier:"Ruby",    num:3, min:3200, max:3299, color:"#ff4466", bg:"#3a0010"},
  {tier:"Ruby",    num:4, min:3300, max:3399, color:"#ff4466", bg:"#3a0010"},
  {tier:"Ruby",    num:5, min:3400, max:3499, color:"#ff4466", bg:"#3a0010"},
  // Max
  {tier:"Max",     num:0, min:3500, max:Infinity, color:"#00c853", bg:"#003a15"},
];

function getLevel(rating) {
  const r = rating||1200;
  for(const l of LEVELS) if(r >= l.min && r <= l.max) return l;
  return LEVELS[LEVELS.length-1];
}

function LevelBadge({ rating, size=14 }) {
  const lv = getLevel(rating||1200);
  const isMax = lv.tier==="Max";
  return (
    <span style={{
      display:"inline-flex",alignItems:"center",justifyContent:"center",
      background:lv.bg, color:lv.color,
      border:`1px solid ${lv.color}66`,
      borderRadius:4, padding:`1px ${size*0.4}px`,
      fontSize:size, fontWeight:"bold", fontFamily:"monospace",
      lineHeight:1.4, whiteSpace:"nowrap", flexShrink:0,
    }}>
      {isMax ? "M" : lv.num}
      <span style={{fontSize:size*0.7, marginLeft:1, opacity:0.85}}>
        {isMax ? "ax" : lv.tier.slice(0,2)}
      </span>
    </span>
  );
}

function LevelInfo({ rating }) {
  const lv = getLevel(rating||1200);
  const isMax = lv.tier==="Max";
  const nextMin = isMax ? null : LEVELS.find(l=>l.min > lv.max)?.min;
  const toNext = nextMin ? nextMin - (rating||1200) : null;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <LevelBadge rating={rating} size={16}/>
      <div>
        <span style={{color:lv.color,fontWeight:"bold",fontSize:15}}>
          {isMax?"Max":`${lv.tier} ${lv.num}`}
        </span>
        {toNext&&<span style={{color:"#7c6040",fontSize:12,marginLeft:8}}>다음 레벨까지 {toNext}점</span>}
      </div>
    </div>
  );
}

// ============================================================
// RIVAL + SCHEDULED MATCH HELPERS
// ============================================================
async function getRivals(userId) {
  // 내가 등록한 라이벌
  const rows = await supaFetch(`/rest/v1/rivals?user_id=eq.${userId}&select=rival_id,profiles!rivals_rival_id_fkey(id,username,rating)`);
  return (rows||[]).map(r=>r.profiles).filter(Boolean);
}

async function getReverseRivals(userId) {
  // 나를 라이벌로 등록한 사람들
  const rows = await supaFetch(`/rest/v1/rivals?rival_id=eq.${userId}&select=user_id,profiles!rivals_user_id_fkey(id,username,rating)`);
  return (rows||[]).map(r=>r.profiles).filter(Boolean);
}

async function addRival(userId, rivalId) {
  await supaFetch(`/rest/v1/rivals`, {method:"POST",
    headers:{"Prefer":"return=minimal"},
    body:JSON.stringify({user_id:userId, rival_id:rivalId})});
}

async function removeRival(userId, rivalId) {
  await supaFetch(`/rest/v1/rivals?user_id=eq.${userId}&rival_id=eq.${rivalId}`, {method:"DELETE"});
}

async function isRival(userId, rivalId) {
  const rows = await supaFetch(`/rest/v1/rivals?user_id=eq.${userId}&rival_id=eq.${rivalId}&select=id`);
  return (rows||[]).length > 0;
}

async function searchProfiles(query) {
  const rows = await supaFetch(`/rest/v1/profiles?username=ilike.*${encodeURIComponent(query)}*&select=id,username,rating&limit=10`);
  return rows||[];
}

async function getProfileByUsername(username) {
  const rows = await supaFetch(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=*`);
  return rows?.[0]||null;
}

async function getUserRank(userId) {
  const rows = await supaFetch(`/rest/v1/profiles?select=id&order=rating.desc`);
  if(!rows) return null;
  const idx = rows.findIndex(r=>r.id===userId);
  return idx>=0 ? idx+1 : null;
}

// Scheduled matches
async function createScheduledMatch(creatorId, scheduledAt, note="") {
  const rows = await supaFetch(`/rest/v1/scheduled_matches`, {
    method:"POST", headers:{"Prefer":"return=representation"},
    body:JSON.stringify({creator_id:creatorId, scheduled_at:scheduledAt, note, status:"open"})
  });
  return rows?.[0];
}

async function getOpenScheduledMatches() {
  const now = new Date().toISOString();
  // 지난 예약은 자동 cancelled 처리
  await supaFetch(
    `/rest/v1/scheduled_matches?status=eq.open&scheduled_at=lt.${now}`,
    {method:"PATCH", body:JSON.stringify({status:"cancelled"})}
  ).catch(()=>{});
  const rows = await supaFetch(`/rest/v1/scheduled_matches?status=eq.open&scheduled_at=gte.${now}&select=*,profiles!scheduled_matches_creator_id_fkey(username,rating)&order=scheduled_at.asc`);
  return rows||[];
}

async function joinScheduledMatch(matchId, userId) {
  await supaFetch(`/rest/v1/scheduled_matches?id=eq.${matchId}`, {method:"PATCH",
    body:JSON.stringify({opponent_id:userId, status:"confirmed"})});
}

async function getMyScheduledMatches(userId) {
  const rows = await supaFetch(`/rest/v1/scheduled_matches?or=(creator_id.eq.${userId},opponent_id.eq.${userId})&select=*,profiles!scheduled_matches_creator_id_fkey(username,rating)&order=scheduled_at.asc`);
  return rows||[];
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
  // 오래된 대기 방 정리 (10분 이상 된 방)
  const cutoff = new Date(Date.now() - 10*60*1000).toISOString();
  await supaFetch(
    `/rest/v1/rooms?status=eq.waiting&created_at=lt.${cutoff}`,
    {method:"PATCH", body:JSON.stringify({status:"cancelled"})}
  ).catch(()=>{});
  const rows = await supaFetch(`/rest/v1/rooms?status=eq.waiting&mode=eq.random&white_id=neq.${userId}&select=*&limit=1`);
  return rows?.[0]||null;
}

async function cancelRoom(roomId) {
  if(!roomId) return;
  await supaFetch(`/rest/v1/rooms?id=eq.${roomId}`,
    {method:"PATCH", body:JSON.stringify({status:"cancelled"})}).catch(()=>{});
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
        const signupData = await authSignUp(email, password, username.trim());
        // 회원가입 후 세션이 바로 오는 경우 (Confirm email OFF)
        if(signupData.access_token) {
          _supaToken = signupData.access_token;
          _supaUser = signupData.user;
          await saveSession(signupData);
          onLogin(signupData.user);
        } else if(signupData.session?.access_token) {
          _supaToken = signupData.session.access_token;
          _supaUser = signupData.user;
          await saveSession({...signupData.session, refresh_token: signupData.session.refresh_token});
          onLogin(signupData.user);
        } else {
          // 세션 없으면 잠깐 기다렸다가 로그인 시도
          await new Promise(r=>setTimeout(r,1000));
          try {
            const loginData = await authSignIn(email, password);
            await saveSession(loginData);
            onLogin(loginData.user);
          } catch(e) {
            setError("회원가입 완료! 바로 로그인해주세요.");
            setIsSignup(false);
          }
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
function MainMenu({ user, profile, onAI, onPvPOffline, onPvPOnline, onLeaderboard, onLogout, theme, onThemeChange, onProfile }) {
  const isDemo = user==="demo";
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"24px 40px",marginBottom:20,textAlign:"center",
        boxShadow:"0 0 40px #0008",minWidth:360,maxWidth:480,width:"100%"}}>
        <div style={{fontSize:36,marginBottom:8}}>{isDemo?"👤":"♛"}</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:6}}>
          {!isDemo&&profile&&<LevelBadge rating={profile.rating} size={15}/>}
          <h2 style={{color:"#c9a96e",margin:0,fontSize:20,letterSpacing:1}}>
            {isDemo?"데모 계정":profile?.username||"로딩 중..."}
          </h2>
        </div>
        {!isDemo&&profile&&(
          <div style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>
              <LevelInfo rating={profile.rating}/>
            </div>
            <div style={{color:"#7c6040",fontSize:13}}>
              {profile.rating}점 · {profile.wins}승 {profile.losses}패 {profile.draws}무
            </div>
            <button onClick={onProfile} style={{...smallBtn("#2d1a0a","#c9a96e"),marginTop:8,fontSize:12}}>
              👤 내 프로필
            </button>
          </div>
        )}
        {isDemo&&<div style={{color:"#7c6040",fontSize:13}}>순위 없음 · 오프라인 전용</div>}
        <div style={{marginTop:12,display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
          {Object.entries(THEMES).map(([key,t])=>(
            <button key={key} onClick={()=>onThemeChange(key)}
              style={{padding:"5px 10px",fontSize:11,
                background:theme===key?"#7c4a1e":"#2d1a0a",
                color:theme===key?"#c9a96e":"#7c6040",
                border:`1px solid ${theme===key?"#c9a96e":"#7c4a1e44"}`,
                borderRadius:20,cursor:"pointer",fontFamily:"Georgia,serif"}}>{t.name}</button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:360}}>
        <button onClick={onAI} style={btnStyle("#1a3a5c","#6ab4f5")}>🤖 AI 모드</button>
        <button onClick={onPvPOffline} style={btnStyle("#2d5a27","#7ec876")}>♟ Player vs Player (오프라인)</button>
        <button onClick={()=>isDemo?alert("온라인 대전은 계정이 필요합니다!"):onPvPOnline()}
          style={{...btnStyle(isDemo?"#1a1a1a":"#5a1a5c",isDemo?"#444":"#e06af5"),opacity:isDemo?0.5:1}}>
          🌐 Player vs Player (온라인){isDemo?" 🔒":""}
        </button>
        <button onClick={onLeaderboard} style={btnStyle("#3a2a0a","#c9a96e")}>🏆 순위표</button>
        <button onClick={onLogout} style={{...btnStyle("#2a1a0a","#7c6040"),fontSize:13}}>로그아웃</button>
      </div>
    </div>
  );
}


// ============================================================
// LEADERBOARD SCREEN
// ============================================================
function LeaderboardScreen({ onBack, currentProfile, onViewProfile }) {
  const [rows, setRows] = useState([]);
  useEffect(()=>{ getLeaderboard().then(d=>setRows(d||[])); },[]);
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"32px 40px",width:"100%",maxWidth:520,boxShadow:"0 0 40px #0008"}}>
        <h2 style={{color:"#c9a96e",textAlign:"center",fontSize:24,marginBottom:24,letterSpacing:2}}>🏆 순위표</h2>
        {rows.map((r,i)=>(
          <div key={i} onClick={()=>onViewProfile&&onViewProfile(r.username)}
            style={{
              display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:6,
              background:r.username===currentProfile?.username?"#2d1a0a":"#1a1208",
              border:`1px solid ${r.username===currentProfile?.username?"#c9a96e":"#7c4a1e22"}`,
              borderRadius:8,color:"#c9a96e",cursor:onViewProfile?"pointer":"default",transition:"background 0.1s"
            }}
            onMouseEnter={e=>e.currentTarget.style.background="#2d2010"}
            onMouseLeave={e=>e.currentTarget.style.background=r.username===currentProfile?.username?"#2d1a0a":"#1a1208"}
          >
            <span style={{width:24,color:"#7c6040",fontSize:13,textAlign:"right"}}>{i+1}</span>
            <LevelBadge rating={r.rating} size={12}/>
            <span style={{flex:1,fontSize:14}}>{r.username}</span>
            <span style={{fontSize:14,fontWeight:"bold"}}>{r.rating}</span>
            <span style={{color:"#7c6040",fontSize:11}}>{r.wins}W/{r.losses}L</span>
          </div>
        ))}
        {rows.length===0&&<p style={{color:"#7c6040",textAlign:"center"}}>아직 데이터가 없습니다.</p>}
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%",marginTop:16}}>← 뒤로</button>
      </div>
    </div>
  );
}


// ============================================================
// PROFILE SCREEN
// ============================================================
function ProfileScreen({ onBack, targetUsername, currentUserId, isDemo }) {
  const [profile, setProfile] = useState(null);
  const [sharedBots, setSharedBots] = useState([]);
  const [rank, setRank] = useState(null);
  const [rivals, setRivals] = useState([]);         // 이 유저가 등록한 라이벌
  const [reverseRivals, setReverseRivals] = useState([]); // 이 유저를 등록한 사람
  const [isMyRival, setIsMyRival] = useState(false);
  const [loading, setLoading] = useState(true);
  const isMyProfile = !targetUsername || (profile?.id === currentUserId);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try {
        let p;
        if(targetUsername) p = await getProfileByUsername(targetUsername);
        else p = await getProfile(currentUserId);
        if(!p) { setLoading(false); return; }
        setProfile(p);
        // shared bots
        const bots = await supaFetch(`/rest/v1/bots?user_id=eq.${p.id}&is_shared=eq.true&select=name,type,train_count`);
        setSharedBots(bots||[]);
        // rank
        const r = await getUserRank(p.id);
        setRank(r);
        // rivals
        if(!isDemo && currentUserId) {
          const myRivals = await getRivals(p.id);
          setRivals(myRivals);
          const rev = await getReverseRivals(p.id);
          setReverseRivals(rev);
          if(currentUserId !== p.id) {
            const rival = await isRival(currentUserId, p.id);
            setIsMyRival(rival);
          }
        }
      } catch(e) { console.error(e); }
      setLoading(false);
    })();
  },[targetUsername, currentUserId]);

  const handleToggleRival = async() => {
    if(!profile||isDemo) return;
    try {
      if(isMyRival) { await removeRival(currentUserId, profile.id); setIsMyRival(false); }
      else { await addRival(currentUserId, profile.id); setIsMyRival(true); }
    } catch(e) { alert("라이벌 설정 실패: "+e.message); }
  };

  const lv = profile ? getLevel(profile.rating||1200) : null;

  if(loading) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#1a0e06",color:"#c9a96e",fontFamily:"Georgia,serif"}}>로딩 중...</div>
  );
  if(!profile) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#1a0e06",fontFamily:"Georgia,serif"}}>
      <div style={{textAlign:"center"}}>
        <p style={{color:"#e07070"}}>프로필을 찾을 수 없습니다.</p>
        <button onClick={onBack} style={btnStyle("#3d2208","#c9a96e")}>← 뒤로</button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20,paddingTop:40}}>
      <div style={{width:"100%",maxWidth:520}}>
        {/* Header */}
        <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
          padding:"28px 36px",marginBottom:16,textAlign:"center",boxShadow:"0 0 40px #0008"}}>
          <div style={{fontSize:48,marginBottom:8}}>♛</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:8}}>
            <LevelBadge rating={profile.rating} size={18}/>
            <h2 style={{color:"#c9a96e",margin:0,fontSize:24,letterSpacing:1}}>{profile.username}</h2>
          </div>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
            <LevelInfo rating={profile.rating}/>
          </div>
          <div style={{color:"#7c6040",fontSize:13,marginBottom:8}}>
            {profile.rating}점 · {profile.wins}승 {profile.losses}패 {profile.draws}무
            {rank&&<span style={{color:"#c9a96e",marginLeft:8}}>전체 {rank}위</span>}
          </div>
          {!isMyProfile&&!isDemo&&(
            <button onClick={handleToggleRival}
              style={{...btnStyle(isMyRival?"#3a1a0a":"#1a3a2c",isMyRival?"#e07070":"#6af5b0"),fontSize:13}}>
              {isMyRival?"⚔️ 라이벌 해제":"⚔️ 라이벌 등록"}
            </button>
          )}
        </div>

        {/* Shared AIs */}
        <div style={{background:"#1a0e06",border:"1px solid #7c4a1e44",borderRadius:10,
          padding:"20px 24px",marginBottom:12,boxShadow:"0 0 20px #0006"}}>
          <h3 style={{color:"#c9a96e",fontSize:15,marginBottom:12}}>🤖 공유된 AI ({sharedBots.length})</h3>
          {sharedBots.length===0&&<p style={{color:"#7c6040",fontSize:13}}>공유된 AI가 없습니다.</p>}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {sharedBots.map((b,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                background:"#2d1a0a",borderRadius:8}}>
                <span style={{fontSize:11,padding:"2px 6px",borderRadius:8,fontWeight:"bold",
                  background:b.type==="qtable"?"#1a3a5c":"#3a1a5c",
                  color:b.type==="qtable"?"#6ab4f5":"#c06af5"}}>
                  {b.type==="qtable"?"Q":"M"}
                </span>
                <span style={{color:"#c9a96e",flex:1,fontSize:14}}>{b.name}</span>
                <span style={{color:"#7c6040",fontSize:12}}>학습 {b.train_count}회</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rivals */}
        {rivals.length>0&&(
          <div style={{background:"#1a0e06",border:"1px solid #7c4a1e44",borderRadius:10,
            padding:"20px 24px",marginBottom:12}}>
            <h3 style={{color:"#c9a96e",fontSize:15,marginBottom:12}}>⚔️ 라이벌 ({rivals.length})</h3>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {rivals.map((r,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                  background:"#2d1a0a",borderRadius:8}}>
                  <LevelBadge rating={r.rating} size={11}/>
                  <span style={{color:"#c9a96e",flex:1,fontSize:14}}>{r.username}</span>
                  <span style={{color:"#7c6040",fontSize:12}}>{r.rating}점</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reverse Rivals */}
        {reverseRivals.length>0&&(
          <div style={{background:"#1a0e06",border:"1px solid #7c4a1e44",borderRadius:10,
            padding:"20px 24px",marginBottom:12}}>
            <h3 style={{color:"#c9a96e",fontSize:15,marginBottom:12}}>🎯 역라이벌 ({reverseRivals.length})</h3>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {reverseRivals.map((r,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
                  background:"#2d1a0a",borderRadius:8}}>
                  <LevelBadge rating={r.rating} size={11}/>
                  <span style={{color:"#c9a96e",flex:1,fontSize:14}}>{r.username}</span>
                  <span style={{color:"#7c6040",fontSize:12}}>{r.rating}점</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>← 뒤로</button>
      </div>
    </div>
  );
}

// ============================================================
// SCHEDULED MATCH SCREEN
// ============================================================
function ScheduledMatchScreen({ onBack, user, profile, onJoinMatch }) {
  const [openMatches, setOpenMatches] = useState([]);
  const [myMatches, setMyMatches] = useState([]);
  const [tab, setTab] = useState("list"); // list|create|mine
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = async() => {
    const [open, mine] = await Promise.all([
      getOpenScheduledMatches(),
      getMyScheduledMatches(user.id)
    ]);
    const now = new Date();
    setOpenMatches(open.filter(m=>
      m.creator_id!==user.id &&
      new Date(m.scheduled_at) > now
    ));
    const now2 = new Date();
    setMyMatches(mine.filter(m=>{
      // 지난 open 예약(참가자 없이 시간 지난 것)은 숨김
      if(m.status==="open" && new Date(m.scheduled_at) < now2) return false;
      return true;
    }));
  };

  useEffect(()=>{ refresh(); },[]);

  // Check if any confirmed match is due
  useEffect(()=>{
    const interval = setInterval(()=>{
      const now = new Date();
      myMatches.forEach(m=>{
        if(m.status==="confirmed") {
          const diff = new Date(m.scheduled_at) - now;
          if(diff<=0&&diff>-30000) { // within 30s of scheduled time
            onJoinMatch(m);
          }
        }
      });
    }, 5000);
    return ()=>clearInterval(interval);
  },[myMatches, onJoinMatch]);

  const handleCreate = async() => {
    if(!schedDate||!schedTime) { alert("날짜와 시간을 선택하세요."); return; }
    const dt = new Date(`${schedDate}T${schedTime}`);
    if(dt<=new Date()) { alert("미래 시간을 선택하세요."); return; }
    setLoading(true);
    try {
      await createScheduledMatch(user.id, dt.toISOString(), note);
      setTab("mine"); await refresh();
    } catch(e) { alert("예약 실패: "+e.message); }
    setLoading(false);
  };

  const handleJoin = async(match) => {
    if(!window.confirm(`${new Date(match.scheduled_at).toLocaleString("ko-KR")}에 예약된 대전에 참가할까요?`)) return;
    setLoading(true);
    try {
      await joinScheduledMatch(match.id, user.id);
      await refresh();
      alert("참가 완료! 예약 시간에 자동으로 대전이 시작됩니다.");
    } catch(e) { alert("참가 실패: "+e.message); }
    setLoading(false);
  };

  const tabBtn = (t, label) => (
    <button onClick={()=>setTab(t)} style={{
      padding:"8px 20px",fontFamily:"Georgia,serif",fontSize:13,cursor:"pointer",
      background:tab===t?"#7c4a1e":"#2d1a0a",
      color:tab===t?"#c9a96e":"#7c6040",
      border:`1px solid ${tab===t?"#c9a96e":"#7c4a1e44"}`,
      borderRadius:6,
    }}>{label}</button>
  );

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20,paddingTop:40}}>
      <div style={{width:"100%",maxWidth:520}}>
        <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
          padding:"24px 32px",boxShadow:"0 0 40px #0008"}}>
          <h2 style={{color:"#c9a96e",fontSize:20,marginBottom:16,textAlign:"center"}}>📅 예약 매치</h2>
          <div style={{display:"flex",gap:8,marginBottom:20,justifyContent:"center"}}>
            {tabBtn("list","예약 리스트")}
            {tabBtn("create","예약 만들기")}
            {tabBtn("mine","내 예약")}
          </div>

          {tab==="list"&&(
            <div>
              {openMatches.length===0&&<p style={{color:"#7c6040",textAlign:"center"}}>참가 가능한 예약이 없습니다.</p>}
              {openMatches.map((m,i)=>(
                <div key={i} style={{background:"#2d1a0a",border:"1px solid #7c4a1e44",borderRadius:8,
                  padding:"12px 16px",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <LevelBadge rating={m.profiles?.rating} size={11}/>
                    <span style={{color:"#c9a96e",fontSize:14}}>{m.profiles?.username||"?"}</span>
                    <span style={{color:"#7c6040",fontSize:12,marginLeft:"auto"}}>{m.profiles?.rating||"?"}점</span>
                  </div>
                  <div style={{color:"#7c6040",fontSize:13,marginBottom:8}}>
                    📅 {new Date(m.scheduled_at).toLocaleString("ko-KR")}
                    {m.note&&<span style={{marginLeft:8,color:"#9a8060"}}>"{m.note}"</span>}
                  </div>
                  <button onClick={()=>handleJoin(m)} disabled={loading}
                    style={btnStyle("#1a3a5c","#6ab4f5")}>참가하기</button>
                </div>
              ))}
            </div>
          )}

          {tab==="create"&&(
            <div>
              <div style={{marginBottom:12}}>
                <label style={{color:"#7c6040",fontSize:13,display:"block",marginBottom:4}}>날짜</label>
                <input type="date" value={schedDate} onChange={e=>setSchedDate(e.target.value)}
                  style={{...inputStyle,margin:0}}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{color:"#7c6040",fontSize:13,display:"block",marginBottom:4}}>시간</label>
                <input type="time" value={schedTime} onChange={e=>setSchedTime(e.target.value)}
                  style={{...inputStyle,margin:0}}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={{color:"#7c6040",fontSize:13,display:"block",marginBottom:4}}>메모 (선택)</label>
                <input value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="예: 친선전, 연습 등"
                  style={{...inputStyle,margin:0}}/>
              </div>
              <button onClick={handleCreate} disabled={loading}
                style={{...btnStyle("#2d5a27","#7ec876"),width:"100%"}}>
                {loading?"처리 중...":"예약 만들기"}
              </button>
            </div>
          )}

          {tab==="mine"&&(
            <div>
              {myMatches.length===0&&<p style={{color:"#7c6040",textAlign:"center"}}>예약된 대전이 없습니다.</p>}
              {myMatches.map((m,i)=>{
                const dt = new Date(m.scheduled_at);
                const statusColor = m.status==="confirmed"?"#7ec876":m.status==="open"?"#6ab4f5":"#7c6040";
                const statusLabel = m.status==="confirmed"?"확정":m.status==="open"?"대기중":m.status==="playing"?"진행중":"완료";
                return (
                  <div key={i} style={{background:"#2d1a0a",border:`1px solid ${statusColor}44`,
                    borderRadius:8,padding:"12px 16px",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{color:statusColor,fontSize:12,fontWeight:"bold"}}>{statusLabel}</span>
                      <span style={{color:"#7c6040",fontSize:12,marginLeft:"auto"}}>
                        {m.creator_id===user.id?"내가 만듦":"참가"}
                      </span>
                    </div>
                    <div style={{color:"#c9a96e",fontSize:13,marginBottom:4}}>
                      📅 {dt.toLocaleString("ko-KR")}
                    </div>
                    {m.note&&<div style={{color:"#9a8060",fontSize:12}}>"{m.note}"</div>}
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%",marginTop:16}}>← 뒤로</button>
        </div>
      </div>
    </div>
  );
}

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
  const [promotion, setPromotion] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const posHistRef = useRef({});   // position history for threefold
  const halfMoveRef = useRef(0);   // half-move clock for 50-move rule

  const {capturedByWhite, capturedByBlack} = getCaptured(board);
  const score = getMaterialScore(capturedByWhite, capturedByBlack);

  const doMove = (b, move, side, cr, promPiece="Q") => {
    const nb = applyMove(b, move, promPiece);
    const newCR = updateCastleRights(cr, b, move);
    // 50수 clock: 폰 이동 or 기물 포획이면 리셋
    const isPawnMove = b[move.from[0]][move.from[1]]?.[1]==="P";
    const isCapture = !!b[move.to[0]][move.to[1]] || move.enPassant;
    if(isPawnMove||isCapture) halfMoveRef.current=0;
    else halfMoveRef.current++;
    setAnimPiece({to:move.to});
    setTimeout(()=>setAnimPiece(null),300);
    setLastMoveSq([move.from, move.to]);
    setLastMove(move);
    setCastleRights(newCR);
    setBoard(nb);
    setSelected(null); setHighlights([]);
    const opp = side==="w"?"b":"w";
    setTurn(opp);
    // Update position history
    const hash = boardHash(nb, opp, newCR);
    posHistRef.current[hash] = (posHistRef.current[hash]||0)+1;
    const nextMoves = getAllValidMoves(nb, opp, move, newCR);
    if(!nextMoves.length) {
      const inChk = isInCheck(nb, opp);
      if(inChk) { setStatus(`checkmate_${side}`); setMessage(side==="w"?"백(White) 승리!":"흑(Black) 승리!"); }
      else { setStatus("draw"); setMessage("스테일메이트 — 무승부"); }
      return;
    }
    // Check other draw conditions
    const drawReason = checkDrawReason(nb, opp, newCR, move, posHistRef.current, halfMoveRef.current);
    if(drawReason) { setStatus("draw"); setMessage(`무승부 — ${drawReason}`); }
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
    posHistRef.current={}; halfMoveRef.current=0;
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
function PvPOnlineScreen({ onBack, user, profile, theme, onScheduled=()=>{} }) {
  const [phase, setPhase] = useState("lobby"); // lobby|waiting|playing|result
  // roomStatus는 DB에서 직접 읽은 실제 상태
  const [roomStatus, setRoomStatus] = useState("waiting");
  const [matchMode, setMatchMode] = useState(null); // random|room
  const [roomCode, setRoomCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [room, setRoom] = useState(null);
  const [mySide, setMySide] = useState("w");
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
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
  const [timeControl, setTimeControl] = useState(60); // seconds per move: 30 or 60
  const [timeLeft, setTimeLeft] = useState(60);
  const [selectingTime, setSelectingTime] = useState(true); // show time selection first
  const pollRef = useRef(null);
  const roomRef = useRef(null);
  const timerRef = useRef(null);
  const posHistRef = useRef({});
  const halfMoveRef = useRef(0);

  const {capturedByWhite, capturedByBlack} = getCaptured(board);
  const score = getMaterialScore(capturedByWhite, capturedByBlack);

  const phaseRef = useRef(phase);
  useEffect(()=>{ phaseRef.current = phase; }, [phase]);
  const mySideRef = useRef(mySide);
  useEffect(()=>{ mySideRef.current = mySide; }, [mySide]);

  const startPoll = useCallback((roomId) => {
    if(pollRef.current) clearInterval(pollRef.current);
    let alreadyPlaying = false;
    let alreadyFinished = false;
    pollRef.current = setInterval(async()=>{
      try {
        const r = await pollRoom(roomId);
        if(!r) return;
        roomRef.current = r;

        // 항상 board/turn/castle 동기화
        if(r.board) setBoard(r.board);
        if(r.turn) setTurn(r.turn);
        if(r.last_move) {
          setLastMoveSq([r.last_move.from, r.last_move.to]);
          setLastMove(r.last_move);
        }
        if(r.castle_rights) setCastleRights(r.castle_rights);
        // 채팅 메시지 동기화
        if(r.chat_messages) setChatMessages(r.chat_messages);

        // roomStatus 항상 동기화
        setRoomStatus(r.status);

        // playing 전환 (한번만)
        if(r.status==="playing" && !alreadyPlaying) {
          alreadyPlaying = true;
          const oppId = mySideRef.current==="w" ? r.black_id : r.white_id;
          if(oppId) getProfile(oppId).then(p=>{ if(p) setOppProfile(p); }).catch(()=>{});
          setPhase("playing");
        }

        // finished 전환 (한번만)
        if(r.status==="finished" && !alreadyFinished) {
          alreadyFinished = true;
          clearInterval(pollRef.current);
          clearInterval(timerRef.current);
          const side = mySideRef.current;
          const myChange = side==="w"?r.white_rating_change:r.black_rating_change;
          setRatingChange(myChange);
          const drawMsg = r.result&&r.result!=="checkmate"&&r.result!=="stalemate"&&r.result!=="timeout"?` (${r.result})`:"";
          setMessage(r.winner_id===user.id?"승리! 🎉":r.winner_id?`패배 😞`:`무승부${drawMsg}`);
          setStatus("finished");
          setPhase("result");
          await updateRating(user.id, myChange);
        }
      } catch(e) { console.error("poll error", e); }
    }, 800);
  }, [user.id]);

  useEffect(()=>()=>{ if(pollRef.current) clearInterval(pollRef.current); },[]);

  // Timer effect - runs when it's my turn during playing phase
  useEffect(()=>{
    if(phase!=="playing"||status!=="playing") { clearInterval(timerRef.current); return; }
    if(turn!==mySide) { clearInterval(timerRef.current); setTimeLeft(timeControl); return; }
    setTimeLeft(timeControl);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(()=>{
      setTimeLeft(t=>{
        if(t<=1) {
          clearInterval(timerRef.current);
          // Time out — lose
          const oppId = mySide==="w"?roomRef.current?.black_id:roomRef.current?.white_id;
          const wChange = mySide==="w"?-16:16;
          const bChange = mySide==="b"?-16:16;
          pushMove(roomRef.current?.id, board, turn, lastMove, castleRights,
            "timeout", oppId, wChange, bChange).catch(()=>{});
          setMessage("시간 초과 — 패배 😞");
          setStatus("timeout");
          return 0;
        }
        return t-1;
      });
    }, 1000);
    return ()=>clearInterval(timerRef.current);
  },[phase, turn, mySide, status, timeControl]);

  const startRandom = async() => {
    setMatchMode("random"); setPhase("waiting");
    try {
      const existing = await findWaitingRoom(user.id);
      if(existing) {
        // 내가 black으로 참가
        await joinRoom(existing.id, user.id);
        const updatedRoom = await pollRoom(existing.id);
        setRoom(updatedRoom||existing);
        setMySide("b");
        mySideRef.current = "b";
        const opp = await getProfile(existing.white_id);
        setOppProfile(opp);
        setPhase("playing");
        startPoll(existing.id);
      } else {
        // 내가 white로 방 생성 후 대기
        const newRoom = await createRoom(user.id, "random");
        setRoom(newRoom);
        setMySide("w");
        mySideRef.current = "w";
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
    if(!inputCode.trim()) return;
    try {
      const rows = await supaFetch(`/rest/v1/rooms?code=eq.${inputCode.trim().toUpperCase()}&select=*`);
      const r = rows?.[0];
      if(!r) { alert("방을 찾을 수 없습니다."); return; }
      if(r.status==="cancelled") { alert("취소된 방입니다."); return; }
      if(r.status==="finished") { alert("이미 종료된 방입니다."); return; }
      if(r.status==="playing") { alert("이미 진행 중인 방입니다."); return; }
      if(r.white_id===user.id) { alert("내가 만든 방입니다."); return; }
      await joinRoom(r.id, user.id);
      const updatedRoom = await pollRoom(r.id);
      setRoom(updatedRoom||r);
      setMySide("b");
      mySideRef.current = "b";
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
    // Update draw tracking
    const isPawnMove = b[move.from[0]][move.from[1]]?.[1]==="P";
    const isCapture = !!b[move.to[0]][move.to[1]]||move.enPassant;
    if(isPawnMove||isCapture) halfMoveRef.current=0;
    else halfMoveRef.current++;
    setAnimPiece({to:move.to});
    setTimeout(()=>setAnimPiece(null),300);
    setLastMoveSq([move.from,move.to]);
    setLastMove(move);
    setCastleRights(newCR);
    setBoard(nb);
    setSelected(null); setHighlights([]);
    setTurn(opp);
    clearInterval(timerRef.current);
    // Update position history
    const hash = boardHash(nb, opp, newCR);
    posHistRef.current[hash]=(posHistRef.current[hash]||0)+1;

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
    } else {
      // Check other draw conditions
      const drawReason = checkDrawReason(nb, opp, newCR, move, posHistRef.current, halfMoveRef.current);
      if(drawReason) { result=drawReason; }
    }
    try {
      await pushMove(room.id,nb,opp,move,newCR,result,winnerId,wChange,bChange);
    } catch(e){ console.error("pushMove error",e); }
    setPromotion(null);
  };

  // Time selection
  // Rival match (훅은 조건문 앞에 있어야 함)
  const [rivals, setRivals] = useState([]);
  const [showRivals, setShowRivals] = useState(false);
  useEffect(()=>{
    if(showRivals) getRivals(user.id).then(setRivals);
  },[showRivals, user.id]);

  if(selectingTime) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif"}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"40px 56px",textAlign:"center",boxShadow:"0 0 40px #0008",minWidth:340}}>
        <h2 style={{color:"#c9a96e",fontSize:22,marginBottom:8}}>⏱ 시간 제한 설정</h2>
        <p style={{color:"#7c6040",fontSize:13,marginBottom:28}}>한 수당 제한 시간을 선택하세요</p>
        <div style={{display:"flex",gap:16,justifyContent:"center",marginBottom:24}}>
          {[30,60].map(t=>(
            <button key={t} onClick={()=>{setTimeControl(t);setTimeLeft(t);setSelectingTime(false);}}
              style={{
                width:120,padding:"20px 0",
                background:timeControl===t?"#7c4a1e":"#2d1a0a",
                color:"#c9a96e",
                border:`2px solid ${timeControl===t?"#c9a96e":"#7c4a1e44"}`,
                borderRadius:10,cursor:"pointer",fontFamily:"Georgia,serif",
              }}>
              <div style={{fontSize:32,fontWeight:"bold",marginBottom:4}}>{t}초</div>
              <div style={{fontSize:12,color:"#7c6040"}}>{t===30?"빠른 대전":"일반 대전"}</div>
            </button>
          ))}
        </div>
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>← 뒤로</button>
      </div>
    </div>
  );

  const startRivalMatch = async(rivalId) => {
    setMatchMode("room"); setPhase("waiting");
    const code = "R"+Math.random().toString(36).slice(2,7).toUpperCase();
    try {
      const newRoom = await createRoom(user.id, "room", code);
      setRoom(newRoom); setMySide("w"); setRoomCode(code);
      setShowRivals(false);
      // Notify rival via room code (they need to manually join for now)
      alert(`방 코드: ${code}
라이벌에게 코드를 전달하세요!`);
      startPoll(newRoom.id);
    } catch(e) { alert("방 생성 실패: "+e.message); setPhase("lobby"); }
  };

  // Lobby
  // playing 조건: roomStatus가 playing이거나 phase가 playing
  const isPlaying = roomStatus==="playing" || phase==="playing";

  if(phase==="lobby") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"32px 40px",width:"100%",maxWidth:440,boxShadow:"0 0 40px #0008",textAlign:"center"}}>
        <h2 style={{color:"#c9a96e",fontSize:22,marginBottom:4}}>🌐 온라인 대전</h2>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20}}>
          <LevelBadge rating={profile?.rating} size={13}/>
          <span style={{color:"#7c6040",fontSize:13}}>{profile?.username} · {profile?.rating}점</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          <button onClick={startRandom} style={btnStyle("#5a1a5c","#e06af5")}>🎲 랜덤 매칭</button>
          <button onClick={createRoomCode} style={btnStyle("#1a3a5c","#6ab4f5")}>🏠 방 만들기</button>
          <button onClick={()=>setShowRivals(!showRivals)} style={btnStyle("#3a1a2c","#f06af5")}>⚔️ 라이벌 매칭</button>
          {showRivals&&(
            <div style={{background:"#2d1a0a",border:"1px solid #7c4a1e44",borderRadius:8,padding:"10px 12px",textAlign:"left"}}>
              {rivals.length===0&&<p style={{color:"#7c6040",fontSize:13,margin:0}}>등록된 라이벌이 없습니다.</p>}
              {rivals.map((r,i)=>(
                <div key={i} onClick={()=>startRivalMatch(r.id)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer",
                    borderRadius:6,marginBottom:4,background:"#1a0e06"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#3d2a14"}
                  onMouseLeave={e=>e.currentTarget.style.background="#1a0e06"}>
                  <LevelBadge rating={r.rating} size={11}/>
                  <span style={{color:"#c9a96e",flex:1,fontSize:13}}>{r.username}</span>
                  <span style={{color:"#7c6040",fontSize:12}}>{r.rating}점</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>onScheduled()} style={btnStyle("#2a2a0a","#f5c842")}>📅 예약 매치</button>
          <div style={{display:"flex",gap:8}}>
            <input value={inputCode} onChange={e=>setInputCode(e.target.value)}
              placeholder="방 코드 입력" style={{...inputStyle,margin:0,flex:1,fontSize:13}}/>
            <button onClick={joinByCode} style={{...btnStyle("#2d5a27","#7ec876"),padding:"12px 16px",fontSize:13}}>참가</button>
          </div>
        </div>
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>← 뒤로</button>
      </div>
    </div>
  );

  // Waiting
  if(phase==="waiting" && !isPlaying) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif"}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"40px 60px",textAlign:"center",boxShadow:"0 0 40px #0008"}}>
        <div style={{fontSize:48,marginBottom:16,animation:"spin 2s linear infinite"}}>⏳</div>
        <p style={{color:"#c9a96e",fontSize:18,marginBottom:8}}>상대 대기 중...</p>
        {roomCode&&<p style={{color:"#7c6040",fontSize:14}}>방 코드: <span style={{color:"#c9a96e",fontWeight:"bold",letterSpacing:3}}>{roomCode}</span></p>}
        <button onClick={async()=>{
          if(pollRef.current) clearInterval(pollRef.current);
          // 내가 만든 방이면 DB에서 cancelled 처리
          if(room?.id && mySide==="w") await cancelRoom(room.id);
          setPhase("lobby"); setRoom(null); setRoomCode("");
        }} style={{...btnStyle("#7c4a1e","#c9a96e"),marginTop:20}}>취소</button>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // Result
  if(phase==="result" || roomStatus==="finished") return (
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
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
          <LevelBadge rating={profile?.rating} size={12}/>
          <span style={{color:"#c9a96e",fontSize:14}}>{profile?.username}({profile?.rating})</span>
          <span style={{color:"#7c6040",fontSize:13}}>vs</span>
          <LevelBadge rating={oppProfile?.rating} size={12}/>
          <span style={{color:"#c9a96e",fontSize:14}}>{oppProfile?.username||"상대"}({oppProfile?.rating||"?"})</span>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <span style={{color:myTurn?"#7ec876":"#7c6040",fontSize:13}}>
            {myTurn?"⬡ 내 차례":"⬡ 상대 차례"}
          </span>
          {myTurn&&status==="playing"&&(
            <div style={{
              display:"inline-flex",alignItems:"center",gap:6,
              background:timeLeft<=10?"#3a0000":"#2d1a0a",
              border:`1px solid ${timeLeft<=10?"#ff4444":"#7c4a1e44"}`,
              borderRadius:20,padding:"3px 12px",
            }}>
              <span style={{fontSize:18}}>⏱</span>
              <span style={{
                color:timeLeft<=10?"#ff6666":"#c9a96e",
                fontSize:16,fontWeight:"bold",fontFamily:"monospace",minWidth:28,textAlign:"center"
              }}>{timeLeft}</span>
            </div>
          )}
        </div>
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

      {/* Chat section */}
      <div style={{marginTop:12,width:500,maxWidth:"95vw"}}>
        {!chatEnabled ? (
          <button onClick={async()=>{
            setChatEnabled(true);
            if(room?.id) {
              await supaFetch(`/rest/v1/rooms?id=eq.${room.id}`,
                {method:"PATCH", body:JSON.stringify({chat_enabled:true})}).catch(()=>{});
            }
          }} style={{...smallBtn("#2d1a2a","#c06af5"),fontSize:12}}>
            💬 채팅 허용
          </button>
        ) : (
          <div style={{background:"#1a0e06",border:"1px solid #7c4a1e44",borderRadius:10,padding:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{color:"#c9a96e",fontSize:13}}>💬 채팅</span>
              <button onClick={()=>setChatEnabled(false)}
                style={{...smallBtn("#2a1a0a","#7c6040"),fontSize:11}}>닫기</button>
            </div>
            <div style={{height:100,overflowY:"auto",marginBottom:8,display:"flex",flexDirection:"column",gap:4}}>
              {chatMessages.length===0&&<p style={{color:"#7c6040",fontSize:12,textAlign:"center"}}>메시지가 없습니다</p>}
              {chatMessages.map((m,i)=>(
                <div key={i} style={{fontSize:12,color:m.userId===user.id?"#c9a96e":"#7ec876"}}>
                  <span style={{fontWeight:"bold"}}>{m.username}: </span>
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
                onKeyDown={async e=>{
                  if(e.key==="Enter"&&chatInput.trim()&&room?.id) {
                    const msg = {userId:user.id, username:profile?.username||"나", text:chatInput.trim(), ts:Date.now()};
                    const newMsgs = [...chatMessages, msg];
                    setChatMessages(newMsgs);
                    setChatInput("");
                    await supaFetch(`/rest/v1/rooms?id=eq.${room.id}`,
                      {method:"PATCH", body:JSON.stringify({chat_messages:newMsgs})}).catch(()=>{});
                  }
                }}
                placeholder="메시지 입력 후 Enter"
                style={{...inputStyle,margin:0,flex:1,fontSize:12,padding:"6px 10px"}}/>
            </div>
          </div>
        )}
      </div>

      <button onClick={async()=>{
          if(!window.confirm("기권하시겠습니까? 패배로 처리됩니다.")) return;
          if(pollRef.current) clearInterval(pollRef.current);
          if(timerRef.current) clearInterval(timerRef.current);
          // 기권 처리 - 상대방 승리
          if(room?.id) {
            const oppId = mySide==="w" ? room.black_id : room.white_id;
            const oppProf = oppId ? await getProfile(oppId) : null;
            const myRating = profile?.rating||1200;
            const oppRating = oppProf?.rating||1200;
            const delta = calcElo(myRating, oppRating, 0); // 패배
            const wChange = mySide==="w" ? delta : -delta;
            const bChange = mySide==="b" ? delta : -delta;
            await pushMove(room.id, board, turn, lastMove, castleRights,
              "forfeit", oppId, wChange, bChange).catch(()=>{});
            await updateRating(user.id, delta).catch(()=>{});
          }
          onBack();
        }}
        style={{...btnStyle("#7c4a1e","#c9a96e"),marginTop:12}}>⚑ 기권 / 나가기</button>
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
function HomeScreen({ onLoad, onNew, onBack, onManage, onShared }) {
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
          <button onClick={onManage} style={btnStyle("#3a2a5c","#c06af5")}>📋 AI 목록 관리</button>
          <button onClick={onShared} style={btnStyle("#1a3a2c","#6af5b0")}>🌐 공유된 AI 둘러보기</button>
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
        padding:"40px 48px",
        background:"#1a0e06",
        border:"2px solid #7c4a1e",
        borderRadius:12,
        boxShadow:"0 0 60px #0009",
        minWidth:360,maxWidth:520,width:"90%"
      }}>
        <h2 style={{color:"#c9a96e",fontSize:24,marginBottom:24,textAlign:"center",letterSpacing:2}}>
          📂 불러오기
        </h2>
        {names.length===0&&(
          <p style={{color:"#7c6040",textAlign:"center"}}>저장된 AI가 없습니다.</p>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24,maxHeight:400,overflowY:"auto"}}>
          {names.map(n=>{
            const ai = (bots||{})[n];
            if(!ai) return null;
            return (
              <div key={n} onClick={()=>onSelect(ai)} style={{
                padding:"12px 16px",background:"#2d1a0a",
                border:`1px solid ${ai._isShared?"#6af5b044":"#7c4a1e44"}`,
                borderRadius:8,cursor:"pointer",
                display:"flex",justifyContent:"space-between",alignItems:"center",
                color:"#c9a96e",transition:"background 0.15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.background="#3d2a14"}
              onMouseLeave={e=>e.currentTarget.style.background="#2d1a0a"}
              >
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  <span style={{fontSize:15,fontWeight:"bold"}}>{n}</span>
                  <span style={{color:"#7c6040",fontSize:11}}>학습 {ai.trainCount}회</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                  <span style={{
                    fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:"bold",
                    background:ai.type==="qtable"?"#1a3a5c":"#3a1a5c",
                    color:ai.type==="qtable"?"#6ab4f5":"#c06af5",
                    border:`1px solid ${ai.type==="qtable"?"#6ab4f544":"#c06af544"}`
                  }}>{ai.type==="qtable"?"Q-Table":"Minimax"}</span>
                  {ai._isShared&&(
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:"bold",
                      background:"#1a3a2c",color:"#6af5b0",border:"1px solid #6af5b044"}}>🌐 공유중</span>
                  )}
                </div>
              </div>
            );
          })}
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

// --- AI 목록 관리 Screen ---
function AIManageScreen({ onBack, bots, isDemo, onRefresh, userId }) {
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(null);
  const [localBots, setLocalBots] = useState(()=>({...(bots||{})}));
  // Sync if parent bots changes (e.g. after refresh)
  useEffect(()=>{ setLocalBots({...(bots||{})}); }, [bots]);
  const names = Object.keys(localBots||{});

  const handleRename = async(oldName) => {
    const trimmed = newName.trim();
    if(!trimmed || trimmed===oldName) { setRenaming(null); setNewName(""); return; }
    if(localBots[trimmed]) { alert("이미 같은 이름의 AI가 있습니다."); return; }
    setLoading(oldName);
    try {
      const ai = localBots[oldName];
      if(!isDemo && ai._dbId) {
        await renameBotInDB(ai._dbId, trimmed);
      }
      // Update locally regardless
      const updated = {...localBots};
      ai.name = trimmed;
      updated[trimmed] = ai;
      delete updated[oldName];
      setLocalBots(updated);
      if(isDemo) saveBotsLocal(updated);
      onRefresh();
    } catch(e) { alert("이름 변경 실패: "+e.message); }
    setRenaming(null); setNewName(""); setLoading(null);
  };

  const handleDelete = async(name) => {
    if(!window.confirm(`"${name}" AI를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setLoading(name);
    try {
      const ai = localBots[name];
      if(!isDemo && ai._dbId) {
        await deleteBotFromDB(ai._dbId);
      }
      const updated = {...localBots};
      delete updated[name];
      setLocalBots(updated);
      if(isDemo) saveBotsLocal(updated);
      onRefresh();
    } catch(e) { alert("삭제 실패: "+e.message); }
    setLoading(null);
  };

  const handleToggleShare = async(name) => {
    const ai = localBots[name];
    if(isDemo) { alert("데모 계정은 AI를 공유할 수 없습니다."); return; }
    if(!ai._dbId) { alert("먼저 AI를 저장해주세요."); return; }
    setLoading(name);
    try {
      const newShared = !ai._isShared;
      await toggleShareBot(ai._dbId, newShared);
      ai._isShared = newShared;
      setLocalBots({...localBots, [name]: ai});
      onRefresh();
    } catch(e) { alert("공유 설정 실패: "+e.message); }
    setLoading(null);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #7c4a1e",borderRadius:12,
        padding:"32px 40px",width:"100%",maxWidth:560,boxShadow:"0 0 40px #0008"}}>
        <h2 style={{color:"#c9a96e",fontSize:22,marginBottom:20,textAlign:"center"}}>📋 AI 목록 관리</h2>
        {names.length===0&&<p style={{color:"#7c6040",textAlign:"center",marginBottom:20}}>저장된 AI가 없습니다.</p>}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20,maxHeight:480,overflowY:"auto"}}>
          {names.map(n=>{
            const ai = localBots[n];
            if(!ai) return null;
            const isLoading = loading===n;
            return (
              <div key={n} style={{background:"#2d1a0a",border:`1px solid ${ai._isShared?"#6af5b033":"#7c4a1e33"}`,
                borderRadius:10,padding:"14px 16px"}}>
                {/* Top row: name + badges */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  {renaming===n ? (
                    <input value={newName} onChange={e=>setNewName(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")handleRename(n);if(e.key==="Escape"){setRenaming(null);setNewName("");}}}
                      autoFocus
                      style={{...inputStyle,margin:0,flex:1,fontSize:14,padding:"6px 10px"}}/>
                  ) : (
                    <span style={{color:"#c9a96e",fontSize:16,fontWeight:"bold",flex:1}}>{n}</span>
                  )}
                  <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:"bold",
                    background:ai.type==="qtable"?"#1a3a5c":"#3a1a5c",
                    color:ai.type==="qtable"?"#6ab4f5":"#c06af5",
                    border:`1px solid ${ai.type==="qtable"?"#6ab4f544":"#c06af544"}`
                  }}>{ai.type==="qtable"?"Q-Table":"Minimax"}</span>
                  {ai._isShared&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
                    background:"#1a3a2c",color:"#6af5b0",border:"1px solid #6af5b044",fontWeight:"bold"}}>🌐 공유중</span>}
                </div>
                {/* Stats row */}
                <div style={{display:"flex",gap:16,marginBottom:12,flexWrap:"wrap"}}>
                  <span style={{color:"#7c6040",fontSize:12}}>학습 <span style={{color:"#c9a96e"}}>{ai.trainCount}</span>회</span>
                  {ai.type==="minimax"&&<span style={{color:"#7c6040",fontSize:12}}>탐색깊이 <span style={{color:"#c9a96e"}}>{ai.depth||3}</span></span>}
                  {ai._isShared&&ai._sharedAt&&(
                    <span style={{color:"#7c6040",fontSize:12}}>공유일 <span style={{color:"#6af5b0"}}>{new Date(ai._sharedAt).toLocaleDateString("ko-KR")}</span></span>
                  )}
                </div>
                {/* Action buttons */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {renaming===n ? (
                    <>
                      <button onClick={()=>handleRename(n)} disabled={isLoading}
                        style={{...smallBtn("#2d5a27","#7ec876")}}>✓ 저장</button>
                      <button onClick={()=>{setRenaming(null);setNewName("");}}
                        style={{...smallBtn("#3d2208","#c9a96e")}}>✕ 취소</button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>{setRenaming(n);setNewName(n);}} disabled={isLoading}
                        style={smallBtn("#2d2a1a","#c9a96e")}>✏️ 이름 변경</button>
                      {!isDemo&&(
                        <button onClick={()=>handleToggleShare(n)} disabled={isLoading}
                          style={smallBtn(ai._isShared?"#2a1a0a":"#1a3a2c",ai._isShared?"#e07070":"#6af5b0")}>
                          {ai._isShared?"🔒 공유 취소":"🌐 공유"}
                        </button>
                      )}
                      <button onClick={()=>handleDelete(n)} disabled={isLoading}
                        style={smallBtn("#3a1a1a","#e07070")}>🗑️ 삭제</button>
                    </>
                  )}
                  {isLoading&&<span style={{color:"#7c6040",fontSize:12,alignSelf:"center"}}>처리 중...</span>}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>← 뒤로</button>
      </div>
    </div>
  );
}

function smallBtn(bg, fg) {
  return {padding:"5px 12px",background:bg,color:fg,border:`1px solid ${fg}44`,
    borderRadius:6,fontSize:12,fontFamily:"Georgia,serif",cursor:"pointer",transition:"all 0.15s"};
}

// --- 공유된 AI 목록 Screen ---
function SharedAIScreen({ onBack, onSelect, currentUserId, isDemo }) {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remixing, setRemixing] = useState(null);

  useEffect(()=>{
    loadSharedBots().then(b=>{ setBots(b); setLoading(false); });
  },[]);

  const handleRemix = async(ai) => {
    const name = prompt(`리믹스할 AI 이름을 입력하세요:`, `${ai.name}_copy`);
    if(!name||!name.trim()) return;
    setRemixing(ai._dbId);
    try {
      if(isDemo) {
        // demo: save locally
        const newAi = ai.type==="qtable"
          ? QTableAI.deserialize({...ai.serialize(), name:name.trim()})
          : ChessAI.deserialize({...ai.serialize(), name:name.trim()});
        const local = loadBotsLocal();
        local[name.trim()] = newAi;
        saveBotsLocal(local);
        alert("로컬에 저장되었습니다!");
      } else {
        await remixBot(currentUserId, ai, name.trim());
        alert("내 AI 목록에 추가되었습니다!");
      }
    } catch(e) { alert("리믹스 실패: "+e.message); }
    setRemixing(null);
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06,#2d1a0a)",fontFamily:"Georgia,serif",padding:20}}>
      <div style={{background:"#1a0e06",border:"2px solid #6af5b033",borderRadius:12,
        padding:"32px 40px",width:"100%",maxWidth:580,boxShadow:"0 0 40px #0008"}}>
        <h2 style={{color:"#6af5b0",fontSize:22,marginBottom:6,textAlign:"center"}}>🌐 공유된 AI</h2>
        <p style={{color:"#7c6040",fontSize:13,marginBottom:20,textAlign:"center"}}>
          다른 유저의 AI와 대전하거나 리믹스해 더 학습시킬 수 있습니다
        </p>
        {loading&&<p style={{color:"#7c6040",textAlign:"center"}}>불러오는 중...</p>}
        {!loading&&bots.length===0&&<p style={{color:"#7c6040",textAlign:"center"}}>공유된 AI가 없습니다.</p>}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20,maxHeight:480,overflowY:"auto"}}>
          {bots.map((ai,i)=>(
            <div key={i} style={{background:"#2d1a0a",border:"1px solid #6af5b022",borderRadius:10,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                <span style={{color:"#c9a96e",fontSize:15,fontWeight:"bold",flex:1}}>{ai.name}</span>
                <span style={{fontSize:10,padding:"2px 7px",borderRadius:10,fontWeight:"bold",
                  background:ai.type==="qtable"?"#1a3a5c":"#3a1a5c",
                  color:ai.type==="qtable"?"#6ab4f5":"#c06af5",
                  border:`1px solid ${ai.type==="qtable"?"#6ab4f544":"#c06af544"}`
                }}>{ai.type==="qtable"?"Q-Table":"Minimax"}</span>
              </div>
              <div style={{display:"flex",gap:16,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{color:"#7c6040",fontSize:12}}>학습 <span style={{color:"#c9a96e"}}>{ai.trainCount}</span>회</span>
                {ai.type==="minimax"&&<span style={{color:"#7c6040",fontSize:12}}>탐색깊이 <span style={{color:"#c9a96e"}}>{ai.depth||3}</span></span>}
                {ai._sharedAt&&<span style={{color:"#7c6040",fontSize:12}}>공유일 <span style={{color:"#6af5b0"}}>{new Date(ai._sharedAt).toLocaleDateString("ko-KR")}</span></span>}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>onSelect(ai)}
                  style={smallBtn("#1a3a5c","#6ab4f5")}>⚔️ 대전하기</button>
                <button onClick={()=>handleRemix(ai)} disabled={remixing===ai._dbId}
                  style={smallBtn("#1a3a2c","#6af5b0")}>
                  {remixing===ai._dbId?"리믹스 중...":"🔀 리믹스"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),width:"100%"}}>← 뒤로</button>
      </div>
    </div>
  );
}

// --- AI Dashboard ---
function AIDashboard({ ai, onSave, onBack, theme="wood", isDemo=false, onToggleShare=()=>{} }) {
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
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {!isDemo&&ai._dbId&&(
            <button onClick={onToggleShare} style={{
              ...btnStyle(ai._isShared?"#3a1a0a":"#1a3a2c", ai._isShared?"#e07070":"#6af5b0"),
              flex:1,fontSize:13
            }}>
              {ai._isShared?"🔒 공유 취소":"🌐 공유하기"}
            </button>
          )}
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
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [screen, setScreen] = useState("menu");
  const [screenParam, setScreenParam] = useState(null); // for profile username etc
  const [theme, setTheme] = useState(()=>localStorage.getItem("chess_theme")||"wood");

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
    setUser("demo"); setProfile(null);
    setAuthState("app"); setScreen("menu");
  };

  const handleLogout = async() => {
    if(user!=="demo") await authSignOut();
    setUser(null); setProfile(null); setAuthState("auth"); setScreen("menu");
  };

  const goProfile = (username=null) => {
    setScreenParam(username);
    setScreen("profile");
  };

  const refreshProfile = async() => {
    if(user&&user!=="demo") {
      const p = await getProfile(user.id);
      setProfile(p);
    }
  };

  if(authState==="loading") return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#1a0e06",color:"#c9a96e",fontFamily:"Georgia,serif",fontSize:24}}>♟ 로딩 중...</div>
  );

  if(authState==="auth") return <AuthScreen onLogin={handleLogin} onDemo={handleDemo}/>;

  if(screen==="leaderboard") return (
    <LeaderboardScreen onBack={()=>setScreen("menu")} currentProfile={profile}
      onViewProfile={uname=>goProfile(uname)}/>
  );
  if(screen==="pvp_offline") return <PvPOfflineScreen onBack={()=>setScreen("menu")} theme={theme}/>;
  if(screen==="pvp_online") return (
    <PvPOnlineScreen onBack={()=>setScreen("menu")} user={user} profile={profile} theme={theme}
      onScheduled={()=>setScreen("scheduled")}/>
  );
  if(screen==="scheduled") return (
    <ScheduledMatchScreen
      onBack={()=>setScreen("pvp_online")}
      user={user} profile={profile}
      onJoinMatch={(m)=>{ setScreenParam(m); setScreen("pvp_online"); }}
    />
  );
  if(screen==="profile") return (
    <ProfileScreen
      onBack={()=>{ refreshProfile(); setScreen(screenParam?"leaderboard":"menu"); }}
      targetUsername={screenParam}
      currentUserId={user==="demo"?null:user?.id}
      isDemo={user==="demo"}
    />
  );
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
      onProfile={()=>goProfile(null)}
    />
  );
}

// AI Root — wraps old AI flow with DB support
function AIRoot({ user, profile, onBack, theme }) {
  const isDemo = user==="demo";
  const [screen, setScreen] = useState("home"); // home|load|new|dashboard|manage|shared
  const [currentAI, setCurrentAI] = useState(null);
  const [bots, setBots] = useState({});
  const [loaded, setLoaded] = useState(false);

  const refreshBots = async() => {
    if(isDemo) { setBots({...loadBotsLocal()}); }
    else { const b = await loadBotsFromDB(user.id); setBots(b); }
  };

  useEffect(()=>{
    if(!loaded) {
      refreshBots().then(()=>setLoaded(true));
    }
  },[loaded]);

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
    else {
      try {
        await saveBotToDB(user.id, ai);
      } catch(e){
        alert("저장 실패: "+e.message+"\n로그인이 만료됐을 수 있습니다. 다시 로그인해주세요.");
        return;
      }
    }
    setScreen("home"); setCurrentAI(null);
  };

  const handleToggleShare = async() => {
    if(!currentAI||isDemo) return;
    try {
      const newShared = !currentAI._isShared;
      await toggleShareBot(currentAI._dbId, newShared);
      currentAI._isShared = newShared;
      setBots(b=>({...b, [currentAI.name]:currentAI}));
    } catch(e) { alert("공유 설정 실패: "+e.message); }
  };

  if(!loaded) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:"#1a0e06",color:"#c9a96e",fontFamily:"Georgia,serif"}}>불러오는 중...</div>
  );

  if(screen==="home") return (
    <HomeScreen
      onLoad={()=>setScreen("load")}
      onNew={()=>setScreen("new")}
      onBack={onBack}
      onManage={()=>setScreen("manage")}
      onShared={()=>setScreen("shared")}
    />
  );
  if(screen==="load") return <LoadScreen onBack={()=>setScreen("home")} onSelect={handleLoad} bots={bots}/>;
  if(screen==="new") return <NewAIScreen onBack={()=>setScreen("home")} onCreate={handleNew}/>;
  if(screen==="manage") return (
    <AIManageScreen
      onBack={()=>{ refreshBots(); setScreen("home"); }}
      bots={bots}
      isDemo={isDemo}
      userId={user?.id}
      onRefresh={refreshBots}
    />
  );
  if(screen==="shared") return (
    <SharedAIScreen
      onBack={()=>setScreen("home")}
      onSelect={(ai)=>{ setCurrentAI(ai); setScreen("dashboard"); }}
      currentUserId={user?.id}
      isDemo={isDemo}
    />
  );
  if(screen==="dashboard"&&currentAI) return (
    <AIDashboard
      ai={currentAI}
      onSave={handleSave}
      onBack={()=>{ setScreen("home"); setCurrentAI(null); }}
      theme={theme}
      isDemo={isDemo}
      onToggleShare={handleToggleShare}
    />
  );
  return (
    <HomeScreen
      onLoad={()=>setScreen("load")}
      onNew={()=>setScreen("new")}
      onBack={onBack}
      onManage={()=>setScreen("manage")}
      onShared={()=>setScreen("shared")}
    />
  );
}
