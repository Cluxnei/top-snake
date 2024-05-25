let snake;
let settings;
let game_state;
let client_settings;
let socket;

const bindKeyboard = () => {
  window.addEventListener("keydown", (event) => {
    if (
      event.key in settings.movement.do_movement_vector &&
      settings.movement.block_movements[event.key] !==
        client_settings.movement.direction
    ) {
      socket.emit("movement", event.key);
    }
  });
};

let started = false;

const init = () => {
  if (started) {
    return;
  }
  started = true;
  socket.on("disconnect", () => {
    console.log("disconnected");
  });

  bindKeyboard();
  const canvas = document.getElementById("canvas");
  canvas.width =
    settings.size.base * Math.floor(settings.size.width / settings.size.base);
  canvas.height =
    settings.size.base * Math.floor(settings.size.height / settings.size.base);
  const ctx = canvas.getContext("2d");
  loop(canvas, ctx).then(() => {
    console.log("snake started");
  });
};

const loop = async (canvas, ctx) => {
  render(canvas, ctx);
  window.requestAnimationFrame(() => loop(canvas, ctx));
};

const render = (canvas, ctx) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  settings.size.show_grid && renderGrid(canvas, ctx);
  renderInfo(snake, ctx);
  const toRender = [...snake, ...game_state.foods];
  for (const snk of game_state.snakes) {
    toRender.push(...snk);
  }
  for (const { x, y, color } of toRender) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, settings.size.base, settings.size.base);
  }
};

const renderGrid = (canvas, ctx) => {
  const squaresX = Math.floor(canvas.width / settings.size.base);
  const squaresY = Math.floor(canvas.height / settings.size.base);
  for (let i = 0; i < squaresX; i++) {
    for (let j = 0; j < squaresY; j++) {
      ctx.strokeStyle = "rgba(0, 255, 0, 0.1)";
      ctx.strokeRect(
        i * settings.size.base,
        j * settings.size.base,
        settings.size.base,
        settings.size.base,
      );
    }
  }
};

const renderInfo = (snake, ctx) => {
  ctx.fillStyle = "white";
  ctx.font = `${settings.size.base - 2}px Arial`;
  const minutes = (settings.state.time.elapsed / 60).toFixed(0);
  ctx.fillText(
    `Time: ${minutes}m ${settings.state.time.elapsed % 60}s`,
    settings.size.base,
    settings.size.base * 2,
  );
  ctx.fillText(
    `Score: ${snake.length - 3}`,
    settings.size.base,
    settings.size.base * 3,
  );
  ctx.fillText(
    `Best: ${client_settings.score.high_score || 0}`,
    settings.size.base,
    settings.size.base * 4,
  );
  ctx.fillText(
    `Difficult: ${settings.state.time.base_delay - settings.state.time.current_delay}`,
    settings.size.base,
    settings.size.base * 5,
  );
};

window.addEventListener("load", () => {
  socket = io();

  socket.on("connect", () => {
    console.log("connected");
  });

  socket.on("update", (data) => {
    snake = data.snake;
    settings = data.settings;
    game_state = data.game_state;
    client_settings = data.client_settings;
    init();
  });
});
