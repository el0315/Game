// Set up the main canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Set up the mini-map canvas and context
const miniMapCanvas = document.createElement('canvas');
miniMapCanvas.width = 100;
miniMapCanvas.height = 100;
miniMapCanvas.style.position = 'absolute';
miniMapCanvas.style.top = '10px';
miniMapCanvas.style.right = '10px';
miniMapCanvas.style.border = '2px solid black';
miniMapCanvas.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
document.body.appendChild(miniMapCanvas);
const miniCtx = miniMapCanvas.getContext('2d');

// Map dimensions
const mapWidth = 1000;
const mapHeight = 1000;

// Scaling factor for the mini-map
const miniMapScaleX = miniMapCanvas.width / mapWidth;
const miniMapScaleY = miniMapCanvas.height / mapHeight;

// Viewport dimensions (canvas size)
canvas.width = window.innerWidth;
canvas.height = window.innerHeight / 2;

const viewportWidth = canvas.width;
const viewportHeight = canvas.height;

// Player state
let player = {
    x: 100,
    y: 100,
    radius: 15,
    baseSpeed: 3,
    speed: 3,
    color: 'blue',
    health: 100,
    maxHealth: 100,
    lastDirection: { x: 1, y: 0 },
    attachedCells: []
};

// Enemy state
let enemy = {
    x: 800,
    y: 800,
    radius: 15,
    baseSpeed: 3,
    speed: 3,
    color: 'lightpurple',
    health: 100,
    maxHealth: 100,
    lastDirection: { x: -1, y: 0 },
    attachedCells: [],
    isFiring: false,
    lastShotTime: 0
};

// Variables for behavior logic
const chaseDistance = 1000;
const attackDistance = 500;
const enemyShootingCooldown = 100;

// Buffer zone for scrolling
const bufferZone = 80;

// Scroll offsets to track the visible portion of the map
let offsetX = 0;
let offsetY = 0;

// Joystick states
let joystickMoveAngle = null;
let joystickFireAngle = null;
let movePointerId = null; // Track the pointer ID for movement joystick
let firePointerId = null; // Track the pointer ID for firing joystick
let isFiring = false;

// Array to hold projectiles
let projectiles = [];
let enemyProjectiles = [];
const projectileSize = player.radius / 10;
const projectileSpeed = 5;
const shootingCooldown = 100;
let lastShotTime = 0;

// Get joystick and button elements
const joystickContainerMove = document.getElementById('joystickContainerMove');
const joystickKnobMove = document.getElementById('joystickKnobMove');
const joystickContainerFire = document.getElementById('joystickContainerFire');
const joystickKnobFire = document.getElementById('joystickKnobFire');
const bButton = document.getElementById('bButton');

// Array to hold all cells on the map
let cells = [
    createCell(200, 200, 'yellow', 'yellow'),
    createCell(300, 300, 'orange', 'orange'),
    createCell(400, 400, 'red', 'red')
];

// Cell detachment timing and attributes
const cellDuration = 10000;
const maxCells = 50;

// Speed boost multiplier
const speedBoostMultiplier = 1.5;

// Function to create a cell
function createCell(x, y, color, type) {
    return {
        x: x,
        y: y,
        radius: player.radius / 2,
        color: color,
        attached: false,
        type: type,
        attachTime: null,
        directionChangeInterval: 2000,
        directionAngle: Math.random() * 2 * Math.PI,
        lastDirectionChangeTime: Date.now()
    };
}

// Event listeners for movement joystick
joystickKnobMove.addEventListener('pointerdown', (e) => {
    movePointerId = e.pointerId; // Track the pointer ID for movement
    e.preventDefault();
});

joystickKnobMove.addEventListener('pointermove', (e) => {
    if (e.pointerId === movePointerId) {
        handleMoveJoystick(e);
    }
    e.preventDefault();
});

joystickKnobMove.addEventListener('pointerup', () => {
    joystickMoveAngle = null;
    joystickKnobMove.style.transform = `translate(0px, 0px)`;
});

// Event listeners for firing joystick
joystickKnobFire.addEventListener('pointerdown', (e) => {
    firePointerId = e.pointerId; // Track the pointer ID for firing
    handleFireJoystick(e); // Start firing immediately on touch
    e.preventDefault();
});

joystickKnobFire.addEventListener('pointermove', (e) => {
    if (e.pointerId === firePointerId) {
        handleFireJoystick(e);
    }
    e.preventDefault();
});

joystickKnobFire.addEventListener('pointerup', () => {
    isFiring = false; // Stop firing when the joystick is released
    joystickKnobFire.style.transform = `translate(0px, 0px)`;
    joystickFireAngle = null;
});

// Function to handle movement joystick
function handleMoveJoystick(event) {
    const rect = joystickContainerMove.getBoundingClientRect();
    let offsetX = event.clientX - rect.left - 50; // Centered
    let offsetY = event.clientY - rect.top - 50; // Centered
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    const maxDistance = 50;

    if (distance > maxDistance) {
        const angle = Math.atan2(offsetY, offsetX);
        offsetX = Math.cos(angle) * maxDistance;
        offsetY = Math.sin(angle) * maxDistance;
    }

    joystickKnobMove.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    joystickMoveAngle = Math.atan2(offsetY, offsetX);
}

// Function to handle firing joystick
function handleFireJoystick(event) {
    const rect = joystickContainerFire.getBoundingClientRect();
    let offsetX = event.clientX - rect.left - 25; // Centered
    let offsetY = event.clientY - rect.top - 25; // Centered
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    const maxDistance = 50;

    if (distance > maxDistance) {
        const angle = Math.atan2(offsetY, offsetX);
        offsetX = Math.cos(angle) * maxDistance;
        offsetY = Math.sin(angle) * maxDistance;
    }

    joystickKnobFire.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    joystickFireAngle = Math.atan2(offsetY, offsetX);

    // Start firing continuously
    if (!isFiring) {
        isFiring = true;
        fireContinuously();
    }
}

// Function to determine projectile color based on attached cells
function getProjectileColor(attachedCells) {
    const hasRedCell = attachedCells.some(cell => cell.type === 'red');
    return hasRedCell ? 'red' : 'white'; // Red if a red cell is attached, white otherwise
}

// Function to fire projectiles continuously
function fireContinuously() {
    if (isFiring && joystickFireAngle !== null) {
        const currentTime = Date.now();
        if (currentTime - lastShotTime >= shootingCooldown) {
            lastShotTime = currentTime;
            projectiles.push({
                x: player.x,
                y: player.y,
                size: projectileSize,
                direction: { x: Math.cos(joystickFireAngle), y: Math.sin(joystickFireAngle) },
                distanceTraveled: 0,
                color: getProjectileColor(player.attachedCells)
            });
        }
    }
    setTimeout(fireContinuously, shootingCooldown);
}

// Function for enemy projectile firing
function fireEnemyProjectile() {
    const currentTime = Date.now();
    if (currentTime - enemy.lastShotTime >= enemyShootingCooldown) {
        enemy.lastShotTime = currentTime;
        enemyProjectiles.push({
            x: enemy.x,
            y: enemy.y,
            size: projectileSize,
            direction: { x: player.x - enemy.x, y: player.y - enemy.y },
            distanceTraveled: 0,
            color: getProjectileColor(enemy.attachedCells)
        });
    }
}

// Normalize vector for enemy projectile direction
function normalizeVector(vector) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    return { x: vector.x / length, y: vector.y / length };
}

// Function to update and draw projectiles
function updateProjectiles() {
    projectiles = projectiles.filter(projectile => {
        projectile.x += projectile.direction.x * projectileSpeed;
        projectile.y += projectile.direction.y * projectileSpeed;
        projectile.distanceTraveled += projectileSpeed;

        ctx.save();
        ctx.translate(projectile.x - offsetX, projectile.y - offsetY);
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        return projectile.distanceTraveled < 500;
    });

    enemyProjectiles = enemyProjectiles.filter(projectile => {
        const normalizedDirection = normalizeVector(projectile.direction);
        projectile.x += normalizedDirection.x * projectileSpeed;
        projectile.y += normalizedDirection.y * projectileSpeed;
        projectile.distanceTraveled += projectileSpeed;

        ctx.save();
        ctx.translate(projectile.x - offsetX, projectile.y - offsetY);
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        return projectile.distanceTraveled < 500;
    });
}

// Function to draw the health bar above the player
function drawHealthBar(x, y, health, maxHealth) {
    const barWidth = 30;
    const barHeight = 4;
    const healthRatio = Math.max(0, health / maxHealth);

    ctx.save();
    ctx.translate(x - offsetX - barWidth / 2, y - offsetY - 20);
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, barWidth, barHeight);

    ctx.fillStyle = 'green';
    ctx.fillRect(0, 0, barWidth * healthRatio, barHeight);
    ctx.restore();
}

// Function to draw a cell
function drawCell(cell) {
    if (!cell.attached) {
        ctx.save();
        ctx.translate(cell.x - offsetX, cell.y - offsetY);
        ctx.fillStyle = cell.color;
        ctx.beginPath();
        ctx.arc(0, 0, cell.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Function to draw attached cells within a player
function drawAttachedCells(player, attachedCells) {
    const currentTime = Date.now();
    attachedCells.forEach((cell, index) => {
        const timeLeftRatio = Math.max(0, 1 - (currentTime - cell.attachTime) / cellDuration);
        const adjustedRadius = (player.radius / 2) * timeLeftRatio;

        const angleIncrement = (Math.PI * 2) / attachedCells.length;
        const angle = angleIncrement * index;

        const cellOffsetX = Math.cos(angle) * (player.radius / 2);
        const cellOffsetY = Math.sin(angle) * (player.radius / 2);

        ctx.save();
        ctx.translate(player.x - offsetX + cellOffsetX, player.y - offsetY + cellOffsetY);
        ctx.fillStyle = cell.color;
        ctx.beginPath();
        ctx.arc(0, 0, adjustedRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// Function to move the player based on joystick input
function updatePlayerPosition() {
    if (joystickMoveAngle !== null) {
        const nextX = player.x + Math.cos(joystickMoveAngle) * player.speed;
        const nextY = player.y + Math.sin(joystickMoveAngle) * player.speed;

        player.lastDirection = { x: Math.cos(joystickMoveAngle), y: Math.sin(joystickMoveAngle) };

        player.x = Math.max(player.radius, Math.min(mapWidth - player.radius, nextX));
        player.y = Math.max(player.radius, Math.min(mapHeight - player.radius, nextY));

        if (player.health > 0) {
            player.health -= 0.1;
        }

        cells.forEach(cell => {
            if (!cell.attached && isCollidingWithCell(player.x, player.y, cell)) {
                attachCell(cell, player.attachedCells, player);
            }
        });

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
}

// Function to move the enemy player
function updateEnemyPosition() {
    const distanceToPlayer = Math.sqrt(Math.pow(enemy.x - player.x, 2) + Math.pow(enemy.y - player.y, 2));
    
    if (distanceToPlayer <= chaseDistance) {
        const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        enemy.x += Math.cos(angleToPlayer) * enemy.speed;
        enemy.y += Math.sin(angleToPlayer) * enemy.speed;
        enemy.lastDirection = { x: Math.cos(angleToPlayer), y: Math.sin(angleToPlayer) };

        if (distanceToPlayer <= attackDistance) {
            fireEnemyProjectile();
        }
    } else {
        moveCellRandomly(enemy);
        cells.forEach(cell => {
            if (!cell.attached && isCollidingWithCell(enemy.x, enemy.y, cell)) {
                attachCell(cell, enemy.attachedCells, enemy);
            }
        });
    }

    enemy.x = Math.max(enemy.radius, Math.min(mapWidth - enemy.radius, enemy.x));
    enemy.y = Math.max(enemy.radius, Math.min(mapHeight - enemy.radius, enemy.y));
}

// Function to check collision between a player and a cell
function isCollidingWithCell(nextX, nextY, cell) {
    const distance = Math.sqrt(Math.pow(nextX - cell.x, 2) + Math.pow(nextY - cell.y, 2));
    return distance < player.radius + cell.radius;
}

// Function to check collision between the player and the enemy
function isColliding(player, enemy) {
    const distance = Math.sqrt(Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2));
    return distance < player.radius + enemy.radius;
}

// Function to handle player and enemy collisions by preventing overlap
function preventOverlap() {
    if (isColliding(player, enemy)) {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const overlap = player.radius + enemy.radius - distance;

        const offsetX = (dx / distance) * overlap;
        const offsetY = (dy / distance) * overlap;

        enemy.x += offsetX / 2;
        enemy.y += offsetY / 2;
    }
}

// Function to attach a cell
function attachCell(cell, attachedCells, player) {
    if (!cell.attached) {
        cell.attached = true;
        cell.attachTime = Date.now();
        attachedCells.push(cell);
        console.log(`${cell.type} cell attached to ${player.color === 'blue' ? 'player' : 'enemy'}`);

        if (cell.type === 'orange') {
            player.speed = player.baseSpeed * speedBoostMultiplier;
        }
    }
}

// Function to detach cells after their duration has passed
function detachExpiredCells(attachedCells, player) {
    const currentTime = Date.now();
    let detachedCell = null;

    let remainingAttachedCells = attachedCells.filter(cell => {
        if (currentTime - cell.attachTime >= cellDuration) {
            console.log(`${cell.type} cell detached from ${player.color === 'blue' ? 'player' : 'enemy'}`);
            cell.attached = false;
            detachedCell = cell;
            return false;
        }
        return true;
    });

    player.attachedCells = remainingAttachedCells;

    if (detachedCell) {
        addRandomCell();
    }
}

// Function to respawn a cell at a random location
function respawnCell(cell) {
    cell.x = Math.random() * (mapWidth - 2 * cell.radius) + cell.radius;
    cell.y = Math.random() * (mapHeight - 2 * cell.radius) + cell.radius;
    cell.directionAngle = Math.random() * 2 * Math.PI;
    cell.lastDirectionChangeTime = Date.now();
    console.log(`${cell.type} cell respawned at (${cell.x}, ${cell.y})`);
}

// Function to move cells in a consistent natural direction
function moveCellRandomly(cell) {
    if (!cell.attached) {
        if (Date.now() - cell.lastDirectionChangeTime >= cell.directionChangeInterval) {
            cell.directionAngle = Math.random() * 2 * Math.PI;
            cell.lastDirectionChangeTime = Date.now();
        }

        const speed = 1;
        cell.x += Math.cos(cell.directionAngle) * speed;
        cell.y += Math.sin(cell.directionAngle) * speed;

        cell.x = Math.max(cell.radius, Math.min(mapWidth - cell.radius, cell.x));
        cell.y = Math.max(cell.radius, Math.min(mapHeight - cell.radius, cell.y));
    }
}

// Function to draw the mini-map
function drawMiniMap() {
    miniCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

    miniCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    miniCtx.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

    miniCtx.fillStyle = player.color;
    miniCtx.beginPath();
    miniCtx.arc(
        player.x * miniMapScaleX,
        player.y * miniMapScaleY,
        player.radius * miniMapScaleX,
        0,
        Math.PI * 2
    );
    miniCtx.fill();

    miniCtx.fillStyle = enemy.color;
    miniCtx.beginPath();
    miniCtx.arc(
        enemy.x * miniMapScaleX,
        enemy.y * miniMapScaleY,
        enemy.radius * miniMapScaleX,
        0,
        Math.PI * 2
    );
    miniCtx.fill();

    cells.forEach(cell => {
        if (!cell.attached) {
            miniCtx.fillStyle = cell.color;
            miniCtx.beginPath();
            miniCtx.arc(
                cell.x * miniMapScaleX,
                cell.y * miniMapScaleY,
                cell.radius * miniMapScaleX,
                0,
                Math.PI * 2
            );
            miniCtx.fill();
        }
    });
}

// Function to handle cell interaction
function handleCellInteraction(attachedCells, player) {
    attachedCells.forEach(cell => {
        if (cell.type === 'yellow') {
            player.health = Math.min(player.maxHealth, player.health + 0.2);
        }
    });
}

function addRandomCell() {
    if (cells.length >= maxCells) {
        return;
    }

    const type = Math.random() < 0.5 ? 'yellow' : Math.random() < 0.75 ? 'orange' : 'red';
    const color = type === 'yellow' ? 'yellow' : type === 'orange' ? 'orange' : 'red';
    let newCell;

    do {
        const x = Math.random() * (mapWidth - 2 * player.radius) + player.radius;
        const y = Math.random() * (mapHeight - 2 * player.radius) + player.radius;
        newCell = createCell(x, y, color, type);
    } while (isOverlappingWithExistingCells(newCell));

    cells.push(newCell);
}

function isOverlappingWithExistingCells(newCell) {
    if (isCollidingWithCell(player.x, player.y, newCell)) {
        return true;
    }
    return cells.some(cell => {
        const distance = Math.sqrt(Math.pow(newCell.x - cell.x, 2) + Math.pow(newCell.y - cell.y, 2));
        return distance < newCell.radius + cell.radius;
    });
}

// Event listener for the B button to add new cells
bButton.addEventListener('pointerdown', () => {
    if (cells.length < maxCells) {
        addRandomCell();
    }
});

// Function to draw the game scene
function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-offsetX, -offsetY);
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, mapWidth, mapHeight);
    ctx.restore();

    ctx.save();
    ctx.translate(player.x - offsetX, player.y - offsetY);
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(enemy.x - offsetX, enemy.y - offsetY);
    ctx.fillStyle = enemy.color;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    cells.forEach(drawCell);
    drawAttachedCells(player, player.attachedCells);
    drawAttachedCells(enemy, enemy.attachedCells);
    updateProjectiles();
    drawHealthBar(player.x, player.y, player.health, player.maxHealth);
    drawHealthBar(enemy.x, enemy.y, enemy.health, enemy.maxHealth);
    drawMiniMap();
}

function gameLoop() {
    updatePlayerPosition();
    updateEnemyPosition();
    preventOverlap();

    detachExpiredCells(player.attachedCells, player);
    detachExpiredCells(enemy.attachedCells, enemy);

    cells.forEach(moveCellRandomly);
    drawScene();
    requestAnimationFrame(gameLoop);
}

// Function to move cells in a random direction for a set amount of time
function moveCellRandomly(cell) {
    if (!cell.attached) {
        if (cell.lastDirectionChangeTime == null || Date.now() - cell.lastDirectionChangeTime >= cell.directionChangeInterval) {
            cell.directionAngle = Math.random() * 2 * Math.PI;
            cell.lastDirectionChangeTime = Date.now();
        }
        cell.x += Math.cos(cell.directionAngle) * 1;
        cell.y += Math.sin(cell.directionAngle) * 1;

        cell.x = Math.max(cell.radius, Math.min(mapWidth - cell.radius, cell.x));
        cell.y = Math.max(cell.radius, Math.min(mapHeight - cell.radius, cell.y));
    }
}

// Start the game loop
gameLoop();
