// Set up the canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game world dimensions
const worldWidth = 450;
const worldHeight = 200; // Adjusted to reflect top 50% play area

// Game state variables
let isRight = false;
let isLeft = false;
let isUp = false;
let isDown = false;
let isShooting = false; // Indicates if the player is holding down the "B" button
let lastShotTime = 0;   // Time when the last shot was fired
const shootDelay = 50; // Delay between shots in milliseconds
let gameOver = false;
let lastTime = 0; // Store the last frame time
let currentMode = 'blue'; // Player's current mode ('blue' or 'red')

// Resize canvas to fill the game container without distortion
function resizeCanvas() {
    const container = document.getElementById('gameContainer');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Maintain aspect ratio without stretching
    const aspectRatio = worldWidth / worldHeight;
    if (containerWidth / containerHeight > aspectRatio) {
        canvas.height = containerHeight;
        canvas.width = containerHeight * aspectRatio;
    } else {
        canvas.width = containerWidth;
        canvas.height = containerWidth / aspectRatio;
    }

    ctx.scale(canvas.width / worldWidth, canvas.height / worldHeight);
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

        // Ensure the player stays within the play window (top 50% of the screen)
        if (this.x - this.radius < 0) this.x = this.radius;
        if (this.x + this.radius > worldWidth) this.x = worldWidth - this.radius;
        if (this.y - this.radius < 0) this.y = this.radius;
        if (this.y + this.radius > worldHeight) this.y = worldHeight - this.radius;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw the distance to the nearest target on the player's circle
        if (this.distanceToNearestTarget !== Infinity) {
            ctx.fillStyle = 'white';
            ctx.font = `${(this.radius / 2)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(Math.round(this.distanceToNearestTarget), this.x, this.y);
        }
    }
}

// Event listeners for keyboard control
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowRight') { isRight = true; e.preventDefault(); }
    if (e.code === 'ArrowLeft') { isLeft = true; e.preventDefault(); }
    if (e.code === 'ArrowUp') { isUp = true; e.preventDefault(); }
    if (e.code === 'ArrowDown') { isDown = true; e.preventDefault(); }
    if (e.code === 'KeyS') {
        switchMode();  // Switch player mode when 's' is pressed
        e.preventDefault();
    }
    if (e.code === 'KeyB') {
        isShooting = true; // Start shooting when 'B' key is pressed
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight') { isRight = false; e.preventDefault(); }
    if (e.code === 'ArrowLeft') { isLeft = false; e.preventDefault(); }
    if (e.code === 'ArrowUp') { isUp = false; e.preventDefault(); }
    if (e.code === 'ArrowDown') { isDown = false; e.preventDefault(); }
    if (e.code === 'KeyB') {
        isShooting = false; // Stop shooting when 'B' key is released
        e.preventDefault();
    }
});

// Get control buttons and containers
const directionalButtons = document.getElementById('directionalButtons');
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
directionalButtons.addEventListener('touchstart', handleDirectionTouch, false);
directionalButtons.addEventListener('touchmove', handleDirectionTouch, false);
directionalButtons.addEventListener('touchend', handleDirectionTouchEnd, false);

// Function to handle touch events on the directional buttons
function handleDirectionTouch(event) {
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

    const buttonSize = 60; // Button size as per layout
    resetMovement();

    // Determine which button the touch is over
    if (x >= buttonSize && x <= buttonSize * 2 && y >= 0 && y <= buttonSize) {
        isUp = true; // Up button
    } else if (x >= 0 && x <= buttonSize && y >= buttonSize && y <= buttonSize * 2) {
        isLeft = true; // Left button
    } else if (x >= buttonSize && x <= buttonSize * 2 && y >= buttonSize * 2 && y <= buttonSize * 3) {
        isDown = true; // Down button
    } else if (x >= buttonSize * 2 && x <= buttonSize * 3 && y >= buttonSize && y <= buttonSize * 2) {
        isRight = true; // Right button
    }
}

// Action Buttons Event Listeners
aButton.addEventListener('touchstart', (e) => { e.preventDefault(); switchMode(); });
aButton.addEventListener('mousedown', (e) => { e.preventDefault(); switchMode(); });

bButton.addEventListener('touchstart', (e) => { e.preventDefault(); isShooting = true; });
bButton.addEventListener('touchend', (e) => { e.preventDefault(); isShooting = false; });
bButton.addEventListener('mousedown', (e) => { e.preventDefault(); isShooting = true; });
bButton.addEventListener('mouseup', (e) => { e.preventDefault(); isShooting = false; });

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
        this.width = width;
        this.height = height;
        this.color = color;
        this.speed = (Math.random() * 2 + 1) * 2;
        this.affinity = parseInt(color.split('(')[1].split(',')[1]) / 255;
        this.randomMoveCooldown = Math.random() * 100;
        this.followThreshold = 100;
        this.evadeThreshold = 100;

        const rgbValues = color.match(/\d+/g).map(Number);
        this.rgbSum = rgbValues[0] + rgbValues[1] + rgbValues[2];
        this.normalizedRgbSum = this.rgbSum / 765;

        this.isShot = false;
        this.shotSpeed = 0;

        this.inColumn = false;
        this.columnEntrySide = null;
        this.exitTarget = { x: this.x, y: this.y };
    }

    update(player) {
        if (this.isShot) {
            this.y += this.shotSpeed;

            if (this.isInsideColumn()) {
                if (!this.inColumn) {
                    this.inColumn = true;
                    this.columnEntrySide = this.getColumnEntrySide();
                    this.setExitTarget();
                }

                this.moveTowardsExit();
                return;
            }

            if (this.y + this.height >= worldHeight) {
                this.isShot = false;
                this.shotSpeed = 0;
                this.y = worldHeight - this.height;
            }

            return;
        }

        this.normalBehavior(player);
    }

    normalBehavior(player) {
        let moved = false;
        let adjustedSpeed = this.speed;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (currentMode === 'blue' && distance < this.evadeThreshold) {
            const angle = Math.atan2(dy, dx);
            this.x -= adjustedSpeed * Math.cos(angle);
            this.y -= adjustedSpeed * Math.sin(angle);
            moved = true;
        } else if (currentMode === 'red' && distance < this.followThreshold) {
            const angle = Math.atan2(dy, dx);
            this.x += adjustedSpeed * Math.cos(angle);
            this.y += adjustedSpeed * Math.sin(angle);
            moved = true;
        }

        if (!moved) {
            this.randomMove(adjustedSpeed);
        }

        this.constrainPosition();
    }

    moveTowardsExit() {
        const dx = this.exitTarget.x - this.x;
        const dy = this.exitTarget.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            const moveX = (dx / distance) * this.shotSpeed;
            const moveY = (dy / distance) * this.shotSpeed;
            this.x += moveX;
            this.y += moveY;
        } else {
            this.inColumn = false;
            this.columnEntrySide = null;
            this.isShot = false;
            this.shotSpeed = 0;
        }

        this.constrainPosition();
    }

    isInsideColumn() {
        return this.isInsideFirstColumn() || this.isInsideSecondColumn();
    }

    isInsideFirstColumn() {
        return (
            this.x + this.width > columnX &&
            this.x < columnX + columnWidth &&
            this.y + this.height > columnY &&
            this.y < columnY + columnHeight
        );
    }

    isInsideSecondColumn() {
        return (
            this.x + this.width > columnX &&
            this.x < columnX + columnWidth &&
            this.y + this.height > secondColumnY &&
            this.y < secondColumnY + secondColumnHeight
        );
    }

    getColumnEntrySide() {
        let entrySide = null;

        const column = this.isInsideFirstColumn()
            ? { x: columnX, y: columnY, width: columnWidth, height: columnHeight }
            : { x: columnX, y: secondColumnY, width: columnWidth, height: secondColumnHeight };

        const centerX = column.x + column.width / 2;
        const centerY = column.y + column.height / 2;

        const dx = this.x + this.width / 2 - centerX;
        const dy = this.y + this.height / 2 - centerY;

        if (Math.abs(dx) > Math.abs(dy)) {
            entrySide = dx > 0 ? 'right' : 'left';
        } else {
            entrySide = dy > 0 ? 'bottom' : 'top';
        }

        return entrySide;
    }

    setExitTarget() {
        if (this.columnEntrySide === 'left') {
            this.exitTarget.x = columnX + columnWidth + 10;
            this.exitTarget.y = this.y;
        } else if (this.columnEntrySide === 'right') {
            this.exitTarget.x = columnX - this.width - 10;
            this.exitTarget.y = this.y;
        } else if (this.columnEntrySide === 'top') {
            this.exitTarget.x = this.x;
            this.exitTarget.y = this.isInsideFirstColumn() ? columnY + columnHeight + 10 : secondColumnY + secondColumnHeight + 10;
        } else if (this.columnEntrySide === 'bottom') {
            this.exitTarget.x = this.x;
            this.exitTarget.y = this.isInsideFirstColumn() ? columnY - this.height - 10 : secondColumnY - this.height - 10;
        } else {
            this.exitTarget.x = this.x;
            this.exitTarget.y = worldHeight + 10;
        }
    }

    constrainPosition() {
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > worldWidth) this.x = worldWidth - this.width;
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > worldHeight) this.y = worldHeight - this.height;
    }

    randomMove(adjustedSpeed) {
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

            this.constrainPosition();
            this.randomMoveCooldown = Math.random() * 100;
        } else {
            this.randomMoveCooldown -= 1;
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x * (canvas.width / worldWidth),
            this.y * (canvas.height / worldHeight),
            this.width * (canvas.width / worldWidth),
            this.height * (canvas.height / worldHeight)
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

// Define columns and their properties
const columnWidth = 100;
const columnX = (worldWidth - columnWidth) / 2;
const columnY = worldHeight / 5;
const columnHeight = 50;
const secondColumnY = columnY + columnHeight + 20;
const secondColumnHeight = 50;

function drawColumn() {
    ctx.fillStyle = 'rgba(0, 0, 255, 0.3)';
    ctx.fillRect(
        columnX * (canvas.width / worldWidth),
        columnY * (canvas.height / worldHeight),
        columnWidth * (canvas.width / worldWidth),
        columnHeight * (canvas.height / worldHeight)
    );

    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
    ctx.fillRect(
        columnX * (canvas.width / worldWidth),
        secondColumnY * (canvas.height / worldHeight),
        columnWidth * (canvas.width / worldWidth),
        secondColumnHeight * (canvas.height / worldHeight)
    );
}

// Draw ground function
function drawGround() {
    ctx.fillStyle = 'green';
    ctx.fillRect(0, worldHeight * (canvas.height / worldHeight), canvas.width, canvas.height - (worldHeight * (canvas.height / worldHeight)));
}

// Function to shoot an enemy
function shootEnemy() {
    const thresholdDistance = 10;
    let nearestEnemy = null;
    let minDistance = Infinity;

    for (let enemy of enemies) {
        if (!enemy.isShot) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= thresholdDistance && distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemy;
            }
        }
    }

    if (nearestEnemy) {
        nearestEnemy.isShot = true;
        nearestEnemy.shotSpeed = player.speed * 5;
    }
}

// Generate enemies
const targetColor = 'rgb(0, 0, 0)';
const targetClassCount = 10;
let enemies = [];

for (let i = 0; i < 100 + targetClassCount; i++) {
    const enemyX = Math.random() * (worldWidth - 30);
    const enemyY = Math.random() * (worldHeight - 30);

    if (i < targetClassCount) {
        enemies.push(new Enemy(enemyX, enemyY, 15, 15, targetColor));
    } else {
        enemies.push(new Enemy(enemyX, enemyY, 15, 15, getRandomColor()));
    }
}

// Game loop
function gameLoop(currentTime) {
    if (gameOver) return;

    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround();
    drawColumn();

    player.move();
    player.draw();

    if (isShooting && currentMode === 'red') {
        if (currentTime - lastShotTime >= shootDelay) {
            shootEnemy();
            lastShotTime = currentTime;
        }
    }

    let minDistance = Infinity;
    let nearestTarget = null;

    enemies.forEach(enemy => {
        if (enemy.color === targetColor) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const distance = Math.hypot(dx, dy);

            if (distance < minDistance) {
                minDistance = distance;
                nearestTarget = enemy;
            }
        }
    });

    player.distanceToNearestTarget = minDistance;

    enemies.forEach(enemy => {
        enemy.update(player);
        enemy.draw();
    });

    requestAnimationFrame(gameLoop);
}

// Start game loop
requestAnimationFrame(gameLoop);
