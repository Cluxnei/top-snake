const HIGH_SCORE_KEY = 'HIGH_SCORE';
const _BASE_SIZE = 20;
const _DIRECTION_BUFFER = ['d'];
let _DIRECTION = 'd';
let _SHOW_GRID = true;
let ELAPSED_TIME_IN_SECONDS = 0;
let _GAME_OVER = false;
let _HIGH_SCORE = 0;
const _BASE_DELAY = 80; // milliseconds
let _CURRENT_DELAY = _BASE_DELAY; // don't change
const _DELAY_DECREASE_FACTOR = 1; // milliseconds
const _DELAY_DECREASE_INTERVAL = 3; // seconds
const _MIN_ACTIVE_DELAY = Math.floor(_BASE_DELAY / 4);
const _MAX_FOODS_ON_GAME_AT_SAME_TIME = 5;
const _MIN_FOOD_SPAWN_TIME = 2; // seconds
const _MAX_FOOD_SPAWN_TIME = 8; // seconds
const _DO_MOVEMENT_VECTOR = {
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
};
const _BLOCK_MOVEMENTS = {
    w: 's',
    s: 'w',
    a: 'd',
    d: 'a',
};

const bindKeyboard = () => {
    window.addEventListener('keydown', (event) => {
        if (event.key in _DO_MOVEMENT_VECTOR && _BLOCK_MOVEMENTS[event.key] !== _DIRECTION) {
            _DIRECTION_BUFFER.push(event.key);
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
    canvas.width = _BASE_SIZE * Math.floor(window.innerWidth / _BASE_SIZE);
    canvas.height = _BASE_SIZE * Math.floor(window.innerHeight / _BASE_SIZE);
    const positions = generateAllGridPositions(canvas);
    const ctx = canvas.getContext('2d');
    const headPosition = randomPosition(positions);
    const snake = [
        snakePartFactory(headPosition.x + _BASE_SIZE * 2, headPosition.y),
        snakePartFactory(headPosition.x + _BASE_SIZE, headPosition.y),
        snakePartFactory(headPosition.x, headPosition.y),
    ];
    const foodPosition = randomSafePosition(positions, snake);
    const foods = [foodFactory(foodPosition.x, foodPosition.y)];
    _HIGH_SCORE = parseInt(window.localStorage.getItem(HIGH_SCORE_KEY), 10);
    loop(snake, foods, positions, canvas, ctx).then(() => {
        console.log('snake started');
        startGameTimer(foods, snake, positions);
    });
};

const loop = async (snake, foods, positions, canvas, ctx) => {
    update(snake, foods, positions, canvas);
    render(snake, foods, canvas, ctx);
    await delay(_CURRENT_DELAY);
    window.requestAnimationFrame(() => loop(snake, foods, positions, canvas, ctx));
};

const update = (snake, foods, positions, canvas) => {
    if (_GAME_OVER) {
        return;
    }
    if (_DIRECTION_BUFFER.length > 0) {
        _DIRECTION = _DIRECTION_BUFFER.shift();
    }
    const movementVector = _DO_MOVEMENT_VECTOR[_DIRECTION];
    const head = snake[0];
    const nextHead = snakePartFactory(head.x + movementVector[0] * _BASE_SIZE, head.y + movementVector[1] * _BASE_SIZE);
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
    _GAME_OVER = true;
    alert('GAME OVER');
    const score = snake.length - 3;
    if ((_HIGH_SCORE || 0) < score) {
        window.localStorage.setItem(HIGH_SCORE_KEY, score.toString());
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
    _SHOW_GRID && renderGrid(canvas, ctx);
    renderInfo(snake, ctx);
    for (const {x, y, color} of [...snake, ...foods]) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, _BASE_SIZE, _BASE_SIZE);
    }
};

const renderGrid = (canvas, ctx) => {
    const squaresX = Math.floor(canvas.width / _BASE_SIZE);
    const squaresY = Math.floor(canvas.height / _BASE_SIZE);
    for (let i = 0; i < squaresX; i++) {
        for (let j = 0; j < squaresY; j++) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.strokeRect(i * _BASE_SIZE, j * _BASE_SIZE, _BASE_SIZE, _BASE_SIZE);
        }
    }
}

const renderInfo = (snake, ctx) => {
    ctx.fillStyle = 'white';
    ctx.font = `${_BASE_SIZE - 2}px Arial`;
    const minutes = (ELAPSED_TIME_IN_SECONDS / 60).toFixed(0);
    ctx.fillText(`Time: ${minutes}m ${ELAPSED_TIME_IN_SECONDS % 60}s`, _BASE_SIZE, _BASE_SIZE * 2);
    ctx.fillText(`Score: ${snake.length - 3}`, _BASE_SIZE, _BASE_SIZE * 3);
    ctx.fillText(`Best: ${_HIGH_SCORE || 0}`, _BASE_SIZE, _BASE_SIZE * 4);
    ctx.fillText(`Difficult: ${_BASE_DELAY - _CURRENT_DELAY}`, _BASE_SIZE, _BASE_SIZE * 5);
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
    ELAPSED_TIME_IN_SECONDS++;
    if (ELAPSED_TIME_IN_SECONDS % _DELAY_DECREASE_INTERVAL === 0) {
        if (_CURRENT_DELAY > _MIN_ACTIVE_DELAY) {
            _CURRENT_DELAY -= _DELAY_DECREASE_FACTOR;
        }
    }
    if (foods.length < _MAX_FOODS_ON_GAME_AT_SAME_TIME
        && ELAPSED_TIME_IN_SECONDS % parseInt(random(_MIN_FOOD_SPAWN_TIME, _MAX_FOOD_SPAWN_TIME), 10) === 0
    ) {
        generateRandomFood(foods, snake, positions);
    }
}, 1000);

const generateAllGridPositions = (canvas) => {
    const squaresX = Math.floor(canvas.width / _BASE_SIZE);
    const squaresY = Math.floor(canvas.height / _BASE_SIZE);
    const positions = [];
    for (let i = 0; i < squaresX; i++) {
        for (let j = 0; j < squaresY; j++) {
            positions.push({x: i * _BASE_SIZE, y: j * _BASE_SIZE});
        }
    }
    return positions;
};

window.addEventListener('load', init);