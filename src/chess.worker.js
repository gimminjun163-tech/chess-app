// chess.worker.js — Web Worker for background training
// Runs Minimax self-play without blocking the main thread

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
  if(move.castle==="k"){nb[tr][fc-1]=side+"R";nb[tr][7]=null;}
  if(move.castle==="q"){nb[tr][fc+1]=side+"R";nb[tr][0]=null;}
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
      const midC = m.castle==="k"?5:3;
      const nb2=applyMove(board,{from:m.from,to:[m.from[0],midC]});
      if(isInCheck(board,side)||isInCheck(nb2,side)) return false;
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

class ChessAI {
  constructor(name) {
    this.name = name;
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


// ── Worker message handler ──
let workerAI = null;
let running = false;

self.onmessage = (e) => {
  const { type, data } = e.data;

  if (type === "init") {
    workerAI = ChessAI.deserialize(data.ai);
    running = true;
    runTraining();
  }

  if (type === "stop") {
    running = false;
    // Send final weights back
    if (workerAI) {
      self.postMessage({ type: "done", ai: workerAI.serialize() });
    }
  }

  if (type === "getWeights") {
    if (workerAI) {
      self.postMessage({ type: "weights", ai: workerAI.serialize() });
    }
  }
};

function runTraining() {
  if (!running || !workerAI) return;

  // Play a batch of games
  const BATCH = 5;
  for (let i = 0; i < BATCH; i++) {
    if (!running) break;
    playGame(workerAI);
  }

  // Report progress every batch
  self.postMessage({ type: "progress", trainCount: workerAI.trainCount, weights: workerAI.weights });

  // Yield to allow stop messages, then continue
  if (running) {
    setTimeout(runTraining, 0);
  }
}
