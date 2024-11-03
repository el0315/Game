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
    //purple
    color: '#9666ba',
    health: 100,
    maxHealth: 100,
    lastDirection: { x: -1, y: 0 },
    attachedCells: [],
    isFiring: false,
    lastShotTime: 0
};

let enemiesKilled = 0; // Initialize the counter for enemies killed


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

const initialCellCount = 10; // Change this value to set the number of initial cells


let cells = [];

for (let i = 0; i < initialCellCount; i++) {
    // Randomly select a cell type and color
    const cellTypes = ['yellow', 'orange', 'red', 'green'];
    const type = cellTypes[Math.floor(Math.random() * cellTypes.length)];
    let color;

    // Assign the color based on the type
    if (type === 'yellow') {
        color = 'yellow';
    } else if (type === 'orange') {
        color = 'orange';
    } else if (type === 'red') {
        color = 'red';
    } else if (type === 'green') {
        color = 'green'; // Green color for the homing missile cell
    }

    // Generate a random position within the map boundaries
    const x = Math.random() * (mapWidth - 2 * player.radius) + player.radius;
    const y = Math.random() * (mapHeight - 2 * player.radius) + player.radius;

    // Create the cell and add it to the array
    cells.push(createCell(x, y, color, type));
}



// Cell detachment timing and attributes
const cellDuration = 10000;
const maxCells = 30;

// Speed boost multiplier
const speedBoostMultiplier = 2;

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
    return 'white'; // All projectiles are now white
}

function fireContinuously() {
    if (isFiring && joystickFireAngle !== null) {
        const currentTime = Date.now();

        // Check if the player has both a red cell (to fire) and a green cell (for homing)
        const hasRedCell = player.attachedCells.some(cell => cell.type === 'red');
        const hasGreenCell = player.attachedCells.some(cell => cell.type === 'green');

        if (hasRedCell && currentTime - lastShotTime >= shootingCooldown) {
            lastShotTime = currentTime;
            projectiles.push({
                x: player.x,
                y: player.y,
                size: projectileSize,
                direction: { x: Math.cos(joystickFireAngle), y: Math.sin(joystickFireAngle) },
                distanceTraveled: 0,
                color: 'white',
                isHoming: hasGreenCell // Track if the projectile is homing
            });
        }
    }
    setTimeout(fireContinuously, shootingCooldown);
}



function fireEnemyProjectile() {
    const currentTime = Date.now();

    // Check if the enemy has a red cell attached before shooting
    const hasRedCell = enemy.attachedCells.some(cell => cell.type === 'red');
    if (hasRedCell && currentTime - enemy.lastShotTime >= enemyShootingCooldown) {
        enemy.lastShotTime = currentTime;
        enemyProjectiles.push({
            x: enemy.x,
            y: enemy.y,
            size: projectileSize,
            direction: normalizeVector({ x: player.x - enemy.x, y: player.y - enemy.y }),
            distanceTraveled: 0,
            color: 'white'
        });
    }
}


// Normalize vector for enemy projectile direction
function normalizeVector(vector) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    return { x: vector.x / length, y: vector.y / length };
}

function updateProjectiles() {
    projectiles = projectiles.filter(projectile => {
        // Check if the projectile should have homing behavior
        if (projectile.isHoming) {
            // Adjust the direction gradually to home in on the enemy
            const angleToEnemy = Math.atan2(enemy.y - projectile.y, enemy.x - projectile.x);
            const adjustmentFactor = 0.5; // Determines how fast the projectile turns (tweakable)

            // Gradually adjust the direction towards the enemy
            projectile.direction.x += Math.cos(angleToEnemy) * adjustmentFactor;
            projectile.direction.y += Math.sin(angleToEnemy) * adjustmentFactor;

            // Normalize the new direction to keep a consistent speed
            const length = Math.sqrt(projectile.direction.x ** 2 + projectile.direction.y ** 2);
            projectile.direction.x /= length;
            projectile.direction.y /= length;
        }

        // Update the projectile's position
        projectile.x += projectile.direction.x * projectileSpeed;
        projectile.y += projectile.direction.y * projectileSpeed;
        projectile.distanceTraveled += projectileSpeed;

        // Check collision with the enemy
        const distanceToEnemy = Math.sqrt(Math.pow(projectile.x - enemy.x, 2) + Math.pow(projectile.y - enemy.y, 2));
        if (distanceToEnemy < enemy.radius + projectile.size) {
            // Deal damage to the enemy
            enemy.health -= 5;
            console.log('Enemy hit! Health:', enemy.health);
            return false; // Remove the projectile after collision
        }

        // Draw the projectile
        ctx.save();
        ctx.translate(projectile.x - offsetX, projectile.y - offsetY);
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Keep the projectile if it hasn't traveled beyond its range
        return projectile.distanceTraveled < 500;
    });

    // Handle enemy projectiles (no changes needed for homing behavior)
    enemyProjectiles = enemyProjectiles.filter(projectile => {
        // Update projectile position
        const normalizedDirection = normalizeVector(projectile.direction);
        projectile.x += normalizedDirection.x * projectileSpeed;
        projectile.y += normalizedDirection.y * projectileSpeed;
        projectile.distanceTraveled += projectileSpeed;

        // Check collision with the player
        const distanceToPlayer = Math.sqrt(Math.pow(projectile.x - player.x, 2) + Math.pow(projectile.y - player.y, 2));
        if (distanceToPlayer < player.radius + projectile.size) {
            // Deal damage to the player
            player.health -= 5;
            console.log('Player hit! Health:', player.health);
            return false; // Remove the projectile after collision
        }

        // Draw the enemy projectile
        ctx.save();
        ctx.translate(projectile.x - offsetX, projectile.y - offsetY);
        ctx.fillStyle = projectile.color;
        ctx.beginPath();
        ctx.arc(0, 0, projectile.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Keep the enemy projectile if it hasn't traveled beyond its range
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
            player.health -= 0;
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

// Function to determine if the enemy should follow its movement logic based on enemies killed
function shouldFollowLogic(enemiesKilled) {
    // Increase by 5% for each enemy killed, capping at 100%
    const followPercentage = Math.min(enemiesKilled * 10, 100);
    const randomValue = Math.random() * 100; // Generate a random number between 0 and 100

    return randomValue < followPercentage; // Return true if the random value is within the followPercentage
}

// Enemy state extension for behavior commitment
enemy.movementCommitDuration = 0; // Commit to a movement for 2000 milliseconds (adjust as needed)
enemy.lastMovementChangeTime = Date.now(); // Timestamp for last behavior change

// Function to determine if the enemy should continue its current movement
function shouldContinueCurrentBehavior() {
    return (Date.now() - enemy.lastMovementChangeTime) < enemy.movementCommitDuration;
}

// Update the enemy position logic to include commitment to current movement
function updateEnemyPosition() {
    if (shouldContinueCurrentBehavior()) {
        // Continue current behavior until commitment duration ends
        if (enemy.isFollowingPlayer) {
            followPlayerAndShoot();
        } else {
            moveCellRandomly(enemy);
        }
    } else {
        // Decide on new behavior after commitment duration
        if (enemy.attachedCells.length === 0) {
            const nearestCell = findNearestCell();
            if (nearestCell) {
                const angleToCell = Math.atan2(nearestCell.y - enemy.y, nearestCell.x - enemy.x);
                enemy.x += Math.cos(angleToCell) * enemy.speed;
                enemy.y += Math.sin(angleToCell) * enemy.speed;

                // Check if the enemy has reached the cell and attach it if so
                if (isCollidingWithCell(enemy.x, enemy.y, nearestCell)) {
                    attachCell(nearestCell, enemy.attachedCells, enemy);
                }
            } else {
                followPlayerAndShoot();
            }
        } else {
            const hasRedCell = enemy.attachedCells.some(cell => cell.type === 'red');

            if (shouldFollowLogic(enemiesKilled)) {
                if (hasRedCell) {
                    enemy.isFollowingPlayer = true;
                    followPlayerAndShoot();
                } else {
                    const nearestCell = findNearestCell();
                    if (nearestCell) {
                        const angleToCell = Math.atan2(nearestCell.y - enemy.y, nearestCell.x - enemy.x);
                        enemy.x += Math.cos(angleToCell) * enemy.speed;
                        enemy.y += Math.sin(angleToCell) * enemy.speed;

                        if (isCollidingWithCell(enemy.x, enemy.y, nearestCell)) {
                            attachCell(nearestCell, enemy.attachedCells, enemy);
                        }
                    }
                }
            } else {
                enemy.isFollowingPlayer = false;
                moveCellRandomly(enemy);
            }
        }

        // Reset the movement commitment timestamp
        enemy.lastMovementChangeTime = Date.now();
    }

    // Ensure enemy stays within map bounds
    enemy.x = Math.max(enemy.radius, Math.min(mapWidth - enemy.radius, enemy.x));
    enemy.y = Math.max(enemy.radius, Math.min(mapHeight - enemy.radius, enemy.y));
}


// Function for the enemy to follow the player and shoot if a red cell is attached
function followPlayerAndShoot() {
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.x += Math.cos(angleToPlayer) * enemy.speed;
    enemy.y += Math.sin(angleToPlayer) * enemy.speed;

    // Check if the enemy is within the attack range and shoot if it has a red cell
    const distanceToPlayer = Math.sqrt(Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2));
    if (distanceToPlayer <= attackDistance && enemy.attachedCells.some(cell => cell.type === 'red')) {
        fireEnemyProjectile();
    }
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

function attachCell(cell, attachedCells, character) {
    if (!cell.attached) {
        cell.attached = true;
        cell.attachTime = Date.now();
        attachedCells.push(cell);
        console.log(`${cell.type} cell attached to ${character.color === 'blue' ? 'player' : 'enemy'}`);

        // Apply special effects for different cell types
        if (cell.type === 'orange') {
            character.speed = character.baseSpeed * speedBoostMultiplier;
        }
    }
}

// Helper function to find the nearest cell
function findNearestCell() {
    let nearestCell = null;
    let minDistance = Infinity;

    for (const cell of cells) {
        if (!cell.attached) {
            const distance = Math.sqrt(Math.pow(cell.x - enemy.x, 2) + Math.pow(cell.y - enemy.y, 2));
            if (distance < minDistance) {
                minDistance = distance;
                nearestCell = cell;
            }
        }
    }

    return nearestCell;
}

// Function for the enemy to follow the player
function followPlayer() {
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.x += Math.cos(angleToPlayer) * enemy.speed;
    enemy.y += Math.sin(angleToPlayer) * enemy.speed;
}


function detachExpiredCells(attachedCells, character) {
    const currentTime = Date.now();
    let detachedCell = null;

    let remainingAttachedCells = attachedCells.filter(cell => {
        if (currentTime - cell.attachTime >= cellDuration) {
            console.log(`${cell.type} cell detached from ${character.color === 'blue' ? 'player' : 'enemy'}`);
            cell.attached = false;
            detachedCell = cell;
            return false;
        }
        return true;
    });

    character.attachedCells = remainingAttachedCells;

    // Reset speed if an orange cell was detached and no other orange cells remain attached
    if (detachedCell && detachedCell.type === 'orange' && !remainingAttachedCells.some(cell => cell.type === 'orange')) {
        character.speed = character.baseSpeed;
    }

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

function handleCellInteraction(attachedCells, character) {
    attachedCells.forEach(cell => {
        if (cell.type === 'yellow') {
            character.health = Math.min(character.maxHealth, character.health + 0.2); // Adjust the healing rate as needed
        }
    });
}


function addRandomCell() {
    if (cells.length >= maxCells) {
        return;
    }

    // Ensure equal probability by using an array of types and picking one at random
    const cellTypes = ['yellow', 'orange', 'red', 'green'];
    const type = cellTypes[Math.floor(Math.random() * cellTypes.length)];
    
    // Assign the color based on the type
    let color;
    if (type === 'yellow') {
        color = 'yellow';
    } else if (type === 'orange') {
        color = 'orange';
    } else if (type === 'red') {
        color = 'red';
    } else if (type === 'green') {
        color = 'green'; // Ensure green cells get the correct color
    }

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

    if (enemy) { // Ensure enemy is not null before drawing
        ctx.save();
        ctx.translate(enemy.x - offsetX, enemy.y - offsetY);
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    cells.forEach(drawCell);
    drawAttachedCells(player, player.attachedCells);
    if (enemy) drawAttachedCells(enemy, enemy.attachedCells);
    updateProjectiles();
    drawHealthBar(player.x, player.y, player.health, player.maxHealth);
    if (enemy) drawHealthBar(enemy.x, enemy.y, enemy.health, enemy.maxHealth);
    drawMiniMap();

    // Draw the "Enemies Killed" display
    drawEnemiesKilled();
}


// Get the restart button element
const restartButton = document.getElementById('restartButton');

// Function to show the game over screen and restart button
function showGameOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Semi-transparent background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
    ctx.restore();

    // Show the restart button
    restartButton.style.display = 'block';
}

// Function to restart the game
restartButton.addEventListener('click', () => {
    // Reset player state
    player.x = 100;
    player.y = 100;
    player.health = player.maxHealth;
    player.attachedCells = [];
    player.speed = player.baseSpeed; // Reset speed
    offsetX = 0;
    offsetY = 0;
    projectiles = [];

    // Reset enemy state
    enemy.x = 800;
    enemy.y = 800;
    enemy.health = enemy.maxHealth;
    enemy.attachedCells = [];
    enemy.speed = enemy.baseSpeed; // Reset speed
    enemy.isFiring = false;
    enemy.lastShotTime = 0;
    enemyProjectiles = [];

    // Reset enemies killed counter
    enemiesKilled = 0;

    // Clear and respawn cells with equivalent probability for all types
    cells = [];
    for (let i = 0; i < initialCellCount; i++) {
        // Randomly select a cell type and color
        const cellTypes = ['yellow', 'orange', 'red', 'green'];
        const type = cellTypes[Math.floor(Math.random() * cellTypes.length)];
        let color;

        // Assign the color based on the type
        if (type === 'yellow') {
            color = 'yellow';
        } else if (type === 'orange') {
            color = 'orange';
        } else if (type === 'red') {
            color = 'red';
        } else if (type === 'green') {
            color = 'green'; // Green color for the homing missile cell
        }

        // Generate a random position within the map boundaries
        const x = Math.random() * (mapWidth - 2 * player.radius) + player.radius;
        const y = Math.random() * (mapHeight - 2 * player.radius) + player.radius;

        // Create the cell and add it to the array
        cells.push(createCell(x, y, color, type));
    }

    // Hide the restart button
    restartButton.style.display = 'none';

    // Resume the game loop
    requestAnimationFrame(gameLoop);
});



function resetEnemy() {
    console.log('Enemy defeated! Resetting enemy...');
    enemiesKilled++; // Increment the counter when an enemy is reset

    // Reset enemy's properties
    enemy.health = enemy.maxHealth;
    enemy.speed = enemy.baseSpeed;
    enemy.attachedCells = [];
    enemy.isFiring = false; // Ensure the enemy cannot shoot until it collects a red cell

    // Find a valid new position within the map boundaries
    let isOverlapping;
    let attempts = 0;
    const maxAttempts = 100;

    do {
        // Generate a random position within map boundaries
        enemy.x = Math.random() * (mapWidth - 2 * enemy.radius) + enemy.radius;
        enemy.y = Math.random() * (mapHeight - 2 * enemy.radius) + enemy.radius;

        // Check for overlap with the player and cells
        isOverlapping = isCollidingWithPlayerOrCells(enemy);
        attempts++;

        if (attempts >= maxAttempts) {
            console.error('Could not find a valid position for the enemy after maximum attempts');
            isOverlapping = false; // Exit loop after max attempts
        }
    } while (isOverlapping);

    console.log('Enemy reset at:', enemy.x, enemy.y);
}


function drawEnemiesKilled() {
    ctx.save();
    ctx.fillStyle = 'white';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Enemies Killed: ${enemiesKilled}`, 10, 20); // Position at the top left
    ctx.restore();
}


function gameLoop() {
    // Check if the player's health reaches 0
    if (player.health <= 0) {
        showGameOver();
        return; // Stop the game loop when the player is dead
    }

    // Update player position based on input
    updatePlayerPosition();

    // Check if the enemy's health reaches 0 and reset it if necessary
    if (enemy && enemy.health <= 0) {
        resetEnemy();
    }

    // Update enemy behavior and position
    if (enemy) {
        updateEnemyPosition();
    }

    // Prevent overlapping between player and enemy
    preventOverlap();

    // Detach expired cells for both the player and enemy
    detachExpiredCells(player.attachedCells, player);
    if (enemy) detachExpiredCells(enemy.attachedCells, enemy);

    // Handle health increases from yellow cells for both player and enemy
    handleCellInteraction(player.attachedCells, player);
    if (enemy) handleCellInteraction(enemy.attachedCells, enemy);

    // Move cells in their natural random directions
    cells.forEach(moveCellRandomly);

    // Draw the updated scene
    drawScene();

    // Schedule the next frame
    requestAnimationFrame(gameLoop);
}


// Function to check if the enemy overlaps with the player or cells
function isCollidingWithPlayerOrCells(character) {
    // Check overlap with the player
    const distanceToPlayer = Math.sqrt(Math.pow(character.x - player.x, 2) + Math.pow(character.y - player.y, 2));
    if (distanceToPlayer < character.radius + player.radius) {
        return true; // Overlaps with player
    }

    // Check overlap with each cell
    for (const cell of cells) {
        const distanceToCell = Math.sqrt(Math.pow(character.x - cell.x, 2) + Math.pow(character.y - cell.y, 2));
        if (distanceToCell < character.radius + cell.radius) {
            return true; // Overlaps with a cell
        }
    }

    return false; // No overlap found
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

