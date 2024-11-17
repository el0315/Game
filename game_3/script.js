let scene, camera, renderer, player, ground, sky;
let obstacles = [];
let collectibles = [];
let trees = [];
let rotatingSpikes = [];
let logs = [];

// Player Inventory
let playerInventory = {
    logs: 0,
};

// Define proximity threshold (e.g., 3 units)
const chopProximity = 3;

// Variable to store the current target tree
let currentTargetTree = null;


// Add other arrays as needed


let physicsWorld, playerBody;
let yaw = 0, pitch = 0;

const maxPitch = Math.PI / 2;   // Existing maximum pitch (looking straight up)
const minPitch = -Math.PI / 6;  // New minimum pitch (looking 45 degrees down)

let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;

const maxAccuracyDeviation = 15; // Maximum deviation in degrees


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
const enemyShootFrequency = 8; // Seconds between shooting actions

// Enemy Jump Mechanics Constants
const enemyJumpForce = 10;        // Upward force applied during a jump
const enemyJumpInterval = 5000;   // Time between jumps in milliseconds (e.g., every 5 seconds)

// Enemy Jump Timer
let enemyJumpTimer = 0;


// Internal tracking variables
let lastEnemyMoveTime = 0;
let lastEnemyShootTime = 0;
let totalElapsedTime = 0; // Total time since the game started

// Jump Mechanics Constants
const jumpForce = 10;         // Upward force applied during a jump

// Jump State Variables
let jumpStartTime = null;
let isJumping = false;

// References to Jump Button Elements
let jumpButton, jumpRing, jumpKnob;
// References to Shooting Button Elements
let shootButton, shootKnob;

// Collectibles
const collectibleMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFFD700, 
    emissive: 0xFFD700, 
    emissiveIntensity: 0.5,
    transparent: true, 
    opacity: 1 
});

let fireflies = [];
const fireflyCount = 100;
const fireflyRange = 80; // Distance range for fireflies from the center
const fireflySpeed = 0.2; // Movement speed of fireflies


// Rotating Spikes
const spikeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xFF0000, 
    emissive: 0xFF0000, 
    emissiveIntensity: 0.3,
    transparent: true, 
    opacity: 1 
});


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
const terrainMaxHeight = 8; // Maximum height of the terrain
const terrainMinHeight = 1; // Minimum height of the terrain
let heightData = null;
let ammoHeightData = null;


// Global variables for projectiles
let projectiles = [];
const projectileSpeed = 50;
const projectileRadius = 0.2;
const projectileMass = 1;
const maxProjectiles = 20; // Limit the number of active projectiles




function createProjectile(position, direction, owner) {
    // Create projectile mesh
    const projectileGeometry = new THREE.SphereGeometry(projectileRadius, 16, 16);
    const projectileMaterial = new THREE.MeshStandardMaterial({ color: owner === 'player' ? 0xffff00 : 0xff0000 }); // Yellow for player, red for enemy
    const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectileMesh.position.copy(position);
    scene.add(projectileMesh);

    // Create Ammo.js physics body for the projectile
    const mass = projectileMass;
    const shape = new Ammo.btSphereShape(projectileRadius);
    shape.setMargin(0.05);

    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
    const motionState = new Ammo.btDefaultMotionState(transform);

    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);
    body.setFriction(0);
    body.setRestitution(0.5);
    body.setActivationState(4); // Disable deactivation

    // Assign shooterType for collision detection
    body.shooterType = owner; // 'player' or 'enemy'

    // Set collision groups and masks
    if (owner === 'player') {
        physicsWorld.addRigidBody(body, COL_GROUP_PLAYER_PROJECTILE, COL_GROUP_ENEMY | COL_GROUP_OBSTACLE | COL_GROUP_TERRAIN);
    } else if (owner === 'enemy') {
        physicsWorld.addRigidBody(body, COL_GROUP_ENEMY_PROJECTILE, COL_GROUP_PLAYER | COL_GROUP_OBSTACLE | COL_GROUP_TERRAIN);
    }

    // Set velocity based on direction and speed
    body.setLinearVelocity(new Ammo.btVector3(direction.x * projectileSpeed, direction.y * projectileSpeed, direction.z * projectileSpeed));

    // Associate the Three.js mesh with the Ammo.js body
    body.threeObject = projectileMesh;

    // Track the projectile
    projectiles.push({ body: body, mesh: projectileMesh });
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

function checkTreeProximity() {
    let nearbyTree = null;

    trees.forEach(tree => {
        const distance = player.position.distanceTo(tree.position);
        if (distance <= chopProximity && !tree.isBeingChopped) {
            nearbyTree = tree;
        }
    });

    if (nearbyTree) {
        showActionButton('Chop Tree', () => initiateChopping(nearbyTree), 'chopTree');
    } else {
        hideActionButton('chopTree');
    }
}


function addToInventory(item, quantity = 1) {
    if (playerInventory.hasOwnProperty(item)) {
        playerInventory[item] += quantity;
    } else {
        playerInventory[item] = quantity;
    }
    updateInventoryUI();
}

function removeFromInventory(item, quantity = 1) {
    if (playerInventory.hasOwnProperty(item)) {
        playerInventory[item] = Math.max(playerInventory[item] - quantity, 0);
        updateInventoryUI();
    }
}


// References to the chop button
const chopButton = document.getElementById('chopButton');
const chopButtonElement = chopButton.querySelector('button');

// Function to show the chop button
function showChopButton() {
    chopButton.style.display = 'flex';
    console.log('Chop button displayed.');
}

// Function to hide the chop button
function hideChopButton() {
    chopButton.style.display = 'none';
    console.log('Chop button hidden.');
}

chopButtonElement.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log('Chop button pressed.');
    if (currentTargetTree && playerControlsEnabled) {
        console.log('Initiating chopping on currentTargetTree.');
        initiateChopping(currentTargetTree);
    } else {
        console.log('No valid target to chop or controls disabled.');
    }
});


function initiateChopping(tree) {
    tree.isBeingChopped = true; // Prevent re-chopping


    // Simulate chopping progress over time
    const chopDuration = 1000; // Duration in milliseconds
    const chopSteps = 10;
    let chopsDone = 0;

    const chopInterval = setInterval(() => {
        chopsDone++;
        // Optionally, update a progress bar or visual indicator

        if (chopsDone >= chopSteps) {
            clearInterval(chopInterval);
            chopTree(tree);
        }
    }, chopDuration / chopSteps);
}


function chopTree(tree) {
    console.log('Chopping Tree:', tree);
    
    // Ensure tree exists in scene
    if (!tree) {
        console.error('Chop action called on undefined tree.');
        return;
    }

    // Initiate rotation animation to tip the tree
    const initialRotation = { x: tree.rotation.x, y: tree.rotation.y, z: tree.rotation.z };
    const tippedRotation = { x: tree.rotation.x + Math.PI / 2, y: tree.rotation.y, z: tree.rotation.z }; // 90 degrees on X-axis

    const rotationTween = new TWEEN.Tween(initialRotation)
        .to(tippedRotation, 500) // 500ms duration
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            tree.rotation.set(initialRotation.x, initialRotation.y, initialRotation.z);
        })
        .onComplete(() => {
            console.log('Tipping animation completed. Removing tree and spawning logs.');
            // After tipping, remove the tree from scene and physics
            removeTree(tree);

            // Spawn logs at tree's position
            spawnLogs(tree.position);
        })
        .onStart(() => {
            console.log('Tipping animation started.');
        })
        .start();
    
    console.log('Tipping animation started for the tree.');
}



function removeTree(tree) {
    console.log('Removing Tree:', tree);
    
    // Remove from physics world
    if (tree.physicsBody) {
        physicsWorld.removeRigidBody(tree.physicsBody);
        Ammo.destroy(tree.physicsBody.getMotionState());
        Ammo.destroy(tree.physicsBody.getCollisionShape());
        tree.physicsBody = null; // Prevent future references
        console.log('Physics body removed from the tree.');
    } else {
        console.warn('Tree has no physicsBody to remove.');
    }
    
    // Remove all child meshes (trunk and foliage) from the scene
    tree.children.forEach(child => {
        scene.remove(child);
    });
    console.log('Removed all child meshes from the scene.');

    // Remove tree from Three.js scene
    scene.remove(tree);
    console.log('Tree removed from the Three.js scene.');
    
    // Remove from trees array
    const treeIndex = trees.indexOf(tree);
    if (treeIndex > -1) {
        trees.splice(treeIndex, 1);
        console.log(`Tree ${treeIndex + 1} removed from trees array.`);
    }

    // Remove from obstacles array if necessary
    const obstacleIndex = obstacles.indexOf(tree);
    if (obstacleIndex > -1) {
        obstacles.splice(obstacleIndex, 1);
        console.log(`Tree ${obstacleIndex + 1} removed from obstacles array.`);
    }
    
    // Spawn logs at tree's position
    spawnLogs(tree.position);
    console.log('Logs spawned at the tree\'s position.');
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

function isPlayerBody(body) {
    return body === playerBody;
}

function isEnemyBody(body) {
    return body === enemyBody;
}

function isObstacleBody(body) {
    return obstacles.some(obstacle => obstacle.userData.physicsBody === body);
}

// Initialize Inventory UI
function updateInventoryUI() {
    const logCountElement = document.getElementById('logCount');
    if (logCountElement) {
        logCountElement.innerText = `Logs: ${playerInventory.logs}`;
    }
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
}


// Helper functions to identify projectiles and obstacles
function isProjectileBody(body) {
    return projectiles.some(projectile => projectile.body === body);
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
    heightData = smoothHeightData(heightData, terrainWidth, terrainDepth);

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

    // Multiple octaves for richer terrain
    const octaves = 4;
    const persistence = 0.5;

    for (let j = 0; j < depth; j++) {
        for (let i = 0; i < width; i++) {
            let amplitude = 1;
            let frequency = 1;
            let noiseHeight = 0;

            for (let o = 0; o < octaves; o++) {
                const x = (i / width) * frequency;
                const y = (j / depth) * frequency;
                noiseHeight += perlinNoise(x, y) * amplitude;
                amplitude *= persistence;
                frequency *= 2;
            }

            // Normalize to [minHeight, maxHeight]
            noiseHeight = noiseHeight / (1 - Math.pow(persistence, octaves)) * hRange + minHeight;
            data[p] = noiseHeight;
            p++;
        }
    }

    return data;
}
function smoothHeightData(heightData, width, depth, iterations = 2) {
    for (let it = 0; it < iterations; it++) {
        const newData = heightData.slice();
        for (let j = 1; j < depth - 1; j++) {
            for (let i = 1; i < width - 1; i++) {
                const index = j * width + i;
                newData[index] = (
                    heightData[index] +
                    heightData[index - 1] +
                    heightData[index + 1] +
                    heightData[index - width] +
                    heightData[index + width]
                ) / 5;
            }
        }
        heightData = newData;
    }
    return heightData;
}

function createTerrainShape() {
    const heightScale = 1;
    const upAxis = 1;
    const hdt = "PHY_FLOAT";
    const flipQuadEdges = false;

    // Check if memory is already allocated
    if (!ammoHeightData) {
        const bufferSize = 4 * terrainWidth * terrainDepth; // 4 bytes per float
        ammoHeightData = Ammo._malloc(bufferSize);
        if (!ammoHeightData) {
            console.error("Failed to allocate memory for terrain height data.");
            return null;
        }
    }

    // Copy height data into Ammo.js heap
    Ammo.HEAPF32.set(heightData, ammoHeightData >> 2);

    // Create heightfield shape
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

    // Set horizontal scaling
    const scaleX = terrainWidthExtents / (terrainWidth - 1);
    const scaleZ = terrainDepthExtents / (terrainDepth - 1);
    heightFieldShape.setLocalScaling(new Ammo.btVector3(scaleX, 1, scaleZ));

    heightFieldShape.setMargin(0.05);

    return heightFieldShape;
}



function createRandomObstacles(count) {
    const obstacleTypes = ['cone']; // Add more types as needed
    for (let i = 0; i < count; i++) {
        const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
        let obstacleMesh;
        let shape;
        let height; // Declare height here
        let radius;
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * terrainWidthExtents,
            0, // Y will be set based on terrain height
            (Math.random() - 0.5) * terrainDepthExtents
        );

        switch(type) {
            case 'cone':
                radius = Math.random() * 1 + 0.5; // Radius between 0.5 and 1.5
                height = Math.random() * 2 + 1;  // Height between 1 and 3

                obstacleMesh = new THREE.Mesh(
                    new THREE.ConeGeometry(radius, height, 32),
                    new THREE.MeshStandardMaterial({ color: 0xCD853F })
                );

                shape = new Ammo.btConeShape(radius, height);

                break;

            default:
                console.warn(`Unknown obstacle type: ${type}. Skipping creation.`);
                continue;
        }

        // Ensure cone sits on the terrain
        const terrainHeight = getTerrainHeightAt(position.x, position.z);
        obstacleMesh.position.set(position.x, terrainHeight + (height / 2), position.z);
        obstacleMesh.castShadow = true;
        obstacleMesh.receiveShadow = true;
        scene.add(obstacleMesh);

        // Create physics for the obstacle
        createObstaclePhysics(obstacleMesh.position, shape, obstacleMesh);
        obstacles.push(obstacleMesh);

        // **Initialize sprite-based smoke pool for this obstacle**
        createSpriteSmokeEffect(obstacleMesh, height);
    }
}



// Global variable to store the smoke texture
let smokeTexture = null;

// Function to create sprite-based smoke effect with pooling
function createSpriteSmokeEffect(obstacleMesh, coneHeight) {
    const smokePoolSize = 5; // Number of smoke sprites per obstacle
    const smokeSprites = []; // Pool array for smoke sprites

    for (let i = 0; i < smokePoolSize; i++) {
        // Create a canvas to draw the smoke texture
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Draw a radial gradient for the smoke
        const gradient = ctx.createRadialGradient(32, 32, 10, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)'); // White center for visibility
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)'); // Transparent edges
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)'); // Fully transparent

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Create a texture from the canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        // Create sprite material using the generated texture
        const smokeMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.5, // Start fully opaque
            depthWrite: false,
            depthTest: false, // Ensure it's rendered on top
            blending: THREE.AdditiveBlending // Brighter blending mode
        });

        // Create the sprite
        const smokeSprite = new THREE.Sprite(smokeMaterial);
        smokeSprite.position.set(
            obstacleMesh.position.x,
            obstacleMesh.position.y + coneHeight + 0.5, // Position slightly above the obstacle
            obstacleMesh.position.z
        );
        smokeSprite.scale.set(3, 3, 1); // Adjust size as needed
        smokeSprite.renderOrder = 1; // Ensure it renders on top
        scene.add(smokeSprite);

        // Initialize sprite as inactive
        smokeSprite.visible = false;

        // Add to pool
        smokeSprites.push(smokeSprite);
    }

    // Attach the smoke pool to the obstacle mesh for easy access
    obstacleMesh.userData.smokePool = {
        sprites: smokeSprites,
        nextIndex: 0 // To keep track of which sprite to emit next
    };

    // Start emitting smoke
    emitSmoke(obstacleMesh, coneHeight);
}

// Function to emit smoke continuously
function emitSmoke(obstacleMesh, coneHeight) {
    const smokePool = obstacleMesh.userData.smokePool;
    const emitInterval = 1000; // Time between emissions in milliseconds

    setInterval(() => {
        const sprite = smokePool.sprites[smokePool.nextIndex];

        // Reset sprite properties
        sprite.position.set(
            obstacleMesh.position.x,
            obstacleMesh.position.y + coneHeight + 0.5,
            obstacleMesh.position.z
        );
        sprite.scale.set(3, 3, 1);
        sprite.material.opacity = 0.5;
        sprite.visible = true;

        // Animate upward movement
        new TWEEN.Tween(sprite.position)
            .to({ y: sprite.position.y + 2 }, 2000) // Move up by 2 units over 2 seconds
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();

        // Animate fading opacity
        new TWEEN.Tween(sprite.material)
            .to({ opacity: 0 }, 2000) // Fade out over 2 seconds
            .easing(TWEEN.Easing.Quadratic.Out)
            .onComplete(() => {
                sprite.visible = false; // Hide sprite after fading
            })
            .start();

        // Update nextIndex for pooling
        smokePool.nextIndex = (smokePool.nextIndex + 1) % smokePool.sprites.length;
    }, emitInterval);
}

let destroyedBoat, repairMessage;

let boatRepaired = false; // Track if the boat is repaired

// Add the boat to the scene
function createDestroyedBoat() {
    destroyedBoat = new THREE.Group();

    // Boat base (cylinder)
    const baseGeometry = new THREE.CylinderGeometry(0.5, 0.5, 5, 16);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Same color as logs
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.rotation.z = Math.PI / 2; // Rotate to lie flat
    baseMesh.position.set(0, 0.5, 0); // Adjust height
    destroyedBoat.add(baseMesh);

    // Boat fragments (broken pieces)
    for (let i = 0; i < 3; i++) {
        const fragmentGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);
        const fragmentMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const fragmentMesh = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
        fragmentMesh.rotation.z = Math.PI / 2;
        fragmentMesh.position.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
        fragmentMesh.rotation.y = Math.random() * Math.PI;
        destroyedBoat.add(fragmentMesh);
    }

    // Position boat in water
    const position = new THREE.Vector3(10, getTerrainHeightAt(10, 10) + 0.5, 10);
    destroyedBoat.position.copy(position);

    // Add to scene
    scene.add(destroyedBoat);

    // Add collision detection
    createBoatPhysics(destroyedBoat);

    // Create the repair message
    createRepairMessage();
}

function showRepairMessage() {
    if (repairMessageMesh) {
        repairMessageMesh.visible = true;
    }
}

function hideRepairMessage() {
    if (repairMessageMesh) {
        repairMessageMesh.visible = false;
    }
}

// Add collision detection for the boat
function createBoatPhysics(boat) {
    const compoundShape = new Ammo.btCompoundShape();

    boat.children.forEach(child => {
        const shape = new Ammo.btCylinderShape(new Ammo.btVector3(0.5, 2.5, 0.5));
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(child.position.x, child.position.y, child.position.z));
        compoundShape.addChildShape(transform, shape);
    });

    createObstaclePhysics(boat.position, compoundShape, boat);
}

const repairProximity = 5; // Distance threshold for showing the message
let isNearBoat = false;

const repairLogRequirement = 0; // Define the log requirement for repairing

function checkBoatProximity() {
    if (!destroyedBoat || boatRepaired) return;

    const distance = player.position.distanceTo(destroyedBoat.position);
    if (distance <= repairProximity) {
        if (playerInventory.logs >= repairLogRequirement) {
            showActionButton('Repair Boat', repairBoat, 'repairBoat');
        } else {
            hideActionButton('repairBoat');
            showRepairMessage();
        }
    } else {
        hideRepairMessage();
        hideActionButton('repairBoat');
    }
}



let repairMessageMesh = null;
function createRepairMessage() {
    if (!destroyedBoat) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    // Draw message background
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw text
    context.fillStyle = '#FFFFFF';
    context.font = '18px Arial';
    context.textAlign = 'center';
    context.fillText('10 logs to repair the boat', canvas.width / 2, canvas.height / 2 + 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    repairMessageMesh = new THREE.Sprite(spriteMaterial);

    // Position the message slightly above the destroyed boat
    repairMessageMesh.position.set(
        destroyedBoat.position.x,
        destroyedBoat.position.y + 2, // Adjust height
        destroyedBoat.position.z
    );
    repairMessageMesh.scale.set(5, 2, 1); // Adjust size

    scene.add(repairMessageMesh);
    repairMessageMesh.visible = false; // Initially hidden
}



function repairBoat() {
    if (boatRepaired) return; // Prevent multiple repairs

    if (playerInventory.logs >= repairLogRequirement) {
        removeFromInventory('logs', repairLogRequirement); // Deduct logs
        completeBoatRepair(); // Perform the repair
        boatRepaired = true; // Mark as repaired
        hideActionButton('repairBoat'); // Hide the button with correct context
        hideRepairMessage(); // Ensure the message is hidden after repair

        console.log('Boat has been repaired. Repair button will no longer be shown.');
    } else {
        console.log('Not enough logs to repair the boat.');
    }
}



function completeBoatRepair() {
    console.log('Boat repair completed!');
    scene.remove(destroyedBoat); // Remove the destroyed boat

    // Create a new group for the repaired boat
    const repairedBoat = new THREE.Group();

    // Create the hull (simple cylinder)
    const hullGeometry = new THREE.CylinderGeometry(0.5, 0.5, 4, 8); // Small cylinder
    const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Wooden color
    const hullMesh = new THREE.Mesh(hullGeometry, hullMaterial);
    hullMesh.rotation.z = Math.PI / 2; // Rotate horizontally
    hullMesh.position.y = 0.5; // Slightly above water level
    repairedBoat.add(hullMesh);

    // Create the mast
    const mastGeometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 8); // Thin vertical cylinder
    const mastMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF }); // White color
    const mastMesh = new THREE.Mesh(mastGeometry, mastMaterial);
    mastMesh.position.y = 2.5; // Centered vertically above the hull
    repairedBoat.add(mastMesh);

    // Create a simple sail
    const sailGeometry = new THREE.PlaneGeometry(2, 3); // Small rectangular sail
    const sailMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
    });
    const sailMesh = new THREE.Mesh(sailGeometry, sailMaterial);
    sailMesh.position.y = 3; // Attached to the mast
    sailMesh.position.z = -0.5; // Slightly behind the mast
    repairedBoat.add(sailMesh);

    // Add rudder (small rectangle at the back)
    const rudderGeometry = new THREE.BoxGeometry(0.2, 0.5, 0.1);
    const rudderMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const rudderMesh = new THREE.Mesh(rudderGeometry, rudderMaterial);
    rudderMesh.position.set(-2.1, 0.5, 0); // Positioned at the back of the hull
    repairedBoat.add(rudderMesh);

    // Add the repaired boat to the scene
    repairedBoat.position.copy(destroyedBoat.position);
    repairedBoat.position.y -= 0.7; // Ensure it sits properly in the water
    scene.add(repairedBoat);

    console.log('Simplified repaired boat added to the scene!');
}



const actionButtonText = document.getElementById('actionButtonText');
const actionButtonIcon = document.getElementById('actionButtonIcon');
const actionButton = document.getElementById('actionButton');

// Current action callback
let currentAction = null;
let currentActionContext = null; // Tracks the active context for the action button
const actionPriorities = {
    repairBoat: 2,
    chopTree: 1,
}; // Higher values mean higher priority

/**
 * Show the multifunctional action button.
 * @param {string} message - The text to display on the button.
 * @param {function|null} actionCallback - The function to call when the button is pressed.
 */
function showActionButton(message, actionCallback, context) {
    // Prevent lower-priority actions from overriding
    if (currentActionContext && actionPriorities[context] <= actionPriorities[currentActionContext]) {
        console.log(`Skipping action button update for context: ${context}`);
        return;
    }

    console.log(`Updating action button for context: ${context}`);
    actionButton.textContent = message;
    actionButton.style.display = 'flex';
    currentAction = actionCallback;
    currentActionContext = context; // Update the context
}



/**
 * Hide the multifunctional action button.
 */
function hideActionButton(context) {
    // Only hide the button if the current context matches
    if (currentActionContext === context) {
        console.log(`Hiding action button for context: ${context}`);
        actionButton.style.display = 'none';
        currentAction = null;
        currentActionContext = null;
    }
}


// Attach event listener to the button
actionButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (currentAction) {
        currentAction(); // Execute the callback
    }
});


function createWaterBodies() {
    const waterGeometry = new THREE.PlaneGeometry(20, 20);
    const waterMaterial = new THREE.MeshPhongMaterial({ color: 0x1E90FF, transparent: true, opacity: 0.6 });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(10, getTerrainHeightAt(10, 10) + 0.1, 10); // Slightly above terrain
    scene.add(water);
}

function createRotatingSpikePhysics(spikeMesh) {
    const mass = 0; // Static object
    const shape = new Ammo.btConeShape(0.5, 2); // Cone shape with radius 0.5 and height 2

    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(spikeMesh.position.x, spikeMesh.position.y, spikeMesh.position.z));
    const motionState = new Ammo.btDefaultMotionState(transform);

    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);
    body.setFriction(0.5);
    body.setRestitution(0.1);
    body.setCollisionFlags(body.getCollisionFlags() | 2); // Make it a static object

    // Tag the body as a rotating spike for collision handling
    body.userData = { type: 'rotatingSpike' };

    physicsWorld.addRigidBody(
        body,
        COL_GROUP_OBSTACLE, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_ENEMY | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_ENEMY_PROJECTILE | COL_GROUP_TERRAIN // Collision mask
    );

    // Associate the Three.js mesh with the Ammo.js body
    spikeMesh.userData.physicsBody = body;
    body.threeObject = spikeMesh;
}


function updateRotatingSpikes(deltaTime) {
    rotatingSpikes.forEach(spike => {
        spike.rotation.y += deltaTime; // Rotate over time
        // Optionally, limit rotation angles to prevent floating-point precision issues
        spike.rotation.y %= Math.PI * 2;
    });
}


function createCollectibles(count) {
    for (let i = 0; i < count; i++) {
        const collectible = new THREE.Mesh(
            new THREE.TetrahedronGeometry(0.5),
            collectibleMaterial // Use the predefined material
        );

        // Random position on terrain
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * terrainWidthExtents,
            0, // Y will be set based on terrain height
            (Math.random() - 0.5) * terrainDepthExtents
        );
        const terrainHeight = getTerrainHeightAt(position.x, position.z);

        // Calculate half the height of the collectible
        const collectibleHeight = 2 * 0.5 * Math.sqrt(2 / 3); // Height of a regular tetrahedron with radius 0.5
        const halfHeight = collectibleHeight / 2;

        collectible.position.set(
            position.x,
            terrainHeight + halfHeight,
            position.z
        );

        collectible.castShadow = true;
        collectible.receiveShadow = true;
        scene.add(collectible);
        collectibles.push(collectible);

        // Add physics body for collision detection
        createCollectiblePhysics(collectible);

        console.log(`Collectible ${i + 1} created at position: (${collectible.position.x}, ${collectible.position.y}, ${collectible.position.z})`);
    }
}

function createRotatingSpikes(count) {
    for (let i = 0; i < count; i++) {
        const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.5, 2, 8),
            spikeMaterial // Use the predefined material
        );
        spike.rotation.x = Math.PI / 2; // Pointing upwards

        // Random position on terrain
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * terrainWidthExtents,
            0, // Y will be set based on terrain height
            (Math.random() - 0.5) * terrainDepthExtents
        );
        const terrainHeight = getTerrainHeightAt(position.x, position.z);

        // Spike height is 2, so half is 1
        spike.position.set(
            position.x,
            terrainHeight + 1, // 1 is half the spike's height to sit on terrain
            position.z
        );

        spike.castShadow = true;
        spike.receiveShadow = true;
        scene.add(spike);
        rotatingSpikes.push(spike);

        // Add physics body for collision detection
        createRotatingSpikePhysics(spike);

        console.log(`Rotating Spike ${i + 1} created at position: (${spike.position.x}, ${spike.position.y}, ${spike.position.z})`);
    }
}



function createCollectiblePhysics(collectibleMesh) {
    const mass = 0; // Static object
    const shape = new Ammo.btSphereShape(0.5); // Approximated as a sphere

    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(collectibleMesh.position.x, collectibleMesh.position.y, collectibleMesh.position.z));
    const motionState = new Ammo.btDefaultMotionState(transform);

    const localInertia = new Ammo.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);
    body.setFriction(0.5);
    body.setRestitution(0.1);
    body.setCollisionFlags(body.getCollisionFlags() | 2); // Make it a static object

    // Tag the body as a collectible for collision handling
    body.userData = { type: 'collectible' };

    physicsWorld.addRigidBody(
        body,
        COL_GROUP_OBSTACLE, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_ENEMY | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_ENEMY_PROJECTILE | COL_GROUP_TERRAIN // Collision mask
    );

    // Associate the Three.js mesh with the Ammo.js body
    collectibleMesh.userData.physicsBody = body;
    body.threeObject = collectibleMesh;
}

function createTrees(count) {
    for (let i = 0; i < count; i++) {
        const tree = new THREE.Group();

        // Trunk
        const trunkHeight = Math.random() * 1 + 1; // Random trunk height between 1 and 2
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, trunkHeight, 8),
            new THREE.MeshStandardMaterial({ color: 0x8B4513 }) // SaddleBrown color
        );
        trunk.position.y = trunkHeight / 2; // Position trunk so its base is at y=0
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        tree.add(trunk);

        // Foliage
        const foliageHeight = Math.random() * 2 + 1; // Random foliage height between 1 and 3
        const foliage = new THREE.Mesh(
            new THREE.ConeGeometry(0.8, foliageHeight, 8),
            new THREE.MeshStandardMaterial({ color: 0x228B22 }) // ForestGreen color
        );
        foliage.position.y = trunkHeight + foliageHeight / 2; // Position foliage on top of the trunk
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        tree.add(foliage);

        // Position on terrain
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * terrainWidthExtents,
            0, // Y will be set based on terrain height and tree height
            (Math.random() - 0.5) * terrainDepthExtents
        );
        const terrainHeight = getTerrainHeightAt(position.x, position.z);

        // Calculate total tree height
        const totalTreeHeight = trunkHeight + foliageHeight;

        // Log terrain height and tree position for debugging
        console.log(`Tree ${i + 1}: Terrain Height = ${terrainHeight}, Total Tree Height = ${totalTreeHeight}`);

        // Correct Y-position: set tree base to terrainHeight
        tree.position.set(
            position.x,
            terrainHeight, // Base at terrain height
            position.z
        );

        // Avoid overlapping with player/enemy
        if (position.distanceTo(player.position) < 5 || position.distanceTo(enemy.position) < 5) {
            console.log(`Tree ${i + 1} overlaps with player or enemy. Repositioning.`);
            i--;
            continue;
        }

        // Add tree to scene and tracking arrays
        scene.add(tree);
        trees.push(tree); // Separate trees array
        obstacles.push(tree); // Trees as obstacles

        // Create Ammo.js physics body for the tree
        const trunkShape = new Ammo.btCylinderShape(new Ammo.btVector3(0.2, trunkHeight / 2, 0.2));
        const foliageShape = new Ammo.btConeShape(0.8, foliageHeight);

        // Position shapes relative to the tree
        const compoundShape = new Ammo.btCompoundShape();
        const transformTrunk = new Ammo.btTransform();
        transformTrunk.setIdentity();
        transformTrunk.setOrigin(new Ammo.btVector3(0, trunkHeight / 2, 0));
        compoundShape.addChildShape(transformTrunk, trunkShape);

        const transformFoliage = new Ammo.btTransform();
        transformFoliage.setIdentity();
        transformFoliage.setOrigin(new Ammo.btVector3(0, trunkHeight + foliageHeight / 2, 0));
        compoundShape.addChildShape(transformFoliage, foliageShape);

        createObstaclePhysics(tree.position, compoundShape, tree);
        console.log(`Tree ${i + 1} created and physics body assigned.`);
    }
}



function spawnLogs(position) {
    const logCount = 1; // Number of logs per tree
    for (let i = 0; i < logCount; i++) {
        // Create log mesh
        const logGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const logMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown color
        const logMesh = new THREE.Mesh(logGeometry, logMaterial);
        logMesh.position.copy(position).add(new THREE.Vector3(
            (Math.random() - 0.5) * 1, // Slight random offset
            0.5,
            (Math.random() - 0.5) * 1
        ));
        logMesh.castShadow = true;
        logMesh.receiveShadow = true;
        scene.add(logMesh);

        // Create Ammo.js physics body for the log
        const logShape = new Ammo.btCylinderShape(new Ammo.btVector3(0.1, 0.5, 0.1));
        const logTransform = new Ammo.btTransform();
        logTransform.setIdentity();
        logTransform.setOrigin(new Ammo.btVector3(logMesh.position.x, logMesh.position.y, logMesh.position.z));
        const logMass = 1; // Adjust mass as needed
        const logMotionState = new Ammo.btDefaultMotionState(logTransform);
        const logLocalInertia = new Ammo.btVector3(0, 0, 0);
        logShape.calculateLocalInertia(logMass, logLocalInertia);
        const logRbInfo = new Ammo.btRigidBodyConstructionInfo(logMass, logMotionState, logShape, logLocalInertia);
        const logBody = new Ammo.btRigidBody(logRbInfo);
        logBody.setFriction(0.5);
        logBody.setRestitution(0.1);
        physicsWorld.addRigidBody(logBody);

        // Associate the Three.js mesh with the Ammo.js body
        logBody.threeObject = logMesh;

        // Track the log
        logs.push({ mesh: logMesh, body: logBody });

        console.log(`Log ${i + 1} spawned at position: (${logMesh.position.x.toFixed(2)}, ${logMesh.position.y.toFixed(2)}, ${logMesh.position.z.toFixed(2)})`);
    }
}



// Handle Log Collection Function (as defined earlier)
function handleLogCollection() {
    logs.forEach((log, index) => {
        if (player.position.distanceTo(log.mesh.position) <= 1) { // Collection range
            // Add log to inventory
            playerInventory.logs += 1;
            updateInventoryUI();

            // Remove log from scene and physics world
            scene.remove(log.mesh);
            physicsWorld.removeRigidBody(log.body);

            // Remove from logs array
            logs.splice(index, 1);

            console.log('Log collected!');
        }
    });
}

function createFireflies() {
    const fireflyGeometry = new THREE.CircleGeometry(0.1, 2); // Simplified geometry
    const fireflyMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFAA,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });

    const fireflyCount = 25;
    const fireflyMesh = new THREE.InstancedMesh(fireflyGeometry, fireflyMaterial, fireflyCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < fireflyCount; i++) {
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * fireflyRange,
            Math.random() * 10 + 5,
            (Math.random() - 0.5) * fireflyRange
        );
        dummy.position.copy(position);
        dummy.updateMatrix();
        fireflyMesh.setMatrixAt(i, dummy.matrix);
    }

    scene.add(fireflyMesh);
    fireflies.push(fireflyMesh);
}

function updateFireflies() {
    const dummy = new THREE.Object3D();
    fireflies.forEach(fireflyMesh => {
        for (let i = 0; i < fireflyMesh.count; i++) {
            fireflyMesh.getMatrixAt(i, dummy.matrix);
            dummy.position.setFromMatrixPosition(dummy.matrix);
            
            // Move slightly
            dummy.position.x += (Math.random() - 0.5) * fireflySpeed;
            dummy.position.y += (Math.random() - 0.5) * fireflySpeed;
            dummy.position.z += (Math.random() - 0.5) * fireflySpeed;

            // Reposition if out of bounds
            const spotlightCenter = new THREE.Vector3(5, 50, -5);
            const distanceToSpotlight = dummy.position.distanceTo(spotlightCenter);
            if (distanceToSpotlight < 30 || dummy.position.length() > fireflyRange) {
                dummy.position.set(
                    (Math.random() - 0.5) * fireflyRange,
                    Math.random() * 10 + 5,
                    (Math.random() - 0.5) * fireflyRange
                );
            }

            dummy.updateMatrix();
            fireflyMesh.setMatrixAt(i, dummy.matrix);
        }
        fireflyMesh.instanceMatrix.needsUpdate = true;
    });
}


function darkenBackgroundLighting() {
    // Adjust the ambient light to be dimmer
    const ambientLight = new THREE.AmbientLight(0x0d1b2a, 0.2); // Dark blue for a night-like effect
    scene.add(ambientLight);

    // Adjust hemisphere light with darker color
    const hemisphereLight = new THREE.HemisphereLight(0x111111, 0x0d1b2a, 0.3);
    scene.add(hemisphereLight);
}


function getTerrainHeightAt(x, z) {
    // Convert world coordinates to grid indices
    const gridX = Math.floor((x + terrainWidthExtents / 2) / (terrainWidthExtents / terrainWidth));
    const gridZ = Math.floor((z + terrainDepthExtents / 2) / (terrainDepthExtents / terrainDepth));

    // Clamp indices to valid range
    const clampedX = THREE.MathUtils.clamp(gridX, 0, terrainWidth - 1);
    const clampedZ = THREE.MathUtils.clamp(gridZ, 0, terrainDepth - 1);

    const index = clampedZ * terrainWidth + clampedX;

    if (index >= 0 && index < heightData.length) {
        return heightData[index];
    }

    // Fallback if out of bounds
    return (terrainMinHeight + terrainMaxHeight) / 2;
}


function createObstaclePhysics(position, shape, obstacleMesh) {
    const obstacleTransform = new Ammo.btTransform();
    obstacleTransform.setIdentity();
    obstacleTransform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
    
    const obstacleMass = 0; // Static object
    const obstacleMotionState = new Ammo.btDefaultMotionState(obstacleTransform);
    const localInertia = new Ammo.btVector3(0, 0, 0); // No inertia for static objects
    
    const obstacleRbInfo = new Ammo.btRigidBodyConstructionInfo(obstacleMass, obstacleMotionState, shape, localInertia);
    const obstacleBody = new Ammo.btRigidBody(obstacleRbInfo);

    // Store the physics body directly on the tree object
    obstacleMesh.physicsBody = obstacleBody;

    // Associate the Three.js object with the Ammo.js body
    obstacleBody.threeObject = obstacleMesh;

    // Add the obstacle to the physics world with collision groups
    physicsWorld.addRigidBody(
        obstacleBody,
        COL_GROUP_OBSTACLE, // Collision group
        COL_GROUP_PLAYER | COL_GROUP_PLAYER_PROJECTILE | COL_GROUP_ENEMY_PROJECTILE | COL_GROUP_ENEMY | COL_GROUP_TERRAIN // Collision mask
    );

    console.log('Physics body created and associated with Tree:', obstacleMesh);
}




// Initialize Jump Button Elements and Event Listeners
function initializeJumpButton() {
    jumpButton = document.getElementById('jumpButton');
    jumpKnob = jumpButton.querySelector('.jump-knob');

    // Add Pointer Event Listeners
    jumpKnob.addEventListener('pointerdown', handleJumpPointerDown, { passive: false });
}


// Handle Jump Button Press
function handleJumpPointerDown(event) {
    if (!playerControlsEnabled) return; // Prevent jumping when controls are disabled

    // Check if the player is on the ground before allowing a jump
    if (!isPlayerOnGround()) return;

    // Apply the jump to the player's physics body
    applyJump();

    // Add active class for visual feedback
    jumpKnob.classList.add('active');

    // Remove active class after a short delay to simulate button press effect
    setTimeout(() => {
        jumpKnob.classList.remove('active');
    }, 150); // Duration in milliseconds
}


function applyJump() {
    // Get the current velocity of the player
    const currentVelocity = playerBody.getLinearVelocity();

    // Apply an upward impulse based on the jump force
    playerBody.setLinearVelocity(new Ammo.btVector3(
        currentVelocity.x(),
        jumpForce,
        currentVelocity.z()
    ));

    // Optional: Play a jump sound or trigger a visual effect here
    console.log('Player jumped with force:', jumpForce);
}


function isPlayerOnGround() {
    const rayFrom = new Ammo.btVector3(player.position.x, player.position.y, player.position.z);
    const rayTo = new Ammo.btVector3(player.position.x, player.position.y - 1.1, player.position.z); // Slightly below the player

    const rayCallback = new Ammo.ClosestRayResultCallback(rayFrom, rayTo);
    physicsWorld.rayTest(rayFrom, rayTo, rayCallback);

    const onGround = rayCallback.hasHit();

    Ammo.destroy(rayFrom);
    Ammo.destroy(rayTo);
    Ammo.destroy(rayCallback);

    return onGround;
}



function initializeShootingButton() {
    shootButton = document.getElementById('shootButton');
    shootKnob = shootButton.querySelector('.shoot-knob');

    // Add Pointer Event Listener
    shootKnob.addEventListener('pointerdown', handleShootPointerDown, { passive: false });
}

function handleShootPointerDown(event) {
    // Prevent multiple triggers if needed
    if (!playerControlsEnabled) return; // Ensure controls are enabled

    // Perform the shoot action
    shootAtEnemy();

    // Add active class for visual feedback
    shootKnob.classList.add('active');

    // Remove active class after a short delay
    setTimeout(() => {
        shootKnob.classList.remove('active');
    }, 150); // Duration in milliseconds

    // Prevent event propagation
    event.preventDefault();
    event.stopPropagation();
}

function shootAtEnemy() {
    // Ensure enemy exists and is alive
    if (!enemy || enemyHealth <= 0) return;

    // Get player's and enemy's positions
    const playerPosition = new THREE.Vector3();
    playerPosition.copy(player.position);

    const enemyPosition = new THREE.Vector3();
    enemyPosition.copy(enemy.position);

    // Calculate direction vector from player to enemy
    const direction = new THREE.Vector3();
    direction.subVectors(enemyPosition, playerPosition).normalize();

    // Introduce random deviation based on accuracy
    const deviation = THREE.MathUtils.degToRad(Math.random() * maxAccuracyDeviation * 2 - maxAccuracyDeviation); // Random angle between -max and +max
    const axis = new THREE.Vector3(0, 1, 0); // Rotate around Y-axis for horizontal deviation

    const quaternion = new THREE.Quaternion();
    quaternion.setFromAxisAngle(axis, deviation);

    direction.applyQuaternion(quaternion).normalize();

    // Create and fire the projectile with shooterType 'player'
    createProjectile(playerPosition, direction, 'player');

    console.log(`Player fired a projectile towards direction: (${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)})`);
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




function initializeScene() {
    scene = new THREE.Scene();

    // Initialize joystick elements
    joystickContainerMove = document.getElementById('joystickContainerMove');
    joystickKnobMove = document.getElementById('joystickKnobMove');

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

    // Enemy Jump Timer Initialization
    enemyJumpTimer = 0;

    // Initialize Jump and Shooting Buttons
    initializeJumpButton();
    initializeShootingButton();

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 30); // Adjusted camera position
    scene.add(camera);

    // Lighting
    const hemisphereLight = new THREE.HemisphereLight(0xffd27f, 0x5e3b1d, 0.8);
    const ambientLight = new THREE.AmbientLight(0xffd4a3, 0.3);
    scene.add(hemisphereLight, ambientLight);

    const spotlight = new THREE.SpotLight(0xffe0a3, 1);
    spotlight.position.set(5, 50, -5);
    spotlight.castShadow = true;
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.3;

    spotlight.shadow.mapSize.width = 1024;
    spotlight.shadow.mapSize.height = 1024;
    spotlight.shadow.bias = -0.000001;
    scene.add(spotlight);

    // Add darker background and fireflies
    darkenBackgroundLighting();
    createFireflies();

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

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x17593e});
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


    createDestroyedBoat();

    
    // Obstacles
    const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });

    

    // **LOD Setup Moved Inside initializeScene()**
    const lod = new THREE.LOD();

    // High detail mesh
    const highDetailMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    lod.addLevel(highDetailMesh, 0);

    // Medium detail mesh
    const mediumDetailMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    lod.addLevel(mediumDetailMesh, 50);

    // Low detail mesh
    const lowDetailMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    lod.addLevel(lowDetailMesh, 100);

    scene.add(lod);

    // Fog
    scene.fog = new THREE.FogExp2(0xcccccc, 0.002);

    // **Call Environmental Feature Creation Functions**
    createRandomObstacles(10);    // Adjust count as needed
    createCollectibles(5);       // Adjust count as needed
    createTrees(50);              // Adjust count as needed
    createWaterBodies(1);          // Creates water bodies
    createRotatingSpikes(5);       // Creates rotating spikes
    updateInventoryUI();
}


// Define reusable vectors and quaternions at the top
const tempVector = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

function updatePlayerPosition() {
    if (joystickMoveAngle !== null) {
        moveDirection.set(Math.cos(joystickMoveAngle), 0, Math.sin(joystickMoveAngle));
        tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        moveDirection.applyQuaternion(tempQuaternion).normalize();

        const desiredVelocity = new Ammo.btVector3(
            moveDirection.x * playerSpeed,
            playerBody.getLinearVelocity().y(),
            moveDirection.z * playerSpeed
        );
        playerBody.setLinearVelocity(desiredVelocity);
    } else {
        const currentVelocity = playerBody.getLinearVelocity();
        playerBody.setLinearVelocity(new Ammo.btVector3(
            currentVelocity.x() * 0.9,
            currentVelocity.y(),
            currentVelocity.z() * 0.9
        ));
    }

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
    enemyShootAtPlayer(); // Ensure this is called each frame

    // Update enemy jump timer
    enemyJumpTimer += deltaTime * 1000; // Convert to milliseconds
    if (enemyJumpTimer >= enemyJumpInterval) {
        performEnemyJump();
        enemyJumpTimer = 0; // Reset timer
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

function performEnemyJump() {
    // Check if enemy is on the ground to prevent mid-air jumps
    if (!isEnemyOnGround()) return;

    // Get the current velocity of the enemy
    const currentVelocity = enemyBody.getLinearVelocity();

    // Apply an upward impulse based on the jump force
    enemyBody.setLinearVelocity(new Ammo.btVector3(
        currentVelocity.x(),
        enemyJumpForce,
        currentVelocity.z()
    ));

    console.log('Enemy performed a jump.');
}

function isEnemyOnGround() {
    const rayFrom = new Ammo.btVector3(enemy.position.x, enemy.position.y, enemy.position.z);
    const rayTo = new Ammo.btVector3(enemy.position.x, enemy.position.y - 1.1, enemy.position.z); // Slightly below the enemy

    const rayCallback = new Ammo.ClosestRayResultCallback(rayFrom, rayTo);
    physicsWorld.rayTest(rayFrom, rayTo, rayCallback);

    const onGround = rayCallback.hasHit();

    Ammo.destroy(rayFrom);
    Ammo.destroy(rayTo);
    Ammo.destroy(rayCallback);

    return onGround;
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

    // Check if the enemy can shoot based on frequency
    if (totalElapsedTime - lastEnemyShootTime < enemyShootFrequency) return;

    // Update the last shot time
    lastEnemyShootTime = totalElapsedTime;

    // Get the enemy's current position
    const enemyPosition = new THREE.Vector3();
    enemyPosition.copy(enemy.position);

    // Calculate direction vector from enemy to player
    const direction = new THREE.Vector3();
    direction.subVectors(player.position, enemy.position).normalize();

    // Introduce random deviation for enemy projectiles
    const deviation = THREE.MathUtils.degToRad(Math.random() * maxAccuracyDeviation * 2 - maxAccuracyDeviation);
    const axis = new THREE.Vector3(0, 1, 0); // Rotate around Y-axis for horizontal deviation

    const quaternion = new THREE.Quaternion();
    quaternion.setFromAxisAngle(axis, deviation);

    direction.applyQuaternion(quaternion).normalize();

    // Debugging log
    console.log(`Enemy firing at player! Direction: ${direction.x.toFixed(2)}, ${direction.y.toFixed(2)}, ${direction.z.toFixed(2)}`);

    // Create and fire the projectile with shooterType 'enemy'
    createProjectile(enemyPosition, direction, 'enemy');

    // Limit the number of projectiles
    if (projectiles.length > maxProjectiles) {
        removeProjectile(0); // Remove the oldest projectile
    }
}




function updateProjectiles() {
    projectiles.forEach((projectile, index) => {
        const mesh = projectile.mesh;

        // Optional: Remove projectiles that are out of bounds to optimize performance
        if (mesh.position.length() > 500) { // Example boundary
            removeProjectile(index);
            return;
        }

        // No homing behavior; projectiles continue in their initial direction
    });
}


function removeProjectile(index) {
    const projectile = projectiles[index];
    scene.remove(projectile.mesh);
    physicsWorld.removeRigidBody(projectile.body);
    
    // Properly destroy Ammo.js objects
    const motionState = projectile.body.getMotionState();
    if (motionState) Ammo.destroy(motionState);
    Ammo.destroy(projectile.body.getCollisionShape());
    Ammo.destroy(projectile.body);
    
    projectiles.splice(index, 1);
}


const maxSubSteps = 5; // Reduced from 10
function updatePhysics(deltaTime) {
    physicsWorld.stepSimulation(deltaTime, maxSubSteps);

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

    // Update all projectiles
    projectiles.forEach((projectile, index) => {
        const mesh = projectile.mesh;
        const body = projectile.body;

        // Get the transform from Ammo.js
        const transform = new Ammo.btTransform();
        body.getMotionState().getWorldTransform(transform);
        const origin = transform.getOrigin();
        const rotation = transform.getRotation();

        // Update mesh position and rotation
        mesh.position.set(origin.x(), origin.y(), origin.z());
        mesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());

        // Optional: Remove projectiles that are out of bounds to optimize performance
        if (mesh.position.length() > 500) {
            removeProjectile(index);
        }
    });

    // Check for collisions between projectiles and other objects
    checkProjectileCollisions();

    // Only update trees marked as being chopped
    trees.forEach(tree => {
        if (tree.isBeingChopped) {
            const transform = new Ammo.btTransform();
            tree.physicsBody.getMotionState().getWorldTransform(transform);
            const origin = transform.getOrigin();
            tree.position.set(origin.x(), origin.y(), origin.z());

            // Update rotation
            const rotation = transform.getRotation();
            tree.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
        }
    });

    // Update logs (dynamic objects)
    logs.forEach(log => {
        const transform = new Ammo.btTransform();
        log.body.getMotionState().getWorldTransform(transform);
        const origin = transform.getOrigin();
        log.mesh.position.set(origin.x(), origin.y(), origin.z());

        // Update rotation
        const rotation = transform.getRotation();
        log.mesh.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    });
}



function checkCollisions() {
    const dispatcher = physicsWorld.getDispatcher();
    const numManifolds = dispatcher.getNumManifolds();

    for (let i = 0; i < numManifolds; i++) {
        const contactManifold = dispatcher.getManifoldByIndexInternal(i);
        const body0 = Ammo.castObject(contactManifold.getBody0(), Ammo.btRigidBody);
        const body1 = Ammo.castObject(contactManifold.getBody1(), Ammo.btRigidBody);

        // Check for player/projectile collisions as before
        // ...

        // Handle direct collisions between player/enemy and collectibles/spikes
        handleDirectCollisions(body0, body1);
    }
}

function handleDirectCollisions(body0, body1) {
    // Player collides with Collectible
    if ((isPlayerBody(body0) && isCollectibleBody(body1)) ||
        (isPlayerBody(body1) && isCollectibleBody(body0))) {
        handlePlayerCollectibleCollision(body0, body1);
    }

    // Enemy collides with Collectible
    if ((isEnemyBody(body0) && isCollectibleBody(body1)) ||
        (isEnemyBody(body1) && isCollectibleBody(body0))) {
        handleEnemyCollectibleCollision(body0, body1);
    }

    // Player collides with Spike
    if ((isPlayerBody(body0) && isSpikeBody(body1)) ||
        (isPlayerBody(body1) && isSpikeBody(body0))) {
        handlePlayerSpikeCollision(body0, body1);
    }

    // Enemy collides with Spike
    if ((isEnemyBody(body0) && isSpikeBody(body1)) ||
        (isEnemyBody(body1) && isSpikeBody(body0))) {
        handleEnemySpikeCollision(body0, body1);
    }
}

function isCollectibleBody(body) {
    return body.userData && body.userData.type === 'collectible';
}

function isSpikeBody(body) {
    return body.userData && body.userData.type === 'rotatingSpike';
}

function handlePlayerCollectibleCollision(body0, body1) {
    let collectibleBody = isPlayerBody(body0) ? body1 : body0;
    collectCollectible(collectibleBody, 'player');
}

function handleEnemyCollectibleCollision(body0, body1) {
    let collectibleBody = isEnemyBody(body0) ? body1 : body0;
    collectCollectible(collectibleBody, 'enemy');
}




function collectCollectible(collectibleBody, collector) {
    const collectible = collectibles.find(c => c.userData.physicsBody === collectibleBody);

    if (collectible) {
        // Apply fade-out effect
        new TWEEN.Tween(collectible.material)
            .to({ opacity: 0 }, 200)
            .onComplete(() => {
                // Calculate a new random position on the terrain
                const newPosition = getNewCollectiblePosition();

                // Update the Three.js mesh position
                collectible.position.copy(newPosition);

                // Update the Ammo.js physics body position
                const transform = new Ammo.btTransform();
                transform.setIdentity();
                transform.setOrigin(new Ammo.btVector3(newPosition.x, newPosition.y, newPosition.z));
                collectibleBody.setWorldTransform(transform);
                collectibleBody.getMotionState().setWorldTransform(transform);

                // Reset material opacity
                collectible.material.opacity = 1;

                // Apply fade-in effect
                new TWEEN.Tween(collectible.material)
                    .to({ opacity: 1 }, 200)
                    .start();
            })
            .start();

        // Apply effects based on collector
        if (collector === 'player') {
            handlePlayerHealthRestore(1); // Restore 1 health
        } else if (collector === 'enemy') {
            handleEnemyHealthRestore(1); // Restore 1 health
        }

        console.log(`${collector.charAt(0).toUpperCase() + collector.slice(1)} collected a collectible! Respawning with fade effect.`);
    }
}


function getNewCollectiblePosition() {
    let newPosition;
    const retryLimit = 10;
    let attempts = 0;
    let validPosition = false;

    while (attempts < retryLimit && !validPosition) {
        newPosition = new THREE.Vector3(
            (Math.random() - 0.5) * terrainWidthExtents,
            0,
            (Math.random() - 0.5) * terrainDepthExtents
        );
        const terrainHeight = getTerrainHeightAt(newPosition.x, newPosition.z);
        if (newPosition.distanceTo(player.position) >= 5 && newPosition.distanceTo(enemy.position) >= 5) {
            newPosition.set(
                newPosition.x,
                terrainHeight + 0.6,
                newPosition.z
            );
            validPosition = true;
        }
        attempts++;
    }

    if (!validPosition) {
        console.warn("Failed to find a valid position for collectible. Placing at default location.");
        newPosition.set(0, terrainMaxHeight + 0.6, 0); // Default position
    }

    return newPosition;
}


function handlePlayerSpikeCollision(body0, body1) {
    let spikeBody = isPlayerBody(body0) ? body1 : body0;
    damagePlayer(1); // Decrease player health by 1
}

function handleEnemySpikeCollision(body0, body1) {
    let spikeBody = isEnemyBody(body0) ? body1 : body0;
    damageEnemy(1); // Decrease enemy health by 1
}

function handlePlayerHealthRestore(amount) {
    playerHealth = Math.min(playerHealth + amount, maxPlayerHealth);
    updatePlayerHealthBar();
    console.log(`Player collected a collectible! Health restored by ${amount}. Current Health: ${playerHealth}`);
}

function handleEnemyHealthRestore(amount) {
    enemyHealth = Math.min(enemyHealth + amount, maxEnemyHealth);
    updateEnemyHealthBar();
    console.log(`Enemy collected a collectible! Health restored by ${amount}. Current Health: ${enemyHealth}`);
}

function damagePlayer(amount) {
    playerHealth -= amount;
    playerHealth = Math.max(playerHealth, 0);
    updatePlayerHealthBar();
    applyPlayerHitEffect();
    console.log(`Player hit by spike! Health decreased by ${amount}. Current Health: ${playerHealth}`);

    if (playerHealth <= 0) {
        handlePlayerDeath();
    }
}

function damageEnemy(amount) {
    enemyHealth -= amount;
    enemyHealth = Math.max(enemyHealth, 0);
    updateEnemyHealthBar();
    applyEnemyHitEffect();
    console.log(`Enemy hit by spike! Health decreased by ${amount}. Current Health: ${enemyHealth}`);

    if (enemyHealth <= 0) {
        destroyEnemy();
    }
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
        
        else if (!isTouchWithinJoystick(touch, joystickContainerMove) && rotationTouchId === null) {
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
    const offsetY = cameraDistance * Math.sin(pitch) + 5; // Elevated for better view
    const offsetZ = cameraDistance * Math.cos(pitch) * Math.cos(yaw);

    camera.position.set(
        player.position.x + offsetX,
        player.position.y + offsetY,
        player.position.z + offsetZ
    );
    camera.lookAt(player.position);
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

let lastFrameTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = now;

    // Clamp deltaTime to avoid large jumps
    const clampedDeltaTime = Math.min(deltaTime, 0.05);

    // Update total elapsed time
    totalElapsedTime += clampedDeltaTime;

    // Update physics with clamped deltaTime
    updatePhysics(clampedDeltaTime);
    // Update player rotation and position
    updatePlayerRotation();
    updatePlayerPosition();
    // Update fireflies each frame
    updateFireflies();

    // Update proximity for the destroyed boat
    checkBoatProximity();
    // Update enemy AI (movement, shooting, jumping)
    updateEnemyAI(deltaTime);

    // Update rotating spikes
    updateRotatingSpikes(deltaTime);

    checkTreeProximity();

    // Handle log collection
    handleLogCollection();

    // Update camera position
    updateCameraPosition();

    // Update health bars to face the camera
    updateHealthBars();

    // Check for collisions
    checkCollisions();

    // **Update TWEEN animations**
    TWEEN.update();

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
