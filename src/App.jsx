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
// AI (Q-Learning simplified)
// ============================================================
function boardToKey(board, side) {
  return board.map(r=>r.map(c=>c||".").join("")).join("|")+side;
}

function evaluateBoard(board, side) {
  const vals = {P:1,N:3,B:3,R:5,Q:9,K:0};
  let score=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(!p) continue;
    const v=vals[p[1]]||0;
    score += color(p)===side?v:-v;
  }
  return score;
}

function moveToKey(m) {
  return `${m.from[0]}${m.from[1]}${m.to[0]}${m.to[1]}${m.castle||""}${m.promote||""}`;
}

class ChessAI {
  constructor(name) {
    this.name = name;
    this.trainCount = 0;
    // qtable: { stateKey: { moveKey: value } }
    this.qtable = {};
    this.epsilon = 0.3;
    this.alpha = 0.1;
    this.gamma = 0.9;
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
    if(explore && Math.random()<this.epsilon) {
      return moves[Math.floor(Math.random()*moves.length)];
    }
    let best=null, bestQ=-Infinity;
    for(const m of moves) {
      const q=this.getQ(state,moveToKey(m));
      if(q>bestQ){bestQ=q;best=m;}
    }
    return best||moves[Math.floor(Math.random()*moves.length)];
  }

  learn(state, mkey, reward, nextState, nextMoves) {
    const oldQ = this.getQ(state, mkey);
    let maxNext = 0;
    if(nextMoves&&nextMoves.length) {
      maxNext = Math.max(...nextMoves.map(m=>this.getQ(nextState,moveToKey(m))));
    }
    const newQ = oldQ + this.alpha*(reward + this.gamma*maxNext - oldQ);
    this.setQ(state, mkey, newQ);
  }

  serialize() {
    return { name: this.name, trainCount: this.trainCount, qtable: this.qtable };
  }

  static deserialize(data) {
    const ai = new ChessAI(data.name);
    ai.trainCount = data.trainCount||0;
    ai.qtable = data.qtable||{};
    return ai;
  }
}

function playGame(ai, maxMoves=200) {
  let board = INIT_BOARD();
  let side = "w";
  let lastMove = null;
  let castleRights = {w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}};
  const history = [];

  for(let i=0;i<maxMoves;i++) {
    const moves = getAllValidMoves(board, side, lastMove, castleRights);
    if(!moves.length) {
      // checkmate or stalemate
      const inCheck = isInCheck(board, side);
      const winner = inCheck ? (side==="w"?"b":"w") : null;
      // Reward/penalize
      history.forEach(({state,mkey,s,nextState,nextMoves})=>{
        let r=0;
        if(winner===s) r=10;
        else if(winner&&winner!==s) r=-10;
        ai.learn(state,mkey,r,nextState,nextMoves);
      });
      ai.trainCount++;
      return winner;
    }
    const state = boardToKey(board, side);
    const move = ai.chooseMove(board, side, lastMove, castleRights);
    if(!move) break;
    const mkey = moveToKey(move);
    const nb = applyMove(board, move);
    castleRights = updateCastleRights(castleRights, board, move);
    const oppMoves = getAllValidMoves(nb, side==="w"?"b":"w", move, castleRights);
    const nextState = boardToKey(nb, side==="w"?"b":"w");
    const matReward = evaluateBoard(nb, side) - evaluateBoard(board, side);
    history.push({state,mkey,s:side,nextState,nextMoves:oppMoves,immediate:matReward});
    lastMove = move;
    board = nb;
    side = side==="w"?"b":"w";
  }

  // Draw — partial reward
  history.forEach(({state,mkey,s,nextState,nextMoves,immediate})=>{
    ai.learn(state,mkey,immediate*0.1,nextState,nextMoves);
  });
  ai.trainCount++;
  return null;
}

// ============================================================
// STORAGE
// ============================================================
const STORAGE_KEY = "chess_ai_bots";

function loadBots() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,ChessAI.deserialize(v)]));
  } catch { return {}; }
}

function saveBots(bots) {
  const d = Object.fromEntries(Object.entries(bots).map(([k,v])=>[k,v.serialize()]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

// ============================================================
// BOARD COMPONENT
// ============================================================
function ChessBoard({ board, selected, highlights, onSquareClick, lastMoveSq, animPiece }) {
  const files = ["a","b","c","d","e","f","g","h"];
  const ranks = ["8","7","6","5","4","3","2","1"];

  return (
    <div style={{
      display:"inline-block",
      border:"6px solid #3d2208",
      borderRadius:4,
      boxShadow:"0 8px 40px #0009, 0 2px 8px #0006",
      background:"#3d2208",
    }}>
      <div style={{display:"grid",gridTemplateColumns:"20px repeat(8,60px)",gridTemplateRows:"repeat(8,60px) 20px"}}>
        {/* Rank labels */}
        {ranks.map((rank,ri)=>(
          <div key={rank} style={{
            gridColumn:1,gridRow:ri+1,
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#c9a96e",fontSize:11,fontFamily:"Georgia,serif",fontWeight:"bold"
          }}>{rank}</div>
        ))}
        {/* File labels */}
        {files.map((file,fi)=>(
          <div key={file} style={{
            gridColumn:fi+2,gridRow:9,
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#c9a96e",fontSize:11,fontFamily:"Georgia,serif",fontWeight:"bold"
          }}>{file}</div>
        ))}
        {/* Squares */}
        {board.map((row,ri)=>row.map((piece,ci)=>{
          const isLight=(ri+ci)%2===0;
          const isSel=selected&&selected[0]===ri&&selected[1]===ci;
          const isHl=highlights.some(h=>h[0]===ri&&h[1]===ci);
          const isLast=lastMoveSq&&lastMoveSq.some(s=>s[0]===ri&&s[1]===ci);

          let bg = isLight?"#f0d9b5":"#b58863";
          if(isLast) bg = isLight?"#cdd26a":"#aaa23a";
          if(isSel) bg = "#f6f669";
          if(isHl) bg = isLight?"#cdd26a88":"#aaa23a88";

          const isAnimTarget = animPiece&&animPiece.to[0]===ri&&animPiece.to[1]===ci;

          return (
            <div key={`${ri}-${ci}`} style={{
              gridColumn:ci+2,gridRow:ri+1,
              width:60,height:60,
              background:bg,
              cursor:isHl||piece?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",
              position:"relative",
              transition:"background 0.15s",
              userSelect:"none",
            }} onClick={()=>onSquareClick(ri,ci)}>
              {isHl&&!piece&&(
                <div style={{
                  width:20,height:20,borderRadius:"50%",
                  background:"rgba(0,0,0,0.18)",
                  pointerEvents:"none"
                }}/>
              )}
              {isHl&&piece&&(
                <div style={{
                  position:"absolute",inset:0,
                  border:"4px solid rgba(0,0,0,0.25)",
                  borderRadius:"50%",boxSizing:"border-box",
                  pointerEvents:"none"
                }}/>
              )}
              {piece&&(
                <span style={{
                  fontSize:40,
                  lineHeight:1,
                  filter:"drop-shadow(0 1px 2px #0008)",
                  animation: isAnimTarget?"pieceSlide 0.25s ease-out":"none",
                  display:"block",
                  transition:"transform 0.25s",
                  zIndex:2,
                }}>
                  {PIECES[piece]}
                </span>
              )}
            </div>
          );
        }))}
      </div>
      <style>{`
        @keyframes pieceSlide {
          from { transform: scale(1.15); opacity:0.7; }
          to { transform: scale(1); opacity:1; }
        }
      `}</style>
    </div>
  );
}

// ============================================================
// GAME STATE MANAGER
// ============================================================
function useGameState(ai, mode, playerSide) {
  const [board, setBoard] = useState(INIT_BOARD());
  const [turn, setTurn] = useState("w");
  const [selected, setSelected] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [lastMoveSq, setLastMoveSq] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [castleRights, setCastleRights] = useState({w:{kingSide:true,queenSide:true},b:{kingSide:true,queenSide:true}});
  const [status, setStatus] = useState("playing");
  const [animPiece, setAnimPiece] = useState(null);
  const stateHistRef = useRef([]);

  const makeMove = useCallback((board, move, side, learn=false) => {
    const state = boardToKey(board, side);
    const mkey = moveToKey(move);
    const nb = applyMove(board, move);
    const newCR = updateCastleRights(castleRights, board, move);

    if(learn) {
      const opp = side==="w"?"b":"w";
      const oppMoves = getAllValidMoves(nb, opp, move, newCR);
      const nextState = boardToKey(nb, opp);
      const reward = evaluateBoard(nb, side) - evaluateBoard(board, side);
      stateHistRef.current.push({state,mkey,s:side,nextState,nextMoves:oppMoves,immediate:reward});
    }

    setAnimPiece({to:move.to});
    setTimeout(()=>setAnimPiece(null),300);
    setLastMoveSq([move.from, move.to]);
    setLastMove(move);
    setCastleRights(newCR);
    setBoard(nb);
    setSelected(null);
    setHighlights([]);

    const newTurn = side==="w"?"b":"w";
    setTurn(newTurn);

    const nextMoves = getAllValidMoves(nb, newTurn, move, newCR);
    if(!nextMoves.length) {
      const inChk = isInCheck(nb, newTurn);
      if(learn && ai) {
        stateHistRef.current.forEach(h=>{
          let r=h.immediate;
          if(inChk&&h.s===side) r+=5;
          if(inChk&&h.s===newTurn) r-=5;
          ai.learn(h.state,h.mkey,r,h.nextState,h.nextMoves||[]);
        });
        ai.trainCount++;
      }
      setStatus(inChk?`checkmate_${side}`:"stalemate");
      return nb;
    }
    return nb;
  }, [castleRights, ai]);

  return { board, setBoard, turn, setTurn, selected, setSelected,
           highlights, setHighlights, lastMoveSq, lastMove, setLastMove,
           castleRights, setCastleRights, status, setStatus, animPiece,
           makeMove, stateHistRef };
}

// ============================================================
// SCREENS
// ============================================================

// --- Home Screen ---
function HomeScreen({ onLoad, onNew }) {
  return (
    <div style={{
      minHeight:"100vh",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      background:"linear-gradient(135deg,#1a0e06 0%,#2d1a0a 50%,#1a0e06 100%)",
      fontFamily:"Georgia,serif"
    }}>
      <div style={{
        padding:"60px 80px",
        background:"linear-gradient(145deg,#2d1a0a,#1a0e06)",
        border:"2px solid #7c4a1e",
        borderRadius:12,
        boxShadow:"0 0 60px #0009, inset 0 0 40px #00000060",
        textAlign:"center",
        maxWidth:500,width:"90%"
      }}>
        <div style={{fontSize:64,marginBottom:8}}>♟</div>
        <h1 style={{
          color:"#c9a96e",fontSize:36,margin:"0 0 8px",
          letterSpacing:3,textShadow:"0 2px 10px #0008"
        }}>CHESS AI</h1>
        <p style={{color:"#7c6040",fontSize:14,marginBottom:40,letterSpacing:1}}>
          강화학습 체스 엔진
        </p>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <button onClick={onLoad} style={btnStyle("#7c4a1e","#c9a96e")}>
            📂 불러오기
          </button>
          <button onClick={onNew} style={btnStyle("#2d5a27","#7ec876")}>
            ✨ 새로운 AI 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(bg,fg) {
  return {
    padding:"14px 32px",
    background:bg,color:fg,
    border:`1px solid ${fg}44`,
    borderRadius:6,
    fontSize:16,fontFamily:"Georgia,serif",
    cursor:"pointer",
    letterSpacing:1,
    transition:"all 0.2s",
    boxShadow:"0 2px 8px #0004",
  };
}

// --- Load Screen ---
function LoadScreen({ onBack, onSelect }) {
  const [bots] = useState(()=>loadBots());
  const names = Object.keys(bots);
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
              <span style={{color:"#7c6040",fontSize:13}}>학습 {bots[n].trainCount}회</span>
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
  const [name, setName] = useState("");
  const bots = loadBots();
  return (
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
          onKeyDown={e=>e.key==="Enter"&&name.trim()&&onCreate(name.trim())}
          placeholder="AI 이름 입력..."
          style={{
            width:"100%",padding:"12px 16px",
            background:"#2d1a0a",
            border:"1px solid #7c4a1e",
            borderRadius:6,
            color:"#c9a96e",fontSize:16,
            fontFamily:"Georgia,serif",
            boxSizing:"border-box",
            outline:"none",marginBottom:16
          }}
          autoFocus
        />
        <div style={{display:"flex",gap:12}}>
          <button onClick={onBack} style={{...btnStyle("#3d2208","#c9a96e"),flex:1}}>
            ← 뒤로
          </button>
          <button
            onClick={()=>name.trim()&&onCreate(name.trim())}
            disabled={!name.trim()}
            style={{...btnStyle("#2d5a27","#7ec876"),flex:1,opacity:name.trim()?1:0.5}}
          >
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}

// --- AI Dashboard ---
function AIDashboard({ ai, onSave, onBack }) {
  const [mode, setMode] = useState(null); // "train","watch","pvp"
  const [playerSide, setPlayerSide] = useState("w");
  const [trainCount, setTrainCount] = useState(ai.trainCount);

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
        <h2 style={{color:"#c9a96e",fontSize:28,marginBottom:4,letterSpacing:2}}>{ai.name}</h2>
        <p style={{color:"#7c6040",fontSize:14,marginBottom:32}}>
          학습 수: <span style={{color:"#c9a96e",fontWeight:"bold"}}>{trainCount}</span>
        </p>
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
    />
  );
}

// ============================================================
// GAME SCREEN
// ============================================================
function GameScreen({ ai, mode, aiSide, onBack, onTrainUpdate }) {
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
    const state = boardToKey(b, side);
    const mkey = moveToKey(move);
    const nb = applyMove(b, move);
    const newCR = updateCastleRights(cr, b, move);
    const opp = side==="w"?"b":"w";
    const oppMoves = getAllValidMoves(nb, opp, move, newCR);
    const nextState = boardToKey(nb, opp);
    const reward = evaluateBoard(nb, side) - evaluateBoard(b, side);

    if(learn) {
      stateHist.current.push({state,mkey,s:side,nextState,nextMoves:oppMoves,immediate:reward});
    }

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
      if(learn) {
        stateHist.current.forEach(h=>{
          let r=h.immediate;
          if(inChk&&h.s===side) r+=5;
          if(inChk&&h.s===opp) r-=5;
          ai.learn(h.state,h.mkey,r,h.nextState,h.nextMoves||[]);
        });
        ai.trainCount++;
        stateHist.current=[];
      }
      const winner = inChk?side:null;
      setStatus(winner?`checkmate_${winner}`:"stalemate");
      setMessage(winner?(winner==="w"?"백(White) 승리!":"흑(Black) 승리!"):"스테일메이트 (무승부)");
      return {nb, newCR, newTurn, ended:true};
    }
    return {nb, newCR, newTurn, ended:false};
  }, [ai]);

  // === TRAIN MODE (no display, fast) ===
  useEffect(()=>{
    if(mode!=="train") return;
    runRef.current=true;
    let frameId;

    const runBatch = ()=>{
      if(!runRef.current) return;
      for(let i=0;i<50;i++){
        playGame(ai);
        trainBatch.current++;
      }
      setTrainDisplay(ai.trainCount);
      onTrainUpdate();
      frameId=requestAnimationFrame(runBatch);
    };
    frameId=requestAnimationFrame(runBatch);
    return ()=>{runRef.current=false;cancelAnimationFrame(frameId);};
  },[mode,ai,onTrainUpdate]);

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
          padding:"40px 60px",textAlign:"center",boxShadow:"0 0 40px #0008"
        }}>
          <div style={{fontSize:60,marginBottom:12,animation:"spin 2s linear infinite"}}>⚙️</div>
          <p style={{color:"#c9a96e",fontSize:18,marginBottom:8}}>빠른 학습 중...</p>
          <p style={{color:"#7c6040",fontSize:14}}>백그라운드에서 AI가 게임을 시뮬레이션하고 있습니다.</p>
          <div style={{margin:"20px 0",fontSize:28,color:"#c9a96e",fontWeight:"bold"}}>{trainDisplay}</div>
          <button onClick={onBack} style={btnStyle("#7c4a1e","#c9a96e")}>
            학습 중단 및 돌아가기
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
  const [screen, setScreen] = useState("home"); // home|load|new|dashboard
  const [currentAI, setCurrentAI] = useState(null);
  const [bots, setBots] = useState(()=>loadBots());

  const handleLoad = (ai) => { setCurrentAI(ai); setScreen("dashboard"); };
  const handleNew = (name) => {
    const existing = bots[name];
    if(existing){setCurrentAI(existing);setScreen("dashboard");return;}
    const ai = new ChessAI(name);
    setCurrentAI(ai);
    setScreen("dashboard");
  };
  const handleSave = (ai) => {
    const nb = {...bots,[ai.name]:ai};
    setBots(nb);
    saveBots(nb);
    setScreen("home");
    setCurrentAI(null);
  };

  if(screen==="home") return <HomeScreen onLoad={()=>setScreen("load")} onNew={()=>setScreen("new")} />;
  if(screen==="load") return <LoadScreen onBack={()=>setScreen("home")} onSelect={handleLoad} />;
  if(screen==="new") return <NewAIScreen onBack={()=>setScreen("home")} onCreate={handleNew} />;
  if(screen==="dashboard"&&currentAI) return (
    <AIDashboard
      ai={currentAI}
      onSave={handleSave}
      onBack={()=>{setScreen("home");setCurrentAI(null);}}
    />
  );
  return <HomeScreen onLoad={()=>setScreen("load")} onNew={()=>setScreen("new")} />;
}
