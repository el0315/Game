// Set up the canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Constants
const aspectRatio = 16 / 9;
let groundLevel = 1100;  // Fixed ground level
let worldLength = 2490; // World length equals canvas width for simplicity

// Game state variables
let isRight = false;
let isLeft = false;
let isUp = false;
let isDown = false;
let gameOver = false;
let lastTime = 0; // Store the last frame time
let currentMode = 'blue'; // Player's current mode ('blue' or 'red')

// Resize canvas to maintain aspect ratio
function resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    let newWidth, newHeight;

    if (windowWidth / windowHeight > aspectRatio) {
        newHeight = windowHeight;
        newWidth = newHeight * aspectRatio;
    } else {
        newWidth = windowWidth;
        newHeight = newWidth / aspectRatio;
    }

    canvas.width = newWidth * window.devicePixelRatio;
    canvas.height = newHeight * window.devicePixelRatio;
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = `${(windowWidth - newWidth) / 2}px`;
    canvas.style.top = `${(windowHeight - newHeight) / 2}px`;
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

        // Ensure the player stays within the game window
        if (this.x - this.radius < 0) this.x = this.radius;
        if (this.x + this.radius > worldLength) this.x = worldLength - this.radius;
        if (this.y - this.radius < 0) this.y = this.radius;
        if (this.y + this.radius > groundLevel) this.y = groundLevel - this.radius;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw the distance to the nearest target on the player's circle
        if (this.distanceToNearestTarget !== Infinity) {
            ctx.fillStyle = 'white'; // Text color
            ctx.font = `${this.radius / 2}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(this.distanceToNearestTarget), this.x, this.y);
        }
    }
}

// Event listeners for player movement
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

// Get control buttons
const upButton = document.getElementById('upButton');
const downButton = document.getElementById('downButton');
const leftButton = document.getElementById('leftButton');
const rightButton = document.getElementById('rightButton');
const aButton = document.getElementById('aButton');
const bButton = document.getElementById('bButton');

// Directional Buttons Event Listeners
upButton.addEventListener('touchstart', (e) => { e.preventDefault(); isUp = true; });
upButton.addEventListener('touchend', (e) => { e.preventDefault(); isUp = false; });
upButton.addEventListener('mousedown', (e) => { e.preventDefault(); isUp = true; });
upButton.addEventListener('mouseup', (e) => { e.preventDefault(); isUp = false; });

downButton.addEventListener('touchstart', (e) => { e.preventDefault(); isDown = true; });
downButton.addEventListener('touchend', (e) => { e.preventDefault(); isDown = false; });
downButton.addEventListener('mousedown', (e) => { e.preventDefault(); isDown = true; });
downButton.addEventListener('mouseup', (e) => { e.preventDefault(); isDown = false; });

leftButton.addEventListener('touchstart', (e) => { e.preventDefault(); isLeft = true; });
leftButton.addEventListener('touchend', (e) => { e.preventDefault(); isLeft = false; });
leftButton.addEventListener('mousedown', (e) => { e.preventDefault(); isLeft = true; });
leftButton.addEventListener('mouseup', (e) => { e.preventDefault(); isLeft = false; });

rightButton.addEventListener('touchstart', (e) => { e.preventDefault(); isRight = true; });
rightButton.addEventListener('touchend', (e) => { e.preventDefault(); isRight = false; });
rightButton.addEventListener('mousedown', (e) => { e.preventDefault(); isRight = true; });
rightButton.addEventListener('mouseup', (e) => { e.preventDefault(); isRight = false; });

// Action Buttons Event Listeners
aButton.addEventListener('touchstart', (e) => { e.preventDefault(); switchMode(); });
aButton.addEventListener('mousedown', (e) => { e.preventDefault(); switchMode(); });

bButton.addEventListener('touchstart', (e) => { e.preventDefault(); /* Future functionality */ });
bButton.addEventListener('mousedown', (e) => { e.preventDefault(); /* Future functionality */ });

// Initialize player
let player = new Character(100, groundLevel - 30, 30, 5, 'blue'); // Start as player 1 (blue)

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

// Draw ground function
function drawGround() {
    ctx.fillStyle = 'green';
    ctx.fillRect(0, groundLevel, canvas.width, canvas.height - groundLevel);
}

// Updated Enemy class with movement logic and speed adjustments based on RGB sum
class Enemy {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = (Math.random() * 2 + 1) * 2; // Increased base speed
        this.affinity = parseInt(color.split('(')[1].split(',')[1]) / 255; // Affinity based on green channel
        this.randomMoveCooldown = Math.random() * 100; // Random timer for random movement
        this.followThreshold = 200; // Threshold to follow player in red mode
        this.evadeThreshold = 200;  // Threshold to evade player in blue mode

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
        if (this.x + this.width > worldLength) this.x = worldLength - this.width;
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > groundLevel) this.y = groundLevel - this.height;
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
            if (this.x + this.width > worldLength) this.x = worldLength - this.width;
            if (this.y < 0) this.y = 0;
            if (this.y + this.height > groundLevel) this.y = groundLevel - this.height;

            // Reset the random move cooldown
            this.randomMoveCooldown = Math.random() * 100;
        } else {
            this.randomMoveCooldown -= 1;
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
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
const targetClassCount = 20;  // Number of targets with identical properties

// Generate enemies with random colors and specific targets with identical properties
let enemies = [];
for (let i = 0; i < 500 + targetClassCount; i++) {
    const enemyX = Math.random() * (worldLength - 50);
    const enemyY = Math.random() * canvas.height;

    if (i < targetClassCount) {
        // Create targets with identical color (black)
        enemies.push(new Enemy(enemyX, enemyY, 25, 25, targetColor));
    } else {
        // Create normal enemies with random colors
        enemies.push(new Enemy(enemyX, enemyY, 25, 25, getRandomColor()));
    }
}

// Column properties (1/3 width of the canvas and centered)
const columnWidth = canvas.width / 3;
const columnX = (canvas.width - columnWidth) / 2;
const columnY = canvas.height / 5;
const columnHeight = 100;

// Second column properties (for speed reduction)
const secondColumnY = columnY + columnHeight + 50; // Position below the first column
const secondColumnHeight = 100; // Height of the second column

// Draw the columns with 1/3 width and centered
function drawColumn() {
    // Draw the first column
    ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
    ctx.fillRect(columnX, columnY, columnWidth, columnHeight);

    // Draw the second column
    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)'; // Semi-transparent orange color
    ctx.fillRect(columnX, secondColumnY, columnWidth, secondColumnHeight);
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
