// Set up the canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Map dimensions
const mapWidth = 5000;
const mapHeight = 5000;

// Viewport dimensions (canvas size)
canvas.width = window.innerWidth;
canvas.height = window.innerHeight / 2; // Only the play window (upper half of the screen)

const viewportWidth = canvas.width;
const viewportHeight = canvas.height;

// Player state
let player = {
    x: viewportWidth / 2,
    y: viewportHeight / 2,
    radius: 15,
    speed: 3,
    color: 'blue',
    angle: 0 // Angle in radians
};

// Scroll offsets to track the visible portion of the map
let offsetX = 0;
let offsetY = 0;

// Buffer zone for scrolling
const bufferZone = 200;

// Scroll Wheel state
let isRotating = false;
let centerX, centerY;

// Get scroll wheel element
const scrollWheel = document.getElementById('scrollWheel');

// Add event listeners for the scroll wheel
scrollWheel.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isRotating = true;
    const touch = e.touches[0];
    centerX = scrollWheel.offsetLeft + scrollWheel.offsetWidth / 2;
    centerY = scrollWheel.offsetTop + scrollWheel.offsetHeight / 2;
    calculateAngle(touch.clientX, touch.clientY);
});

scrollWheel.addEventListener('touchmove', (e) => {
    if (!isRotating) return;
    e.preventDefault();
    const touch = e.touches[0];
    calculateAngle(touch.clientX, touch.clientY);
});

scrollWheel.addEventListener('touchend', () => {
    isRotating = false;
});

// Function to calculate the angle of rotation and set player direction
function calculateAngle(clientX, clientY) {
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const angle = Math.atan2(dy, dx); // Calculate angle in radians

    // Update player's angle
    player.angle = angle;
}

// Function to update player position based on angle
function updatePlayerPosition() {
    if (isRotating) {
        player.x += player.speed * Math.cos(player.angle);
        player.y += player.speed * Math.sin(player.angle);

        // Constrain the player within the map boundaries
        player.x = Math.max(player.radius, Math.min(mapWidth - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(mapHeight - player.radius, player.y));

        // Update scroll offset
        updateScrollOffset();
    }
}

// Function to update the scroll offset based on player position
function updateScrollOffset() {
    if (player.x - offsetX < bufferZone) {
        offsetX = Math.max(0, player.x - bufferZone);
    } else if (player.x - offsetX > viewportWidth - bufferZone) {
        offsetX = Math.min(mapWidth - viewportWidth, player.x - (viewportWidth - bufferZone));
    }

    if (player.y - offsetY < bufferZone) {
        offsetY = Math.max(0, player.y - bufferZone);
    } else if (player.y - offsetY > viewportHeight - bufferZone) {
        offsetY = Math.min(mapHeight - viewportHeight, player.y - (viewportHeight - bufferZone));
    }
}

// Function to draw the scene, including player
function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw map boundaries
    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, mapWidth, mapHeight);
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
