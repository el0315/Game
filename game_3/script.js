let scene, camera, renderer, player, ground, sky, obstacles = [];
let physicsWorld, playerBody;
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerRadius = 0.5;
const playerSpeed = 10;
const rotationSpeed = 0.015;
let moveDirection = new THREE.Vector3();

// Terrain parameters
const terrainWidthExtents = 100;
const terrainDepthExtents = 100;
const terrainWidth = 128;
const terrainDepth = 128;
const terrainHalfWidth = terrainWidth / 2;
const terrainHalfDepth = terrainDepth / 2;
const terrainMaxHeight = 4; // Maximum height of the terrain
const terrainMinHeight = 1; // Minimum height of the terrain
let heightData = null;
let ammoHeightData = null;

// Hill parameters for terrain generation
const hillFrequency = 15;   // Adjust this value for more or fewer hills (lower value = fewer hills)
const hillAmplitude = 0.5; // Adjust this value for the height of the hills (higher value = taller hills)

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
    physicsWorld.addRigidBody(groundBody);

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

    physicsWorld.addRigidBody(playerBody);

    // Obstacles physics
    createObstaclePhysics(new THREE.Vector3(5, 2.5, 5), new Ammo.btCylinderShape(new Ammo.btVector3(0.5, 2.5, 0.5)));
    createObstaclePhysics(new THREE.Vector3(3, 1, 3), new Ammo.btBoxShape(new Ammo.btVector3(1, 1, 1)));
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

    // Initialize joystick elements
    joystickContainerMove = document.getElementById('joystickContainerMove');
    joystickKnobMove = document.getElementById('joystickKnobMove');

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

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 1 / 60;
    physicsWorld.stepSimulation(deltaTime, 10);

    updatePlayerPosition();
    updateCameraPosition();

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
