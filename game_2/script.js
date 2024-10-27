// Set up the canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');


// Disable context menu on long touch
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
}, false);

// Prevent pinch zoom by disabling touchmove events with more than one finger
window.addEventListener('touchmove', function(event) {
    if (event.scale !== 1) {  // Prevent pinch-zoom gestures
        event.preventDefault();
    }
}, { passive: false });  // 'passive: false' is important to be able to call preventDefault()


// Camera settings
let cameraOffsetX = 0;
let cameraOffsetY = 0;

// Game state variables
let isRight = false;
let isLeft = false;
let jumpRequested = false;
let gameOver = false; // Track game over state

// Constants
const gravity = 0.5;
const jumpStrength = -15;
let groundLevel = 550;  // Fixed ground level
const maxFallSpeed = 12;
const platformMinY = 200;
const platformMaxY = 450;
const platformSpacing = 350;
const platformWidthRange = [120, 200];
let worldLength = 5000;  // Set initial world length
const flowerHealthGain = 20;
const maxHealth = 100;
const enemyDamage = 0.1;
const enemySpawnLimit = 3;
const npcFollowDistance = 300;
const enemyChaseDistance = 400;
const platformMoveRange = 100;
const platformMoveSpeed = 1;
const projectileDamage = 5; // Set fixed projectile damage

// Define the target aspect ratio (16:9)
const aspectRatio = 16 / 9;

// Load the background music
const backgroundMusic = new Audio('assets/music.wav');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.5; // Adjust the volume as needed
backgroundMusic.playing = false;  // Custom flag to check if music has already started

// Function to start the music on the first player interaction
function startGameMusic() {
    if (!backgroundMusic.playing) {
        backgroundMusic.play();
        backgroundMusic.playing = true; // Ensure the music only starts once
    }
}

// Add event listeners to detect the first user input (key press or touch)
document.addEventListener('keydown', startGameMusic);
document.addEventListener('touchstart', startGameMusic);

// Load the game over sound effect (laugh)
const gameOverSound = new Audio('assets/laugh.wav');
gameOverSound.volume = 0.8; // Adjust volume for the laugh sound

// Function to resize the canvas while maintaining the aspect ratio
let resizeTimeout;
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

    console.log(`Canvas resized: width=${newWidth}, height=${newHeight}`);
}

// Throttle the resize event to prevent continuous recalculations
function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvas, 250); // Add a small delay to wait for the viewport to settle
}

// Initial call to resize the canvas
resizeCanvas();
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

// Image loading function
function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
}

// Images for player, NPC, and enemies
const turtleWalkRight = [loadImage('assets/turtle_walk_1.png'), loadImage('assets/turtle_walk_2.png')];
const turtleWalkLeft = [loadImage('assets/turtle_walk_left_1.png'), loadImage('assets/turtle_walk_left_2.png')];
const npcWalkRight = [loadImage('assets/npc_walk_1.png'), loadImage('assets/npc_walk_2.png')];
const npcWalkLeft = [loadImage('assets/npc_walk_left_1.png'), loadImage('assets/npc_walk_left_2.png')];
const turtleJumpImage = loadImage('assets/turtle_jump.png');
const npcJumpImage = loadImage('assets/npc_jump.png');
const enemyImage = loadImage('assets/enemy.png');
const flowerImage = loadImage('assets/flower.png');

// Sound loading
const hitSound = new Audio('assets/hit.wav');
const collectSound = new Audio('assets/collect.wav');

// Platform class with vertical movement
class Platform {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.originalY = y; // Store the original y position
        this.direction = 1; // 1 for moving up, -1 for moving down
    }

    update() {
        // Move the platform within the specified range
        this.y += this.direction * platformMoveSpeed;
        if (this.y > this.originalY + platformMoveRange || this.y < this.originalY - platformMoveRange) {
            this.direction *= -1; // Reverse direction at the limits
        }
    }

    draw(ctx) {
        ctx.fillStyle = 'brown';  // Make platforms visible with brown color
        ctx.fillRect(this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
    }
}

// Function to generate platforms throughout the world
function generatePlatforms() {
    const platforms = [];
    for (let i = 0; i < worldLength; i += platformSpacing) {
        const platformY = Math.random() * (platformMaxY - platformMinY) + platformMinY;
        const platformWidth = Math.random() * (platformWidthRange[1] - platformWidthRange[0]) + platformWidthRange[0];
        platforms.push(new Platform(i, platformY, platformWidth, 20));
    }
    return platforms;
}

// Projectile class
class Projectile {
    constructor(x, y, speed, direction) {
        this.x = x;
        this.y = y;
        this.width = 10;
        this.height = 10;
        this.speed = speed;
        this.direction = direction;
    }

    update() {
        this.x += this.speed * (this.direction === 'right' ? 1 : -1);
    }

    draw(ctx) {
        ctx.fillStyle = 'blue';
        ctx.fillRect(this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
    }

    isOffScreen() {
        return this.x < 0 || this.x > worldLength;
    }
}

// Character class for shared behavior between player and NPC
class Character {
    constructor(imagesRight, imagesLeft, jumpImage, speed, maxHealth) {
        this.imagesRight = imagesRight;
        this.imagesLeft = imagesLeft;
        this.jumpImage = jumpImage;
        this.currentFrame = 0;
        this.frameCounter = 0;
        this.image = this.imagesRight[this.currentFrame];
        this.x = 100;
        this.y = groundLevel - 50;
        this.width = 50;
        this.height = 50;
        this.speed = speed;
        this.velocityY = 0;
        this.health = maxHealth;
        this.maxHealth = maxHealth;
        this.onGround = true;
        this.onPlatform = false;
        this.facingDirection = 'right';
        this.moving = false;
        this.jumping = false;
        this.projectiles = [];
        this.platform = null;
        this.score = 0; // Track the score (flowers collected)
    }

    applyGravity(platforms) {
        if (!this.onGround && !this.onPlatform) {
            this.velocityY += gravity;
            if (this.velocityY > maxFallSpeed) this.velocityY = maxFallSpeed;
        }

        this.y += this.velocityY;
        this.onPlatform = false;

        for (const platform of platforms) {
            if (this.isLandingOnPlatform(platform)) {
                this.y = platform.y - this.height;
                this.velocityY = 0;
                this.onPlatform = true;
                this.jumping = false;
                this.platform = platform;
                break;
            }
        }

        if (this.y + this.height >= groundLevel) {
            this.y = groundLevel - this.height;
            this.velocityY = 0;
            this.onGround = true;
            this.jumping = false;
        } else {
            this.onGround = false;
        }

        if (this.onPlatform && this.platform) {
            this.y += this.platform.direction * platformMoveSpeed;
        }
    }

    isLandingOnPlatform(platform) {
        const playerBottom = this.y + this.height;
        const platformTop = platform.y;
        const playerRight = this.x + this.width;
        const platformRight = platform.x + platform.width;

        const isFalling = this.velocityY > 0;
        const isCloseEnoughVertically = playerBottom + this.velocityY >= platformTop && Math.abs(playerBottom - platformTop) <= 5;
        const isWithinPlatformWidth = this.x < platformRight && playerRight > platform.x;

        return isFalling && isCloseEnoughVertically && isWithinPlatformWidth;
    }

    move() {
        this.moving = false;

        if (isRight) {
            this.x += this.speed;
            this.facingDirection = 'right';
            this.moving = true;
        }
        if (isLeft) {
            this.x -= this.speed;
            this.facingDirection = 'left';
            this.moving = true;
        }

        if (this.x < 0) this.x = 0;
    }

    jump() {
        if ((this.onGround || this.onPlatform) && jumpRequested) {
            this.velocityY = jumpStrength;
            this.jumping = true;
            this.onGround = false;
            this.onPlatform = false;
            this.platform = null;
            jumpRequested = false;
        }
    }

    updateFrame() {
        if (this.moving) {
            this.frameCounter++;
            if (this.frameCounter > 10) {
                this.currentFrame = (this.currentFrame + 1) % this.imagesRight.length;
                this.frameCounter = 0;
            }
        } else {
            this.currentFrame = 0;  // Use idle frame
        }
    }

    draw(ctx) {
        ctx.save();
        let img;

        if (this.jumping) {
            img = this.jumpImage;
        } else if (this.moving) {
            img = this.facingDirection === 'right' ? this.imagesRight[this.currentFrame] : this.imagesLeft[this.currentFrame];
        } else {
            img = this.facingDirection === 'right' ? this.imagesRight[0] : this.imagesLeft[0];
        }

        if (this.facingDirection === 'left' && this.jumping) {
            ctx.translate(this.x + this.width - cameraOffsetX, this.y - cameraOffsetY);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, this.width, this.height);
        } else {
            ctx.drawImage(img, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
        }

        ctx.restore();
    }

    shoot() {
        const projectileX = this.facingDirection === 'right' ? this.x + this.width : this.x;
        const projectile = new Projectile(projectileX, this.y + this.height / 2, 10, this.facingDirection);
        this.projectiles.push(projectile);
    }

    updateProjectiles(ctx, enemies) {
        this.projectiles = this.projectiles.filter((proj) => {
            proj.update();
            proj.draw(ctx);
            return !proj.isOffScreen() && !this.checkProjectileCollision(proj, enemies);
        });
    }

    checkProjectileCollision(proj, enemies) {
        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];
            if (
                proj.x < enemy.x + enemy.width &&
                proj.x + proj.width > enemy.x &&
                proj.y < enemy.y + enemy.height &&
                proj.y + proj.height > enemy.y
            ) {
                enemy.health -= projectileDamage;

                if (enemy.health <= 0) {
                    hitSound.play();
                    flowers.push(new Flower(enemy.x, enemy.y));
                    enemies.splice(i, 1);
                }

                return true;
            }
        }
        return false;
    }

    drawHealthBar(ctx) {
        const barWidth = 50;
        const barHeight = 5;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraOffsetX, this.y - 10 - cameraOffsetY, barWidth, barHeight);
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x - cameraOffsetX, this.y - 10 - cameraOffsetY, barWidth * (this.health / this.maxHealth), barHeight);
    }

    increaseHealth() {
        this.health = Math.min(this.maxHealth, this.health + flowerHealthGain);
    }

    decreaseHealth(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
    }
}

// NPC class extending from Character with follow player and walk toward flowers
class NPC extends Character {
    constructor(imagesRight, imagesLeft, jumpImage, speed, maxHealth) {
        super(imagesRight, imagesLeft, jumpImage, speed, maxHealth);
    }

    followPlayer(player) {
        const distance = Math.abs(this.x - player.x);

        // If NPC is too far from the player, move toward the player
        if (distance > npcFollowDistance) {
            if (this.x < player.x) {
                this.x += this.speed;
                this.facingDirection = 'right';
                this.moving = true;
            } else {
                this.x -= this.speed;
                this.facingDirection = 'left';
                this.moving = true;
            }
        } else {
            this.moving = false; // Stop moving when close enough
        }
    }

    walkTowardsNearestFlower(flowers) {
        if (flowers.length === 0) return;

        // Find the closest flower to the NPC
        let closestFlower = null;
        let closestDistance = Infinity;

        flowers.forEach(flower => {
            const distance = Math.hypot(flower.x - this.x, flower.y - this.y); // Calculate the Euclidean distance
            if (distance < closestDistance) {
                closestDistance = distance;
                closestFlower = flower;
            }
        });

        // Move towards the closest flower
        if (closestFlower) {
            if (this.x < closestFlower.x) {
                this.x += this.speed;
                this.facingDirection = 'right';
                this.moving = true;
            } else if (this.x > closestFlower.x) {
                this.x -= this.speed;
                this.facingDirection = 'left';
                this.moving = true;
            }

            // Move vertically towards the flower if needed
            if (this.y < closestFlower.y) {
                this.y += this.speed;
            } else if (this.y > closestFlower.y) {
                this.y -= this.speed;
            }
        }
    }

    randomActions() {
        if (Math.random() < 0.60) this.jump(); // Random jump
        if (Math.random() < 0.15) this.shoot(); // Random shoot
    }
}


// Enemy class
// Enhanced Enemy class
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 50;
        this.health = 50;
        this.speed = 2;
        this.verticalSpeed = 1.5;  // Add vertical speed for climbing platforms
        this.facingDirection = 'left';  // Track which direction the enemy is facing
    }

    moveTowardTarget(target, platforms) {
        const distanceX = target.x - this.x;
        const distanceY = target.y - this.y;

        // Move horizontally toward target
        if (Math.abs(distanceX) > 5) {
            if (distanceX > 0) {
                this.x += this.speed;
                this.facingDirection = 'right';
            } else {
                this.x -= this.speed;
                this.facingDirection = 'left';
            }
        }

        // Move vertically toward target if on a different vertical level
        if (Math.abs(distanceY) > 10) {
            if (distanceY > 0) {
                this.y += this.verticalSpeed;  // Move down toward the target
            } else {
                this.y -= this.verticalSpeed;  // Move up toward the target
            }
        }

        // Check for platform collision and attempt to follow the player onto platforms
        for (const platform of platforms) {
            if (this.isLandingOnPlatform(platform)) {
                this.y = platform.y - this.height;  // Align enemy on the platform
            }
        }
    }

    isLandingOnPlatform(platform) {
        const enemyBottom = this.y + this.height;
        const platformTop = platform.y;
        const enemyRight = this.x + this.width;
        const platformRight = platform.x + platform.width;

        const isFalling = true;  // Enemies should always check for landing on platforms
        const isCloseEnoughVertically = enemyBottom >= platformTop && Math.abs(enemyBottom - platformTop) <= 5;
        const isWithinPlatformWidth = this.x < platformRight && enemyRight > platform.x;

        return isFalling && isCloseEnoughVertically && isWithinPlatformWidth;
    }

    draw(ctx) {
        ctx.save();

        if (this.facingDirection === 'right') {
            ctx.translate(this.x + this.width - cameraOffsetX, this.y - cameraOffsetY);
            ctx.scale(-1, 1);
            ctx.drawImage(enemyImage, 0, 0, this.width, this.height);
        } else {
            ctx.drawImage(enemyImage, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
        }

        ctx.restore();
        this.drawHealthBar(ctx);
    }

    drawHealthBar(ctx) {
        const barWidth = 50;
        const barHeight = 5;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraOffsetX, this.y - 10 - cameraOffsetY, barWidth, barHeight);
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x - cameraOffsetX, this.y - 10 - cameraOffsetY, barWidth * (this.health / 50), barHeight);
    }

    decreaseHealth(amount) {
        this.health -= amount;
    }
}


// Flower class for health pickups
class Flower {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
    }

    draw(ctx) {
        ctx.drawImage(flowerImage, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
    }

    checkCollision(character) {
        return this.x < character.x + character.width &&
               this.x + this.width > character.x &&
               this.y < character.y + character.height &&
               this.y + this.height > character.y;
    }
}

// Function to handle enemy contact damage
function checkEnemyCollisions(character, enemies) {
    for (const enemy of enemies) {
        const isColliding = (
            character.x < enemy.x + enemy.width &&
            character.x + character.width > enemy.x &&
            character.y < enemy.y + enemy.height &&
            character.y + character.height > enemy.y
        );

        if (isColliding) {
            character.decreaseHealth(enemyDamage);  // Decrease health on collision
            if (character.health <= 0) {
                triggerGameOver();  // Trigger game over if health is zero
            }
        }
    }
}

// Main game objects
const player = new Character(turtleWalkRight, turtleWalkLeft, turtleJumpImage, 5, maxHealth);
const npc = new NPC(npcWalkRight, npcWalkLeft, npcJumpImage, 3, maxHealth);
let enemies = [new Enemy(500, groundLevel - 50), new Enemy(700, groundLevel - 50), new Enemy(900, groundLevel - 50)];
let platforms = generatePlatforms();
let flowers = [];

// Game Over screen elements
const gameOverScreen = document.getElementById('gameOverScreen');
const restartButton = document.getElementById('restartButton');

// Ensure the Game Over screen is hidden initially
gameOverScreen.style.display = 'none';


// Player control event listeners for keyboard
document.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowRight') isRight = true;
    if (e.code === 'ArrowLeft') isLeft = true;
    if (e.code === 'Space') jumpRequested = true;
    if (e.code === 'KeyS') player.shoot();
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight') isRight = false;
    if (e.code === 'ArrowLeft') isLeft = false;
});

// Mobile control buttons (touch)
document.getElementById('leftButton').addEventListener('touchstart', () => {
    isLeft = true;
});
document.getElementById('leftButton').addEventListener('touchend', () => {
    isLeft = false;
});

document.getElementById('rightButton').addEventListener('touchstart', () => {
    isRight = true;
});
document.getElementById('rightButton').addEventListener('touchend', () => {
    isRight = false;
});

document.getElementById('jumpButton').addEventListener('touchstart', () => {
    jumpRequested = true;
});
document.getElementById('jumpButton').addEventListener('touchend', () => {
    jumpRequested = false;
});

document.getElementById('shootButton').addEventListener('touchstart', () => {
    player.shoot();
});


// Camera movement function
function handleCameraScrolling() {
    const bufferLeft = 200;
    const bufferRight = canvas.width - 200;
    const bufferTop = 150;
    const bufferBottom = canvas.height - 150;

    // Horizontal scrolling
    if (player.x - cameraOffsetX < bufferLeft) {
        cameraOffsetX = player.x - bufferLeft;
    } else if (player.x - cameraOffsetX > bufferRight) {
        cameraOffsetX = player.x - bufferRight;
    }

    // Vertical scrolling
    if (player.y - cameraOffsetY < bufferTop) {
        cameraOffsetY = player.y - bufferTop;
    } else if (player.y - cameraOffsetY > bufferBottom) {
        cameraOffsetY = player.y - bufferBottom;

        // Ensure the camera doesn't move the ground offscreen
        if (cameraOffsetY > groundLevel - canvas.height + player.height) {
            cameraOffsetY = groundLevel - canvas.height + player.height;
        }
    }
}

// Draw the green ground (main platform)
function drawGround() {
    ctx.fillStyle = 'green';
    ctx.fillRect(0 - cameraOffsetX, groundLevel - cameraOffsetY, worldLength, canvas.height - (groundLevel - cameraOffsetY));
}

// Spawn new enemies if needed
function spawnNewEnemies() {
    if (enemies.length < enemySpawnLimit) {
        const newEnemyX = player.x + (Math.random() > 0.5 ? 200 : -200);
        enemies.push(new Enemy(newEnemyX, groundLevel - 50));
    }
}

// Trigger Game Over
function triggerGameOver() {
    gameOver = true;
    gameOverScreen.style.display = 'flex';

    backgroundMusic.pause();

    gameOverSound.play();
}

// Check if player or NPC falls off the platform
function checkFallOff() {
    const fallOffThreshold = worldLength; // The finite ground edge

    if (player.x < 0 || player.x > fallOffThreshold || npc.x < 0 || npc.x > fallOffThreshold) {
        triggerGameOver();
    }
}

// Function to display the scores in the top left of the screen
function displayScores(ctx) {
    ctx.fillStyle = 'black';  // Set score color to black
    ctx.font = '20px Arial';
    ctx.fillText(`Player Score: ${player.score}`, 10, 30);
    ctx.fillText(`NPC Score: ${npc.score}`, 10, 60);
}


// Game loop function where NPC movement and enemy collisions are handled
function gameLoop() {
    if (gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGround();  // Ensure ground is drawn in the correct position
    handleCameraScrolling();  // Update camera based on player movement

    // Apply gravity and movement logic
    player.applyGravity(platforms);
    player.move();
    player.jump();
    player.updateFrame();
    player.draw(ctx);
    player.drawHealthBar(ctx);

    // Update and draw the NPC
    npc.applyGravity(platforms);
    if (flowers.length > 0) {
        npc.walkTowardsNearestFlower(flowers); // NPC prioritizes moving towards flowers
    } else {
        npc.followPlayer(player);  // NPC follows player if no flowers are around
    }

    npc.randomActions();      // NPC performs random actions
    npc.updateFrame();
    npc.draw(ctx);
    npc.drawHealthBar(ctx);

    // Enforce that at least one enemy is always attacking the player (turtle)
    enemies.forEach((enemy, index) => {
        if (index === 0) {
            // First enemy always targets the player (turtle)
            enemy.moveTowardTarget(player, platforms); 
        } else {
            // Remaining enemies target either the player or NPC randomly
            const target = Math.random() < 0.5 ? player : npc;
            enemy.moveTowardTarget(target, platforms);
        }
        enemy.draw(ctx);
    });

    // Draw and update platforms
    platforms.forEach(platform => {
        platform.update();  // Move platforms
        platform.draw(ctx);
    });

    // Check for enemy collisions with player and NPC
    checkEnemyCollisions(player, enemies);
    checkEnemyCollisions(npc, enemies);

    // Update projectiles
    player.updateProjectiles(ctx, enemies);
    npc.updateProjectiles(ctx, enemies);

    // Check for flower collection
    flowers = flowers.filter((flower, index) => {
        flower.draw(ctx);
        if (flower.checkCollision(player)) {
            player.increaseHealth();
            player.score++;  // Increase player's score
            collectSound.play();
            return false;  // Remove the flower from the list after it's collected
        } else if (flower.checkCollision(npc)) {
            npc.increaseHealth();
            npc.score++;  // Increase NPC's score
            collectSound.play();
            return false;  // Remove the flower from the list after it's collected
        }
        return true;
    });

    // Check if player or NPC falls off
    checkFallOff();

    // Spawn new enemies if necessary
    spawnNewEnemies();

    // Display scores
    displayScores(ctx);

    // Request the next frame for the game loop
    requestAnimationFrame(gameLoop);
}

restartButton.addEventListener('click', () => {
    player.x = 100;
    player.y = groundLevel - 50;
    npc.x = 150;
    npc.y = groundLevel - 50;

    player.health = maxHealth;
    npc.health = maxHealth;

    player.score = 0; // Reset player score to 0
    npc.score = 0;    // Reset NPC score to 0

    gameOver = false; // Reset game over state
    gameOverScreen.style.display = 'none'; // Hide Game Over screen

    // Reset music playing flag to allow music to start again
    backgroundMusic.playing = false; 

    // Optionally: You can start the music immediately after the restart, or wait for user input
    // Uncomment the following line if you want music to play immediately on restart:
    backgroundMusic.play();

    requestAnimationFrame(gameLoop); // Restart the game loop
});
// Start the game loop initially to ensure objects are drawn
requestAnimationFrame(gameLoop);
