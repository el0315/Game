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

// Barriers (placeholder)
let barriers = [];

// Joystick state
let joystickActive = false;
let centerX, centerY;

// Get joystick elements
const joystickContainer = document.getElementById('joystickContainer');
const joystickBase = document.getElementById('joystickBase');
const joystickHandle = document.getElementById('joystickHandle');

// Add event listeners for the joystick
joystickContainer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystickActive = true;
    const touch = e.touches[0];
    centerX = joystickBase.offsetLeft + joystickBase.offsetWidth / 2;
    centerY = joystickBase.offsetTop + joystickBase.offsetHeight / 2;
    moveJoystick(touch.clientX, touch.clientY);
});

joystickContainer.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveJoystick(touch.clientX, touch.clientY);
});

joystickContainer.addEventListener('touchend', () => {
    joystickActive = false;
    resetJoystick();
});

// Function to move the joystick handle and calculate movement direction
function moveJoystick(clientX, clientY) {
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), joystickBase.offsetWidth / 2);
    const angle = Math.atan2(dy, dx);

    const handleX = Math.cos(angle) * distance;
    const handleY = Math.sin(angle) * distance;

    joystickHandle.style.transform = `translate(${handleX}px, ${handleY}px)`;

    // Calculate normalized direction vector
    const normalizedX = handleX / (joystickBase.offsetWidth / 2);
    const normalizedY = handleY / (joystickBase.offsetHeight / 2);

    // Apply movement based on joystick input
    playerMovement(normalizedX, normalizedY);
}

// Function to apply player movement based on joystick input
function playerMovement(normalizedX, normalizedY) {
    if (normalizedX > 0.2) {
        player.x += player.speed * normalizedX;
    } else if (normalizedX < -0.2) {
        player.x += player.speed * normalizedX;
    }

    if (normalizedY > 0.2) {
        player.y += player.speed * normalizedY;
    } else if (normalizedY < -0.2) {
        player.y += player.speed * normalizedY;
    }

    // Constrain the player within the map boundaries
    player.x = Math.max(player.radius, Math.min(mapWidth - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(mapHeight - player.radius, player.y));

    // Update scroll offset
    updateScrollOffset();
}

// Reset joystick handle position
function resetJoystick() {
    joystickHandle.style.transform = 'translate(-50%, -50%)';
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

// Function to draw the scene, including player and barriers
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
    drawScene();
    requestAnimationFrame(gameLoop);
}

// Start the game loop
gameLoop();
