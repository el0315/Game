let scene, camera, renderer, player, ground, sky, obstacles = [];
let physicsWorld, playerBody, groundBody;
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerRadius = 0.5;
const playerSpeed = 7; // Increase speed for more responsive movement
const rotationSpeed = 0.015;
let moveDirection = new THREE.Vector3();

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

    // Ground physics
    const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(100, 1, 100));
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, -1, 0));
    const groundMass = 0;
    const groundMotionState = new Ammo.btDefaultMotionState(groundTransform);
    const groundRbInfo = new Ammo.btRigidBodyConstructionInfo(groundMass, groundMotionState, groundShape, new Ammo.btVector3(0, 0, 0));
    groundBody = new Ammo.btRigidBody(groundRbInfo);
    physicsWorld.addRigidBody(groundBody);

    // Player physics
    const playerShape = new Ammo.btSphereShape(playerRadius);
    const playerTransform = new Ammo.btTransform();
    playerTransform.setIdentity();
    playerTransform.setOrigin(new Ammo.btVector3(0, playerRadius, 0));
    const playerMass = 1;
    const playerInertia = new Ammo.btVector3(0, 0, 0);
    playerShape.calculateLocalInertia(playerMass, playerInertia);
    const playerMotionState = new Ammo.btDefaultMotionState(playerTransform);
    const playerRbInfo = new Ammo.btRigidBodyConstructionInfo(playerMass, playerMotionState, playerShape, playerInertia);
    playerBody = new Ammo.btRigidBody(playerRbInfo);
    playerBody.setActivationState(4);
    physicsWorld.addRigidBody(playerBody);

    // Obstacles physics
    createObstaclePhysics(new THREE.Vector3(5, 2.5, 5), new Ammo.btCylinderShape(new Ammo.btVector3(0.5, 2.5, 0.5)));
    createObstaclePhysics(new THREE.Vector3(3, 1, 3), new Ammo.btBoxShape(new Ammo.btVector3(1, 1, 1)));
}

function createObstaclePhysics(position, shape) {
    const obstacleTransform = new Ammo.btTransform();
    obstacleTransform.setIdentity();
    obstacleTransform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
    const obstacleMass = 0;
    const obstacleMotionState = new Ammo.btDefaultMotionState(obstacleTransform);
    const obstacleRbInfo = new Ammo.btRigidBodyConstructionInfo(obstacleMass, obstacleMotionState, shape, new Ammo.btVector3(0, 0, 0));
    const obstacleBody = new Ammo.btRigidBody(obstacleRbInfo);
    physicsWorld.addRigidBody(obstacleBody);
}

function initializeScene() {
    scene = new THREE.Scene();

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas') });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;


    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    scene.add(camera);

    // Lighting
    // Ambient and Hemisphere Lighting
    const hemisphereLight = new THREE.HemisphereLight(0xffd27f, 0x5e3b1d, 0.8);
    const ambientLight = new THREE.AmbientLight(0xffd4a3, 0.3);
    scene.add(hemisphereLight, ambientLight);
    const spotlight = new THREE.SpotLight(0xffe0a3, 1);
    spotlight.position.set(5, 10, -5);
    spotlight.castShadow = true;
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.3;

// Increase shadow map size for smoother shadows
spotlight.shadow.mapSize.width = 4096;
spotlight.shadow.mapSize.height = 4096;
spotlight.shadow.bias = -0.00001; // Slightly adjust bias for better shadow quality
scene.add(spotlight);

    // Sky
    sky = new THREE.Sky();
    sky.scale.setScalar(450000);
    const sun = new THREE.Vector3(5, 1, -10);
    sky.material.uniforms['sunPosition'].value.copy(sun);
    scene.add(sky);

    // Ground
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Player
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 });
    player = new THREE.Mesh(new THREE.SphereGeometry(playerRadius, 32, 32), playerMaterial);
    player.castShadow = true;
    scene.add(player);

    // Obstacles
    const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 32), obstacleMaterial);
    pillar.position.set(5, 2.5, 5);
    
    obstacles.push(pillar);
    scene.add(pillar);

    const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
    cube.position.set(3, 1, 3);
    
    obstacles.push(cube);
    scene.add(cube);
    // Update shadow properties on obstacles
    obstacles.forEach(obstacle => {
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
});
}

// Player Movement Update with Smooth Direction Switching and Dramatic Collision Effect
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
            currentVelocity.x() * 0.9, // Apply slight damping to slow down smoothly
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

// Joystick Reset for Smooth Stop
function resetMoveJoystick() {
    joystickMoveAngle = null;
    joystickKnobMove.style.transform = 'translate(0px, 0px)';
    // Reduce speed to stop rather than instantly setting to zero
    const currentVelocity = playerBody.getLinearVelocity();
    playerBody.setLinearVelocity(new Ammo.btVector3(
        currentVelocity.x() * 0.1,  // Quick deceleration without abrupt stop
        currentVelocity.y(),
        currentVelocity.z() * 0.1
    ));
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
            yaw -= deltaX * rotationSpeed;
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

// Update camera position
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

// Main Animation Loop
function animate() {
    requestAnimationFrame(animate);
    updatePlayerPosition();
    updateCameraPosition();
    physicsWorld.stepSimulation(1 / 60, 10);
    renderer.render(scene, camera);
}

loadAmmoAndStartGame();
