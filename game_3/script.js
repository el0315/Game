// Set up the canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game world dimensions
const worldWidth = 450;
const worldHeight = 400;

// Game state variables
let isRight = false;
let isLeft = false;
let isUp = false;
let isDown = false;
let gameOver = false;
let lastTime = 0; // Store the last frame time
let currentMode = 'blue'; // Player's current mode ('blue' or 'red')

// Resize canvas to fill the game container
function resizeCanvas() {
    const container = document.getElementById('gameContainer');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Set canvas dimensions to fill the container
    canvas.width = containerWidth;
    canvas.height = containerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);

// Character class
class Character {
    constructor(x, y, radius, speed, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speed = speed;
        this.color = color;
        this.distanceToNearestTarget = Infinity; // Initialize distance property
    }

    move() {
        if (isRight) this.x += this.speed;
        if (isLeft) this.x -= this.speed;
        if (isUp) this.y -= this.speed;
        if (isDown) this.y += this.speed;

        // Ensure the player stays within the game world
        if (this.x - this.radius < 0) this.x = this.radius;
        if (this.x + this.radius > worldWidth) this.x = worldWidth - this.radius;
        if (this.y - this.radius < 0) this.y = this.radius;
        if (this.y + this.radius > worldHeight) this.y = worldHeight - this.radius;
    }

    draw() {
        const xRatio = canvas.width / worldWidth;
        const yRatio = canvas.height / worldHeight;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x * xRatio, this.y * yRatio, this.radius * xRatio, 0, Math.PI * 2);
        ctx.fill();

        // Draw the distance to the nearest target on the player's circle
        if (this.distanceToNearestTarget !== Infinity) {
            ctx.fillStyle = 'white'; // Text color
            ctx.font = `${(this.radius / 2) * xRatio}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(this.distanceToNearestTarget), this.x * xRatio, this.y * yRatio);
        }
    }
}

// Event listeners for player movement using keyboard
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowRight') { isRight = true; e.preventDefault(); }
    if (e.code === 'ArrowLeft') { isLeft = true; e.preventDefault(); }
    if (e.code === 'ArrowUp') { isUp = true; e.preventDefault(); }
    if (e.code === 'ArrowDown') { isDown = true; e.preventDefault(); }
    if (e.code === 'KeyS') {
        switchMode();  // Switch player mode when 's' is pressed
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight') { isRight = false; e.preventDefault(); }
    if (e.code === 'ArrowLeft') { isLeft = false; e.preventDefault(); }
    if (e.code === 'ArrowUp') { isUp = false; e.preventDefault(); }
    if (e.code === 'ArrowDown') { isDown = false; e.preventDefault(); }
});

// Get control buttons and containers
const directionalButtons = document.getElementById('directionalButtons');
const upButton = document.getElementById('upButton');
const downButton = document.getElementById('downButton');
const leftButton = document.getElementById('leftButton');
const rightButton = document.getElementById('rightButton');
const aButton = document.getElementById('aButton');
const bButton = document.getElementById('bButton');

// Helper function to reset movement variables
function resetMovement() {
    isUp = false;
    isDown = false;
    isLeft = false;
    isRight = false;
}

// Directional Buttons Touch Event Listeners
directionalButtons.addEventListener('touchstart', handleDirectionTouchStart, false);
directionalButtons.addEventListener('touchmove', handleDirectionTouchMove, false);
directionalButtons.addEventListener('touchend', handleDirectionTouchEnd, false);

// Function to handle touchstart and touchmove events on the directional buttons
function handleDirectionTouchStart(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    updateDirection(touch);
}

function handleDirectionTouchMove(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    updateDirection(touch);
}

// Function to handle touchend event on the directional buttons
function handleDirectionTouchEnd(event) {
    event.preventDefault();
    resetMovement();
}

// Function to update movement variables based on touch position
function updateDirection(touch) {
    const rect = directionalButtons.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Dimensions of the buttons within the directional pad
    const buttonSize = 50; // As per CSS
    const gap = 0; // No gap between buttons

    resetMovement();

    // Determine which button the touch is over
    if (x >= buttonSize && x <= buttonSize * 2 && y >= 0 && y <= buttonSize) {
        isUp = true;
    } else if (x >= 0 && x <= buttonSize && y >= buttonSize && y <= buttonSize * 2) {
        isLeft = true;
    } else if (x >= buttonSize && x <= buttonSize * 2 && y >= buttonSize * 2 && y <= buttonSize * 3) {
        isDown = true;
    } else if (x >= buttonSize * 2 && x <= buttonSize * 3 && y >= buttonSize && y <= buttonSize * 2) {
        isRight = true;
    }
}

// Action Buttons Event Listeners
aButton.addEventListener('touchstart', (e) => { e.preventDefault(); switchMode(); });
aButton.addEventListener('mousedown', (e) => { e.preventDefault(); switchMode(); });

bButton.addEventListener('touchstart', (e) => { e.preventDefault(); /* Future functionality */ });
bButton.addEventListener('mousedown', (e) => { e.preventDefault(); /* Future functionality */ });

// Initialize player
let player = new Character(100, worldHeight - 30, 15, 3, 'blue'); // Start as player 1 (blue)

// Function to switch the player's mode
function switchMode() {
    if (currentMode === 'blue') {
        currentMode = 'red';
        player.color = 'red';
    } else {
        currentMode = 'blue';
        player.color = 'blue';
    }
}

// Enemy class
class Enemy {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;   // Width in game units
        this.height = height; // Height in game units
        this.color = color;
        this.speed = (Math.random() * 2 + 1) * 2; // Increased base speed
        this.affinity = parseInt(color.split('(')[1].split(',')[1]) / 255; // Affinity based on green channel
        this.randomMoveCooldown = Math.random() * 100; // Random timer for random movement
        this.followThreshold = 100; // Adjusted threshold to follow player in red mode
        this.evadeThreshold = 100;  // Adjusted threshold to evade player in blue mode

        // Calculate RGB sum and normalize
        const rgbValues = color.match(/\d+/g).map(Number); // Extract R, G, B values
        this.rgbSum = rgbValues[0] + rgbValues[1] + rgbValues[2]; // Sum of RGB values
        this.normalizedRgbSum = this.rgbSum / 765; // Normalize between 0 and 1 (max sum is 765)
    }

    update(player) {
        let moved = false;

        // Adjust speed if within the first column
        let adjustedSpeed = this.speed;
        if (
            this.x + this.width > columnX &&
            this.x < columnX + columnWidth &&
            this.y + this.height >= columnY &&
            this.y <= columnY + columnHeight
        ) {
            // Speed reduction proportional to normalized RGB sum
            adjustedSpeed *= (1 - this.normalizedRgbSum);
        }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (currentMode === 'blue' && distance < this.evadeThreshold) {
            // Evade player in blue mode
            const angle = Math.atan2(dy, dx);
            this.x -= adjustedSpeed * Math.cos(angle);
            this.y -= adjustedSpeed * Math.sin(angle);
            moved = true;
        } else if (currentMode === 'red' && distance < this.followThreshold) {
            // Follow player in red mode
            const angle = Math.atan2(dy, dx);
            this.x += adjustedSpeed * Math.cos(angle);
            this.y += adjustedSpeed * Math.sin(angle);
            moved = true;
        }

        // If not moved yet, proceed with random movement
        if (!moved) {
            this.randomMove(adjustedSpeed);
        }

        // Ensure enemies remain within bounds
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > worldWidth) this.x = worldWidth - this.width;
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > worldHeight) this.y = worldHeight - this.height;
    }

    randomMove(adjustedSpeed) {
        // Adjust speed if within the second column
        if (
            this.x + this.width > columnX &&
            this.x < columnX + columnWidth &&
            this.y + this.height >= secondColumnY &&
            this.y <= secondColumnY + secondColumnHeight
        ) {
            adjustedSpeed *= 0.5 + (0.5 * this.affinity); // Further reduce speed based on affinity
        }

        // Move randomly left, right, up, or down
        if (this.randomMoveCooldown <= 0) {
            const directions = ['left', 'right', 'up', 'down'];
            const chosenDirection = directions[Math.floor(Math.random() * directions.length)];

            switch (chosenDirection) {
                case 'left':
                    this.x -= adjustedSpeed;
                    break;
                case 'right':
                    this.x += adjustedSpeed;
                    break;
                case 'up':
                    this.y -= adjustedSpeed;
                    break;
                case 'down':
                    this.y += adjustedSpeed;
                    break;
            }

            // Ensure enemies remain within bounds
            if (this.x < 0) this.x = 0;
            if (this.x + this.width > worldWidth) this.x = worldWidth - this.width;
            if (this.y < 0) this.y = 0;
            if (this.y + this.height > worldHeight) this.y = worldHeight - this.height;

            // Reset the random move cooldown
            this.randomMoveCooldown = Math.random() * 100;
        } else {
            this.randomMoveCooldown -= 1;
        }
    }

    draw() {
        const xRatio = canvas.width / worldWidth;
        const yRatio = canvas.height / worldHeight;

        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x * xRatio,
            this.y * yRatio,
            this.width * xRatio,
            this.height * yRatio
        );
    }
}

// Function to generate random color
function getRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r}, ${g}, ${b})`;
}

// Define the target class properties
const targetColor = 'rgb(0, 0, 0)';  // Black color for target class
const targetClassCount = 10;  // Adjusted number of targets

// Generate enemies with random colors and specific targets with identical properties
let enemies = [];
for (let i = 0; i < 100 + targetClassCount; i++) {
    const enemyX = Math.random() * (worldWidth - 30);
    const enemyY = Math.random() * (worldHeight - 30);

    if (i < targetClassCount) {
        // Create targets with identical color (black)
        enemies.push(new Enemy(enemyX, enemyY, 15, 15, targetColor));
    } else {
        // Create normal enemies with random colors
        enemies.push(new Enemy(enemyX, enemyY, 15, 15, getRandomColor()));
    }
}

// Column properties (Centered columns)
const columnWidth = 100;
const columnX = (worldWidth - columnWidth) / 2;
const columnY = worldHeight / 5;
const columnHeight = 50;

// Second column properties (for speed reduction)
const secondColumnY = columnY + columnHeight + 20; // Position below the first column
const secondColumnHeight = 50; // Height of the second column

// Draw the columns
function drawColumn() {
    const xRatio = canvas.width / worldWidth;
    const yRatio = canvas.height / worldHeight;

    // Draw the first column
    ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
    ctx.fillRect(
        columnX * xRatio,
        columnY * yRatio,
        columnWidth * xRatio,
        columnHeight * yRatio
    );

    // Draw the second column
    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)'; // Semi-transparent orange color
    ctx.fillRect(
        columnX * xRatio,
        secondColumnY * yRatio,
        columnWidth * xRatio,
        secondColumnHeight * yRatio
    );
}

// Draw ground function
function drawGround() {
    const yRatio = canvas.height / worldHeight;

    ctx.fillStyle = 'green';
    ctx.fillRect(0, worldHeight * yRatio, canvas.width, canvas.height - (worldHeight * yRatio));
}

// Game loop
function gameLoop(currentTime) {
    if (gameOver) return;

    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGround();
    drawColumn();

    // Update and draw the player
    player.move();
    player.draw();

    // Find the nearest target for the player
    let minDistance = Infinity;
    let nearestTarget = null;

    enemies.forEach(enemy => {
        if (enemy.color === targetColor) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                nearestTarget = enemy;
            }
        }
    });

    // Assign the distance to the player
    player.distanceToNearestTarget = minDistance;

    enemies.forEach((enemy) => {
        enemy.update(player); // Use the updated movement logic with speed adjustments
        enemy.draw();
    });

    requestAnimationFrame(gameLoop);
}

// Start game loop
requestAnimationFrame(gameLoop);
