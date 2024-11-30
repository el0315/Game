// script.js

// Ensure that Three.js and Ammo.js are loaded via script tags in index.html
// ==============================
// Global Configuration
// ==============================

const PLAYER_CONFIG = {
    initialPosition: { x: 0, y: 2, z: 20 }, // Adjust this based on your desired initial position
    height: 5,
    radius: 0.5,
    mass: 10
};

const BARBELL_CONFIG = {
    centralBar: {
        radius: 0.08,        // Radius of the central bar
        length: 5,          // Total length of the central bar
        mass: 20,           // Mass of the central bar
        segments: 32        // Number of segments for smoothness
    },
    plate: {
        radius: 0.8,        // Radius of each plate
        thickness: 0.1,     // Thickness of each plate
        mass: 5,            // Mass of each plate
        segments: 32        // Number of segments for smoothness
    },
    position: {
        y: 3,              // Default Y-position of the barbell
        initialPosition: {  // Initial X, Y, Z coordinates
            x: 0,
            y: 5,
            z: 0.05
        }
    }
};


// ==============================
// Declare Global Variables
// ==============================

let scene, camera, renderer;
let player, ground, barbell;
let physicsWorld, playerBody, groundBody, barbellBody;
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerRadius = 0.5;
const playerSpeed = 10; // Constant speed for player movement
const rotationSpeed = 0.005;

// Removed plateRadius and plateThickness as they are now part of BARBELL_CONFIG

let moveDirection = new THREE.Vector3();

// Constants for Camera Pitch Limitation
const maxPitch = Math.PI / 3;   // Maximum pitch (60 degrees up)
const minPitch = -Math.PI / 6;  // Minimum pitch (~25.7 degrees down)

// DOM Elements
const joystickContainerMove = document.getElementById('joystickContainerMove');
const joystickKnobMove = document.getElementById('joystickKnobMove');
const jumpButton = document.getElementById('jumpButton');

// ==============================
// Initialize the Game
// ==============================

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

// ==============================
// Initialize Physics
// ==============================

function initializePhysics() {
    // Setup the physics world
    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -19.6, 0)); // Standard gravity

    // Helper function to create rigid bodies
    function createRigidBody(shape, mass, position, rotation = null, friction = 0.5, damping = { linear: 0.1, angular: 0.2 }) {
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
        if (rotation) {
            transform.setRotation(new Ammo.btQuaternion(rotation.x, rotation.y, rotation.z, rotation.w));
        }

        const motionState = new Ammo.btDefaultMotionState(transform);
        const inertia = new Ammo.btVector3(0, 0, 0);
        if (mass > 0) shape.calculateLocalInertia(mass, inertia);

        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, inertia);
        const body = new Ammo.btRigidBody(rbInfo);

        body.setFriction(friction);
        body.setDamping(damping.linear, damping.angular);

        physicsWorld.addRigidBody(body);
        return body;
    }

    // Create the ground physics body
    const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(100, 1, 100));
    groundBody = createRigidBody(groundShape, 0, { x: 0, y: -1, z: 0 }, null, 0.9);

    // Initialize player physics
    createPlayerPhysics();
    createBarbellPhysics();
}

function checkCollisions() {
    const numManifolds = physicsWorld.getDispatcher().getNumManifolds();

    for (let i = 0; i < numManifolds; i++) {
        const contactManifold = physicsWorld.getDispatcher().getManifoldByIndexInternal(i);
        const body0 = contactManifold.getBody0();
        const body1 = contactManifold.getBody1();

        if ((body0 === playerBody && body1 === barbellBody) || (body1 === playerBody && body0 === barbellBody)) {
            setBarbellMass(BARBELL_CONFIG.centralBar.mass + 2 * BARBELL_CONFIG.plate.mass);
            return;
        }
    }
}



// ==============================
// Initialize Scene
// ==============================

function initializeScene() {
    // Create the scene
    scene = new THREE.Scene();

    // Set background color to mimic gym walls
    scene.background = new THREE.Color(0xd3d3d3); // Light gray background

    // Set up the renderer
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
        antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use PCFSoftShadowMap for softer shadows
    renderer.shadowMap.bias = -0.00005; // Adjusted shadow bias
    renderer.outputEncoding = THREE.sRGBEncoding; // Improved color accuracy

    // Create and position the camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 5, 15);
    scene.add(camera);

    // Setup lighting
    setupLighting();

    // Create the ground
    createGround();

    // Create the player mesh and add it to the scene
    createPlayer();

    // Create the barbell mesh and add it to the scene
    createBarbellVisual();

    // Add walls to the gym environment
    addWalls();

    // Set viewport height for mobile responsiveness
    setVh();

    // Add event listeners for window resizing and orientation changes
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('orientationchange', onWindowResize, false);

    // Setup jump button functionality
    setupJumpButton();
}



// ==============================
// Camera Toggle Configuration
// ==============================

let isThirdPerson = false; // Flag to toggle between third-person and first-person

document.addEventListener("DOMContentLoaded", () => {
    const toggleCameraButton = document.getElementById("toggleCameraButton");

    if (toggleCameraButton) {
        toggleCameraButton.addEventListener("touchstart", (e) => {
            e.preventDefault(); // Prevent unintended behavior like scrolling
            e.stopPropagation(); // Prevent touch event from bubbling up
            isThirdPerson = !isThirdPerson;

            if (isThirdPerson) {
                // Reset to standard FOV for third-person
                camera.fov = 75; // Default FOV for third-person view
            } else {
                // Increase FOV for first-person mode
                camera.fov = 100; // Wider FOV for first-person view
            }

            camera.updateProjectionMatrix(); // Important: Apply the FOV change
        });
    } else {
        console.error("Toggle Camera Button not found in the DOM.");
    }
});

// ==============================
// Lighting Setup
// ==============================

function setupLighting() {
    // Ambient Light for general illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Increased intensity from 0.6 to 0.8
    scene.add(ambientLight);

    // Overhead PointLights to simulate gym ceiling lights
    const pointLightPositions = [
        { x: 10, y: 20, z: 10 },
       // { x: -10, y: 20, z: -10 },
        { x: 10, y: 20, z: -10 },
        { x: -10, y: 20, z: 10 }
    ];

    pointLightPositions.forEach((pos, index) => {
        const pointLight = new THREE.PointLight(0xffffff, 1, 100);
        pointLight.position.set(pos.x, pos.y, pos.z);
        
        if (index < 2) { // Only first two lights cast shadows for performance
            pointLight.castShadow = true;
            
            // Moderate shadow map size for better quality without too much performance hit
            pointLight.shadow.mapSize.width = 1024; // Reduced from 2048
            pointLight.shadow.mapSize.height = 1024; // Reduced from 2048
            
            // Adjust shadow camera parameters
            pointLight.shadow.camera.near = 1;
            pointLight.shadow.camera.far = 50;
            pointLight.shadow.bias = -0.00005; // Reduced from -0.0001
            
            // Adjust shadow radius for subtle softness
            pointLight.shadow.radius = 2; // Reduced from 4
        } else {
            pointLight.castShadow = false; // Disable shadows for other lights
        }
        scene.add(pointLight);
    });
}

// ==============================
// Create Ground
// ==============================

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


// ==============================
// Create Player Visual and Physics
// ==============================

function createPlayer() {
    const { height, radius, initialPosition } = PLAYER_CONFIG;

    const playerMaterial = new THREE.MeshStandardMaterial({
        color: 0x4682B4, // Steel Blue
        transparent: true,
        opacity: 0.4, // Adjust opacity for slight transparency
    });

    // Create the cylinder mesh
    const playerGeometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.castShadow = true;
    player.receiveShadow = true;

    // Position the player visually to match the physics body
    player.position.set(initialPosition.x, initialPosition.y, initialPosition.z);

    // Add the player to the scene
    scene.add(player);
}



function createPlayerPhysics() {
    const { height, radius, mass, initialPosition } = PLAYER_CONFIG;

    // Create a cylinder shape for the player
    const cylinderShape = new Ammo.btCylinderShape(new Ammo.btVector3(radius, height / 2, radius));
    cylinderShape.setMargin(0); // Remove default collision margin for better precision

    // Set up the player's starting transform
    const startTransform = new Ammo.btTransform();
    startTransform.setIdentity();
    startTransform.setOrigin(new Ammo.btVector3(initialPosition.x, initialPosition.y, initialPosition.z));

    // Calculate inertia for the cylinder
    const localInertia = new Ammo.btVector3(0, 0, 0);
    cylinderShape.calculateLocalInertia(mass, localInertia);

    // Create motion state and rigid body
    const motionState = new Ammo.btDefaultMotionState(startTransform);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, cylinderShape, localInertia);
    playerBody = new Ammo.btRigidBody(rbInfo);

    // Freeze rotation along the X and Z axes to keep the cylinder upright
    playerBody.setAngularFactor(new Ammo.btVector3(0, 1, 0));

    // Add friction and damping for stability
    playerBody.setFriction(0.8);
    playerBody.setRollingFriction(0.1);
    playerBody.setDamping(0.1, 0.2);

    // Add the player body to the physics world
    physicsWorld.addRigidBody(playerBody);
}


// ==============================
// Create Barbell Visual
// ==============================

function createBarbellVisual() {
    barbell = new THREE.Group();

    // Material for the barbell
    const barMaterial = new THREE.MeshStandardMaterial({
        color: 0xC0C0C0, // Silver color for the barbell
        metalness: 0.9,
        roughness: 0.3,
    });

    // Create the central bar
    const barGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.centralBar.radius,
        BARBELL_CONFIG.centralBar.radius,
        BARBELL_CONFIG.centralBar.length,
        BARBELL_CONFIG.centralBar.segments
    );
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    bar.rotation.z = Math.PI / 2; // Align with X-axis
    bar.castShadow = true;
    bar.receiveShadow = true;
    barbell.add(bar);

    // Left plate
    const leftPlateGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.thickness,
        BARBELL_CONFIG.plate.segments
    );
    const leftPlate = new THREE.Mesh(leftPlateGeometry, barMaterial);
    leftPlate.rotation.z = Math.PI / 2;
    leftPlate.position.set(-BARBELL_CONFIG.centralBar.length / 2, 0, 0);
    leftPlate.castShadow = true;
    leftPlate.receiveShadow = true;
    barbell.add(leftPlate);

    // Right plate
    const rightPlateGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.thickness,
        BARBELL_CONFIG.plate.segments
    );
    const rightPlate = new THREE.Mesh(rightPlateGeometry, barMaterial);
    rightPlate.rotation.z = Math.PI / 2;
    rightPlate.position.set(BARBELL_CONFIG.centralBar.length / 2, 0, 0);
    rightPlate.castShadow = true;
    rightPlate.receiveShadow = true;
    barbell.add(rightPlate);

    // Set initial position of the barbell
    barbell.position.set(
        BARBELL_CONFIG.position.initialPosition.x,
        BARBELL_CONFIG.position.initialPosition.y,
        BARBELL_CONFIG.position.initialPosition.z
    );

    // Add the barbell to the scene
    scene.add(barbell);
}

function createBarbellPhysics() {
    const barbellCompoundShape = new Ammo.btCompoundShape();

    // Central bar
    const barShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(BARBELL_CONFIG.centralBar.length / 2, BARBELL_CONFIG.centralBar.radius, BARBELL_CONFIG.centralBar.radius)
    );
    const barTransform = new Ammo.btTransform();
    barTransform.setIdentity();
    barbellCompoundShape.addChildShape(barTransform, barShape);

    // Left and Right Plates
    const plateShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(BARBELL_CONFIG.plate.radius, BARBELL_CONFIG.plate.thickness / 2, BARBELL_CONFIG.plate.radius)
    );
    for (const position of [
        { x: -BARBELL_CONFIG.centralBar.length / 2, rotation: Math.PI / 4 },
        { x: BARBELL_CONFIG.centralBar.length / 2, rotation: Math.PI / 4 },
    ]) {
        const plateTransform = new Ammo.btTransform();
        plateTransform.setIdentity();
        plateTransform.setOrigin(new Ammo.btVector3(position.x, 0, 0));
        plateTransform.setRotation(new Ammo.btQuaternion(0, 0, Math.sin(position.rotation), Math.cos(position.rotation)));
        barbellCompoundShape.addChildShape(plateTransform, plateShape);
    }

    const barbellTransform = new Ammo.btTransform();
    barbellTransform.setIdentity();
    barbellTransform.setOrigin(new Ammo.btVector3(
        BARBELL_CONFIG.position.initialPosition.x,
        BARBELL_CONFIG.position.initialPosition.y, // Start at specified height
        BARBELL_CONFIG.position.initialPosition.z
    ));

    const motionState = new Ammo.btDefaultMotionState(barbellTransform);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, barbellCompoundShape, new Ammo.btVector3(0, 0, 0)); // Initial mass = 0
    barbellBody = new Ammo.btRigidBody(rbInfo);

    // Barbell remains immobile initially
    barbellBody.setFriction(0.5);
    barbellBody.setDamping(0.1, 0.2);
    barbellBody.setGravity(new Ammo.btVector3(0, 0, 0)); // Disable gravity

    physicsWorld.addRigidBody(barbellBody);
}

function setBarbellMass(mass) {
    if (!barbellBody) return;

    const transform = new Ammo.btTransform();
    barbellBody.getMotionState().getWorldTransform(transform);

    // Remove from physics world before modification
    physicsWorld.removeRigidBody(barbellBody);

    // Update mass and inertia
    const inertia = new Ammo.btVector3(0, 0, 0);
    barbellBody.getCollisionShape().calculateLocalInertia(mass, inertia);

    const motionState = new Ammo.btDefaultMotionState(transform);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, barbellBody.getCollisionShape(), inertia);
    barbellBody = new Ammo.btRigidBody(rbInfo);

    // Reapply friction and damping
    barbellBody.setFriction(0.5);
    barbellBody.setRollingFriction(0.1);
    barbellBody.setDamping(0.1, 0.2);

    // Enable gravity
    barbellBody.setGravity(new Ammo.btVector3(0, -19.6, 0)); // Standard gravity

    // Add back to physics world
    physicsWorld.addRigidBody(barbellBody);
}

// ==============================
// Global Variables for Spring Force
// ==============================

// Configurable parameters for the spring system
const SPRING_CONFIG = {
    stiffness: 500,      // Spring stiffness (higher = stiffer spring)
    damping: 5,          // Damping factor (higher = less oscillation)
    oscillationEnabled: true, // Enable or disable oscillations
    minHeight: 1.5,      // Minimum player height
    maxHeight: 5.0,      // Maximum player height
    additionalForce: 50000, // Additional force applied when pressing the button
};

// Variables to track spring force and height
let currentHeight = PLAYER_CONFIG.height; // Current height of the player

// Reference to the Apply Force button
const applyForceButton = document.getElementById("applyForceButton");

// Define variables for the spring system
let originalHeight = PLAYER_CONFIG.height; // Original player height
//let currentHeight = originalHeight;        // Current height of the player
let springVelocity = 0;                    // Velocity of the spring
let springConstant = 500;   // Increased from 100 to make the spring stiffer
let dampingCoefficient = 50; // Increased from 10 to dampen oscillations faster
let playerMass = 10;                       // Mass of the player
let appliedForce = 0;                      // External force applied to the spring
let minHeight = originalHeight * 0.7;      // Minimum compressed height
let maxHeight = originalHeight;            // Maximum height


// ==============================
// Spring Force System
// ==============================

let jumpInProgress = false; // Track if a jump is in progress
function updateSpring(deltaTime) {
    if (!player) return;

    // Skip spring logic while jumping
    if (jumpInProgress) return;

    // Calculate displacement and forces only if needed
    const displacement = originalHeight - currentHeight;
    if (Math.abs(displacement) > 0.01 || appliedForce > 0) {
        const springForce = springConstant * displacement;
        const dampingForce = -dampingCoefficient * springVelocity;

        // Calculate net force
        const netForce = springForce + dampingForce - appliedForce;

        // Update velocity and height
        springVelocity += (netForce / playerMass) * deltaTime;
        currentHeight += springVelocity * deltaTime;

        // Clamp height within limits
        currentHeight = Math.max(minHeight, Math.min(maxHeight, currentHeight));

        // Reset velocity if spring is at equilibrium
        if (Math.abs(displacement) <= 0.01 && Math.abs(springVelocity) <= 0.01 && appliedForce === 0) {
            springVelocity = 0;
            currentHeight = originalHeight; // Ensure exact original height
        }
    }
}

// ==============================
// Apply Force Button Handlers
// ==============================

applyForceButton.addEventListener("mousedown", () => {
    appliedForce = SPRING_CONFIG.additionalForce;
});

applyForceButton.addEventListener("mouseup", () => {
    appliedForce = 0;
});

applyForceButton.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling up
    appliedForce = SPRING_CONFIG.additionalForce;
}, { passive: false });

applyForceButton.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling up
    appliedForce = 0;
}, { passive: false });


// ==============================
// Animation Loop Integration
// ==============================



// ==============================
// Add Walls
// ==============================

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

    // Add physics body for front wall
    const frontWallShape = new Ammo.btBoxShape(new Ammo.btVector3(wallLength / 2, wallHeight / 2, wallThickness / 2));
    const frontWallTransform = new Ammo.btTransform();
    frontWallTransform.setIdentity();
    frontWallTransform.setOrigin(new Ammo.btVector3(0, wallHeight / 2, -100));
    const frontWallMass = 0; // Static
    const frontWallMotionState = new Ammo.btDefaultMotionState(frontWallTransform);
    const frontWallRbInfo = new Ammo.btRigidBodyConstructionInfo(frontWallMass, frontWallMotionState, frontWallShape, new Ammo.btVector3(0, 0, 0));
    const frontWallBody = new Ammo.btRigidBody(frontWallRbInfo);
    physicsWorld.addRigidBody(frontWallBody);

    // Back Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(wallLength, wallHeight, wallThickness), wallMaterial);
    backWall.position.set(0, wallHeight / 2, 100); // Position at the front of the ground
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Add physics body for back wall
    const backWallShape = new Ammo.btBoxShape(new Ammo.btVector3(wallLength / 2, wallHeight / 2, wallThickness / 2));
    const backWallTransform = new Ammo.btTransform();
    backWallTransform.setIdentity();
    backWallTransform.setOrigin(new Ammo.btVector3(0, wallHeight / 2, 100));
    const backWallMass = 0; // Static
    const backWallMotionState = new Ammo.btDefaultMotionState(backWallTransform);
    const backWallRbInfo = new Ammo.btRigidBodyConstructionInfo(backWallMass, backWallMotionState, backWallShape, new Ammo.btVector3(0, 0, 0));
    const backWallBody = new Ammo.btRigidBody(backWallRbInfo);
    physicsWorld.addRigidBody(backWallBody);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, wallLength), wallMaterial);
    leftWall.position.set(-100, wallHeight / 2, 0); // Left side of the ground
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Add physics body for left wall
    const leftWallShape = new Ammo.btBoxShape(new Ammo.btVector3(wallThickness / 2, wallHeight / 2, wallLength / 2));
    const leftWallTransform = new Ammo.btTransform();
    leftWallTransform.setIdentity();
    leftWallTransform.setOrigin(new Ammo.btVector3(-100, wallHeight / 2, 0));
    const leftWallMass = 0; // Static
    const leftWallMotionState = new Ammo.btDefaultMotionState(leftWallTransform);
    const leftWallRbInfo = new Ammo.btRigidBodyConstructionInfo(leftWallMass, leftWallMotionState, leftWallShape, new Ammo.btVector3(0, 0, 0));
    const leftWallBody = new Ammo.btRigidBody(leftWallRbInfo);
    physicsWorld.addRigidBody(leftWallBody);

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, wallLength), wallMaterial);
    rightWall.position.set(100, wallHeight / 2, 0); // Right side of the ground
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Add physics body for right wall
    const rightWallShape = new Ammo.btBoxShape(new Ammo.btVector3(wallThickness / 2, wallHeight / 2, wallLength / 2));
    const rightWallTransform = new Ammo.btTransform();
    rightWallTransform.setIdentity();
    rightWallTransform.setOrigin(new Ammo.btVector3(100, wallHeight / 2, 0));
    const rightWallMass = 0; // Static
    const rightWallMotionState = new Ammo.btDefaultMotionState(rightWallTransform);
    const rightWallRbInfo = new Ammo.btRigidBodyConstructionInfo(rightWallMass, rightWallMotionState, rightWallShape, new Ammo.btVector3(0, 0, 0));
    const rightWallBody = new Ammo.btRigidBody(rightWallRbInfo);
    physicsWorld.addRigidBody(rightWallBody);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(wallLength, wallLength), wallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight; // Same height as walls
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    // Add physics body for ceiling
    const ceilingShape = new Ammo.btBoxShape(new Ammo.btVector3(wallLength / 2, 0.5, wallLength / 2));
    const ceilingTransform = new Ammo.btTransform();
    ceilingTransform.setIdentity();
    ceilingTransform.setOrigin(new Ammo.btVector3(0, wallHeight, 0));
    const ceilingMass = 0; // Static
    const ceilingMotionState = new Ammo.btDefaultMotionState(ceilingTransform);
    const ceilingRbInfo = new Ammo.btRigidBodyConstructionInfo(ceilingMass, ceilingMotionState, ceilingShape, new Ammo.btVector3(0, 0, 0));
    const ceilingBody = new Ammo.btRigidBody(ceilingRbInfo);
    physicsWorld.addRigidBody(ceilingBody);
}

// ==============================
// Utility Functions
// ==============================

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

// ==============================
// Jump Functionality
// ==============================

function setupJumpButton() {
    if (jumpButton) {
        // Touch events for mobile
        jumpButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent touch event from bubbling up
            jumpButton.classList.add('active');
            jump();
        }, { passive: false });
        
        jumpButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent touch event from bubbling up
            jumpButton.classList.remove('active');
        });        

        // Click event for compatibility
        jumpButton.addEventListener('click', (e) => {
            e.preventDefault();
            jump();
        });
    }
}
function jump() {
    if (!playerBody) {
        console.warn("playerBody is undefined.");
        return;
    }

    const velocity = playerBody.getLinearVelocity();

    if (velocity.y() < 0.1 && !jumpInProgress) { // Ensure grounded and not already jumping
        jumpInProgress = true; // Set jump flag
        const jumpForce = new Ammo.btVector3(0, 50, 0); // Adjust jump strength
        playerBody.applyCentralImpulse(jumpForce);

        // Reset jumpInProgress after the jump is complete
        const checkLandingInterval = setInterval(() => {
            const newVelocity = playerBody.getLinearVelocity();
            if (Math.abs(newVelocity.y()) < 0.1) { // Adjust threshold as needed
                jumpInProgress = false; // Allow spring logic to resume
                clearInterval(checkLandingInterval);
            }
        }, 100); // Check every 100 ms
    }
}



// ==============================
// Update Functions
// ==============================

function updatePlayerPosition() {
    if (!playerBody) {
        console.warn("playerBody is undefined in updatePlayerPosition.");
        return;
    }

    // Ensure the player body is always active
    playerBody.activate(true);

    // Handle joystick movement
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
        // Joystick is inactive, ensure the player stops
        const currentVelocity = playerBody.getLinearVelocity();
        if (currentVelocity.length() > 0.1) {
            // Stop movement only if the player is still moving
            playerBody.setLinearVelocity(new Ammo.btVector3(
                0, // Stop movement on X-axis
                currentVelocity.y(), // Preserve vertical velocity (gravity)
                0  // Stop movement on Z-axis
            ));
        }
    }

    // Get the player's transform from Ammo.js
    const transform = new Ammo.btTransform();
    playerBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();
    const rotation = transform.getRotation();

    // Update the player mesh's position and rotation to match the physics body
    player.position.set(origin.x(), origin.y(), origin.z());
    player.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());

    // **Always apply spring compression**
    const heightReduction = originalHeight - currentHeight;
    player.scale.set(1, currentHeight / originalHeight, 1); // Adjust Y-scale for compression
    player.position.y = origin.y() - heightReduction / 2;   // Adjust vertical position

    // Update camera position to follow the player
    if (isThirdPerson) {
        // Third-person camera logic
        const cameraDistance = 10; // Distance behind the player
        const elevation = 5 + (currentHeight - originalHeight) / 2; // Adjust elevation for spring compression

        const offsetX = cameraDistance * Math.cos(pitch) * Math.sin(yaw);
        const offsetY = elevation + cameraDistance * Math.sin(pitch);
        const offsetZ = cameraDistance * Math.cos(pitch) * Math.cos(yaw);

        camera.position.set(
            player.position.x + offsetX,
            player.position.y + offsetY,
            player.position.z + offsetZ
        );
        camera.lookAt(player.position);
    } else {
        // First-person camera logic
        const eyeLevelOffset = currentHeight / 2 - 0.2; // Eye level at half the current player height
        const cameraYOffset = player.position.y + eyeLevelOffset;

        camera.position.set(
            player.position.x,
            cameraYOffset,
            player.position.z
        );

        // Apply pitch and yaw for first-person perspective
        const quaternion = new THREE.Quaternion();
        quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")); // YXZ ensures FPS-like orientation
        camera.quaternion.copy(quaternion);
    }
}



// Function to update the barbell's mesh based on its physics body
function updateBarbellPosition() {
    if (!barbellBody) {
        console.warn("barbellBody is undefined in updateBarbellPosition.");
        return;
    }

    const transform = new Ammo.btTransform();
    barbellBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();
    const rotation = transform.getRotation();

    barbell.position.set(origin.x(), origin.y(), origin.z());
    barbell.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
}

// Reference the action button
const actionButton = document.getElementById('actionButton');

// Define the force value (you can adjust this as needed)
const forceValue = 10000; // Set your desired force in Newtons (e.g., 100 N)

// Function to apply force on the barbell
function applyForceOnBarbell(force) {
    if (!barbellBody) return;

    // Activate the barbell by giving it mass
    setBarbellMass(BARBELL_CONFIG.centralBar.mass + 2 * BARBELL_CONFIG.plate.mass);

    // Apply force
    const forceVector = new Ammo.btVector3(0, 0, -force);
    barbellBody.applyCentralForce(forceVector);
    console.log(`Applied force: ${force} N`);
}

// Set up the action button to apply force
actionButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling up
    console.log('Barbell action triggered!');
    applyForceOnBarbell(forceValue);
});



const PROXIMITY_THRESHOLD = 10; // Distance to trigger action
const ACTION_TEXT = "Squat";    // Text for the action button

function checkProximityToBarbell() {
    if (!player || !barbell) return;

    const distance = player.position.distanceTo(barbell.position);

    if (distance <= PROXIMITY_THRESHOLD) {
        actionButton.style.display = "block";
        actionButton.innerText = ACTION_TEXT;
    } else {
        actionButton.style.display = "none";
    }
}

actionButton.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent any default touch behavior
    console.log('Barbell action triggered!');
    // Add your specific action logic here (e.g., lifting the barbell)
});

// ==============================
// Joystick Event Handlers
// ==============================

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

function resetMoveJoystick() {
    joystickMoveAngle = null;
    joystickKnobMove.style.transform = 'translate(0px, 0px)';
}


function setupEventListeners() {
    // Movement joystick touch events
    joystickContainerMove.addEventListener("touchstart", onMovementTouchStart, { passive: false });
    joystickContainerMove.addEventListener("touchmove", onMovementTouchMove, { passive: false });
    joystickContainerMove.addEventListener("touchend", onMovementTouchEnd, { passive: false });

    // Rotation touch events
    const rotationOverlay = document.createElement('div');
    rotationOverlay.style.position = 'absolute';
    rotationOverlay.style.top = '0';
    rotationOverlay.style.left = '50%';
    rotationOverlay.style.width = '50%';
    rotationOverlay.style.height = '100%';
    rotationOverlay.style.zIndex = '5'; // Adjust as needed
    rotationOverlay.style.background = 'transparent';
    rotationOverlay.style.touchAction = 'none';
    document.body.appendChild(rotationOverlay);

    rotationOverlay.addEventListener("touchstart", onRotationTouchStart, { passive: false });
    rotationOverlay.addEventListener("touchmove", onRotationTouchMove, { passive: false });
    rotationOverlay.addEventListener("touchend", onRotationTouchEnd, { passive: false });
}
function onMovementTouchStart(e) {
    e.preventDefault();
    if (movementTouchId === null) {
        const touch = e.changedTouches[0];
        movementTouchId = touch.identifier;
        handleMoveJoystickStart(touch);
    }
}

function onMovementTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        if (touch.identifier === movementTouchId) {
            handleMoveJoystick(touch);
            break;
        }
    }
}

function onMovementTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        if (touch.identifier === movementTouchId) {
            resetMoveJoystick();
            movementTouchId = null;
            break;
        }
    }
}

function onRotationTouchStart(e) {
    e.preventDefault();
    if (rotationTouchId === null) {
        const touch = e.changedTouches[0];
        rotationTouchId = touch.identifier;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    }
}

function onRotationTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        if (touch.identifier === rotationTouchId) {
            const deltaX = touch.clientX - lastTouchX;
            const deltaY = touch.clientY - lastTouchY;
            yaw -= deltaX * rotationSpeed;
            pitch = Math.max(minPitch, Math.min(maxPitch, pitch + deltaY * rotationSpeed));
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            break;
        }
    }
}

function onRotationTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        if (touch.identifier === rotationTouchId) {
            rotationTouchId = null;
            break;
        }
    }
}




// ==============================
// Camera Update
// ==============================

function updateCameraPosition() {
    if (isThirdPerson) {
        // Third-person camera logic
        const cameraDistance = 10; // Distance behind the player
        const elevation = 5;      // Height above the player

        const offsetX = cameraDistance * Math.cos(pitch) * Math.sin(yaw);
        const offsetY = elevation + cameraDistance * Math.sin(pitch);
        const offsetZ = cameraDistance * Math.cos(pitch) * Math.cos(yaw);

        camera.position.set(
            player.position.x + offsetX,
            player.position.y + offsetY,
            player.position.z + offsetZ
        );
        camera.lookAt(player.position);
    } else {
        // First-person camera logic
        const eyeLevelOffset = currentHeight / 2 - 0.2; // Eye level at half the current player height
        const cameraYOffset = player.position.y + eyeLevelOffset;

        camera.position.set(
            player.position.x,
            cameraYOffset,
            player.position.z
        );

        // Apply pitch and yaw for first-person perspective
        const quaternion = new THREE.Quaternion();
        quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")); // YXZ ensures FPS-like orientation
        camera.quaternion.copy(quaternion);
    }
}


// ==============================
// Animation Loop
// ==============================

function animate() {
    requestAnimationFrame(animate);

    // Calculate deltaTime for smoother updates
    const deltaTime = 1 / 60;

    // Update physics world
    physicsWorld.stepSimulation(deltaTime, 10);

    // Update spring system
    updateSpring(deltaTime);

    // Update player and barbell positions
    updatePlayerPosition();
    updateBarbellPosition();

    // Update camera position
    updateCameraPosition();

    // Check collisions and proximity
    checkCollisions();
    checkProximityToBarbell();

    renderer.render(scene, camera);
}

// ==============================
// Start the Game
// ==============================

loadAmmoAndStartGame();
