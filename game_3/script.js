// Set up the canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Map dimensions
const mapWidth = 1000;
const mapHeight = 1000;

// Viewport dimensions (canvas size)
canvas.width = window.innerWidth;
canvas.height = window.innerHeight / 2; // Only the play window (upper half of the screen)

const viewportWidth = canvas.width;
const viewportHeight = canvas.height;

// Player state
let player = {
    x: mapWidth / 2,
    y: mapHeight / 2,
    radius: 15,
    speed: 3,
    color: 'blue'
};

// Buffer zone for scrolling
const bufferZone = 80;

// Scroll offsets to track the visible portion of the map
let offsetX = 0;
let offsetY = 0;

// Barriers
let barriers = [
    {
        x: 300,
        y: 300,
        width: 100,
        height: 100,
        color: 'gray'
    }
];

// Movement state variables
let isRight = false;
let isLeft = false;
let isUp = false;
let isDown = false;

// Event listeners for keyboard movement
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowRight') { isRight = true; e.preventDefault(); }
    if (e.code === 'ArrowLeft') { isLeft = true; e.preventDefault(); }
    if (e.code === 'ArrowUp') { isUp = true; e.preventDefault(); }
    if (e.code === 'ArrowDown') { isDown = true; e.preventDefault(); }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight') { isRight = false; e.preventDefault(); }
    if (e.code === 'ArrowLeft') { isLeft = false; e.preventDefault(); }
    if (e.code === 'ArrowUp') { isUp = false; e.preventDefault(); }
    if (e.code === 'ArrowDown') { isDown = false; e.preventDefault(); }
});

// Get control buttons from the DOM
const upButton = document.getElementById('upButton');
const downButton = document.getElementById('downButton');
const leftButton = document.getElementById('leftButton');
const rightButton = document.getElementById('rightButton');

// Add touch and mouse event listeners for directional buttons
upButton.addEventListener('touchstart', () => { isUp = true; });
upButton.addEventListener('touchend', () => { isUp = false; });
upButton.addEventListener('mousedown', () => { isUp = true; });
upButton.addEventListener('mouseup', () => { isUp = false; });

downButton.addEventListener('touchstart', () => { isDown = true; });
downButton.addEventListener('touchend', () => { isDown = false; });
downButton.addEventListener('mousedown', () => { isDown = true; });
downButton.addEventListener('mouseup', () => { isDown = false; });

leftButton.addEventListener('touchstart', () => { isLeft = true; });
leftButton.addEventListener('touchend', () => { isLeft = false; });
leftButton.addEventListener('mousedown', () => { isLeft = true; });
leftButton.addEventListener('mouseup', () => { isLeft = false; });

rightButton.addEventListener('touchstart', () => { isRight = true; });
rightButton.addEventListener('touchend', () => { isRight = false; });
rightButton.addEventListener('mousedown', () => { isRight = true; });
rightButton.addEventListener('mouseup', () => { isRight = false; });

// Ensure buttons work on click as well (useful for desktop testing)
upButton.addEventListener('click', () => { isUp = true; setTimeout(() => { isUp = false; }, 100); });
downButton.addEventListener('click', () => { isDown = true; setTimeout(() => { isDown = false; }, 100); });
leftButton.addEventListener('click', () => { isLeft = true; setTimeout(() => { isLeft = false; }, 100); });
rightButton.addEventListener('click', () => { isRight = true; setTimeout(() => { isRight = false; }, 100); });

// Function to check collision between player and barriers
function checkCollisionWithBarriers(newX, newY) {
    for (let barrier of barriers) {
        if (
            newX + player.radius > barrier.x &&
            newX - player.radius < barrier.x + barrier.width &&
            newY + player.radius > barrier.y &&
            newY - player.radius < barrier.y + barrier.height
        ) {
            return true; // Collision detected
        }
    }
    return false; // No collision
}

// Function to move the player and adjust scrolling
function updatePlayerPosition() {
    let newX = player.x;
    let newY = player.y;

    if (isRight && player.x + player.radius + player.speed < mapWidth) {
        newX += player.speed;
    }
    if (isLeft && player.x - player.radius - player.speed > 0) {
        newX -= player.speed;
    }
    if (isUp && player.y - player.radius - player.speed > 0) {
        newY -= player.speed;
    }
    if (isDown && player.y + player.radius + player.speed < mapHeight) {
        newY += player.speed;
    }

    // Check for collision with barriers before updating position
    if (!checkCollisionWithBarriers(newX, newY)) {
        player.x = newX;
        player.y = newY;
    }

    // Adjust horizontal scrolling
    if (player.x - offsetX < bufferZone) {
        offsetX = Math.max(0, player.x - bufferZone);
    } else if (player.x - offsetX > viewportWidth - bufferZone) {
        offsetX = Math.min(mapWidth - viewportWidth, player.x - (viewportWidth - bufferZone));
    }

    // Adjust vertical scrolling
    if (player.y - offsetY < bufferZone) {
        offsetY = Math.max(0, player.y - bufferZone);
    } else if (player.y - offsetY > viewportHeight - bufferZone) {
        offsetY = Math.min(mapHeight - viewportHeight, player.y - (viewportHeight - bufferZone));
    }
}

// Function to draw the map, player, and barriers
function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw map boundaries
    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, mapWidth, mapHeight);
    ctx.restore();

    // Draw barriers
    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    for (let barrier of barriers) {
        ctx.fillStyle = barrier.color;
        ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
    }
    ctx.restore();

    // Draw the player
    ctx.save();
    ctx.translate(player.x - offsetX, player.y - offsetY);
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Game loop
function gameLoop() {
    updatePlayerPosition();
    drawScene();
    requestAnimationFrame(gameLoop);
}

// Start the game loop
gameLoop();
