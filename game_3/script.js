// script.js

// Ensure that Three.js and Ammo.js are loaded via script tags in index.html

// Declare global variables
let scene, camera, renderer;
let player, ground, platform, mirrors = [];
let physicsWorld, playerBody, groundBody, platformBody;
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerRadius = 0.5;
const playerSpeed = 10; // Constant speed for player movement
const rotationSpeed = 0.005;
let moveDirection = new THREE.Vector3();

// DOM Elements
const joystickContainerMove = document.getElementById('joystickContainerMove');
const joystickKnobMove = document.getElementById('joystickKnobMove');
const jumpButton = document.getElementById('jumpButton');

// Initialize the game once Ammo.js is loaded
function loadAmmoAndStartGame() {
    Ammo().then(() => {
        console.log("Ammo.js loaded successfully.");
        initializePhysics();
        initializeScene();
        setupEventListeners();
        animate();
    }).catch((error) => {
        console.error("Failed to load Ammo.js:", error);
    });
}

// Initialize the physics world and objects using Ammo.js
function initializePhysics() {
    // Set up the physics world
    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0)); // Gravity set to -9.81 on Y-axis

    // Create the ground physics body
    const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(100, 1, 100));
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, -1, 0));
    const groundMass = 0; // Static object
    const groundMotionState = new Ammo.btDefaultMotionState(groundTransform);
    const groundRbInfo = new Ammo.btRigidBodyConstructionInfo(groundMass, groundMotionState, groundShape, new Ammo.btVector3(0, 0, 0));
    groundBody = new Ammo.btRigidBody(groundRbInfo);
    physicsWorld.addRigidBody(groundBody);

    // Create the central platform physics body
    const platformSize = new THREE.Vector3(10, 0.5, 10); // Width, Height, Depth
    const platformShape = new Ammo.btBoxShape(new Ammo.btVector3(platformSize.x / 2, platformSize.y / 2, platformSize.z / 2));
    const platformTransform = new Ammo.btTransform();
    platformTransform.setIdentity();
    platformTransform.setOrigin(new Ammo.btVector3(0, platformSize.y / 2, 0)); // Positioned on the ground
    const platformMass = 0; // Static object
    const platformMotionState = new Ammo.btDefaultMotionState(platformTransform);
    const platformRbInfo = new Ammo.btRigidBodyConstructionInfo(platformMass, platformMotionState, platformShape, new Ammo.btVector3(0, 0, 0));
    platformBody = new Ammo.btRigidBody(platformRbInfo);
    physicsWorld.addRigidBody(platformBody);

    // Create the player physics body
    const playerShape = new Ammo.btSphereShape(playerRadius);
    const playerTransform = new Ammo.btTransform();
    playerTransform.setIdentity();
    playerTransform.setOrigin(new Ammo.btVector3(0, playerRadius + 1, 0)); // Positioned slightly above the ground to prevent initial collision issues
    const playerMass = 1; // Dynamic object
    const playerInertia = new Ammo.btVector3(0, 0, 0);
    playerShape.calculateLocalInertia(playerMass, playerInertia);
    const playerMotionState = new Ammo.btDefaultMotionState(playerTransform);
    const playerRbInfo = new Ammo.btRigidBodyConstructionInfo(playerMass, playerMotionState, playerShape, playerInertia);
    playerBody = new Ammo.btRigidBody(playerRbInfo);
    playerBody.setActivationState(4); // Disable deactivation to keep player active
    physicsWorld.addRigidBody(playerBody);
}

// Initialize the Three.js scene, camera, renderer, lighting, and objects
function initializeScene() {
    // Create the scene
    scene = new THREE.Scene();

    // Set background color to light gray to mimic gym walls
    scene.background = new THREE.Color(0xd3d3d3); // Light Gray

    // Set up the renderer
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
        antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use PCFSoftShadowMap for softer shadows

    // Create and position the camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 5, 15);
    scene.add(camera);

    // Set up lighting to simulate indoor gym lighting
    setupLighting();

    // Create the ground mesh with charcoal color
    createGround();

    // Create the central platform mesh with shiny wooden material
    createCentralPlatform();

    // Create the player mesh and add it to the scene
    createPlayer();

    // Add walls to the gym environment
    addWalls();

    // Set initial viewport height for mobile responsiveness
    setVh();

    // Add event listeners for window resizing and orientation changes
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('orientationchange', onWindowResize, false);

    // Set up jump button functionality
    setupJumpButton();
}

// Function to set up indoor gym-like lighting
function setupLighting() {
    // Ambient Light for general illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // White ambient light with higher intensity
    scene.add(ambientLight);

    // Overhead PointLights to simulate gym ceiling lights
    const pointLightPositions = [
        { x: 10, y: 20, z: 10 },
        { x: -10, y: 20, z: -10 },
        { x: 10, y: 20, z: -10 },
        { x: -10, y: 20, z: 10 }
    ];

    pointLightPositions.forEach((pos, index) => {
        const pointLight = new THREE.PointLight(0xffffff, 1, 100);
        pointLight.position.set(pos.x, pos.y, pos.z);
        if (index < 2) { // Only first two lights cast shadows for performance
            pointLight.castShadow = true;
            pointLight.shadow.mapSize.width = 1024; // Increased for better quality
            pointLight.shadow.mapSize.height = 1024;
            pointLight.shadow.bias = -0.00005; // Adjusted bias to reduce shadow artifacts
        } else {
            pointLight.castShadow = false; // Disable shadows for other lights
        }
        scene.add(pointLight);
    });
}

// Function to create the ground mesh with charcoal color
function createGround() {
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333, // Charcoal color
        roughness: 0.7,  // Slightly less rough for some reflectivity
        metalness: 0.2,  // Low metalness for subtle reflections
    });
    ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
}

// Function to create the central platform mesh with shiny wooden material
function createCentralPlatform() {
    const platformSize = new THREE.Vector3(10, 0.5, 10); // Width, Height, Depth
    const platformGeometry = new THREE.BoxGeometry(platformSize.x, platformSize.y, platformSize.z);

    const platformMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x8B4513,           // SaddleBrown color to resemble wood
        metalness: 0.1,            // Low metalness since wood isn't metallic
        roughness: 0.2,            // Lower roughness for a shinier surface
        clearcoat: 1.0,            // Adds a clear coating for extra shine
        clearcoatRoughness: 0.1,   // Low roughness for clearcoat to enhance shininess
    });

    platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(0, platformSize.y / 2, 0); // Positioned on the ground
    platform.castShadow = true;
    platform.receiveShadow = true;
    scene.add(platform);
}

// Function to create the player mesh and add it to the scene
function createPlayer() {
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 }); // Steel Blue
    player = new THREE.Mesh(new THREE.SphereGeometry(playerRadius, 32, 32), playerMaterial);
    player.castShadow = true;
    player.receiveShadow = true; // Optional: if you want the player to receive shadows
    scene.add(player);
}

// Function to add walls around the gym environment
function addWalls() {
    // Wall material
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc, // Light gray walls
        roughness: 0.8,
        metalness: 0.2,
    });

    // Dimensions for walls
    const wallThickness = 1;
    const wallHeight = 10;
    const wallLength = 200;

    // Front Wall
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(wallLength, wallHeight, wallThickness), wallMaterial);
    frontWall.position.set(0, wallHeight / 2, -100); // Position at the back of the ground
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Back Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(wallLength, wallHeight, wallThickness), wallMaterial);
    backWall.position.set(0, wallHeight / 2, 100); // Position at the front of the ground
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, wallLength), wallMaterial);
    leftWall.position.set(-100, wallHeight / 2, 0); // Left side of the ground
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, wallLength), wallMaterial);
    rightWall.position.set(100, wallHeight / 2, 0); // Right side of the ground
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(wallLength, wallLength), wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight; // Same height as walls
    ceiling.receiveShadow = true;
    scene.add(ceiling);
}

// Function to set CSS variable --vh for mobile responsiveness
function setVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Function to handle window resizing and orientation changes
function onWindowResize() {
    setVh(); // Update the --vh variable
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update camera aspect ratio and projection matrix
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Update renderer size
    renderer.setSize(width, height);
}

// Function to set up the jump button functionality
function setupJumpButton() {
    if (jumpButton) {
        // Touch events for mobile
        jumpButton.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevents triggering other touch events
            jumpButton.classList.add('active'); // Visual feedback
            jump();
        }, { passive: false });

        jumpButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            jumpButton.classList.remove('active'); // Remove visual feedback
        });

        // Click event for compatibility
        jumpButton.addEventListener('click', (e) => {
            e.preventDefault();
            jump();
        });
    }
}

// Function to handle jumping
function jump() {
    // Check if the player is on the ground by checking the Y velocity
    const velocity = playerBody.getLinearVelocity();
    if (velocity.y() < 0.1) { // Threshold to determine if on or near the ground
        // Apply an upward impulse
        const jumpForce = new Ammo.btVector3(0, 8, 0); // Adjusted Y value for jump strength
        playerBody.applyCentralImpulse(jumpForce);
    }
}

// Function to update the player's position based on joystick input and physics
function updatePlayerPosition() {
    if (joystickMoveAngle !== null) {
        // Calculate the movement direction based on joystick angle
        moveDirection.set(Math.cos(joystickMoveAngle), 0, Math.sin(joystickMoveAngle));

        // Apply player rotation to movement direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        moveDirection.applyQuaternion(quaternion);

        // Normalize to ensure consistent speed
        moveDirection.normalize();

        // Set player's horizontal velocity to constant speed in the desired direction
        const desiredVelocity = new Ammo.btVector3(
            moveDirection.x * playerSpeed,
            playerBody.getLinearVelocity().y(), // Preserve vertical velocity (gravity)
            moveDirection.z * playerSpeed
        );
        playerBody.setLinearVelocity(desiredVelocity);
    } else {
        // **Modified Behavior:** Set movement velocity to zero when joystick is released
        const currentVelocity = playerBody.getLinearVelocity();
        playerBody.setLinearVelocity(new Ammo.btVector3(
            0, // Stop movement on X-axis
            currentVelocity.y(), // Preserve vertical velocity (gravity)
            0  // Stop movement on Z-axis
        ));
    }

    // Sync player mesh position with physics
    const transform = new Ammo.btTransform();
    playerBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();
    player.position.set(origin.x(), origin.y(), origin.z());
}

// Joystick Event Handlers

// Function to handle the start of joystick movement
function handleMoveJoystickStart(touch) {
    const rect = joystickContainerMove.getBoundingClientRect();
    const dx = touch.clientX - rect.left - (rect.width / 2);
    const dy = touch.clientY - rect.top - (rect.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = rect.width / 2;

    if (distance <= maxDistance) {
        joystickMoveAngle = Math.atan2(dy, dx);
    }
}

// Function to handle joystick movement
function handleMoveJoystick(touch) {
    const rect = joystickContainerMove.getBoundingClientRect();
    let dx = touch.clientX - rect.left - (rect.width / 2);
    let dy = touch.clientY - rect.top - (rect.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = rect.width / 2;

    if (distance > maxDistance) {
        const angle = Math.atan2(dy, dx);
        dx = Math.cos(angle) * maxDistance;
        dy = Math.sin(angle) * maxDistance;
    }
    joystickKnobMove.style.transform = `translate(${dx}px, ${dy}px)`;
    joystickMoveAngle = Math.atan2(dy, dx);
}

// Function to reset the joystick position smoothly
function resetMoveJoystick() {
    joystickMoveAngle = null;
    joystickKnobMove.style.transform = 'translate(0px, 0px)';
}

// Function to set up touch event listeners for joystick and rotation
function setupEventListeners() {
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
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        for (const touch of e.changedTouches) {
            if (touch.identifier === movementTouchId) {
                handleMoveJoystick(touch);
            } else if (touch.identifier === rotationTouchId) {
                const deltaX = touch.clientX - lastTouchX;
                const deltaY = touch.clientY - lastTouchY;
                yaw -= deltaX * rotationSpeed;
                pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + deltaY * rotationSpeed));
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
            } else if (touch.identifier === rotationTouchId) {
                rotationTouchId = null;
            }
        }
        e.preventDefault();
    }, { passive: false });
}

// Function to update the camera position based on player's position and rotation
function updateCameraPosition() {
    const cameraDistance = 10;
    const offsetX = cameraDistance * Math.cos(pitch) * Math.sin(yaw);
    const offsetY = cameraDistance * Math.sin(pitch) + 5; // Elevated slightly for better view
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
    physicsWorld.stepSimulation(1 / 60, 10);
    updatePlayerPosition();
    updateCameraPosition();
    renderer.render(scene, camera);
}

// Start the game by loading Ammo.js
loadAmmoAndStartGame();
