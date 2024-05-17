// const HIGH_SCORE_KEY = 'HIGH_SCORE';
// const settings.size.base_size = 20;
// const _DIRECTION_BUFFER = ['d'];
// let _DIRECTION = 'd';
// let _SHOW_GRID = true;
// let ELAPSED_TIME_IN_SECONDS = 0;
// let _GAME_OVER = false;
// let _HIGH_SCORE = 0;
// const _BASE_DELAY = 80; // milliseconds
// let _CURRENT_DELAY = _BASE_DELAY; // don't change
// const _DELAY_DECREASE_FACTOR = 1; // milliseconds
// const _DELAY_DECREASE_INTERVAL = 3; // seconds
// const _MIN_ACTIVE_DELAY = Math.floor(_BASE_DELAY / 4);
// const _MAX_FOODS_ON_GAME_AT_SAME_TIME = 5;
// const _MIN_FOOD_SPAWN_TIME = 2; // seconds
// const _MAX_FOOD_SPAWN_TIME = 8; // seconds
// const _DO_MOVEMENT_VECTOR = {
//     w: [0, -1],
//     s: [0, 1],
//     a: [-1, 0],
//     d: [1, 0],
// };
// const _BLOCK_MOVEMENTS = {
//     w: 's',
//     s: 'w',
//     a: 'd',
//     d: 'a',
// };

const settings = {
    render:{
        show_grid: true
    },
    movement:{
        direction: 'd',
        direction_buffer: ['d'],
        do_movement_vector: {
            w: [0, -1],
            s: [0, 1],
            a: [-1, 0],
            d: [1, 0],
        },
        block_movements: {
            w: 's',
            s: 'w',
            a: 'd',
            d: 'a',
        }
    },
    time:{
        base_delay: 80, // milliseconds
        delay_decrease_factor: 1, // milliseconds
        delay_decrease_interval: 3, // milliseconds
        // min_active_delay
        elapsed_time_in_second: 0
    },
    food:{
        max_foods_on_game_at_same_time: 5,
        min_food_spawn_time: 2, // seconds
        max_food_spawn_time: 8, // seconds
    },
    score:{
        high_score_key: 'HIGH_SCORE',
        high_score: 0,
    },
    state:{
        game_over: false,
    },
    size:{
        base_size: 20
    }
}

const runtime = {
    current_delay: settings.time.base_delay,
    min_active_delay: Math.floor(settings.time.base_delay / 4),
}

const bindKeyboard = () => {
    window.addEventListener('keydown', (event) => {
        if (event.key in settings.movement.do_movement_vector && settings.movement.block_movements[event.key] !== settings.movement.direction) {
            settings.movement.direction_buffer.push(event.key);
        }
    });
};

const snakePartFactory = (x = 0, y = 0, color = 'yellow') => ({x, y, color});
const foodFactory = (x = null, y = null, maxX = 0, maxY = 0) => ({
    x: x || random(0, maxX),
    y: y || random(0, maxY),
    color: 'red',
});

const init = () => {
    bindKeyboard();
    const canvas = document.getElementById('canvas');
    canvas.width = settings.size.base_size * Math.floor(window.innerWidth / settings.size.base_size) - (settings.size.base_size);
    canvas.height = settings.size.base_size * Math.floor(window.innerHeight / settings.size.base_size) - (settings.size.base_size);
    const positions = generateAllGridPositions(canvas);
    const ctx = canvas.getContext('2d');
    const headPosition = randomPosition(positions);
    const snake = [
        snakePartFactory(headPosition.x + settings.size.base_size * 2, headPosition.y),
        snakePartFactory(headPosition.x + settings.size.base_size, headPosition.y),
        snakePartFactory(headPosition.x, headPosition.y),
    ];
    const foodPosition = randomSafePosition(positions, snake);
    const foods = [foodFactory(foodPosition.x, foodPosition.y)];
    settings.score.high_score = parseInt(window.localStorage.getItem(settings.score.high_score_key), 10);
    loop(snake, foods, positions, canvas, ctx).then(() => {
        console.log('snake started');
        startGameTimer(foods, snake, positions);
    });
};

const loop = async (snake, foods, positions, canvas, ctx) => {
    update(snake, foods, positions, canvas);
    render(snake, foods, canvas, ctx);
    await delay(runtime.current_delay);
    window.requestAnimationFrame(() => loop(snake, foods, positions, canvas, ctx));
};

const update = (snake, foods, positions, canvas) => {
    if (settings.state.game_over) {
        return;
    }
    if (settings.movement.direction_buffer.length > 0) {
        settings.movement.direction = settings.movement.direction_buffer.shift();
    }
    const movementVector = settings.movement.do_movement_vector[settings.movement.direction];
    const head = snake[0];
    const nextHead = snakePartFactory(head.x + movementVector[0] * settings.size.base_size, head.y + movementVector[1] * settings.size.base_size);
    if (collidingWithBody(nextHead, snake)) {
        gameOver(snake);
        return;
    }
    head.color = 'white';
    computePositionOverflow(nextHead, canvas);
    snake.unshift(nextHead);
    const collidingFoodIndex = foods.findIndex(({x, y}) => x === nextHead.x && y === nextHead.y);
    if (collidingFoodIndex !== -1) {
        foods.splice(collidingFoodIndex, 1);
        generateRandomFood(foods, snake, positions);
    } else {
        snake.pop();
    }
};

const collidingWithBody = ({x, y}, snake) => {
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
    alert('GAME OVER');
    const score = snake.length - 3;
    if ((settings.score.high_score || 0) < score) {
        window.localStorage.setItem(settings.score.high_score_key, score.toString());
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
    settings.render.show_grid && renderGrid(canvas, ctx);
    renderInfo(snake, ctx);
    for (const {x, y, color} of [...snake, ...foods]) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, settings.size.base_size, settings.size.base_size);
    }
};

const renderGrid = (canvas, ctx) => {
    const squaresX = Math.floor(canvas.width / settings.size.base_size);
    const squaresY = Math.floor(canvas.height / settings.size.base_size);
    for (let i = 0; i < squaresX; i++) {
        for (let j = 0; j < squaresY; j++) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.strokeRect(i * settings.size.base_size, j * settings.size.base_size, settings.size.base_size, settings.size.base_size);
        }
    }
}

const renderInfo = (snake, ctx) => {
    ctx.fillStyle = 'white';
    ctx.font = `${settings.size.base_size - 2}px Arial`;
    const minutes = (settings.time.elapsed_time_in_second / 60).toFixed(0);
    ctx.fillText(`Time: ${minutes}m ${settings.time.elapsed_time_in_second % 60}s`, settings.size.base_size, settings.size.base_size * 2);
    ctx.fillText(`Score: ${snake.length - 3}`, settings.size.base_size, settings.size.base_size * 3);
    ctx.fillText(`Best: ${settings.score.high_score || 0}`, settings.size.base_size, settings.size.base_size * 4);
    ctx.fillText(`Difficult: ${settings.time.base_delay - runtime.current_delay}`, settings.size.base_size, settings.size.base_size * 5);
};

const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const random = (min = 0, max = 1) => Math.random() * (max - min) + min;
const randomPosition = (positions) => positions[Math.floor(Math.random() * positions.length - 1)];
const randomSafePosition = (positions, filled) => {
    let attempts = Math.floor(positions.length / 2);
    let position = randomPosition(positions);
    while (filled.find(({x, y}) => x === position.x && y === position.y) && attempts-- > 0) {
        position = randomPosition(positions);
    }
    return position;
};

const generateRandomFood = (foods, snake, positions) => {
    const position = randomSafePosition(positions, [...snake, ...foods]);
    foods.push(foodFactory(position.x, position.y));
};

const startGameTimer = (foods, snake, positions) => setInterval(() => {
    settings.time.elapsed_time_in_second++;
    if (settings.time.elapsed_time_in_second % settings.time.delay_decrease_interval === 0) {
        if (runtime.current_delay > runtime.min_active_delay) {
            runtime.current_delay -= settings.time.delay_decrease_factor;
        }
    }
    if (foods.length < settings.food.max_foods_on_game_at_same_time
        && settings.time.elapsed_time_in_second % parseInt(random(settings.food.min_food_spawn_time, settings.food.max_food_spawn_time), 10) === 0
    ) {
        generateRandomFood(foods, snake, positions);
    }
}, 1000);

const generateAllGridPositions = (canvas) => {
    const squaresX = Math.floor(canvas.width / settings.size.base_size);
    const squaresY = Math.floor(canvas.height / settings.size.base_size);
    const positions = [];
    for (let i = 0; i < squaresX; i++) {
        for (let j = 0; j < squaresY; j++) {
            positions.push({x: i * settings.size.base_size, y: j * settings.size.base_size});
        }
    }
    return positions;
};

window.addEventListener('load', init);