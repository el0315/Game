let scene, camera, renderer, player, ground, sky, obstacles = [];
let physicsWorld, playerBody;
let yaw = 0, pitch = 0;

const maxPitch = Math.PI / 2;   // Existing maximum pitch (looking straight up)
const minPitch = -Math.PI / 6;  // New minimum pitch (looking 45 degrees down)

let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;

// New shooting joystick variables
let joystickFireAngle = null;
let firingTouchId = null;
let isFiring = false;
let lastShotTime = 0;               // Timestamp of the last shot
const shootCooldown = 50;           // Cooldown in milliseconds between shots
const playerRadius = 0.5;
const playerSpeed = 10;
const rotationSpeed = 0.015;
let moveDirection = new THREE.Vector3();
let playerControlsEnabled = true;

let playerHealth = 5; // Current player health
const maxPlayerHealth = 5; // Maximum player health

let enemyCanShoot = true;

let enemy, enemyBody;
const enemyRadius = 0.5; // Same as player radius
let enemyMoveDirection = new THREE.Vector3();
const enemySpeed = 2; // Adjust the speed as needed
let enemyHealth = 3; // Current health
const maxEnemyHealth = 3; // Maximum health
// Enemy AI Configuration
const enemyMoveTowardsPlayerFrequency = 1; // Seconds between movement direction updates
const enemyShootFrequency = 2; // Seconds between shooting actions

// Internal tracking variables
let lastEnemyMoveTime = 0;
let lastEnemyShootTime = 0;
let totalElapsedTime = 0; // Total time since the game started


// Collision Groups
const COL_GROUP_PLAYER = 1 << 0;             // 1
const COL_GROUP_OBSTACLE = 1 << 2;           // 4
const COL_GROUP_ENEMY = 1 << 3;              // 8
const COL_GROUP_TERRAIN = 1 << 4;            // 16
const COL_GROUP_PLAYER_PROJECTILE = 1 << 5;  // 32
const COL_GROUP_ENEMY_PROJECTILE = 1 << 6;   // 64




// Terrain parameters
const terrainWidthExtents = 100;
const terrainDepthExtents = 100;
const terrainWidth = 64;
const terrainDepth = 64;
const terrainHalfWidth = terrainWidth / 2;
const terrainHalfDepth = terrainDepth / 2;
const terrainMaxHeight = 4; // Maximum height of the terrain
const terrainMinHeight = 1; // Minimum height of the terrain
let heightData = null;
let ammoHeightData = null;

// Hill parameters for terrain generation
const hillFrequency = 15;   // Adjust this value for more or fewer hills (lower value = fewer hills)
const hillAmplitude = 0.5; // Adjust this value for the height of the hills (higher value = taller hills)

// Global variables for projectiles
let projectiles = [];
const projectileSpeed = 50;
const projectileRadius = 0.2;
const projectileMass = 1;
const maxProjectiles = 100; // Limit the number of active projectiles



function createProjectile(position, direction, shooterType = 'player') {
    // Create a copy of the position to avoid modifying the original
    const spawnPosition = position.clone();

    // Offset the spawn position slightly in front of the shooter
    const spawnOffset = direction.clone().multiplyScalar(playerRadius + projectileRadius + 0.1); // 0.1 is a small buffer
    spawnPosition.add(spawnOffset);

    // Define projectile color based on shooterType
    const projectileColor = shooterType === 'player' ? 0xff0000 : 0x0000ff; // Player: red, Enemy: blue

    // Create Three.js mesh for the projectile
    const projectileMaterial = new THREE.MeshStandardMaterial({ color: projectileColor });
    const projectileMesh = new THREE.Mesh(
        new THREE.SphereGeometry(projectileRadius, 16, 16),
        projectileMaterial
    );
    projectileMesh.castShadow = true;
    projectileMesh.receiveShadow = true;
    projectileMesh.position.copy(spawnPosition);

    scene.add(projectileMesh);

    // Create Ammo.js physics body for the projectile
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(spawnPosition.x, spawnPosition.y, spawnPosition.z));

    const motionState = new Ammo.btDefaultMotionState(transform);
    const shape = new Ammo.btSphereShape(projectileRadius);
    shape.setMargin(0.05);

    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(projectileMass, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
        projectileMass,
        motionState,
        shape,
        localInertia
    );
    const body = new Ammo.btRigidBody(rbInfo);

    // Associate the Three.js mesh with the Ammo.js body
    body.threeObject = projectileMesh;
    body.shooterType = shooterType; // Add shooterType to the body for collision handling

    // Set the velocity of the projectile
    const velocity = direction.clone().multiplyScalar(projectileSpeed);
    body.setLinearVelocity(new Ammo.btVector3(velocity.x, velocity.y, velocity.z));

    // Disable deactivation so the projectile doesn't sleep
    body.setActivationState(4);

    // Determine collision group and mask based on shooterType
    let collisionGroup, collisionMask;
    if (shooterType === 'player') {
        collisionGroup = COL_GROUP_PLAYER_PROJECTILE;
        collisionMask = COL_GROUP_OBSTACLE | COL_GROUP_ENEMY | COL_GROUP_TERRAIN;
    } else if (shooterType === 'enemy') {
        collisionGroup = COL_GROUP_ENEMY_PROJECTILE;
        collisionMask = COL_GROUP_OBSTACLE | COL_GROUP_PLAYER | COL_GROUP_TERRAIN;
    } else {
        collisionGroup = COL_GROUP_PLAYER_PROJECTILE; // Default to player projectile
        collisionMask = COL_GROUP_OBSTACLE | COL_GROUP_ENEMY | COL_GROUP_TERRAIN;
    }

    physicsWorld.addRigidBody(
        body,
        collisionGroup, // Collision group
        collisionMask // Collides with these groups
    );

    // Track the projectile
    projectiles.push({ mesh: projectileMesh, body: body });
}



// Function to remove the oldest projectile
function removeOldestProjectile() {
    const oldest = projectiles.shift();
    scene.remove(oldest.mesh);
    physicsWorld.removeRigidBody(oldest.body);
}

function checkProjectileCollisions() {
    const dispatcher = physicsWorld.getDispatcher();
    const numManifolds = dispatcher.getNumManifolds();

    for (let i = 0; i < numManifolds; i++) {
        const contactManifold = dispatcher.getManifoldByIndexInternal(i);
        const body0 = Ammo.castObject(contactManifold.getBody0(), Ammo.btRigidBody);
        const body1 = Ammo.castObject(contactManifold.getBody1(), Ammo.btRigidBody);

        // Check for player projectile colliding with enemy
        if ((isPlayerProjectileBody(body0) && isEnemyBody(body1)) || (isPlayerProjectileBody(body1) && isEnemyBody(body0))) {
            handleProjectileEnemyCollision(body0, body1);
        }
        // Check for enemy projectile colliding with player
        else if ((isEnemyProjectileBody(body0) && isPlayerBody(body1)) || (isEnemyProjectileBody(body1) && isPlayerBody(body0))) {
            handleProjectilePlayerCollision(body0, body1);
        }
        // Check for player projectiles colliding with obstacles
        else if ((isPlayerProjectileBody(body0) && isObstacleBody(body1)) || (isPlayerProjectileBody(body1) && isObstacleBody(body0))) {
            handleProjectileCollision(body0, body1);
        }
        // Check for enemy projectiles colliding with obstacles
        else if ((isEnemyProjectileBody(body0) && isObstacleBody(body1)) || (isEnemyProjectileBody(body1) && isObstacleBody(body0))) {
            handleProjectileCollision(body0, body1);
        }
    }
}


function isPlayerBody(body) {
    return body === playerBody;
}

function handleProjectilePlayerCollision(body0, body1) {
    // Identify which body is the enemy projectile
    let projectileBody;
    if (isEnemyProjectileBody(body0)) {
        projectileBody = body0;
    } else {
        projectileBody = body1;
    }

    // Remove the projectile
    const index = projectiles.findIndex(projectile => projectile.body === projectileBody);
    if (index !== -1) {
        const projectile = projectiles[index];
        scene.remove(projectile.mesh);
        physicsWorld.removeRigidBody(projectile.body);
        projectiles.splice(index, 1);
    }

    // Apply damage to the player
    handlePlayerDamage(1); // Adjust damage amount as needed
}

function showGameOverOverlay() {
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideGameOverOverlay() {
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}




function isEnemyBody(body) {
    return body === enemyBody;
}

function handleProjectileEnemyCollision(body0, body1) {
    // Identify which body is the player projectile
    let projectileBody;
    if (isPlayerProjectileBody(body0)) {
        projectileBody = body0;
    } else {
        projectileBody = body1;
    }

    // Remove the projectile
    const index = projectiles.findIndex(projectile => projectile.body === projectileBody);
    if (index !== -1) {
        const projectile = projectiles[index];
        scene.remove(projectile.mesh);
        physicsWorld.removeRigidBody(projectile.body);
        projectiles.splice(index, 1);
    }

    // Decrease enemy health
    enemyHealth--;

    if (enemyHealth > 0) {
        // Update health bar
        updateEnemyHealthBar();
        // Apply hit effect
        applyEnemyHitEffect();
    } else {
        // Enemy defeated, handle respawn
        destroyEnemy();
    }
}


function isPlayerProjectileBody(body) {
    return projectiles.some(projectile => projectile.body === body && projectile.body.shooterType === 'player');
}

function isEnemyProjectileBody(body) {
    return projectiles.some(projectile => projectile.body === body && projectile.body.shooterType === 'enemy');
}


function createHealthBarTexture(healthPercentage) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 16;
    const context = canvas.getContext('2d');

    // Draw background (red)
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw foreground (green) based on health
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, canvas.width * healthPercentage, canvas.height);

    // Optional: Add border
    context.strokeStyle = '#000000';
    context.lineWidth = 2;
    context.strokeRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}


function updatePlayerHealthBar() {
    const healthPercentage = playerHealth / maxPlayerHealth;
    // Clamp healthPercentage between 0 and 1
    const clampedHealth = Math.max(0, Math.min(1, healthPercentage));

    // Update the sprite's texture
    if (player.healthBarTexture) {
        const newTexture = createHealthBarTexture(clampedHealth);
        player.healthBarSprite.material.map.dispose(); // Dispose of the old texture
        player.healthBarSprite.material.map = newTexture;
        player.healthBarSprite.material.needsUpdate = true;

        // Update the stored texture reference
        player.healthBarTexture = newTexture;
    }
}

function updateEnemyHealthBar() {
    const healthPercentage = enemyHealth / maxEnemyHealth;
    // Clamp healthPercentage between 0 and 1
    const clampedHealth = Math.max(0, Math.min(1, healthPercentage));

    // Update the sprite's texture
    if (enemy.healthBarTexture) {
        const newTexture = createHealthBarTexture(clampedHealth);
        enemy.healthBarSprite.material.map.dispose(); // Dispose of the old texture
        enemy.healthBarSprite.material.map = newTexture;
        enemy.healthBarSprite.material.needsUpdate = true;

        // Update the stored texture reference
        enemy.healthBarTexture = newTexture;
    }
}


function updateHealthBars() {
    // Update Enemy Health Bar
    if (enemy.healthBarSprite) {
        updateEnemyHealthBar();
    }

    // Update Player Health Bar
    if (player.healthBarSprite) {
        updatePlayerHealthBar();
    }
}


function applyEnemyHitEffect() {
    // Change the enemy's color to red briefly
    enemy.material.color.set(0xff0000);

    // Reset the color after a short delay
    setTimeout(() => {
        enemy.material.color.set(0x800080); // Purple color
    }, 200); // Duration in milliseconds
}

function destroyEnemy() {
    // Remove enemy from scene
    scene.remove(enemy);

    // Remove enemy from physics world
    physicsWorld.removeRigidBody(enemyBody);

    // Prevent enemy from shooting
    enemyCanShoot = false;

    // Show respawn indicator with countdown
    showEnemyRespawnOverlayWithCountdown(5); // 5 seconds

    // Schedule respawn after a delay (e.g., 5 seconds)
    setTimeout(() => {
        respawnEnemy();
    }, 5000); // 5000 milliseconds = 5 seconds
}



function respawnEnemy() {
    // Reset enemy health
    enemyHealth = maxEnemyHealth;

    // Reset enemy position
    const startPosition = new THREE.Vector3(0, terrainMaxHeight + enemyRadius + 1, -10);
    enemy.position.copy(startPosition);

    // Reset enemy physics body
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(startPosition.x, startPosition.y, startPosition.z));
    enemyBody.setWorldTransform(transform);
    enemyBody.getMotionState().setWorldTransform(transform);

    // Re-add enemy to scene
    scene.add(enemy);

    // Re-add enemy to physics world
    physicsWorld.addRigidBody(
        enemyBody,
        COL_GROUP_ENEMY, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_OBSTACLE | COL_GROUP_TERRAIN // Collision mask
    );

    // Reset health bar to full health
    updateEnemyHealthBar();

    // Reset enemy's material color in case it was changed
    enemy.material.color.set(0x800080); // Purple color

    // Allow enemy to shoot again
    enemyCanShoot = true;

    // Hide respawn indicator
    hideEnemyRespawnOverlay();
}


function showEnemyRespawnOverlayWithCountdown(seconds) {
    const overlay = document.getElementById('enemyRespawnOverlay');
    if (overlay) {
        overlay.style.display = 'block';
        overlay.innerText = `Enemy Respawning in ${seconds}...`;

        // Start countdown
        let remaining = seconds;
        const countdownInterval = setInterval(() => {
            remaining--;
            if (remaining > 0) {
                overlay.innerText = `Enemy Respawning in ${remaining}...`;
            } else {
                clearInterval(countdownInterval);
                overlay.innerText = 'Enemy Respawning...';
            }
        }, 1000);
    }
}


function hideEnemyRespawnOverlay() {
    const overlay = document.getElementById('enemyRespawnOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}


function createEnemyHealthBar() {
    // Prevent creating multiple health bars
    if (enemy.healthBarSprite) return;

    // Initial health percentage
    const healthPercentage = enemyHealth / maxEnemyHealth;

    // Create sprite material with initial texture
    const texture = createHealthBarTexture(healthPercentage);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });

    // Create sprite
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.25, 1); // Adjust size as needed
    sprite.position.set(0, enemyRadius + 0.6, 0); // Position slightly above the enemy

    // Add sprite to enemy
    enemy.add(sprite);

    // Store references for later updates
    enemy.healthBarSprite = sprite;
    enemy.healthBarTexture = texture;
}


function createPlayerHealthBar() {
    // Prevent creating multiple health bars
    if (player.healthBarSprite) return;

    // Initial health percentage
    const healthPercentage = playerHealth / maxPlayerHealth;

    // Create sprite material with initial texture
    const texture = createHealthBarTexture(healthPercentage);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });

    // Create sprite
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.25, 1); // Adjust size as needed
    sprite.position.set(0, playerRadius + 0.6, 0); // Position slightly above the player

    // Add sprite to player
    player.add(sprite);

    // Store references for later updates
    player.healthBarSprite = sprite;
    player.healthBarTexture = texture;
}


function handleShootStart(event) {
    event.preventDefault();

    // Get the player's position and direction
    const playerPosition = new THREE.Vector3();
    playerPosition.copy(player.position);

    // Calculate the shooting direction based on player rotation (yaw and pitch)
    const direction = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();

    // Create the projectile with shooterType 'player'
    createProjectile(playerPosition, direction, 'player');

    // Limit the number of projectiles
    if (projectiles.length > maxProjectiles) {
        removeOldestProjectile();
    }
}

function handlePlayerDamage(damageAmount) {
    playerHealth -= damageAmount;
    playerHealth = Math.max(playerHealth, 0); // Prevent negative health

    if (playerHealth > 0) {
        // Update health bar
        updatePlayerHealthBar();
        // Apply hit effect
        applyPlayerHitEffect();
    } else {
        // Player is dead, handle respawn
        handlePlayerDeath();
    }
}

function applyPlayerHitEffect() {
    // Change the player's color to red briefly
    player.material.color.set(0xff0000);

    // Reset the color after a short delay
    setTimeout(() => {
        player.material.color.set(0x4682B4); // Original color
    }, 200); // Duration in milliseconds
}

function handlePlayerDeath() {
    // Remove player from scene
    scene.remove(player);

    // Remove player from physics world
    physicsWorld.removeRigidBody(playerBody);

    // Disable player controls
    disablePlayerControls();

    // Schedule respawn after a delay (e.g., 5 seconds)
    setTimeout(() => {
        respawnPlayer();
    }, 5000); // 5000 milliseconds = 5 seconds
}

function disablePlayerControls() {
    playerControlsEnabled = false;
    // Optionally, provide visual feedback (e.g., dim the screen or show a "Game Over" overlay)
    showGameOverOverlay();
}

function enablePlayerControls() {
    playerControlsEnabled = true;
    // Remove visual feedback
    hideGameOverOverlay();
}


function respawnPlayer() {
    // Reset player health
    playerHealth = maxPlayerHealth;

    // Reset player position
    const startPosition = new THREE.Vector3(0, terrainMaxHeight + playerRadius + 1, 0);
    player.position.copy(startPosition);

    // Reset player physics body
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(startPosition.x, startPosition.y, startPosition.z));
    playerBody.setWorldTransform(transform);
    playerBody.getMotionState().setWorldTransform(transform);

    // Re-add player to scene
    scene.add(player);

    // Re-add player to physics world
    physicsWorld.addRigidBody(
        playerBody,
        COL_GROUP_PLAYER, // Collision group
        COL_GROUP_OBSTACLE | COL_GROUP_ENEMY | COL_GROUP_TERRAIN | COL_GROUP_ENEMY_PROJECTILE // Collides with these groups
    );

    // Reset health bar to full health
    updatePlayerHealthBar();

    // Reset player's material color in case it was changed
    player.material.color.set(0x4682B4); // Original color

    // Enable player controls
    enablePlayerControls();

    // **Reset Shooting Joystick State**
    resetFireJoystick();
}


// Helper functions to identify projectiles and obstacles
function isProjectileBody(body) {
    return projectiles.some(projectile => projectile.body === body);
}

function isObstacleBody(body) {
    return obstacles.some(obstacle => obstacle.userData.physicsBody === body);
}

function handleProjectileCollision(body0, body1) {
    // Identify which body is the projectile
    let projectileBody, obstacleBody;
    if (isPlayerProjectileBody(body0)) {
        projectileBody = body0;
        obstacleBody = body1;
    } else if (isPlayerProjectileBody(body1)) {
        projectileBody = body1;
        obstacleBody = body0;
    } else if (isEnemyProjectileBody(body0)) {
        projectileBody = body0;
        obstacleBody = body1;
    } else if (isEnemyProjectileBody(body1)) {
        projectileBody = body1;
        obstacleBody = body0;
    }

    // Remove the projectile
    const index = projectiles.findIndex(projectile => projectile.body === projectileBody);
    if (index !== -1) {
        const projectile = projectiles[index];
        scene.remove(projectile.mesh);
        physicsWorld.removeRigidBody(projectile.body);
        projectiles.splice(index, 1);
    }

    // Optionally, apply effects to the obstacle
    // For example, you could remove the obstacle or apply a force
}


// Joystick elements
let joystickContainerMove, joystickKnobMove;

// Load Ammo.js and initialize the game
function loadAmmoAndStartGame() {
    Ammo().then(() => {
        console.log("Ammo.js loaded successfully.");
        initializePhysics();
        initializeScene();
        animate();
    });
}

function initializePhysics() {
    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));

    // Generate height data
    heightData = generateHeight(terrainWidth, terrainDepth, terrainMinHeight, terrainMaxHeight);

    // Create the terrain physics body
    const groundShape = createTerrainShape();
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, (terrainMaxHeight + terrainMinHeight) / 2, 0));
    const groundMass = 0;
    const groundMotionState = new Ammo.btDefaultMotionState(groundTransform);
    const groundBody = new Ammo.btRigidBody(new Ammo.btRigidBodyConstructionInfo(groundMass, groundMotionState, groundShape, new Ammo.btVector3(0, 0, 0)));
    // After creating groundBody
    physicsWorld.addRigidBody(
        groundBody,
        COL_GROUP_TERRAIN, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_ENEMY_PROJECTILE | COL_GROUP_OBSTACLE | COL_GROUP_ENEMY // Collides with these groups
    );

    // Player physics
    const playerShape = new Ammo.btSphereShape(playerRadius);
    const playerTransform = new Ammo.btTransform();
    playerTransform.setIdentity();
    playerTransform.setOrigin(new Ammo.btVector3(0, terrainMaxHeight + playerRadius + 1, 0)); // Start player above terrain
    const playerMass = 1;
    const playerInertia = new Ammo.btVector3(0, 0, 0);
    playerShape.calculateLocalInertia(playerMass, playerInertia);
    const playerMotionState = new Ammo.btDefaultMotionState(playerTransform);
    const playerRbInfo = new Ammo.btRigidBodyConstructionInfo(playerMass, playerMotionState, playerShape, playerInertia);
    playerBody = new Ammo.btRigidBody(playerRbInfo);
    playerBody.setActivationState(4);

    // Set damping for realistic physics
    playerBody.setDamping(0.2, 0.9); // Linear damping, angular damping

    // Set friction and restitution
    playerBody.setFriction(0.8);
    playerBody.setRestitution(0.2);
    physicsWorld.addRigidBody(
        playerBody,
        COL_GROUP_PLAYER, // Collision group
        COL_GROUP_OBSTACLE | COL_GROUP_ENEMY | COL_GROUP_TERRAIN | COL_GROUP_ENEMY_PROJECTILE // Collides with these groups
    );


    // Enemy physics
    const enemyShape = new Ammo.btSphereShape(enemyRadius);
    const enemyTransform = new Ammo.btTransform();
    enemyTransform.setIdentity();
    enemyTransform.setOrigin(new Ammo.btVector3(0, terrainMaxHeight + enemyRadius + 1, -10)); // Start enemy at a position
    const enemyMass = 1;
    const enemyInertia = new Ammo.btVector3(0, 0, 0);
    enemyShape.calculateLocalInertia(enemyMass, enemyInertia);
    const enemyMotionState = new Ammo.btDefaultMotionState(enemyTransform);
    const enemyRbInfo = new Ammo.btRigidBodyConstructionInfo(enemyMass, enemyMotionState, enemyShape, enemyInertia);
    enemyBody = new Ammo.btRigidBody(enemyRbInfo);
    enemyBody.setActivationState(4);

    // Set damping for realistic physics
    enemyBody.setDamping(0.2, 0.9); // Linear damping, angular damping

    // Set friction and restitution
    enemyBody.setFriction(0.8);
    enemyBody.setRestitution(0.2);

    // Associate the Three.js mesh with the Ammo.js body
    enemyBody.threeObject = enemy;

    physicsWorld.addRigidBody(
        enemyBody,
        COL_GROUP_ENEMY, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_OBSTACLE | COL_GROUP_TERRAIN // Collides with these groups
    );

}

function generateHeight(width, depth, minHeight, maxHeight) {
    const size = width * depth;
    const data = new Float32Array(size);

    const hRange = maxHeight - minHeight;

    let p = 0;

    // Generate Perlin noise for terrain height variation
    for (let j = 0; j < depth; j++) {
        for (let i = 0; i < width; i++) {
            const x = i / width;
            const y = j / depth;

            // Use Perlin noise function for natural-looking terrain
            const height = perlinNoise(x * hillFrequency, y * hillFrequency) * hillAmplitude * hRange + minHeight;

            data[p] = height;
            p++;
        }
    }

    return data;
}

function createTerrainShape() {
    const heightScale = 1;
    const upAxis = 1;
    const hdt = "PHY_FLOAT";
    const flipQuadEdges = false;

    // Create height data buffer in Ammo heap
    ammoHeightData = Ammo._malloc(4 * terrainWidth * terrainDepth);

    // Copy the JavaScript height data array to the Ammo one
    let p = 0;
    let p2 = 0;
    for (let j = 0; j < terrainDepth; j++) {
        for (let i = 0; i < terrainWidth; i++) {
            // Write 32-bit float data to memory
            Ammo.HEAPF32[ammoHeightData + p2 >> 2] = heightData[p];
            p++;
            // 4 bytes/float
            p2 += 4;
        }
    }

    // Create the heightfield physics shape
    const heightFieldShape = new Ammo.btHeightfieldTerrainShape(
        terrainWidth,
        terrainDepth,
        ammoHeightData,
        heightScale,
        terrainMinHeight,
        terrainMaxHeight,
        upAxis,
        hdt,
        flipQuadEdges
    );

    // Set horizontal scale
    const scaleX = terrainWidthExtents / (terrainWidth - 1);
    const scaleZ = terrainDepthExtents / (terrainDepth - 1);
    heightFieldShape.setLocalScaling(new Ammo.btVector3(scaleX, 1, scaleZ));

    heightFieldShape.setMargin(0.05);

    return heightFieldShape;
}

function createObstaclePhysics(position, shape, obstacleMesh) {
    const obstacleTransform = new Ammo.btTransform();
    obstacleTransform.setIdentity();
    obstacleTransform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
    const obstacleMass = 0;
    const obstacleMotionState = new Ammo.btDefaultMotionState(obstacleTransform);
    const obstacleRbInfo = new Ammo.btRigidBodyConstructionInfo(obstacleMass, obstacleMotionState, shape, new Ammo.btVector3(0, 0, 0));
    const obstacleBody = new Ammo.btRigidBody(obstacleRbInfo);

    // Store the physics body in the mesh's userData
    obstacleMesh.userData.physicsBody = obstacleBody;

    // Associate the Three.js object with the Ammo.js body
    obstacleBody.threeObject = obstacleMesh;

    // Add the obstacle to the physics world with collision groups
    physicsWorld.addRigidBody(
        obstacleBody,
        COL_GROUP_OBSTACLE, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_ENEMY_PROJECTILE | COL_GROUP_ENEMY | COL_GROUP_TERRAIN // Collides with these groups
    );
}


// Function to calculate joystick direction vector
function getJoystickDirectionVector(angle) {
    return new THREE.Vector3(
        Math.cos(angle),
        0,
        Math.sin(angle)
    ).normalize();
}

// Function to transform local direction to world space
function transformDirectionToWorldSpace(localDirection) {
    const worldDirection = localDirection.clone();
    worldDirection.applyQuaternion(camera.quaternion);
    return worldDirection.normalize();
}


// **New Function to Add Event Listeners for Shooting Joystick**
function addShootingJoystickEventListeners() {
    // Shooting Joystick Event Handlers
    joystickKnobFire.addEventListener('pointerdown', (e) => {
        firingTouchId = e.pointerId;
        handleFireJoystickStart(e);
        e.preventDefault();
        e.stopPropagation(); // Prevent event from reaching document
    }, { passive: false });

    joystickKnobFire.addEventListener('pointermove', (e) => {
        if (e.pointerId === firingTouchId) {
            handleFireJoystick(e);
        }
        e.preventDefault();
        e.stopPropagation(); // Prevent event from reaching document
    }, { passive: false });

    joystickKnobFire.addEventListener('pointerup', (e) => {
        resetFireJoystick();
        firingTouchId = null;
        e.preventDefault();
        e.stopPropagation(); // Prevent event from reaching document
    }, { passive: false });
}


function initializeScene() {
    scene = new THREE.Scene();

    // Initialize joystick elements
    joystickContainerMove = document.getElementById('joystickContainerMove');
    joystickKnobMove = document.getElementById('joystickKnobMove');

    // **Add these references for the shooting joystick**
    joystickContainerFire = document.getElementById('joystickContainerFire');
    joystickKnobFire = document.getElementById('joystickKnobFire');


        // Movement Joystick Event Handlers
    joystickKnobMove.addEventListener('pointerdown', (e) => {
        movementTouchId = e.pointerId;
        handleMoveJoystickStart(e);
        e.preventDefault();
        e.stopPropagation(); // Prevent event from reaching document
    }, { passive: false });

    joystickKnobMove.addEventListener('pointermove', (e) => {
        if (e.pointerId === movementTouchId) {
            handleMoveJoystick(e);
        }
        e.preventDefault();
        e.stopPropagation(); // Prevent event from reaching document
    }, { passive: false });

    joystickKnobMove.addEventListener('pointerup', (e) => {
        resetMoveJoystick();
        movementTouchId = null;
        e.preventDefault();
        e.stopPropagation(); // Prevent event from reaching document
    }, { passive: false });

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 30); // Adjusted camera position
    scene.add(camera);

    addShootingJoystickEventListeners();

    // Lighting
    const hemisphereLight = new THREE.HemisphereLight(0xffd27f, 0x5e3b1d, 0.8);
    const ambientLight = new THREE.AmbientLight(0xffd4a3, 0.3);
    scene.add(hemisphereLight, ambientLight);

    const spotlight = new THREE.SpotLight(0xffe0a3, 1);
    spotlight.position.set(5, 50, -5);
    spotlight.castShadow = true;
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.3;

    spotlight.shadow.mapSize.width = 4096;
    spotlight.shadow.mapSize.height = 4096;
    spotlight.shadow.bias = -0.000001;
    scene.add(spotlight);

    // Sky
    sky = new THREE.Sky();
    sky.scale.setScalar(450000);
    const sun = new THREE.Vector3(5, 1, -10);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    scene.add(sky);

    // Create terrain mesh
    const geometry = new THREE.PlaneGeometry(terrainWidthExtents, terrainDepthExtents, terrainWidth - 1, terrainDepth - 1);
    geometry.rotateX(-Math.PI / 2);

    const vertices = geometry.attributes.position.array;
    for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
        // j + 1 because it is the y component that we modify
        vertices[j + 1] = heightData[i];
    }
    geometry.computeVertexNormals();

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    ground = new THREE.Mesh(geometry, groundMaterial);
    ground.receiveShadow = true;
    ground.castShadow = true;
    scene.add(ground);

    // Player
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
    player = new THREE.Mesh(new THREE.SphereGeometry(playerRadius, 32, 32), playerMaterial);
    player.castShadow = true;
    scene.add(player);

    // Create Player Health Bar
    createPlayerHealthBar();

    // Initialize Player Health
    playerHealth = maxPlayerHealth;
    updatePlayerHealthBar();

    // Enemy
    const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0x800080 }); // Purple color
    enemy = new THREE.Mesh(new THREE.SphereGeometry(enemyRadius, 32, 32), enemyMaterial);
    enemy.castShadow = true;
    scene.add(enemy);

    // Initialize Enemy Health
    enemyHealth = maxEnemyHealth;

    // Create Enemy Health Bar
    createEnemyHealthBar();

    // Obstacles
    const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

    // Pillar
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 32), obstacleMaterial);
    pillar.position.set(5, 2.5, 5);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);

    // Create physics for the pillar and associate the mesh
    createObstaclePhysics(pillar.position, new Ammo.btCylinderShape(new Ammo.btVector3(0.5, 2.5, 0.5)), pillar);

    // Cube
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
    cube.position.set(3, 1, 3);
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);

    // Create physics for the cube and associate the mesh
    createObstaclePhysics(cube.position, new Ammo.btBoxShape(new Ammo.btVector3(1, 1, 1)), cube);

    obstacles.push(pillar, cube);
    
    // Update shadow properties on obstacles
    obstacles.forEach(obstacle => {
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
    });

    }
    

function updatePlayerPosition() {
    if (joystickMoveAngle !== null) {
        // Calculate the movement direction based on joystick angle
        moveDirection.set(Math.cos(joystickMoveAngle), 0, Math.sin(joystickMoveAngle));

        // Apply player rotation to movement direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        moveDirection.applyQuaternion(quaternion);

        // Adjust velocity for responsive control
        const desiredVelocity = new Ammo.btVector3(
            moveDirection.x * playerSpeed,
            playerBody.getLinearVelocity().y(), // Preserve vertical velocity
            moveDirection.z * playerSpeed
        );
        playerBody.setLinearVelocity(desiredVelocity);
    } else {
        // Gradually reduce player speed when joystick is released
        const currentVelocity = playerBody.getLinearVelocity();
        playerBody.setLinearVelocity(new Ammo.btVector3(
            currentVelocity.x() * 0.9,
            currentVelocity.y(),
            currentVelocity.z() * 0.9
        ));
    }

    // Sync player mesh position with physics
    const transform = new Ammo.btTransform();
    playerBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();
    player.position.set(origin.x(), origin.y(), origin.z());
}

function updatePlayerRotation() {
    // Create a quaternion based on yaw
    const quaternion = new THREE.Quaternion();
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    // Apply the quaternion to the player mesh
    player.quaternion.copy(quaternion);
}



function updateEnemyPosition(deltaTime) {
    // If the enemy has reached a boundary, change direction
    if (Math.abs(enemy.position.x) > terrainWidthExtents / 2 - enemyRadius) {
        enemyMoveDirection.x *= -1;
    }
    if (Math.abs(enemy.position.z) > terrainDepthExtents / 2 - enemyRadius) {
        enemyMoveDirection.z *= -1;
    }

    // Apply random movement changes occasionally
    if (Math.random() < 0.02) { // Adjust the frequency of direction changes
        enemyMoveDirection.x = (Math.random() - 0.5) * 2;
        enemyMoveDirection.z = (Math.random() - 0.5) * 2;
        enemyMoveDirection.normalize();
    }

    // Set the enemy's velocity
    const velocity = new Ammo.btVector3(
        enemyMoveDirection.x * enemySpeed,
        enemyBody.getLinearVelocity().y(), // Preserve vertical velocity
        enemyMoveDirection.z * enemySpeed
    );
    enemyBody.setLinearVelocity(velocity);

    // Update the enemy's position based on physics
    const transform = new Ammo.btTransform();
    enemyBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();
    enemy.position.set(origin.x(), origin.y(), origin.z());
}

function updateEnemyAI(deltaTime) {
    // Movement Towards Player
    if (totalElapsedTime - lastEnemyMoveTime > enemyMoveTowardsPlayerFrequency) {
        moveEnemyTowardsPlayer();
        lastEnemyMoveTime = totalElapsedTime;
    }

    // Shooting at Player
    if (totalElapsedTime - lastEnemyShootTime > enemyShootFrequency) {
        enemyShootAtPlayer();
        lastEnemyShootTime = totalElapsedTime;
    }

    // Sync enemy mesh position with physics
    syncEnemyPosition();
}

function syncEnemyPosition() {
    const transform = new Ammo.btTransform();
    enemyBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();
    enemy.position.set(origin.x(), origin.y(), origin.z());
}


function moveEnemyTowardsPlayer() {
    // Calculate direction vector from enemy to player
    const directionToPlayer = new THREE.Vector3();
    directionToPlayer.subVectors(player.position, enemy.position).normalize();

    // Update enemy's movement direction
    enemyMoveDirection.copy(directionToPlayer);

    // Set enemy's velocity towards the player
    const desiredVelocity = new Ammo.btVector3(
        enemyMoveDirection.x * enemySpeed,
        enemyBody.getLinearVelocity().y(), // Preserve vertical velocity
        enemyMoveDirection.z * enemySpeed
    );
    enemyBody.setLinearVelocity(desiredVelocity);
}

function enemyShootAtPlayer() {
    if (!enemyCanShoot) return; // Prevent shooting during respawn
    if (!playerControlsEnabled) return; // Prevent shooting if player is dead or respawning

    // Get the enemy's current position
    const enemyPosition = new THREE.Vector3();
    enemyPosition.copy(enemy.position);

    // Calculate direction vector from enemy to player
    const direction = new THREE.Vector3();
    direction.subVectors(player.position, enemy.position).normalize();

    // Create the projectile with shooterType 'enemy'
    createProjectile(enemyPosition, direction, 'enemy');

    // Limit the number of projectiles
    if (projectiles.length > maxProjectiles) {
        removeOldestProjectile();
    }
}


function updateProjectiles() {
    // Iterate over all projectiles
    projectiles.forEach((projectile, index) => {
        const transform = new Ammo.btTransform();
        projectile.body.getMotionState().getWorldTransform(transform);
        const origin = transform.getOrigin();
        projectile.mesh.position.set(origin.x(), origin.y(), origin.z());

        // Optionally remove projectile if it goes out of bounds or slows down
        const velocity = projectile.body.getLinearVelocity();
        const speed = velocity.length();

        // Remove projectiles that have slowed down or fallen below the terrain
        if (speed < 0.1 || projectile.mesh.position.y < -10) {
            // Remove from scene
            scene.remove(projectile.mesh);

            // Remove physics body
            physicsWorld.removeRigidBody(projectile.body);

            // Remove from projectiles array
            projectiles.splice(index, 1);
        }
    });
}


function updatePhysics(deltaTime) {
    // Step the physics simulation
    physicsWorld.stepSimulation(deltaTime, 10);

    // Update the player's position based on the physics simulation
    const playerTransform = new Ammo.btTransform();
    playerBody.getMotionState().getWorldTransform(playerTransform);
    const playerOrigin = playerTransform.getOrigin();
    player.position.set(playerOrigin.x(), playerOrigin.y(), playerOrigin.z());

    // Update the enemy's position
    const enemyTransform = new Ammo.btTransform();
    enemyBody.getMotionState().getWorldTransform(enemyTransform);
    const enemyOrigin = enemyTransform.getOrigin();
    enemy.position.set(enemyOrigin.x(), enemyOrigin.y(), enemyOrigin.z());

    // Update the projectiles' positions and handle their lifecycle
    updateProjectiles();

    // Check for collisions between projectiles and obstacles/enemy
    checkProjectileCollisions();
}



function resetMoveJoystick() {
    joystickMoveAngle = null;
    joystickKnobMove.style.transform = 'translate(0px, 0px)';
    // Reduce speed to stop rather than instantly setting to zero
    const currentVelocity = playerBody.getLinearVelocity();
    playerBody.setLinearVelocity(new Ammo.btVector3(
        currentVelocity.x() * 0.1,
        currentVelocity.y(),
        currentVelocity.z() * 0.1
    ));
}

// Joystick Event Handlers
function handleMoveJoystickStart(event) {
    if (!playerControlsEnabled) return; // Prevent movement when controls are disabled
    const rect = joystickContainerMove.getBoundingClientRect();
    const dx = event.clientX - rect.left - 50;
    const dy = event.clientY - rect.top - 50;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 50;
    if (distance <= maxDistance) {
        joystickMoveAngle = Math.atan2(dy, dx);
    }
}

function handleMoveJoystick(event) {
    if (!playerControlsEnabled) return; // Prevent movement when controls are disabled
    const rect = joystickContainerMove.getBoundingClientRect();
    let dx = event.clientX - rect.left - 50;
    let dy = event.clientY - rect.top - 50;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 50;

    if (distance > maxDistance) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * maxDistance;
        dy = Math.sin(angle) * maxDistance;
    }
    joystickKnobMove.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickMoveAngle = Math.atan2(dy, dx);
}



function isTouchWithinJoystick(touch, joystickContainer) {
    const rect = joystickContainer.getBoundingClientRect();
    const isWithin = (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
    );
    console.log(`Touch at (${touch.clientX}, ${touch.clientY}) within joystick: ${isWithin}`);
    return isWithin;
}



document.addEventListener('touchstart', (e) => {
    for (const touch of e.changedTouches) {
        if (isTouchWithinJoystick(touch, joystickContainerMove) && movementTouchId === null) {
            movementTouchId = touch.identifier;
            handleMoveJoystickStart(touch);
        }
        else if (isTouchWithinJoystick(touch, joystickContainerFire) && firingTouchId === null) {
            firingTouchId = touch.identifier;
            handleFireJoystickStart(touch);
        }
        else if (!isTouchWithinJoystick(touch, joystickContainerMove) && !isTouchWithinJoystick(touch, joystickContainerFire) && rotationTouchId === null) {
            rotationTouchId = touch.identifier;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        }
    }
    e.preventDefault();
}, { passive: false });


document.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
        if (touch.identifier === movementTouchId) {
            handleMoveJoystick(touch);
        } else if (touch.identifier === firingTouchId) {
            handleFireJoystick(touch);
        } else if (touch.identifier === rotationTouchId) {
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;
            yaw -= deltaX * rotationSpeed;
            // Update pitch with new constraints
            pitch = Math.max(minPitch, Math.min(maxPitch, pitch + deltaY * 0.008));
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        }
    }
    e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
        if (touch.identifier === movementTouchId) {
            resetMoveJoystick();
            movementTouchId = null;
        } else if (touch.identifier === firingTouchId) {
            resetFireJoystick();
            firingTouchId = null;
        } else if (touch.identifier === rotationTouchId) {
            rotationTouchId = null;
        }
    }
    e.preventDefault();
}, { passive: false });



function updateCameraPosition() {
    const cameraDistance = 10;
    const offsetX = cameraDistance * Math.cos(pitch) * Math.sin(yaw);
    const offsetY = cameraDistance * Math.sin(pitch);
    const offsetZ = cameraDistance * Math.cos(pitch) * Math.cos(yaw);

    camera.position.set(
        player.position.x + offsetX,
        player.position.y + offsetY + 5, // Adjusted for better view
        player.position.z + offsetZ
    );
    camera.lookAt(player.position);
}


// **Handler Function When Shooting Joystick is Pressed**
function handleFireJoystickStart(event) {
    if (!playerControlsEnabled) return; // Prevent shooting when controls are disabled
    handleFireJoystick(event);
}

// **Handler Function for Shooting Joystick Movement**
function handleFireJoystick(event) {
    const rect = joystickContainerFire.getBoundingClientRect();
    let offsetX = event.clientX - rect.left - rect.width / 2;
    let offsetY = event.clientY - rect.top - rect.height / 2;
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    const maxDistance = rect.width / 2;

    if (distance > maxDistance) {
        const angle = Math.atan2(offsetY, offsetX);
        offsetX = Math.cos(angle) * maxDistance;
        offsetY = Math.sin(angle) * maxDistance;
    }

    joystickKnobFire.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    joystickFireAngle = Math.atan2(offsetY, offsetX);

    // Attempt to fire a shot if cooldown has passed
    attemptToFireShot();
}

// **Function to Attempt Firing a Shot with Cooldown**
function attemptToFireShot() {
    const currentTime = Date.now();
    if (currentTime - lastShotTime >= shootCooldown) {
        fireShot();
        lastShotTime = currentTime;
    }

    // Continue firing as long as the joystick is engaged
    if (joystickFireAngle !== null) {
        requestAnimationFrame(attemptToFireShot);
    }
}

function fireShot() {
    if (!playerControlsEnabled) return; // Ensure controls are enabled

    // Calculate shooting direction based on joystickFireAngle
    const localDirection = getJoystickDirectionVector(joystickFireAngle);

    // Transform direction to world space using camera's quaternion
    const worldDirection = transformDirectionToWorldSpace(localDirection);

    // Get player's current position
    const playerPosition = new THREE.Vector3();
    playerPosition.copy(player.position);

    // Create and fire the projectile with the correct direction
    createProjectile(playerPosition, worldDirection, 'player');

    // Limit the number of projectiles
    if (projectiles.length > maxProjectiles) {
        removeOldestProjectile();
    }
}


// **Function to Reset the Shooting Joystick**
function resetFireJoystick() {
    joystickFireAngle = null;
    joystickKnobFire.style.transform = `translate(0px, 0px)`;
    isFiring = false;
}


function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 1 / 60; // Assuming 60 FPS
    totalElapsedTime += deltaTime;

    // Update physics world
    updatePhysics(deltaTime);

    // Update player rotation and position
    updatePlayerRotation();
    updatePlayerPosition();

    // Update enemy AI (movement and shooting)
    updateEnemyAI(deltaTime);

    // Update camera position
    updateCameraPosition();

    // Update health bars to face the camera
    updateHealthBars();

    // Render the scene
    renderer.render(scene, camera);
}



loadAmmoAndStartGame();

// Perlin Noise implementation
// Based on Ken Perlin's reference implementation

const permutation = [151,160,137,91,90,15,
    131,13,201,95,96,53,194,233,7,225,140,36,
    103,30,69,142,8,99,37,240,21,10,23,
    190, 6,148,247,120,234,75,0,26,197,62,94,
    252,219,203,117,35,11,32,57,177,33,88,237,
    149,56,87,174,20,125,136,171,168, 68,175,
    74,165,71,134,139,48,27,166,77,146,158,231,
    83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54, 65,25,63,161,
    1,216,80,73,209,76,132,187,208,89,18,169,
    200,196,135,130,116,188,159,86,164,100,109,
    198,173,186, 3,64,52,217,226,250,124,123,5,
    202,38,147,118,126,255,82,85,212,207,206,59,
    227,47,16,58,17,182,189,28,42,223,183,170,
    213,119,248,152, 2,44,154,163,70,221,153,101,
    155,167, 43,172,9,129,22,39,253, 19,98,108,
    110,79,113,224,232,178,185,112,104,218,246,
    97,228,251,34,242,193,238,210,144,12,191,179,
    162,241, 81,51,145,235,249,14,239,107,49,192,
    214,31,181,199,106,157,184, 84,204,176,115,
    121,50,45,127, 4,150,254,138,236,205,93,222,
    114,67,29,24,72,243,141,128,195,78,66,215,
    61,156,180];

const p = new Array(512);
for (let i = 0; i < 256; i++) {
    p[256 + i] = p[i] = permutation[i];
}

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t, a, b) {
    return a + t * (b - a);
}

function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y,
        v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

function perlinNoise(x, y, z = 0) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;

    const res = lerp(w, lerp(v, lerp(u, grad(p[AA], x, y, z),
                                    grad(p[BA], x - 1, y, z)),
                                lerp(u, grad(p[AB], x, y - 1, z),
                                    grad(p[BB], x - 1, y - 1, z))),
                        lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1),
                                    grad(p[BA + 1], x - 1, y, z - 1)),
                                lerp(u, grad(p[AB + 1], x, y - 1, z - 1),
                                    grad(p[BB + 1], x - 1, y - 1, z - 1))));
    return (res + 1) / 2; // Normalize to [0,1]
}
