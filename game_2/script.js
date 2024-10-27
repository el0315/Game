// Set up canvas and game world
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

// Constants
const gravity = 0.5;
const jumpStrength = -12;
const groundLevel = 550;
const maxFallSpeed = 12;
const platformMinY = 200;
const platformMaxY = 450;
const platformSpacing = 350;
const platformWidthRange = [120, 200];
const worldLength = canvas.width * 100;
const flowerHealthGain = 20;
const maxHealth = 100;
const enemyDamage = 0.1;
const enemySpawnLimit = 3;
const npcFollowDistance = canvas.width / 2;
const enemyChaseDistance = canvas.width;
const platformMoveRange = 100;
const platformMoveSpeed = 1;

// Camera settings
let cameraOffsetX = 0;
let cameraOffsetY = 0;

// Game state variables
let isRight = false;
let isLeft = false;
let jumpRequested = false;

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
        ctx.fillStyle = 'brown';
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
        this.jumpImage = jumpImage; // Only the right-facing jump image
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
        this.facingDirection = 'right'; // Track last direction the character was facing
        this.moving = false;
        this.jumping = false;
        this.projectiles = [];
        this.platform = null;
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
                this.platform = platform; // Save platform reference
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
            this.facingDirection = 'right';  // Set last direction to 'right'
            this.moving = true;
        }
        if (isLeft) {
            this.x -= this.speed;
            this.facingDirection = 'left';  // Set last direction to 'left'
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
            this.platform = null; // Stop attaching to platform when jumping
            jumpRequested = false;
        }
    }

    // Update the walking frame and reset it to the idle frame if idle
    updateFrame() {
        if (this.moving) {
            this.frameCounter++;
            if (this.frameCounter > 10) {
                this.currentFrame = (this.currentFrame + 1) % this.imagesRight.length;
                this.frameCounter = 0;
            }
        } else {
            this.currentFrame = 0;  // Use idle frame (first frame of walk animation)
        }
    }

    // Draw the character based on current state (idle, walking, jumping)
    draw(ctx) {
        ctx.save();
        let img;

        // Determine the correct image to use
        if (this.jumping) {
            img = this.jumpImage;  // Always use the right-facing jump image
        } else if (this.moving) {
            // Use the walking animation frame
            img = this.facingDirection === 'right' ? this.imagesRight[this.currentFrame] : this.imagesLeft[this.currentFrame];
        } else {
            // Use the idle frame (first frame of walking animation)
            img = this.facingDirection === 'right' ? this.imagesRight[0] : this.imagesLeft[0];
        }

        // If facing left and jumping, apply flip logic for the jump
        if (this.facingDirection === 'left' && this.jumping) {
            ctx.translate(this.x + this.width - cameraOffsetX, this.y - cameraOffsetY);
            ctx.scale(-1, 1);  // Flip horizontally
            ctx.drawImage(img, 0, 0, this.width, this.height);
        } else {
            // For right-facing or left-facing walking/idle, draw normally
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
                enemy.health -= 10;
                hitSound.play();
                if (enemy.health <= 0) {
                    flowers.push(new Flower(enemy.x, enemy.y));
                    enemies.splice(i, 1);
                    return true;
                }
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

// NPC class extending from Character
class NPC extends Character {
    constructor(imagesRight, imagesLeft, jumpImage, speed, maxHealth) {
        super(imagesRight, imagesLeft, jumpImage, speed, maxHealth);
    }

    followPlayer(player) {
        const distance = Math.abs(this.x - player.x);

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
            this.moving = false;
        }
    }

    randomActions() {
        if (Math.random() < 0.01) this.jump();
        if (Math.random() < 0.02) this.shoot();
    }
}

// Enemy class
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 50;
        this.health = 50;
        this.speed = 2;
    }

    moveTowardTarget(target) {
        const distance = Math.abs(this.x - target.x);
        if (distance > enemyChaseDistance) {
            if (this.x < target.x) this.x += this.speed;
            else this.x -= this.speed;
        }

        if (this.y < target.y) {
            this.y += this.speed;
        } else if (this.y > target.y) {
            this.y -= this.speed;
        }
    }

    draw(ctx) {
        ctx.drawImage(enemyImage, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
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

// Main game objects
const player = new Character(turtleWalkRight, turtleWalkLeft, turtleJumpImage, 5, maxHealth);
const npc = new NPC(npcWalkRight, npcWalkLeft, npcJumpImage, 3, maxHealth);
let enemies = [new Enemy(500, groundLevel - 50), new Enemy(700, groundLevel - 50), new Enemy(900, groundLevel - 50)];
let platforms = generatePlatforms();
let flowers = [];

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
    }
}

// Draw the green ground
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

// Main game loop
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw the ground
    drawGround();

    // Apply gravity and movement for player and NPC
    player.applyGravity(platforms);
    player.move();
    player.jump();  // Check if jump is requested
    npc.applyGravity(platforms);
    npc.followPlayer(player);
    npc.randomActions();

    // Enemies move toward the player/NPC
    enemies.forEach(enemy => {
        enemy.moveTowardTarget(Math.random() < 0.5 ? player : npc);
        enemy.draw(ctx);
    });

    // Update platform movements and draw them
    handleCameraScrolling();
    platforms.forEach(platform => {
        platform.update();
        platform.draw(ctx);
    });

    // Draw player and NPC
    player.draw(ctx);
    player.drawHealthBar(ctx);
    npc.draw(ctx);
    npc.drawHealthBar(ctx);

    // Handle projectile logic
    player.updateProjectiles(ctx, enemies);
    npc.updateProjectiles(ctx, enemies);

    // Handle flower collection
    flowers.forEach((flower, index) => {
        flower.draw(ctx);
        if (flower.checkCollision(player)) {
            player.increaseHealth();
            collectSound.play();
            flowers.splice(index, 1);
        } else if (flower.checkCollision(npc)) {
            npc.increaseHealth();
            collectSound.play();
            flowers.splice(index, 1);
        }
    });

    // Collision between player/npc and enemies
    enemies.forEach(enemy => {
        if (checkCollision(player, enemy)) {
            player.decreaseHealth(enemyDamage);
        }
        if (checkCollision(npc, enemy)) {
            npc.decreaseHealth(enemyDamage);
        }
    });

    // Spawn new enemies if needed
    spawnNewEnemies();

    // Update walking animation frames
    player.updateFrame();
    npc.updateFrame();

    requestAnimationFrame(gameLoop);
}

// Check if two entities collide (simple bounding box check)
function checkCollision(entity1, entity2) {
    return (
        entity1.x < entity2.x + entity2.width &&
        entity1.x + entity1.width > entity2.x &&
        entity1.y < entity2.y + entity2.height &&
        entity1.y + entity1.height > entity2.y
    );
}

// Player control event listeners
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

// Start the game loop
gameLoop();