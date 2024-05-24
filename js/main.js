const settings = {
  score: {
    high_score_key: "HIGH_SCORE",
    high_score: 0,
  },
  size: {
    base: 20,
    show_grid: true,
  },
  movement: {
    direction_buffer: ["d"],
    direction: "d",
    do_movement_vector: {
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
    },
    block_movements: {
      w: "s",
      s: "w",
      a: "d",
      d: "a",
    },
  },
  state: {
    game_over: false,
    time: {
      elapsed: 0,
      base_delay: 80,
      current_delay: 80,
      delay_decrease_factor: 1,
      delay_decrease_interval: 3,
      min_active_delay: Math.floor(80 / 4), // 1/4 of the base delay
    },
    food: {
      max_on_game_at_same_time: 5,
      min_spawn_time: 2, // seconds
      max_spawn_time: 8, // seconds
      spawn_time: 8, // seconds
    },
  },
};

const bindKeyboard = () => {
  window.addEventListener("keydown", (event) => {
    if (
      event.key in settings.movement.do_movement_vector &&
      settings.movement.block_movements[event.key] !==
        settings.movement.direction
    ) {
      settings.movement.direction_buffer.push(event.key);
    }
  });
};

const snakePartFactory = (x = 0, y = 0, color = "yellow") => ({ x, y, color });
const foodFactory = (x = null, y = null, maxX = 0, maxY = 0) => ({
  x: x || random(0, maxX),
  y: y || random(0, maxY),
  color: "red",
});

const init = () => {
  bindKeyboard();
  const canvas = document.getElementById("canvas");
  canvas.width =
    settings.size.base * Math.floor(window.innerWidth / settings.size.base);
  canvas.height =
    settings.size.base * Math.floor(window.innerHeight / settings.size.base);
  const positions = generateAllGridPositions(canvas);
  const ctx = canvas.getContext("2d");
  const headPosition = randomPosition(positions);
  const snake = [
    snakePartFactory(headPosition.x + settings.size.base * 2, headPosition.y),
    snakePartFactory(headPosition.x + settings.size.base, headPosition.y),
    snakePartFactory(headPosition.x, headPosition.y),
  ];
  const foodPosition = randomSafePosition(positions, snake);
  const foods = [foodFactory(foodPosition.x, foodPosition.y)];
  settings.score.high_score = parseInt(
    window.localStorage.getItem(settings.score.high_score_key),
    10,
  );
  loop(snake, foods, positions, canvas, ctx).then(() => {
    console.log("snake started");
    startGameTimer(foods, snake, positions);
  });
};

const loop = async (snake, foods, positions, canvas, ctx) => {
  update(snake, foods, positions, canvas);
  render(snake, foods, canvas, ctx);
  await delay(settings.state.time.current_delay);
  window.requestAnimationFrame(() =>
    loop(snake, foods, positions, canvas, ctx),
  );
};

const update = (snake, foods, positions, canvas) => {
  if (settings.state.game_over) {
    return;
  }
  if (settings.movement.direction_buffer.length > 0) {
    settings.movement.direction = settings.movement.direction_buffer.shift();
  }
  const movementVector =
    settings.movement.do_movement_vector[settings.movement.direction];
  const head = snake[0];
  const nextHead = snakePartFactory(
    head.x + movementVector[0] * settings.size.base,
    head.y + movementVector[1] * settings.size.base,
  );
  if (collidingWithBody(nextHead, snake)) {
    gameOver(snake);
    return;
  }
  head.color = "white";
  computePositionOverflow(nextHead, canvas);
  snake.unshift(nextHead);
  const collidingFoodIndex = foods.findIndex(
    ({ x, y }) => x === nextHead.x && y === nextHead.y,
  );
  if (collidingFoodIndex !== -1) {
    foods.splice(collidingFoodIndex, 1);
    generateRandomFood(foods, snake, positions);
  } else {
    snake.pop();
  }
};

const collidingWithBody = ({ x, y }, snake) => {
  for (let i = 0; i < snake.length; i++) {
    if (i === 0) {
      continue;
    }
    if (x === snake[i].x && y === snake[i].y) {
      return true;
    }
  }
  return false;
};

const gameOver = (snake) => {
  settings.state.game_over = true;
  alert("GAME OVER");
  const score = snake.length - 3;
  if ((settings.score.high_score || 0) < score) {
    window.localStorage.setItem(
      settings.score.high_score_key,
      score.toString(),
    );
  }
  window.location.reload();
};

const computePositionOverflow = (nextHead, canvas) => {
  if (nextHead.x > canvas.width) {
    nextHead.x = 0;
  }
  if (nextHead.y > canvas.height) {
    nextHead.y = 0;
  }
  if (nextHead.x < 0) {
    nextHead.x = canvas.width;
  }
  if (nextHead.y < 0) {
    nextHead.y = canvas.height;
  }
};

const render = (snake, foods, canvas, ctx) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  settings.size.show_grid && renderGrid(canvas, ctx);
  renderInfo(snake, ctx);
  for (const { x, y, color } of [...snake, ...foods]) {
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
    `Best: ${settings.score.high_score || 0}`,
    settings.size.base,
    settings.size.base * 4,
  );
  ctx.fillText(
    `Difficult: ${settings.state.time.base_delay - settings.state.time.current_delay}`,
    settings.size.base,
    settings.size.base * 5,
  );
};

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const random = (min = 0, max = 1) => Math.random() * (max - min) + min;
const randomPosition = (positions) =>
  positions[Math.floor(Math.random() * positions.length - 1)];
const randomSafePosition = (positions, filled) => {
  let attempts = Math.floor(positions.length / 2);
  let position = randomPosition(positions);
  while (
    filled.find(({ x, y }) => x === position.x && y === position.y) &&
    attempts-- > 0
  ) {
    position = randomPosition(positions);
  }
  return position;
};

const generateRandomFood = (foods, snake, positions) => {
  const position = randomSafePosition(positions, [...snake, ...foods]);
  foods.push(foodFactory(position.x, position.y));
};

const startGameTimer = (foods, snake, positions) =>
  setInterval(() => {
    settings.state.time.elapsed++;
    if (
      settings.state.time.elapsed %
        settings.state.time.delay_decrease_interval ===
      0
    ) {
      if (
        settings.state.time.current_delay > settings.state.time.min_active_delay
      ) {
        settings.state.time.current_delay -=
          settings.state.time.delay_decrease_factor;
      }
    }
    if (
      foods.length < settings.state.food.max_on_game_at_same_time &&
      settings.state.time.elapsed %
        parseInt(
          random(
            settings.state.food.min_spawn_time,
            settings.state.food.max_spawn_time,
          ),
          10,
        ) ===
        0
    ) {
      generateRandomFood(foods, snake, positions);
    }
  }, 1000);

const generateAllGridPositions = (canvas) => {
  const squaresX = Math.floor(canvas.width / settings.size.base);
  const squaresY = Math.floor(canvas.height / settings.size.base);
  const positions = [];
  for (let i = 0; i < squaresX; i++) {
    for (let j = 0; j < squaresY; j++) {
      positions.push({ x: i * settings.size.base, y: j * settings.size.base });
    }
  }
  return positions;
};

window.addEventListener("load", init);
