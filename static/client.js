let snake;
let settings;
let game_state;
let client_settings;
let socket;
let canvas;
let ctx;

// Movimento: espelhamos localmente o buffer de direcoes que o servidor consome,
// para validar a proxima tecla contra a ultima direcao ENVIADA (e nao contra a
// ultima direcao ja aplicada), evitando reversao de 180 graus no mesmo tick.
let applied_direction = null;
let sent_directions = [];
const MAX_PENDING_MOVEMENTS = 3;

let restart_requested = false;
let stored_high_score = 0;
let high_score_loaded = false;

const DEFAULT_BASE = 20;
const ARROW_KEYS = {
  ArrowUp: "w",
  ArrowDown: "s",
  ArrowLeft: "a",
  ArrowRight: "d",
};
const RESTART_KEYS = ["Enter", " ", "Spacebar", "Space"];
// Toque: swipe no tabuleiro + d-pad em tela. Um swipe curto (abaixo do
// limiar) conta como toque simples e serve para reiniciar em game over.
const SWIPE_MIN_DISTANCE = 24;
const TAP_MAX_DISTANCE = 16;
let touch_start = null;
let has_touch_controls = false;

const OTHER_SNAKE_HEAD_COLOR = "#4fc3f7";
const OTHER_SNAKE_BODY_COLOR = "#2f6f8f";

const isReady = () =>
  Boolean(
    snake &&
      settings &&
      settings.size &&
      game_state &&
      Array.isArray(game_state.foods) &&
      Array.isArray(game_state.snakes) &&
      client_settings &&
      client_settings.state,
  );

const baseSize = () =>
  settings && settings.size && settings.size.base
    ? settings.size.base
    : DEFAULT_BASE;

const isGameOver = () =>
  Boolean(client_settings && client_settings.state && client_settings.state.game_over);

// mesmo calculo do servidor (snake.length - tamanho inicial), com fallback 3
const spawnLength = () =>
  (settings &&
    settings.state &&
    settings.state.spawn &&
    settings.state.spawn.snake_length) ||
  3;

const currentScore = () => (snake ? Math.max(snake.length - spawnLength(), 0) : 0);

/* ------------------------------- high score ------------------------------- */

const highScoreKey = () =>
  (settings && settings.score && settings.score.high_score_key) || "HIGH_SCORE";

const readStoredHighScore = () => {
  try {
    const raw = window.localStorage.getItem(highScoreKey());
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (error) {
    console.warn("could not read high score", error);
    return 0;
  }
};

const writeStoredHighScore = (value) => {
  try {
    window.localStorage.setItem(highScoreKey(), String(value));
  } catch (error) {
    console.warn("could not persist high score", error);
  }
};

const syncHighScore = () => {
  if (!high_score_loaded) {
    stored_high_score = readStoredHighScore();
    high_score_loaded = true;
  }
  const serverHighScore =
    (client_settings && client_settings.score && client_settings.score.high_score) || 0;
  if (serverHighScore > stored_high_score) {
    stored_high_score = serverHighScore;
    writeStoredHighScore(stored_high_score);
  }
};

const bestScore = () => {
  const serverHighScore =
    (client_settings && client_settings.score && client_settings.score.high_score) || 0;
  return Math.max(stored_high_score, serverHighScore);
};

/* -------------------------------- movement -------------------------------- */

const intendedDirection = () =>
  sent_directions.length > 0
    ? sent_directions[sent_directions.length - 1]
    : applied_direction;

// Consome do buffer local tudo que o servidor ja aplicou.
const syncMovement = () => {
  if (!client_settings || !client_settings.movement) {
    return;
  }
  const direction = client_settings.movement.direction;
  const index = sent_directions.indexOf(direction);
  if (index !== -1) {
    sent_directions.splice(0, index + 1);
  }
  applied_direction = direction;
};

const handleMovement = (key) => {
  if (!isReady() || isGameOver() || !settings.movement) {
    return;
  }
  if (!(key in settings.movement.do_movement_vector)) {
    return;
  }
  const current = intendedDirection();
  if (key === current) {
    return;
  }
  if (settings.movement.block_movements[key] === current) {
    return;
  }
  if (sent_directions.length >= MAX_PENDING_MOVEMENTS) {
    return;
  }
  sent_directions.push(key);
  socket.emit("movement", key);
};

const requestRestart = () => {
  if (!socket || !isGameOver() || restart_requested) {
    return;
  }
  restart_requested = true;
  sent_directions = [];
  socket.emit("restart");
};

const bindKeyboard = () => {
  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    if (RESTART_KEYS.includes(event.key)) {
      event.preventDefault();
      // Tecla de restart nunca vaza como movimento.
      requestRestart();
      return;
    }
    const mapped = ARROW_KEYS[event.key];
    if (mapped) {
      event.preventDefault();
    }
    const key =
      mapped || (event.key.length === 1 ? event.key.toLowerCase() : event.key);
    handleMovement(key);
  });
};

const directionFromSwipe = (dx, dy) =>
  Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "d" : "a") : dy > 0 ? "s" : "w";

const handleTouchStart = (event) => {
  const point = event.changedTouches && event.changedTouches[0];
  if (!point) {
    return;
  }
  touch_start = { x: point.clientX, y: point.clientY };
};

const handleTouchEnd = (event) => {
  const point = event.changedTouches && event.changedTouches[0];
  if (!point || !touch_start) {
    return;
  }
  const dx = point.clientX - touch_start.x;
  const dy = point.clientY - touch_start.y;
  touch_start = null;
  const distance = Math.hypot(dx, dy);
  if (isGameOver()) {
    // qualquer toque no tabuleiro reinicia
    if (distance <= TAP_MAX_DISTANCE || distance >= SWIPE_MIN_DISTANCE) {
      requestRestart();
    }
    return;
  }
  if (distance >= SWIPE_MIN_DISTANCE) {
    handleMovement(directionFromSwipe(dx, dy));
  }
};

const bindTouch = () => {
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  has_touch_controls =
    coarse ||
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);

  if (canvas && typeof canvas.addEventListener === "function") {
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", () => {
      touch_start = null;
    });
    // impede scroll/zoom enquanto o dedo arrasta sobre o tabuleiro
    canvas.addEventListener(
      "touchmove",
      (event) => event.preventDefault(),
      { passive: false },
    );
  }

  const controls =
    typeof document.getElementById === "function"
      ? document.getElementById("touch-controls")
      : null;
  if (!controls || typeof controls.querySelectorAll !== "function") {
    return;
  }
  for (const pad of controls.querySelectorAll(".pad")) {
    const direction = pad.dataset ? pad.dataset.dir : pad.getAttribute("data-dir");
    if (!direction) {
      continue;
    }
    // pointerdown responde no toque, sem os 300ms do clique sintetizado
    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (isGameOver()) {
        requestRestart();
        return;
      }
      handleMovement(direction);
    });
    pad.addEventListener("contextmenu", (event) => event.preventDefault());
  }
};

/* --------------------------------- render --------------------------------- */

const renderCenteredMessage = (message, color = "white") => {
  const base = baseSize();
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${base}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  ctx.restore();
};

const renderGrid = () => {
  const base = baseSize();
  const squaresX = Math.floor(canvas.width / base);
  const squaresY = Math.floor(canvas.height / base);
  ctx.strokeStyle = "rgba(0, 255, 0, 0.1)";
  for (let i = 0; i < squaresX; i++) {
    for (let j = 0; j < squaresY; j++) {
      ctx.strokeRect(i * base, j * base, base, base);
    }
  }
};

const renderCells = (cells) => {
  const base = baseSize();
  for (const { x, y, color } of cells) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, base, base);
  }
};

const renderSnake = (parts, isSelf) => {
  const base = baseSize();
  parts.forEach((part, index) => {
    ctx.fillStyle = isSelf
      ? part.color
      : index === 0
        ? OTHER_SNAKE_HEAD_COLOR
        : OTHER_SNAKE_BODY_COLOR;
    ctx.fillRect(part.x, part.y, base, base);
  });
  if (isSelf && parts.length > 0) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.strokeRect(parts[0].x + 0.5, parts[0].y + 0.5, base - 1, base - 1);
  }
};

// game_state.snakes contem uma copia da propria cobra enquanto o jogador esta
// vivo; comparamos a cabeca para nao desenhar a mesma cobra duas vezes.
const isOwnSnake = (other) =>
  other === snake ||
  (Array.isArray(other) &&
    other.length > 0 &&
    snake.length > 0 &&
    other[0].x === snake[0].x &&
    other[0].y === snake[0].y);

const renderInfo = () => {
  const base = baseSize();
  ctx.fillStyle = "white";
  ctx.font = `${base - 2}px Arial`;
  const elapsed = (settings.state && settings.state.time.elapsed) || 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");
  ctx.fillText(`Time: ${minutes}m ${seconds}s`, base, base * 2);
  ctx.fillText(`Score: ${currentScore()}`, base, base * 3);
  ctx.fillText(`Best: ${bestScore()}`, base, base * 4);
  ctx.fillText(
    `Difficult: ${settings.state.time.base_delay - settings.state.time.current_delay}`,
    base,
    base * 5,
  );
};

const renderGameOver = () => {
  const base = baseSize();
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff5252";
  ctx.font = `bold ${base * 2}px Arial`;
  ctx.fillText("GAME OVER", centerX, centerY - base * 3);
  ctx.fillStyle = "white";
  ctx.font = `${base}px Arial`;
  ctx.fillText(`Score: ${currentScore()}`, centerX, centerY - base * 0.5);
  ctx.fillText(`Best: ${bestScore()}`, centerX, centerY + base);
  ctx.fillStyle = restart_requested ? "#9e9e9e" : "#69f0ae";
  ctx.font = `${Math.max(base - 4, 10)}px Arial`;
  ctx.fillText(
    restart_requested
      ? "Restarting..."
      : has_touch_controls
        ? "Tap to restart"
        : "Press SPACE or ENTER to restart",
    centerX,
    centerY + base * 3,
  );
  ctx.restore();
};

const render = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!isReady()) {
    renderCenteredMessage("Connecting...", "#9e9e9e");
    return;
  }
  settings.size.show_grid && renderGrid();
  renderCells(game_state.foods);
  for (const other of game_state.snakes) {
    if (!Array.isArray(other) || isOwnSnake(other)) {
      continue;
    }
    renderSnake(other, false);
  }
  renderSnake(snake, true);
  renderInfo();
  if (isGameOver()) {
    renderGameOver();
  }
};

const loop = () => {
  try {
    render();
  } catch (error) {
    console.error("render error", error);
  }
  window.requestAnimationFrame(loop);
};

/* ------------------------------- bootstrap -------------------------------- */

let sized = false;

const resizeCanvas = () => {
  if (sized || !settings || !settings.size) {
    return;
  }
  sized = true;
  const base = settings.size.base;
  canvas.width = base * Math.floor(settings.size.width / base);
  canvas.height = base * Math.floor(settings.size.height / base);
};

window.addEventListener("load", () => {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  bindKeyboard();
  bindTouch();
  loop();

  socket = io();

  socket.on("connect", () => {
    console.log("connected");
  });

  socket.on("disconnect", () => {
    console.log("disconnected");
  });

  socket.on("update", (data) => {
    snake = data.snake;
    settings = data.settings;
    game_state = data.game_state;
    client_settings = data.client_settings;
    resizeCanvas();
    syncHighScore();
    if (isGameOver()) {
      sent_directions = [];
      applied_direction =
        (client_settings.movement && client_settings.movement.direction) ||
        applied_direction;
    } else {
      restart_requested = false;
      syncMovement();
    }
  });
});
