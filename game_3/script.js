// game.js

// Scene and Renderer Setup
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;


// Camera Setup with Resize Handling
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Texture Generator Function for Ground and Player
function generateNoiseTexture(size, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(size, size);
    canvas.width = canvas.height = size;
    for (let i = 0; i < imageData.data.length; i += 4) {
        const noise = Math.random() * 50 + 205;
        imageData.data.set([color[0] * noise / 255, color[1] * noise / 255, color[2] * noise / 255, 255], i);
    }
    context.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
}

// Ground Setup
const groundTexture = generateNoiseTexture(512, [139, 69, 19]);
groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(20, 20);
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.8, metalness: 0.2 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Player Setup
const playerTexture = generateNoiseTexture(256, [70, 130, 180]);
const playerRadius = 0.5; // Define player radius here

const player = new THREE.Mesh(
    new THREE.SphereGeometry(playerRadius, 32, 32),
    new THREE.MeshStandardMaterial({
        map: playerTexture, bumpMap: playerTexture, bumpScale: 0.05, roughness: 0.6, metalness: 0.1
    })
);
player.position.set(0, playerRadius, 0); // Set initial height based on radius
player.castShadow = true;
scene.add(player);


// Sky with Sunset Effect
const sky = new THREE.Sky();
sky.scale.setScalar(450000);
const sun = new THREE.Vector3(5, 1, -10);
Object.assign(sky.material.uniforms, {
    turbidity: { value: 10 }, rayleigh: { value: 1 }, mieCoefficient: { value: 0.006 },
    mieDirectionalG: { value: 0.2 }, sunPosition: { value: sun }
});
scene.add(sky);

// Lighting Setup
const hemisphereLight = new THREE.HemisphereLight(0xffd27f, 0x5e3b1d, 0.8);
const ambientLight = new THREE.AmbientLight(0xffd4a3, 0.3);
const spotlight = new THREE.SpotLight(0xffe0a3, 1);
spotlight.position.set(5, 10, -5);
spotlight.castShadow = true;
spotlight.angle = Math.PI / 4;
spotlight.penumbra = 0.3;
spotlight.shadow.mapSize.set(2048, 2048);
spotlight.shadow.bias = -0.00001;
scene.add(hemisphereLight, ambientLight, spotlight);


const pillarRadius = 0.5; // Define pillar radius here

// Obstacles: Pillar and Cube
const obstacles = [];
const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 5, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
);
pillar.position.set(5, 2.5, 5);
pillar.castShadow = true;
pillar.receiveShadow = true;
obstacles.push(pillar);
scene.add(pillar);

const cube = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x8B4513 })
);
cube.position.set(3, 1, 3);
cube.castShadow = true;
cube.receiveShadow = true;
obstacles.push(cube);
scene.add(cube);

// Joystick Controls and Touch Variables
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerSpeed = 0.1;

// Camera Update for Player Following
function updateCameraPosition() {
    const cameraDistance = 10;
    const offsetX = cameraDistance * Math.cos(pitch) * Math.sin(yaw);
    const offsetY = cameraDistance * Math.sin(pitch);
    const offsetZ = cameraDistance * Math.cos(pitch) * Math.cos(yaw);

    camera.position.set(
        player.position.x + offsetX,
        player.position.y + offsetY,
        player.position.z + offsetZ
    );
    camera.lookAt(player.position);
}

// Collision Detection & Adjustment Using AABB
function getAABB(object) {
    return new THREE.Box3().setFromObject(object);
}

function checkAABBCollision(aabb1, aabb2) {
    return aabb1.intersectsBox(aabb2);
}

// Function to calculate the closest point on the AABB to a given point
function closestPointOnAABB(point, aabb) {
    return new THREE.Vector3(
        Math.max(aabb.min.x, Math.min(point.x, aabb.max.x)),
        Math.max(aabb.min.y, Math.min(point.y, aabb.max.y)),
        Math.max(aabb.min.z, Math.min(point.z, aabb.max.z))
    );
}

// Adjust player position to avoid gaps during collision with obstacles
function adjustPositionForSphereCollision(player, obstacles, playerRadius) {
    for (const obstacle of obstacles) {
        const obstacleAABB = getAABB(obstacle);

        // Find the closest point on the obstacle AABB to the player's position
        const closestPoint = closestPointOnAABB(player.position, obstacleAABB);

        // Calculate the vector between the player and the closest point on the obstacle
        const collisionVector = new THREE.Vector3().subVectors(player.position, closestPoint);
        const distance = collisionVector.length();

        if (distance < playerRadius) {
            // Calculate the amount of overlap
            const overlap = playerRadius - distance;

            // Normalize the collision vector and apply the overlap to push the player away from the obstacle
            collisionVector.normalize().multiplyScalar(overlap);
            player.position.add(collisionVector);
        }
    }
}

// Function to handle precise collision with cylindrical pillar
function adjustPositionForCylinderCollision(player, pillar, playerRadius, pillarRadius) {
    const playerPos2D = new THREE.Vector2(player.position.x, player.position.z);
    const pillarPos2D = new THREE.Vector2(pillar.position.x, pillar.position.z);

    // Calculate the vector from the pillar to the player
    const direction = playerPos2D.clone().sub(pillarPos2D);
    const distance = direction.length();

    // If the player is too close to the pillar, adjust the position
    if (distance < playerRadius + pillarRadius) {
        const overlap = playerRadius + pillarRadius - distance;
        direction.normalize().multiplyScalar(overlap);
        
        // Apply the offset along the X and Z directions only
        player.position.x += direction.x;
        player.position.z += direction.y;
    }
}


// Player Movement Update with Collision Adjustment
const playerVelocity = new THREE.Vector3();


// Constants
const groundLevel = 0; // Ground level

const rampWidth = 5;
const rampLength = 20; // Long ramp for smoother incline
const rampHeight = 2;  // Moderate height for gentle incline
const rampFriction = 0.9;
const gravity = -0.02; // Gravity force

// Parameters for controlled entry onto the ramp
const rampVerticalOffset = -0.9; // Adjust to make the entry edge flush with the ground
const rampEntryThreshold = 0; // Distance threshold for player to enter ramp smoothly

// Ramp Setup using BoxGeometry
const rampGeometry = new THREE.BoxGeometry(rampWidth, rampHeight, rampLength);
const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
const ramp = new THREE.Mesh(rampGeometry, rampMaterial);

// Position the ramp so its entry edge is flush with ground level
ramp.position.set(10, groundLevel + rampHeight / 2 + rampVerticalOffset, -10 + rampLength / 2);
ramp.rotation.x = -Math.atan(rampHeight / rampLength); // Set the incline angle
ramp.receiveShadow = true;
scene.add(ramp);

// Define a bounding box for the ramp
const rampBoundingBox = new THREE.Box3().setFromObject(ramp);

// Raycasters for ramp and ground
const raycasterRamp = new THREE.Raycaster();
const raycasterGround = new THREE.Raycaster();

// Player velocity and falling state

let isFalling = false;

// Function to adjust player height on the ramp using raycasting
function adjustPlayerOnRamp(player, ramp) {
    // Cast a ray downward from just above the player to detect the ramp
    raycasterRamp.set(player.position.clone().add(new THREE.Vector3(0, playerRadius + 0.1, 0)), new THREE.Vector3(0, -1, 0));
    const intersectsRamp = raycasterRamp.intersectObject(ramp);

    if (intersectsRamp.length > 0) {
        const intersectPoint = intersectsRamp[0].point;
        player.position.y = intersectPoint.y + playerRadius; // Position player on the ramp surface
        playerVelocity.y = 0; // Reset vertical velocity when on the ramp
        isFalling = false; // Reset falling state
        return true; // Indicates that the player is on the ramp
    }
    return false; // Indicates that the player is not on the ramp
}

// Function to check if the player is on the ground
function adjustPlayerOnGround(player) {
    // Cast a ray downward from just above the player to detect the ground
    raycasterGround.set(player.position.clone().add(new THREE.Vector3(0, playerRadius + 0.1, 0)), new THREE.Vector3(0, -1, 0));
    const intersectsGround = raycasterGround.intersectObject(ground);

    if (intersectsGround.length > 0) {
        const intersectPoint = intersectsGround[0].point;
        player.position.y = intersectPoint.y + playerRadius; // Position player on the ground
        playerVelocity.y = 0; // Reset vertical velocity when on the ground
        isFalling = false; // Reset falling state
        return true; // Indicates that the player is on the ground
    }
    return false; // Indicates that the player is not on the ground
}

// Function to apply gravity if the player is not on the ramp or ground
function applyGravity(player) {
    playerVelocity.y += gravity;
    player.position.y += playerVelocity.y;
}

// Function to determine if the player has rolled off the ramp
function isPlayerOffRamp(player) {
    const playerRelativeZ = player.position.z - (ramp.position.z - rampLength / 2);
    const playerRelativeX = Math.abs(player.position.x - ramp.position.x);

    // Check if player has moved beyond the ramp’s boundaries
    return playerRelativeZ > rampLength / 2 || playerRelativeZ < -rampLength / 2 || playerRelativeX > rampWidth / 2;
}

// Update player position with ramp, ground adjustments, and gravity
function updatePlayerPosition() {
    if (joystickMoveAngle !== null) {
        const moveDirection = new THREE.Vector3(
            Math.cos(joystickMoveAngle), 0, Math.sin(joystickMoveAngle)
        );

        // Apply player rotation to movement direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        moveDirection.applyQuaternion(quaternion);

        // Calculate player velocity based on direction and speed
        playerVelocity.x = moveDirection.x * playerSpeed;
        playerVelocity.z = moveDirection.z * playerSpeed;
        player.position.add(playerVelocity);

        // Check if the player is on the ramp
        const isPlayerOnRamp = adjustPlayerOnRamp(player, ramp);

        // Check if the player is on the ground if not on the ramp
        const isPlayerOnGround = !isPlayerOnRamp && adjustPlayerOnGround(player);

        // If the player is off the ramp and not on the ground, apply gravity
        if (!isPlayerOnRamp && !isPlayerOnGround) {
            isFalling = true;
            applyGravity(player);
        }

        // Check if the player has rolled off the ramp and enable gravity if so
        if (isPlayerOnRamp && isPlayerOffRamp(player)) {
            isFalling = true;
            applyGravity(player);
        }

        // Add player rolling effect
        const rotationAxis = new THREE.Vector3(playerVelocity.z, 0, -playerVelocity.x).normalize();
        player.rotateOnWorldAxis(rotationAxis, playerSpeed / 0.5);
    }
}



// Joystick Event Handlers
function handleMoveJoystickStart(event) {
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

function resetMoveJoystick() {
    joystickMoveAngle = null;
    joystickKnobMove.style.transform = 'translate(0px, 0px)';
}

// Touch Event Handlers for Movement and Rotation
document.addEventListener('touchstart', (e) => {
    for (const touch of e.changedTouches) {
        if (touch.clientX < window.innerWidth / 2 && movementTouchId === null) {
            movementTouchId = touch.identifier;
            handleMoveJoystickStart(touch);
        } else if (touch.clientX > window.innerWidth / 2 && rotationTouchId === null) {
            rotationTouchId = touch.identifier;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        }
    }
    e.preventDefault();
});

document.addEventListener('touchmove', (e) => {
    for (const touch of e.changedTouches) {
        if (touch.identifier === movementTouchId) {
            handleMoveJoystick(touch);
        } else if (touch.identifier === rotationTouchId) {
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;
            yaw -= deltaX * 0.015;
            pitch = Math.max(0, Math.min(Math.PI / 2, pitch + deltaY * 0.008));
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        }
    }
    e.preventDefault();
});

document.addEventListener('touchend', (e) => {
    for (const touch of e.changedTouches) {
        if (touch.identifier === movementTouchId) {
            resetMoveJoystick();
            movementTouchId = null;
        } else if (touch.identifier === rotationTouchId) {
            rotationTouchId = null;
        }
    }
    e.preventDefault();
});

// Main Animation Loop
function animate() {
    requestAnimationFrame(animate);
    updatePlayerPosition();
    updateCameraPosition();
    renderer.render(scene, camera);
}

animate();
