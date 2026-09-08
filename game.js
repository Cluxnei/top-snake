const snakePartFactory = (x = 0, y = 0, color = "yellow") => ({ x, y, color });
const foodFactory = (x = 0, y = 0, color = "red") => ({ x, y, color });

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const random = (min = 0, max = 1) => Math.random() * (max - min) + min;
const randomInt = (min = 0, max = 1) => Math.floor(random(min, max + 1));
const shuffled = (items) =>
  items
    .map((value) => ({ value, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value);

const positionKey = ({ x, y }) => `${x},${y}`;
const hasKey = (object, key) =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(object, key);

const randomPosition = (positions) =>
  positions[Math.floor(Math.random() * positions.length)];

const freePositions = (positions, filled) => {
  const occupied = new Set(filled.map(positionKey));
  return positions.filter((position) => !occupied.has(positionKey(position)));
};

const randomSafePosition = (positions, filled) => {
  const free = freePositions(positions, filled);
  return randomPosition(free.length > 0 ? free : positions);
};

const insideGrid = ({ x, y }, { width, height, base }) =>
  x >= 0 && y >= 0 && x <= width - base && y <= height - base;

const computePositionOverflow = (nextHead, { width, height, base }) => {
  if (nextHead.x >= width) {
    nextHead.x = 0;
  }
  if (nextHead.y >= height) {
    nextHead.y = 0;
  }
  if (nextHead.x < 0) {
    nextHead.x = width - base;
  }
  if (nextHead.y < 0) {
    nextHead.y = height - base;
  }
};

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
    max_direction_buffer: 3,
  },
  state: {
    time: {
      elapsed: 0,
      base_delay: 80,
      current_delay: 80,
      delay_decrease_factor: 1,
      delay_decrease_interval: 3,
      min_active_delay: Math.floor(80 / 4), // 1/4 of the base delay
      tick_interval: Math.floor(80 / 4), // resolution of the server loop
    },
    food: {
      max_on_game_at_same_time: 5,
      min_spawn_time: 2, // seconds
      max_spawn_time: 8, // seconds
      spawn_time: 8, // seconds
    },
    spawn: {
      max_attempts: 50,
      snake_length: 3,
    },
  },
};

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

const game_state = {
  foods: [],
  positions: generateAllGridPositions({
    width: settings.size.width,
    height: settings.size.height,
  }),
  snakes: [],
};

const clients = [];

// every cell taken by a food or by any alive snake
const occupiedCells = () => {
  const cells = [...game_state.foods];
  for (const snake of game_state.snakes) {
    cells.push(...snake);
  }
  return cells;
};

const generateRandomFood = () => {
  const position = randomSafePosition(game_state.positions, occupiedCells());
  if (!position) {
    return;
  }
  game_state.foods.push(foodFactory(position.x, position.y));
};

// three parts that always fit inside the grid and never start over
// another snake or a food, plus the direction that moves the head away
// from its own body
const createSnake = () => {
  const filled = occupiedCells();
  const free = freePositions(game_state.positions, filled);
  const candidates = free.length > 0 ? free : game_state.positions;
  const occupied = new Set(filled.map(positionKey));
  const length = settings.state.spawn.snake_length;
  for (let attempt = 0; attempt < settings.state.spawn.max_attempts; attempt++) {
    const head = randomPosition(candidates);
    for (const direction of shuffled(
      Object.keys(settings.movement.do_movement_vector),
    )) {
      const [vx, vy] = settings.movement.do_movement_vector[direction];
      const parts = [];
      for (let i = 0; i < length; i++) {
        parts.push({
          x: head.x - vx * settings.size.base * i,
          y: head.y - vy * settings.size.base * i,
        });
      }
      const fits = parts.every(
        (part) =>
          insideGrid(part, settings.size) && !occupied.has(positionKey(part)),
      );
      if (fits) {
        return {
          snake: parts.map(({ x, y }) => snakePartFactory(x, y)),
          direction,
        };
      }
    }
  }
  // board is packed: fall back to a wrapped snake on a random position
  const head = randomPosition(candidates);
  const parts = [];
  for (let i = 0; i < length; i++) {
    const part = { x: head.x - settings.size.base * i, y: head.y };
    computePositionOverflow(part, settings.size);
    parts.push(snakePartFactory(part.x, part.y));
  }
  return { snake: parts, direction: "d" };
};

const getInitialClientSettings = (high_score = 0) => ({
  score: {
    high_score,
  },
  movement: {
    direction_buffer: [],
    direction: "d",
  },
  state: {
    game_over: false,
    time: {
      elapsed: 0,
      current_delay: settings.state.time.base_delay,
    },
  },
});

// each client owns its speed/time, so joining late (or dying) never
// inherits somebody else's difficulty
const resetClientTime = (client, now = Date.now()) => {
  client.tick = {
    started_at: now,
    next_move_at: now + settings.state.time.base_delay,
  };
  client.settings.state.time.elapsed = 0;
  client.settings.state.time.current_delay = settings.state.time.base_delay;
};

const updateClientTime = (client, now) => {
  const time = settings.state.time;
  const elapsed = Math.floor((now - client.tick.started_at) / 1000);
  const decrease =
    Math.floor(elapsed / time.delay_decrease_interval) *
    time.delay_decrease_factor;
  client.settings.state.time.elapsed = elapsed;
  client.settings.state.time.current_delay = Math.max(
    time.min_active_delay,
    time.base_delay - decrease,
  );
};

const spawnClientSnake = (client) => {
  const { snake, direction } = createSnake();
  client.snake = snake;
  client.settings.movement.direction = direction;
  client.settings.movement.direction_buffer = [];
  if (!game_state.snakes.includes(client.snake)) {
    game_state.snakes.push(client.snake);
  }
};

const gameOver = (client) => {
  client.settings.state.game_over = true;
  const score = client.snake.length - settings.state.spawn.snake_length;
  if ((client.settings.score.high_score || 0) < score) {
    client.settings.score.high_score = score;
  }
  // the dead snake stops being an obstacle, but client.snake is kept for
  // the final frame and for the score
  game_state.snakes = game_state.snakes.filter((s) => s !== client.snake);
};

const restart = (client) => {
  if (!client.settings.state.game_over) {
    return;
  }
  const high_score = client.settings.score.high_score || 0;
  client.settings = getInitialClientSettings(high_score);
  spawnClientSnake(client);
  resetClientTime(client);
};

export function addClient(client) {
  client.settings = getInitialClientSettings();
  client.snake = [];
  spawnClientSnake(client);
  resetClientTime(client);
  client.socket.on("movement", (key) => {
    // never trust the client: only known keys, and never more than
    // max_direction_buffer of them
    if (!hasKey(settings.movement.do_movement_vector, key)) {
      return;
    }
    const buffer = client.settings.movement.direction_buffer;
    if (buffer.length >= settings.movement.max_direction_buffer) {
      return;
    }
    buffer.push(key);
  });
  client.socket.on("restart", () => {
    try {
      restart(client);
    } catch (error) {
      console.error("restart failed", error);
    }
  });
  clients.push(client);
}

export function removeClient({ id }) {
  const index = clients.findIndex((client) => client.socket.id === id);
  if (index === -1) {
    return;
  }
  const [client] = clients.splice(index, 1);
  game_state.snakes = game_state.snakes.filter((s) => s !== client.snake);
}

// consumes the buffer until a direction that is not the opposite of the
// current one shows up; the server is the authority here
const consumeDirection = (client) => {
  const movement = client.settings.movement;
  while (movement.direction_buffer.length > 0) {
    const candidate = movement.direction_buffer.shift();
    if (!hasKey(settings.movement.do_movement_vector, candidate)) {
      continue;
    }
    if (settings.movement.block_movements[movement.direction] === candidate) {
      continue;
    }
    if (candidate === movement.direction) {
      continue;
    }
    movement.direction = candidate;
    break;
  }
  return movement.direction;
};

const nextHeadOf = (client, direction) => {
  const [vx, vy] = settings.movement.do_movement_vector[direction];
  const head = client.snake[0];
  const nextHead = snakePartFactory(
    head.x + vx * settings.size.base,
    head.y + vy * settings.size.base,
  );
  computePositionOverflow(nextHead, settings.size);
  return nextHead;
};

// one movement step for every client that is due on this tick, resolved
// all at once so collisions do not depend on client order
const moveDueClients = (now) => {
  const movers = [];
  for (const client of clients) {
    if (client.settings.state.game_over) {
      continue;
    }
    updateClientTime(client, now);
    if (now < client.tick.next_move_at) {
      continue;
    }
    client.tick.next_move_at = now + client.settings.state.time.current_delay;
    const direction = consumeDirection(client);
    const nextHead = nextHeadOf(client, direction);
    const food = game_state.foods.find(
      ({ x, y }) => x === nextHead.x && y === nextHead.y,
    );
    movers.push({ client, nextHead, food, dead: false });
  }
  if (movers.length === 0) {
    return;
  }
  const moverBySnake = new Map(movers.map((m) => [m.client.snake, m]));
  // cells that stay taken after this tick: every part of every alive
  // snake, minus the tail of the snakes that move without eating
  const bodies = new Set();
  for (const snake of game_state.snakes) {
    const mover = moverBySnake.get(snake);
    const leaving = mover && !mover.food ? snake.length - 1 : -1;
    for (let i = 0; i < snake.length; i++) {
      if (i === leaving) {
        continue;
      }
      bodies.add(positionKey(snake[i]));
    }
  }
  const heads = new Map();
  for (const mover of movers) {
    const key = positionKey(mover.nextHead);
    heads.set(key, (heads.get(key) || 0) + 1);
  }
  for (const mover of movers) {
    const key = positionKey(mover.nextHead);
    // head to head on the same cell kills both snakes
    mover.dead = heads.get(key) > 1 || bodies.has(key);
  }
  for (const mover of movers) {
    if (mover.dead) {
      gameOver(mover.client);
      continue;
    }
    const snake = mover.client.snake;
    snake[0].color = "white";
    snake.unshift(mover.nextHead);
    if (mover.food) {
      const index = game_state.foods.indexOf(mover.food);
      if (index !== -1) {
        game_state.foods.splice(index, 1);
      }
      generateRandomFood();
    } else {
      snake.pop();
    }
  }
};

// real schedule: one draw for the next spawn instant, then re-draw
let next_food_spawn_at = 0;

const scheduleNextFood = (now) => {
  next_food_spawn_at =
    now +
    randomInt(
      settings.state.food.min_spawn_time,
      settings.state.food.max_spawn_time,
    ) *
      1000;
};

const spawnScheduledFood = (now) => {
  if (now < next_food_spawn_at) {
    return;
  }
  if (game_state.foods.length < settings.state.food.max_on_game_at_same_time) {
    generateRandomFood();
  }
  scheduleNextFood(now);
};

// the client gets its own time/difficulty in the same settings shape
const clientSettingsView = (client) => ({
  ...settings,
  state: {
    ...settings.state,
    time: { ...settings.state.time, ...client.settings.state.time },
  },
});

// positions are 900 objects per client per tick and the client never
// uses them: they stay server side only
const emitUpdate = (client) => {
  client.socket.emit("update", {
    snake: client.snake,
    settings: clientSettingsView(client),
    game_state: {
      foods: game_state.foods,
      snakes: game_state.snakes,
    },
    client_settings: client.settings,
  });
};

const started_at = Date.now();

const tick = (now) => {
  settings.state.time.elapsed = Math.floor((now - started_at) / 1000);
  spawnScheduledFood(now);
  moveDueClients(now);
  for (const client of clients) {
    // every client gets an update on every tick, game over included,
    // otherwise the screen freezes forever
    try {
      emitUpdate(client);
    } catch (error) {
      console.error("emit failed", error);
    }
  }
};

const loop = async () => {
  while (true) {
    try {
      tick(Date.now());
    } catch (error) {
      // one bad tick must never kill the loop for everybody
      console.error("game loop tick failed", error);
    }
    await delay(settings.state.time.tick_interval);
  }
};

const foodPosition = randomSafePosition(game_state.positions, []);
game_state.foods.push(foodFactory(foodPosition.x, foodPosition.y));
scheduleNextFood(Date.now());

console.log("snake started");
loop();
