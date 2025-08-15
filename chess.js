/* =======================
   Config & assets
   ======================= */
const USE_IMAGES = true;           // show piece images if available
const AI_THINK_DELAY_MS = 150;     // small delay for AI "thinking"
const AI_DEPTH = 2;                // search depth (2 is reasonable for browser)

/* Image filenames expected in /img */
const pieceImage = {
  'P':'img/wp.png', 'N':'img/wn.png', 'B':'img/wb.png', 'R':'img/wr.png', 'Q':'img/wq.png', 'K':'img/wk.png',
  'p':'img/bp.png', 'n':'img/bn.png', 'b':'img/bb.png', 'r':'img/br.png', 'q':'img/bq.png', 'k':'img/bk.png'
};

/* Unicode fallback */
const pieceUnicode = {
  r:"♜", n:"♞", b:"♝", q:"♛", k:"♚", p:"♟",
  R:"♖", N:"♘", B:"♗", Q:"♕", K:"♔", P:"♙", _:""
};

/* =======================
   Game state
   ======================= */
let board = [
  ["r","n","b","q","k","b","n","r"],
  ["p","p","p","p","p","p","p","p"],
  ["_","_","_","_","_","_","_","_"],
  ["_","_","_","_","_","_","_","_"],
  ["_","_","_","_","_","_","_","_"],
  ["_","_","_","_","_","_","_","_"],
  ["P","P","P","P","P","P","P","P"],
  ["R","N","B","Q","K","B","N","R"]
];

let selected = null;
let currentPlayer = 'white'; // 'white' or 'black'
let enPassantTarget = null;  // [row,col]
let castlingRights = {
  whiteKingMoved:false, whiteRookA:false, whiteRookH:false,
  blackKingMoved:false, blackRookA:false, blackRookH:false
};
let promotionPending = null; // {from,to,moverColor}
let flipped = false;

/* AI side configuration */
let aiPlaysWhite = false;
let aiPlaysBlack = true; // default matches <select> initial "ai-black"

function isUpperCase(c){ return c === c.toUpperCase() && c !== '_'; }
function isLowerCase(c){ return c === c.toLowerCase() && c !== '_'; }
function isWhitePiece(p){ return isUpperCase(p); }
function isBlackPiece(p){ return isLowerCase(p); }
function inside(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function cloneBoard(b){ return b.map(row => row.slice()); }
function cap(s){ return s[0].toUpperCase()+s.slice(1); }
function other(color){ return color==='white'?'black':'white'; }
function isAIColor(color){ return (color==='white' && aiPlaysWhite) || (color==='black' && aiPlaysBlack); }

/* =======================
   Cached elements
   ======================= */
const boardDiv   = document.getElementById('chessboard');
const statusDiv  = document.getElementById('status');
const dialog     = document.getElementById('promotion-dialog');
const coords     = document.getElementById('coords');
const modeSelect = document.getElementById('modeSelect');
const resetBtn   = document.getElementById('resetBtn');
const flipBtn    = document.getElementById('flipBtn');
const chatBtn    = document.getElementById('chatBtn');
const chatPanel  = document.getElementById('chatPanel');
const chatClose  = document.getElementById('chatClose');
const chatForm   = document.getElementById('chatForm');
const chatInput  = document.getElementById('chatInput');
const chatMsgs   = document.getElementById('chatMessages');

/* =======================
   King / check utilities
   ======================= */
function findKing(b, color){
  const k = color==='white'?'K':'k';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(b[r][c]===k) return [r,c];
  return null;
}

function generateAllMoves(b, color, skipSafety=false){
  const out=[];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=b[r][c];
      if(p==='_' ) continue;
      if(color==='white' && !isWhitePiece(p)) continue;
      if(color==='black' && !isBlackPiece(p)) continue;
      out.push(...generateMovesForPiece(b,r,c,skipSafety));
    }
  }
  return out;
}

function squareAttacked(b, r, c, byColor){
  const moves = generateAllMoves(b, byColor, true);
  return moves.some(m => m[1][0]===r && m[1][1]===c);
}

function inCheck(b, color){
  const kPos = findKing(b, color);
  if(!kPos) return false;
  return squareAttacked(b, kPos[0], kPos[1], other(color));
}

/* =======================
   Move generation
   ======================= */
function generateMovesForPiece(b, r, c, skipSafety=false){
  const moves=[];
  const piece = b[r][c];
  if(piece==='_') return moves;

  const white = isWhitePiece(piece);
  const color = white?'white':'black';
  const dir = white?-1:1;

  function addSlide(nr,nc){
    if(!inside(nr,nc)) return false;
    const t=b[nr][nc];
    if(t==='_'){ moves.push([[r,c],[nr,nc]]); return true; }
    if(white?isBlackPiece(t):isWhitePiece(t)) moves.push([[r,c],[nr,nc]]);
    return false;
  }

  switch(piece.toLowerCase()){
    case 'p':{
      const f1=r+dir;
      if(inside(f1,c) && b[f1][c]==='_'){
        moves.push([[r,c],[f1,c]]);
        const startRow = white?6:1;
        const f2=r+2*dir;
        if(r===startRow && b[f2][c]==='_') moves.push([[r,c],[f2,c]]);
      }
      for(const dc of [-1,1]){
        const nr=r+dir, nc=c+dc;
        if(!inside(nr,nc)) continue;
        const t=b[nr][nc];
        if(t!=='_' && (white?isBlackPiece(t):isWhitePiece(t)))
          moves.push([[r,c],[nr,nc]]);
        // en passant
        if(enPassantTarget && enPassantTarget[0]===nr && enPassantTarget[1]===nc){
          moves.push([[r,c],[nr,nc]]);
        }
      }
      break;
    }
    case 'n':{
      const js=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
      for(const [dr,dc] of js){
        const nr=r+dr,nc=c+dc;
        if(!inside(nr,nc)) continue;
        const t=b[nr][nc];
        if(t==='_' || (white?isBlackPiece(t):isWhitePiece(t)))
          moves.push([[r,c],[nr,nc]]);
      }
      break;
    }
    case 'b':
    case 'r':
    case 'q':{
      let dirs=[];
      if(piece.toLowerCase()==='b') dirs=[[1,1],[1,-1],[-1,1],[-1,-1]];
      else if(piece.toLowerCase()==='r') dirs=[[1,0],[-1,0],[0,1],[0,-1]];
      else dirs=[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dr,dc] of dirs){
        let nr=r+dr,nc=c+dc;
        while(inside(nr,nc)){
          if(!addSlide(nr,nc)) break;
          nr+=dr; nc+=dc;
        }
      }
      break;
    }
    case 'k':{
      const ks=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [dr,dc] of ks){
        const nr=r+dr,nc=c+dc;
        if(!inside(nr,nc)) continue;
        const t=b[nr][nc];
        if(t==='_' || (white?isBlackPiece(t):isWhitePiece(t)))
          moves.push([[r,c],[nr,nc]]);
      }
      if(!skipSafety){ // castling
        if(canCastleKingside(b,r,c,color)) moves.push([[r,c],[r,c+2]]);
        if(canCastleQueenside(b,r,c,color)) moves.push([[r,c],[r,c-2]]);
      }
      break;
    }
  }

  // king safety filter
  if(skipSafety) return moves;
  return moves.filter(m=>{
    const sim=cloneBoard(b);
    makeMoveRaw(sim,m[0],m[1]);
    return !inCheck(sim,color);
  });
}

function canCastleKingside(b,r,c,color){
  const isW = color==='white';
  if(isW){
    if(castlingRights.whiteKingMoved || castlingRights.whiteRookH) return false;
    if(b[r][7]!=='R') return false;
  }else{
    if(castlingRights.blackKingMoved || castlingRights.blackRookH) return false;
    if(b[r][7]!=='r') return false;
  }
  if(b[r][5]!=='_'||b[r][6]!=='_') return false;
  if(inCheck(b,color)) return false;
  if(squareAttacked(b,r,5,other(color))) return false;
  if(squareAttacked(b,r,6,other(color))) return false;
  return true;
}
function canCastleQueenside(b,r,c,color){
  const isW = color==='white';
  if(isW){
    if(castlingRights.whiteKingMoved || castlingRights.whiteRookA) return false;
    if(b[r][0]!=='R') return false;
  }else{
    if(castlingRights.blackKingMoved || castlingRights.blackRookA) return false;
    if(b[r][0]!=='r') return false;
  }
  if(b[r][1]!=='_'||b[r][2]!=='_'||b[r][3]!=='_') return false;
  if(inCheck(b,color)) return false;
  if(squareAttacked(b,r,3,other(color))) return false;
  if(squareAttacked(b,r,2,other(color))) return false;
  return true;
}

/* =======================
   Apply a move (real game)
   ======================= */
function makeMoveRaw(b, from, to){
  const piece=b[from[0]][from[1]];
  // handle castling rook move on raw board
  if(piece.toLowerCase()==='k' && from[1]===4){
    if(to[1]===6){ // king side
      b[from[0]][5]=b[from[0]][7];
      b[from[0]][7]='_';
    }else if(to[1]===2){ // queen side
      b[from[0]][3]=b[from[0]][0];
      b[from[0]][0]='_';
    }
  }
  b[to[0]][to[1]]=piece;
  b[from[0]][from[1]]='_';
}

function makeMove(from, to){
  if(promotionPending) return;

  const piece = board[from[0]][from[1]];
  const moverIsWhite = isWhitePiece(piece);
  const moverColor = moverIsWhite ? 'white' : 'black';

  // ensure legality
  const legal = generateMovesForPiece(board, from[0], from[1]);
  if(!legal.some(m => m[1][0]===to[0] && m[1][1]===to[1])){
    selected=null; drawBoard(); return;
  }

  const captured = board[to[0]][to[1]];

  // en passant capture
  if(piece.toLowerCase()==='p' && enPassantTarget && to[0]===enPassantTarget[0] && to[1]===enPassantTarget[1]){
    board[from[0]][to[1]] = '_';
  }

  // update castling rights for movers
  if(piece==='K') castlingRights.whiteKingMoved = true;
  if(piece==='k') castlingRights.blackKingMoved = true;
  if(piece==='R'){
    if(from[0]===7 && from[1]===0) castlingRights.whiteRookA = true;
    if(from[0]===7 && from[1]===7) castlingRights.whiteRookH = true;
  }
  if(piece==='r'){
    if(from[0]===0 && from[1]===0) castlingRights.blackRookA = true;
    if(from[0]===0 && from[1]===7) castlingRights.blackRookH = true;
  }

  // if a rook is captured on its original square, remove that side's rights
  if(captured==='R' && to[0]===7 && to[1]===0) castlingRights.whiteRookA = true;
  if(captured==='R' && to[0]===7 && to[1]===7) castlingRights.whiteRookH = true;
  if(captured==='r' && to[0]===0 && to[1]===0) castlingRights.blackRookA = true;
  if(captured==='r' && to[0]===0 && to[1]===7) castlingRights.blackRookH = true;

  // move piece
  makeMoveRaw(board,from,to);

  // en passant target set/reset
  if(piece.toLowerCase()==='p' && Math.abs(to[0]-from[0])===2){
    enPassantTarget = [ (from[0]+to[0])/2, from[1] ];
  }else{
    enPassantTarget = null;
  }

  // promotion?
  if(piece.toLowerCase()==='p'){
    const promoRow = moverIsWhite ? 0 : 7;
    if(to[0]===promoRow){
      // If AI moved, auto-queen; if human, open dialog
      if(isAIColor(moverColor)){
        board[to[0]][to[1]] = moverIsWhite ? 'Q' : 'q';
      }else{
        promotionPending = {from, to, moverColor};
        showPromotionDialog(moverColor);
        selected=null; drawBoard();
        return; // wait for human to choose
      }
    }
  }

  // switch turn and continue
  currentPlayer = other(currentPlayer);
  selected=null;
  updateStatus();
  drawBoard();
  checkGameEnd();
  maybeAIMove(); // trigger AI if needed
}

/* =======================
   UI rendering
   ======================= */
function drawBoard(){
  boardDiv.innerHTML='';
  coords.innerHTML='';

  // coordinates (bottom-right relative to visible orientation)
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const cd = document.createElement('div');
      const file = String.fromCharCode('a'.charCodeAt(0) + c);
      const rank = 8 - r;
      cd.textContent = flipped ? `${String.fromCharCode('a'.charCodeAt(0)+(7-c))}${r+1}` : `${file}${rank}`;
      coords.appendChild(cd);
    }
  }

  const mapIndex = (r,c) => flipped ? [7-r, 7-c] : [r,c];

  const wCheck = inCheck(board,'white');
  const bCheck = inCheck(board,'black');
  const wKing = findKing(board,'white');
  const bKing = findKing(board,'black');

  for(let R=0; R<8; R++){
    for(let C=0; C<8; C++){
      const [r,c] = mapIndex(R,C);
      const sq = document.createElement('div');
      sq.className = 'square ' + ((R + C) % 2 === 0 ? 'white' : 'black');

      const pc = board[r][c];

      if(USE_IMAGES && pc !== '_'){
        const img = document.createElement('img');
        img.alt = pc;
        img.draggable = false;
        img.width = 64; img.height = 64;
        img.src = pieceImage[pc] || '';
        img.onerror = () => { // fallback to unicode
          img.remove();
          const span = document.createElement('span');
          span.textContent = pieceUnicode[pc];
          span.className = (isWhitePiece(pc)?'piece-white':'piece-black');
          sq.appendChild(span);
        };
        sq.appendChild(img);
      }else{
        const span = document.createElement('span');
        span.textContent = pieceUnicode[pc];
        span.className = (isWhitePiece(pc)?'piece-white':'piece-black');
        sq.appendChild(span);
      }

      sq.dataset.row = r;
      sq.dataset.col = c;

      if(selected && selected[0]===r && selected[1]===c) sq.classList.add('selected');

      if(selected){
        const legal = generateMovesForPiece(board, selected[0], selected[1]);
        for(const m of legal){
          if(m[1][0]===r && m[1][1]===c){ sq.classList.add('highlight'); break; }
        }
      }

      if(wKing && r===wKing[0] && c===wKing[1] && wCheck) sq.classList.add('checked');
      if(bKing && r===bKing[0] && c===bKing[1] && bCheck) sq.classList.add('checked');

      sq.onclick = () => onSquareClick(r,c);
      boardDiv.appendChild(sq);
    }
  }
}

function onSquareClick(r,c){
  if(promotionPending) return;
  if(isAIColor(currentPlayer)) return; // block human clicking during AI's turn
  const piece = board[r][c];
  const isW = isWhitePiece(piece), isB = isBlackPiece(piece);

  if(selected){
    if(selected[0]===r && selected[1]===c){ selected=null; drawBoard(); return; }
    makeMove(selected,[r,c]);
  }else{
    if((currentPlayer==='white' && isW) || (currentPlayer==='black' && isB)){
      selected=[r,c]; drawBoard();
    }
  }
}

function removeHandlers(){
  for(const node of boardDiv.children) node.onclick = null;
}

function updateStatus(){
  statusDiv.textContent = `${cap(currentPlayer)} to move${isAIColor(currentPlayer) ? " (AI)" : ""}`;
}

/* =======================
   Promotion UI
   ======================= */
function showPromotionDialog(color){
  dialog.classList.remove('hidden');
  dialog.querySelectorAll('button').forEach(btn=>{
    btn.classList.toggle('white', color==='white');
    btn.onclick = () => {
      promotePawn(btn.getAttribute('data-piece'));
      dialog.classList.add('hidden');
    };
  });
}

function promotePawn(pieceChar){
  if(!promotionPending) return;
  const {to, moverColor} = promotionPending;
  const isWhite = moverColor === 'white';
  const promoted = isWhite ? pieceChar.toUpperCase() : pieceChar.toLowerCase();
  board[to[0]][to[1]] = promoted;
  promotionPending = null;

  currentPlayer = other(currentPlayer);
  updateStatus();
  drawBoard();
  checkGameEnd();
  maybeAIMove();
}

/* =======================
   End conditions
   ======================= */
function checkGameEnd(){
  const moves = generateAllMoves(board, currentPlayer);
  const check = inCheck(board, currentPlayer);

  if(moves.length===0){
    if(check){
      statusDiv.textContent = `${cap(currentPlayer)} is checkmated. ${cap(other(currentPlayer))} wins!`;
    }else{
      statusDiv.textContent = `Stalemate — draw.`;
    }
    removeHandlers();
  }else if(check){
    statusDiv.textContent = `${cap(currentPlayer)} is in check!${isAIColor(currentPlayer) ? " (AI turn)" : ""}`;
  }else{
    updateStatus();
  }
}

/* =======================
   Chat (local demo)
   ======================= */
function appendMsg(text, fromMe=false){
  const div=document.createElement('div');
  div.className='msg' + (fromMe?' me':'');
  div.textContent = text;
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

chatBtn.onclick = () => chatPanel.classList.remove('hidden');
chatClose.onclick = () => chatPanel.classList.add('hidden');
chatForm.onsubmit = (e)=>{
  e.preventDefault();
  const v = chatInput.value.trim();
  if(!v) return;
  appendMsg(v, true);
  chatInput.value = '';
  // (Optional) demo auto-reply:
  setTimeout(()=>appendMsg('👍 Got it.'), 300);
};

/* =======================
   AI player (minimax + alpha-beta)
   ======================= */
const PIECE_VALUE = { p:100, n:320, b:330, r:500, q:900, k:0 };

function evaluateBoard(b){
  let score = 0;
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p=b[r][c];
      if(p==='_') continue;
      const val = PIECE_VALUE[p.toLowerCase()] || 0;
      score += isWhitePiece(p) ? val : -val;
    }
  }
  // small mobility term
  const savedEP = enPassantTarget, savedCR = {...castlingRights};
  const wm = generateAllMoves(b,'white').length;
  const bm = generateAllMoves(b,'black').length;
  enPassantTarget = savedEP; castlingRights = savedCR;
  score += 0.1 * (wm - bm);
  return score;
}

function cloneState(){
  return {
    board: cloneBoard(board),
    enPassantTarget: enPassantTarget ? [...enPassantTarget] : null,
    castlingRights: {...castlingRights},
    currentPlayer
  };
}

function genMovesWithState(state, color){
  const sEP = enPassantTarget, sCR = {...castlingRights};
  enPassantTarget = state.enPassantTarget ? [...state.enPassantTarget] : null;
  castlingRights = {...state.castlingRights};
  const moves = generateAllMoves(state.board, color);
  enPassantTarget = sEP; castlingRights = sCR;
  return moves;
}

function applyMoveOnState(state, move){
  // deep-copy state
  const ns = {
    board: cloneBoard(state.board),
    enPassantTarget: state.enPassantTarget ? [...state.enPassantTarget] : null,
    castlingRights: {...state.castlingRights},
    currentPlayer: state.currentPlayer
  };

  const [from,to] = move;
  const piece = ns.board[from[0]][from[1]];
  const moverWhite = isWhitePiece(piece);
  const moverColor = moverWhite ? 'white' : 'black';

  // en passant capture
  if(piece.toLowerCase()==='p' && ns.enPassantTarget && to[0]===ns.enPassantTarget[0] && to[1]===ns.enPassantTarget[1]){
    ns.board[from[0]][to[1]] = '_';
  }

  // captured rook rights
  const captured = ns.board[to[0]][to[1]];
  if(captured==='R' && to[0]===7 && to[1]===0) ns.castlingRights.whiteRookA = true;
  if(captured==='R' && to[0]===7 && to[1]===7) ns.castlingRights.whiteRookH = true;
  if(captured==='r' && to[0]===0 && to[1]===0) ns.castlingRights.blackRookA = true;
  if(captured==='r' && to[0]===0 && to[1]===7) ns.castlingRights.blackRookH = true;

  // move rook on castling + move piece
  const tmpEP = enPassantTarget, tmpCR = {...castlingRights};
  enPassantTarget = ns.enPassantTarget ? [...ns.enPassantTarget] : null;
  castlingRights = {...ns.castlingRights};
  makeMoveRaw(ns.board, from, to);
  ns.enPassantTarget = null;

  // update mover rights
  if(piece==='K') ns.castlingRights.whiteKingMoved = true;
  if(piece==='k') ns.castlingRights.blackKingMoved = true;
  if(piece==='R'){
    if(from[0]===7 && from[1]===0) ns.castlingRights.whiteRookA = true;
    if(from[0]===7 && from[1]===7) ns.castlingRights.whiteRookH = true;
  }
  if(piece==='r'){
    if(from[0]===0 && from[1]===0) ns.castlingRights.blackRookA = true;
    if(from[0]===0 && from[1]===7) ns.castlingRights.blackRookH = true;
  }

  // en passant target set
  if(piece.toLowerCase()==='p' && Math.abs(to[0]-from[0])===2){
    ns.enPassantTarget = [ (from[0]+to[0])/2, from[1] ];
  }

  // auto-queen in search
  if(piece.toLowerCase()==='p'){
    const promoRow = moverWhite ? 0 : 7;
    if(to[0]===promoRow){
      ns.board[to[0]][to[1]] = moverWhite ? 'Q' : 'q';
    }
  }

  enPassantTarget = tmpEP; castlingRights = tmpCR;

  ns.currentPlayer = other(state.currentPlayer);
  return ns;
}

function minimax(state, depth, alpha, beta, maximizingForWhite){
  if(depth===0){
    // temporarily bind globals to state for evaluation
    const sEP = enPassantTarget, sCR = {...castlingRights};
    enPassantTarget = state.enPassantTarget ? [...state.enPassantTarget] : null;
    castlingRights = {...state.castlingRights};
    const score = evaluateBoard(state.board);
    enPassantTarget = sEP; castlingRights = sCR;
    return {score};
  }

  const colorToMove = state.currentPlayer;
  const moves = genMovesWithState(state, colorToMove);
  if(moves.length===0){
    // checkmate/stalemate
    const sEP = enPassantTarget, sCR = {...castlingRights};
    enPassantTarget = state.enPassantTarget ? [...state.enPassantTarget] : null;
    castlingRights = {...state.castlingRights};
    const in_check = inCheck(state.board, colorToMove);
    enPassantTarget = sEP; castlingRights = sCR;
    if(in_check){
      // mate: if it's white to move and mated, bad for white => big negative
      const mateScore = colorToMove==='white' ? -99999 : 99999;
      return {score: mateScore};
    }else{
      return {score: 0}; // stalemate
    }
  }

  let bestMove = moves[0];
  if(maximizingForWhite){
    let best = -Infinity;
    for(const m of moves){
      const ns = applyMoveOnState(state, m);
      const {score} = minimax(ns, depth-1, alpha, beta, maximizingForWhite);
      if(score > best){ best = score; bestMove = m; }
      alpha = Math.max(alpha, best);
      if(beta <= alpha) break;
    }
    return {score: best, move: bestMove};
  }else{
    let best = Infinity;
    for(const m of moves){
      const ns = applyMoveOnState(state, m);
      const {score} = minimax(ns, depth-1, alpha, beta, maximizingForWhite);
      if(score < best){ best = score; bestMove = m; }
      beta = Math.min(beta, best);
      if(beta <= alpha) break;
    }
    return {score: best, move: bestMove};
  }
}

function pickAIMove(){
  const aiColor = currentPlayer;
  const state = cloneState();
  const maximizingForWhite = (aiColor === 'white');
  const {move} = minimax(state, AI_DEPTH, -Infinity, Infinity, maximizingForWhite);
  return move || null;
}

function maybeAIMove(){
  if(!isAIColor(currentPlayer)) return;
  const moves = generateAllMoves(board, currentPlayer);
  if(moves.length===0){ checkGameEnd(); return; }
  setTimeout(()=>{
    const mv = pickAIMove() || moves[Math.floor(Math.random()*moves.length)];
    if(!mv) return;
    makeMove(mv[0], mv[1]);
  }, AI_THINK_DELAY_MS);
}

/* =======================
   Setup & controls
   ======================= */
function init(mode='ai-black'){
  selected=null;
  currentPlayer='white';
  enPassantTarget=null;
  castlingRights={
    whiteKingMoved:false, whiteRookA:false, whiteRookH:false,
    blackKingMoved:false, blackRookA:false, blackRookH:false
  };
  promotionPending=null;
  flipped=false;

  // reset board
  board = [
    ["r","n","b","q","k","b","n","r"],
    ["p","p","p","p","p","p","p","p"],
    ["_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_"],
    ["_","_","_","_","_","_","_","_"],
    ["P","P","P","P","P","P","P","P"],
    ["R","N","B","Q","K","B","N","R"]
  ];

  // set mode
  if(mode==='hvh'){ aiPlaysWhite=false; aiPlaysBlack=false; }
  if(mode==='ai-black'){ aiPlaysWhite=false; aiPlaysBlack=true; }
  if(mode==='ai-white'){ aiPlaysWhite=true; aiPlaysBlack=false; }

  drawBoard();
  updateStatus();

  // If AI plays white, move immediately
  maybeAIMove();
}

/* Controls */
resetBtn.onclick = ()=> init(modeSelect.value);
flipBtn.onclick  = ()=> { flipped=!flipped; drawBoard(); };
modeSelect.onchange = ()=> init(modeSelect.value);

/* Boot */
init(modeSelect.value);
