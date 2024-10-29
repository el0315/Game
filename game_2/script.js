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


// Game state variables
let isRight = false;
let isLeft = false;
let jumpRequested = false;
let gameOver = false; // Track game over state
let lastTime = 0; // Store the last frame time

// Constants
const gravity = 0.5;
const jumpStrength = -15;
let groundLevel = 550;  // Fixed ground level
const maxFallSpeed = 12;
const platformMinY = 20;
const platformMaxY = 450;
const platformSpacing = 250;
const platformWidthRange = [120, 200];
let worldLength = 5000;  // Set initial world length
const flowerHealthGain = 20;
const maxHealth = 100;
const enemyDamage = 0.1;
const enemySpawnLimit = 3;
const npcFollowDistance = 300;
const enemyChaseDistance = 400;
const platformMoveRange = 200;
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


// Load the sound effect for the blue column healing
const blueColumnSound = new Audio('assets/blue_column.wav');
blueColumnSound.volume = 1;  // Adjust the volume if necessary


// Add event listeners to detect the first user input (key press or touch)
document.addEventListener('keydown', startGameMusic);
document.addEventListener('touchstart', startGameMusic);

// Load the game over sound effect (laugh)
const gameOverSound = new Audio('assets/laugh.wav');
gameOverSound.volume = 0.8; // Adjust volume for the laugh sound

// Function to resize the canvas while maintaining the aspect ratio
let resizeTimeout;
// Function to handle both landscape and portrait modes
function resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let newWidth, newHeight;

    if (windowWidth / windowHeight > aspectRatio) {
        // Landscape mode
        newHeight = windowHeight;
        newWidth = newHeight * aspectRatio;
    } else {
        // Portrait mode
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

    console.log(`Canvas resized for ${windowWidth > windowHeight ? 'landscape' : 'portrait'} mode: width=${newWidth}, height=${newHeight}`);
}

// Listen for window resize events to adjust canvas size
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);

// Initial call to set the correct canvas size
resizeCanvas();



let imagesLoaded = 0; // Track how many images are loaded
const totalImages = 9; // Total number of images (3 backgrounds + player/npc/enemy/flower)

//load image function

function loadImage(src) {
    const img = new Image();
    img.src = src;

    img.onload = () => {
        console.log(`Image loaded successfully: ${src}`);
        imagesLoaded++;
        if (imagesLoaded === totalImages) {
            console.log("All images loaded, starting game");
            startGame(); // Start game when all images are loaded
        }
    };

    img.onerror = () => {
        console.error(`Error loading image: ${src}`);
    };

    return img;
}

function startGame() {
    requestAnimationFrame(gameLoop); // Start the game loop only after images are loaded
}


// Background layer images
const backgroundLayer1 = loadImage('assets/background1.png');
const backgroundLayer2 = loadImage('assets/background2.png');
const backgroundLayer3 = loadImage('assets/background3.png');

// Background positions
let background1X = 0;
let background2X = 0;
let background3X = 0;

// Parallax speeds for each layer (slower the layer further away)
const background1Speed = 0.5;
const background2Speed = 1.0;
const background3Speed = 1.5;



// Adjusted function to draw and repeat the background
function drawBackground() {
    const canvasWidth = canvas.width / window.devicePixelRatio;
    const imageWidth = 640;  // Since your background images are 640x640

    // Layer 1: Farthest, moves slower
    const offset1 = Math.floor((-cameraOffsetX * background1Speed) % imageWidth);  // Invert scrolling
    for (let x = offset1; x < canvasWidth + imageWidth; x += imageWidth) {
        ctx.drawImage(backgroundLayer1, x, 0);
    }

    // Layer 2: Middle distance
    const offset2 = Math.floor((-cameraOffsetX * background2Speed) % imageWidth);
    for (let x = offset2; x < canvasWidth + imageWidth; x += imageWidth) {
        ctx.drawImage(backgroundLayer2, x, 0);
    }

    // Layer 3: Closest
    const offset3 = Math.floor((-cameraOffsetX * background3Speed) % imageWidth);
    for (let x = offset3; x < canvasWidth + imageWidth; x += imageWidth) {
        ctx.drawImage(backgroundLayer3, x, 0);
    }
}


// Global variable to store the enemy column sprite
let enemyColumnSprite;

// Images for player, NPC, and enemies
const turtleWalkRight = [loadImage('assets/turtle_walk_1.png'), loadImage('assets/turtle_walk_2.png')];
const turtleWalkLeft = [loadImage('assets/turtle_walk_left_1.png'), loadImage('assets/turtle_walk_left_2.png')];
const npcWalkRight = [loadImage('assets/npc_walk_1.png'), loadImage('assets/npc_walk_2.png')];
const npcWalkLeft = [loadImage('assets/npc_walk_left_1.png'), loadImage('assets/npc_walk_left_2.png')];
const turtleJumpImage = loadImage('assets/turtle_jump.png');
const npcJumpImage = loadImage('assets/npc_jump.png');
const enemyImage = loadImage('assets/enemy.png');
const flowerImage = loadImage('assets/flower.png')

// Load the enemy_column.png sprite
enemyColumnSprite = loadImage('assets/enemy_column.png');

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

    stompEnemy(enemies) {
        const stompDamage = 10; // Damage dealt when stomping
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            // Check if the player/NPC is falling and collides with the top of the enemy
            if (this.y + this.height <= enemy.y + 10 && this.velocityY > 0 && this.isColliding(enemy)) {
                // Successful stomp
                console.log("Stomp successful!");
                enemy.decreaseHealth(stompDamage); // Damage the enemy

                // Bounce the player/NPC after stomping
                this.velocityY = jumpStrength;
                this.jumping = true;

                // Play the stomp sound
                hitSound.play();

                // Remove the enemy if its health reaches 0
                if (enemy.health <= 0) {
                    // Spawn a flower at the enemy's position
                    flowers.push(new Flower(enemy.x, (enemy.y + 10)));
                    enemies.splice(i, 1);  // Remove enemy safely
                }
            }
        }
    }

    isColliding(enemy) {
        // Check for collision between the player/NPC and an enemy
        return this.x < enemy.x + enemy.width &&
               this.x + this.width > enemy.x &&
               this.y < enemy.y + enemy.height &&
               this.y + this.height > enemy.y;
    }


    move(deltaTime) {
        this.moving = false;
        const baseSpeed = 200;

        if (isRight) {
            this.x += baseSpeed * deltaTime;
            this.facingDirection = 'right';
            this.moving = true;
        }
        if (isLeft) {
            this.x -= baseSpeed * deltaTime;
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
// NPC class extending from Character with follow player logic only
class NPC extends Character {
    constructor(imagesRight, imagesLeft, jumpImage, speed, maxHealth) {
        super(imagesRight, imagesLeft, jumpImage, speed, maxHealth);
        this.followBuffer = 30;  // Buffer distance to avoid oscillation
    }

    // NPC follows player with smooth movement logic
    followPlayer(player) {
        const distanceX = player.x - this.x;

        // Only move if the distance is larger than the buffer
        if (Math.abs(distanceX) > this.followBuffer) {
            if (distanceX > 0) {
                // Player is to the right
                this.x += this.speed;
                this.facingDirection = 'right';
                this.moving = true;
            } else {
                // Player is to the left
                this.x -= this.speed;
                this.facingDirection = 'left';
                this.moving = true;
            }
        } else {
            // Stop moving when within the buffer distance
            this.moving = false;
        }
    }

    // NPC performs random actions like jumping or shooting
    randomActions() {
        if (Math.random() < 0.70) this.jump(); // Random jump
        if (Math.random() < 0.10) this.shoot(); // Random shoot
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
        this.health = 50;  // Health of the enemy
        this.speed = 3;
        this.verticalSpeed = 2;  // Vertical speed for climbing platforms
        this.facingDirection = 'left';  // Direction the enemy is facing
    }

    decreaseHealth(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            console.log("Enemy defeated");
        }
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

    
}


// Updated Boss class with correct sprite transition and animation flipping
class Boss {
    constructor(x, y, freezeSprites, walkFrames) {
        this.x = x;
        this.y = y;
        this.width = 100;
        this.height = 100;
        this.freezeSprites = freezeSprites;  // Array of sprites for freeze progression
        this.walkFrames = walkFrames;  // Array of walk animation frames
        this.currentFreezeSpriteIndex = 0;  // Index for freeze progression sprites
        this.currentWalkFrameIndex = 0;  // Track current walk frame
        this.frameCounter = 0;  // Frame counter for timing animations
        this.sprite = this.freezeSprites[this.currentFreezeSpriteIndex];  // Initial freeze sprite
        this.frozen = true;  // Start in frozen state
        this.shotsReceived = 0;  // Track shots per sprite update
        this.shotsPerSpriteUpdate = 5;  // Shots required for each sprite update in frozen state
        this.health = 100;  // Boss health after unfreezing
        this.active = false;  // Boss starts inactive
        this.walking = false;  // Set to true once the boss starts moving
        this.facingRight = false;  // Direction tracking for sprite flipping
    }

    // Draw the boss with correct sprite based on current state
    draw(ctx) {
        ctx.save();
        
        if (!this.frozen && this.walking) {
            // Display the walk animation frames if the boss is unfrozen and walking
            const walkFrame = this.walkFrames[this.currentWalkFrameIndex];
            
            if (this.facingRight) {
                ctx.translate(this.x + this.width - cameraOffsetX, this.y - cameraOffsetY);
                ctx.scale(-1, 1);  // Flip horizontally when facing right
                ctx.drawImage(walkFrame, 0, 0, this.width, this.height);
            } else {
                ctx.drawImage(walkFrame, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
            }
            
            // Animation cycling for walk frames
            this.frameCounter++;
            if (this.frameCounter >= 10) {  // Adjust for speed of animation
                this.currentWalkFrameIndex = (this.currentWalkFrameIndex + 1) % this.walkFrames.length;
                this.frameCounter = 0;
            }
        } else {
            // Use the freeze sprites if still frozen
            ctx.drawImage(this.sprite, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
        }
        
        ctx.restore();

        // Display health bar once unfrozen
        if (!this.frozen) {
            this.drawHealthBar(ctx);
        }
    }

    // Draw boss health bar
    drawHealthBar(ctx) {
        const barWidth = 80;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - cameraOffsetX, this.y - 10 - cameraOffsetY, barWidth, 8);
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x - cameraOffsetX, this.y - 10 - cameraOffsetY, barWidth * (this.health / 100), 8);
    }

    // Handle boss shot impact
    handleShot() {
        if (this.frozen && this.currentFreezeSpriteIndex < this.freezeSprites.length - 1) {
            this.shotsReceived++;  // Increment shots per sprite
            
            // Update sprite once enough shots are received
            if (this.shotsReceived >= this.shotsPerSpriteUpdate) {
                this.shotsReceived = 0;  // Reset shots counter
                this.currentFreezeSpriteIndex++;
                this.sprite = this.freezeSprites[this.currentFreezeSpriteIndex];

                // Unfreeze when reaching final freeze sprite
                if (this.currentFreezeSpriteIndex === this.freezeSprites.length - 1) {
                    this.frozen = false;
                    this.walking = true;  // Start the walking animation
                }
            }
        } else if (!this.frozen) {
            // Boss begins moving if hit while unfrozen
            this.walking = true;
        }
    }

    // Boss follows player when unfrozen
    followPlayer(player) {
        if (!this.frozen) {
            const speed = 2;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 1) {
                this.facingRight = dx > 0;  // Update direction for frame flipping
                this.x += (dx / distance) * speed;
                this.y += (dy / distance) * speed;
            }
        }
    }
}

// Load boss freeze sprites
const bossFreezeSprites = [];
for (let i = 1; i <= 10; i++) {
    bossFreezeSprites.push(loadImage(`assets/Nuc_map${i}.png`));
}

// Load boss walk animation frames
const bossWalkFrames = [];
for (let i = 1; i <= 8; i++) {
    bossWalkFrames.push(loadImage(`assets/Nuc_tails${i}.png`));
}

// Instantiate the boss with freeze and walk frames
const boss = new Boss(0, 0, bossFreezeSprites, bossWalkFrames);



// Variable to track enemy respawning status
let allowEnemyRespawning = true;

// Function to spawn the boss when player score reaches 15
function checkBossSpawn() {
    if (!boss.active && player.score >= 15) {
        boss.active = true;
        boss.x = player.x + 100;
        boss.y = groundLevel - boss.height;

        // Clear all enemies and disable further spawning
        enemies = [];
        allowEnemyRespawning = false;  // Disable enemy respawning
    }
}

// Update the player's shooting mechanism to check for boss hit
Character.prototype.shoot = function() {
    const projectileX = this.facingDirection === 'right' ? this.x + this.width : this.x;
    const projectile = new Projectile(projectileX, this.y + this.height / 2, 10, this.facingDirection);
    this.projectiles.push(projectile);
};

// Update projectile collision detection to include the boss
Character.prototype.checkProjectileCollision = function(proj, enemies) {
    // Check collision with enemies
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

            return true;  // Projectile hit
        }
    }

    // Check collision with the boss if active
    if (boss.active && proj.x < boss.x + boss.width && proj.x + proj.width > boss.x &&
        proj.y < boss.y + boss.height && proj.y + proj.height > boss.y) {
        
        if (boss.frozen) {
            boss.handleShot();  // Update boss if frozen
        } else {
            boss.health -= projectileDamage;  // Decrease health if unfrozen
        }

        return true;  // Projectile hit
    }

    return false;
};



// Constants for column colors
const RED_COLOR = 'rgba(255, 0, 0, 0.5)';  // Transparent red for freezing enemies
const BLUE_COLOR = 'rgba(0, 0, 255, 0.3)';  // Transparent blue (lighter for healing)

// Column class definition
class Column {
    constructor(width, speed, startX) {
        this.width = width;
        this.speed = speed;
        this.x = startX;  // Start the column at the right side of the world
        this.y = 0;  // Start at the top of the canvas
        this.active = true;  // Track if the column is currently active (visible on screen)

        // Randomly set the color to red (50%) or blue (50%)
        this.color = Math.random() < 0.5 ? RED_COLOR : BLUE_COLOR;

        // Track if the column is red or blue
        this.isRed = this.color === RED_COLOR;
        this.isBlue = this.color === BLUE_COLOR;
    }

    // Draw the column as a transparent rectangle extending down to the ground level
    draw(ctx, cameraOffsetX, cameraOffsetY) {
        const columnHeight = groundLevel - this.y;  // Extend column to groundLevel
        if (this.active) {  // Only draw if the column is active
            ctx.fillStyle = this.color;  // Use the assigned color
            ctx.fillRect(this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, columnHeight);
        }
    }

    // Update the column's position, deactivate when it moves offscreen
    update() {
        if (this.active) {
            this.x -= this.speed;
            if (this.x + this.width < 0) {
                this.active = false;  // Deactivate the column when it leaves the screen
            }
        }
    }

    // Reset the column to start from the right again (based on the camera offset)
    reset(cameraOffsetX) {
        this.x = cameraOffsetX + canvas.width;  // Reset the column to the right edge of the current view
        this.active = true;

        // Randomize the column's color again (50% chance for red or blue)
        this.color = Math.random() < 0.5 ? RED_COLOR : BLUE_COLOR;
        this.isRed = this.color === RED_COLOR;
        this.isBlue = this.color === BLUE_COLOR;
    }

    // Check if an entity (like an enemy) is within the column's area
    isEntityInColumn(entity) {
        return (
            this.active &&
            entity.x + entity.width > this.x &&
            entity.x < this.x + this.width
        );
    }
}

// Function to freeze enemies and update their sprite if inside a red column
function freezeEnemiesAndUpdateSprite(enemy) {
    if (sweepingColumn.isEntityInColumn(enemy) && sweepingColumn.isRed) {
        // Freeze the enemy's movement
        enemy.frozen = true;
        // Update the enemy sprite to the "enemy_column.png" image
        if (enemyColumnSprite) {
            enemy.sprite = enemyColumnSprite;
        }
    } else {
        // Unfreeze the enemy and restore the default sprite
        enemy.frozen = false;
        enemy.sprite = enemyImage;
    }
}
// Instantiate the column object with updated height handling
const sweepingColumn = new Column(200, 2, canvas.width);

// Function to restore health if player or NPC are inside blue columns
function restoreHealthIfInBlueColumn(character) {
    if (sweepingColumn.isEntityInColumn(character) && sweepingColumn.isBlue) {
        if (character.health < character.maxHealth) {  // Only restore if health is not already full
            character.health = character.maxHealth;    // Restore health to full
            blueColumnSound.play();                    // Play the sound effect
        }
    }

}

// Variable to manage the delay between columns
let columnSpawnDelay = 500;  // 3 seconds delay
let columnSpawnTimer = 0;


// Update the enemy movement method to freeze if inside a red column
Enemy.prototype.moveTowardTarget = function(target, platforms) {
    if (!this.frozen) {  // Only move if the enemy is not frozen
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
};

// Update the enemy draw method to use the current sprite
Enemy.prototype.draw = function(ctx) {
    ctx.save();

    let sprite = this.sprite || enemyImage;  // Default enemy sprite or the updated one

    if (this.facingDirection === 'right') {
        ctx.translate(this.x + this.width - cameraOffsetX, this.y - cameraOffsetY);
        ctx.scale(-1, 1);  // Flip image if facing right
        ctx.drawImage(sprite, 0, 0, this.width, this.height);
    } else {
        ctx.drawImage(sprite, this.x - cameraOffsetX, this.y - cameraOffsetY, this.width, this.height);
    }

    ctx.restore();
    this.drawHealthBar(ctx);  // Draw the enemy's health bar
};

// Flower class for health pickups
class Flower {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 35;
        this.height = 35;
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

// Adjust player and NPC initial positions
player.x = 400; // Start the player further to the right
player.y = groundLevel - 50;
npc.x = 450;
npc.y = groundLevel - 50;

// Initialize the camera offset based on the player's initial position
let cameraOffsetX = player.x - 200;
let cameraOffsetY = 0;
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


// Restart button event listener

restartButton.addEventListener('click', () => {
    // Reset player and NPC positions
    player.x = 400;  // Reset to the fixed starting position
    player.y = groundLevel - 50;
    npc.x = 450;     // Reset NPC to its starting position
    npc.y = groundLevel - 50;

    // Reset player and NPC health
    player.health = maxHealth;
    npc.health = maxHealth;

    // Reset player and NPC scores
    player.score = 0;
    npc.score = 0;

    // Reset enemies, flowers, and platforms if needed
    enemies = [new Enemy(500, groundLevel - 50), new Enemy(700, groundLevel - 50), new Enemy(900, groundLevel - 50)];
    flowers = [];
    platforms = generatePlatforms();

    // Reset the game state
    gameOver = false;  // Ensure game over state is reset
    gameOverScreen.style.display = 'none';  // Hide the Game Over screen

    // Optionally restart the music
    backgroundMusic.playing = false; // Reset music flag
    backgroundMusic.play();  // Start music again immediately

    // Reset the camera offset based on the player's new position
    cameraOffsetX = player.x - 200;
    cameraOffsetY = 0;

    // Restart the game loop
    requestAnimationFrame(gameLoop); // Start the game loop again
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

function spawnNewEnemies() {
    if (allowEnemyRespawning && enemies.length < enemySpawnLimit) {
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

function gameLoop(currentTime) {
    if (gameOver) return;

    // Calculate delta time (in seconds)
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the parallax background
    drawBackground();

    drawGround();  // Ensure ground is drawn in the correct position
    handleCameraScrolling();  // Update camera based on player movement

    // Check for boss spawn based on score
    checkBossSpawn();

    // Update and render boss behavior
    if (boss.active) {
        if (!boss.frozen) {
            boss.followPlayer(player);  // Boss follows player once unfrozen
        }
        boss.draw(ctx);
    }

    // Update and draw the sweeping column
    sweepingColumn.update();
    sweepingColumn.draw(ctx, cameraOffsetX, cameraOffsetY);

    // Restore health if player or NPC are inside a blue column
    restoreHealthIfInBlueColumn(player);
    restoreHealthIfInBlueColumn(npc);

    // Freeze enemies and update sprite if inside a red column
    enemies.forEach(enemy => {
        freezeEnemiesAndUpdateSprite(enemy);
    });

    // Check if the column is inactive (offscreen) and start the timer to respawn it
    if (!sweepingColumn.active) {
        columnSpawnTimer += deltaTime * 1000;  // Count up the timer in milliseconds
        if (columnSpawnTimer >= columnSpawnDelay) {
            sweepingColumn.reset(cameraOffsetX);  // Reset the column to the right edge of the visible window
            columnSpawnTimer = 0;    // Reset the timer
        }
    }

    // Restore health if player or NPC are inside a blue column
    restoreHealthIfInBlueColumn(player);
    restoreHealthIfInBlueColumn(npc);


    // Enemy logic: Move enemies and draw them
    enemies.forEach(enemy => {
        enemy.moveTowardTarget(player, platforms);
        enemy.draw(ctx);
    });


    // Check if the column is inactive (offscreen) and start the timer to respawn it
    if (!sweepingColumn.active) {
        columnSpawnTimer += deltaTime * 1000;  // Count up the timer in milliseconds
        if (columnSpawnTimer >= columnSpawnDelay) {
            sweepingColumn.reset(cameraOffsetX);  // Reset the column to the right edge of the visible window
            columnSpawnTimer = 0;    // Reset the timer
        }
    }


    // Apply gravity and movement logic
    player.applyGravity(platforms);
    player.move(deltaTime); // Pass deltaTime to control speed
    player.jump();
    player.updateFrame();

    player.stompEnemy(enemies);

    player.draw(ctx);
    player.drawHealthBar(ctx);

    // NPC follows the player
    npc.applyGravity(platforms);
    npc.followPlayer(player);  // NPC now only follows the player
    npc.randomActions();       // NPC performs random actions like jumping/shooting
    npc.updateFrame();
    npc.stompEnemy(enemies);
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
        platform.update(deltaTime);  // Move platforms
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

// Ensure the game starts after the assets load
