const snakePartFactory = (x = 0, y = 0, color = "yellow") => ({ x, y, color });
const foodFactory = (x = null, y = null, maxX = 0, maxY = 0) => ({
  x: x || random(0, maxX),
  y: y || random(0, maxY),
  color: "red",
});

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

const gameOver = (client) => {
  client.settings.state.game_over = true;
  const score = client.snake.length - 3;
  if ((client.settings.score.high_score || 0) < score) {
    client.settings.score.high_score = score;
  }
};

const computePositionOverflow = (nextHead, { width, height }) => {
  if (nextHead.x > width) {
    nextHead.x = 0;
  }
  if (nextHead.y > height) {
    nextHead.y = 0;
  }
  if (nextHead.x < 0) {
    nextHead.x = width;
  }
  if (nextHead.y < 0) {
    nextHead.y = height;
  }
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

const generateRandomFood = () => {
  const position = randomSafePosition(game_state.positions, [
    ...game_state.foods,
  ]);
  game_state.foods.push(foodFactory(position.x, position.y));
};

const startGameTimer = () =>
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
      game_state.foods.length < settings.state.food.max_on_game_at_same_time &&
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
      generateRandomFood();
    }
  }, 1000);

const generateAllGridPositions = ({ width, height }) => {
  const squaresX = Math.floor(width / settings.size.base);
  const squaresY = Math.floor(height / settings.size.base);
  const positions = [];
  for (let i = 0; i < squaresX; i++) {
    for (let j = 0; j < squaresY; j++) {
      positions.push({ x: i * settings.size.base, y: j * settings.size.base });
    }
  }
  return positions;
};

const clients = [];

function getInitialClientSettings() {
  return {
    score: {
      high_score: 0,
    },
    movement: {
      direction_buffer: ["d"],
      direction: "d",
    },
    state: {
      game_over: false,
    },
  };
}

export function addClient(client) {
  client.settings = getInitialClientSettings();
  client.snake = [];
  const headPosition = randomPosition(game_state.positions);
  client.snake.push(
    ...[
      snakePartFactory(headPosition.x + settings.size.base * 2, headPosition.y),
      snakePartFactory(headPosition.x + settings.size.base, headPosition.y),
      snakePartFactory(headPosition.x, headPosition.y),
    ],
  );
  client.socket.on("movement", (key) => {
    client.settings.movement.direction_buffer.push(key);
  });
  game_state.snakes.push(client.snake);
  clients.push(client);
}

export function removeClient({ id }) {
  const index = clients.findIndex((client) => client.socket.id === id);
  const snake = clients[index].snake;
  if (index !== -1) {
    clients.splice(index, 1);
  }
  game_state.snakes = game_state.snakes.filter((s) => s !== snake);
}

const settings = {
  score: {
    high_score_key: "HIGH_SCORE",
  },
  size: {
    base: 20,
    show_grid: true,
    width: 600,
    height: 600,
  },
  movement: {
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

const game_state = {
  foods: [],
  positions: generateAllGridPositions({
    width: settings.size.width,
    height: settings.size.height,
  }),
  snakes: [],
};

const foodPosition = randomSafePosition(game_state.positions, []);
game_state.foods.push(foodFactory(foodPosition.x, foodPosition.y));

const update = (client) => {
  if (client.settings.state.game_over) {
    return;
  }
  if (client.settings.movement.direction_buffer.length > 0) {
    client.settings.movement.direction =
      client.settings.movement.direction_buffer.shift();
  }
  const movementVector =
    settings.movement.do_movement_vector[client.settings.movement.direction];
  const head = client.snake[0];
  const nextHead = snakePartFactory(
    head.x + movementVector[0] * settings.size.base,
    head.y + movementVector[1] * settings.size.base,
  );
  if (collidingWithBody(nextHead, client.snake)) {
    gameOver(client);
    return;
  }
  head.color = "white";
  computePositionOverflow(nextHead, {
    width: settings.size.width,
    height: settings.size.height,
  });
  client.snake.unshift(nextHead);
  const collidingFoodIndex = game_state.foods.findIndex(
    ({ x, y }) => x === nextHead.x && y === nextHead.y,
  );
  if (collidingFoodIndex !== -1) {
    game_state.foods.splice(collidingFoodIndex, 1);
    generateRandomFood();
  } else {
    client.snake.pop();
  }
  client.socket.emit("update", {
    snake: client.snake,
    settings,
    game_state,
    client_settings: client.settings,
  });
};

const loop = async () => {
  for (const client of clients) {
    update(client);
  }
  await delay(settings.state.time.current_delay);
  loop().then(null);
};

loop().then(() => {
  console.log("snake started");
  startGameTimer();
});
