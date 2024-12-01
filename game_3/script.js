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
        length: 7.5,          // Total length of the central bar
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
            y: 5.1,
            z: 0.05
        }
    },
    releaseForce: 10000  // Force applied to barbell on release (in Newtons)
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
const lockoutButton = document.getElementById('lockoutButton'); // Reusing the same button


// Function to show the Lockout Button with fade-in effect
function showLockoutButton() {
    if (lockoutButton && barbellConstraint) { // Only show if barbell is attached
        lockoutButton.classList.add('visible'); // Add the 'visible' class
        lockoutButton.setAttribute('aria-hidden', 'false'); // Make it accessible
        lockoutButtonVisible = true;
        console.log("Lockout Button Shown");
    }
}

// Function to hide the Lockout Button with fade-out effect
function hideLockoutButton() {
    if (lockoutButton) {
        lockoutButton.classList.remove('visible'); // Remove the 'visible' class
        lockoutButton.setAttribute('aria-hidden', 'true'); // Hide from accessibility
        lockoutButtonVisible = false;
        console.log("Lockout Button Hidden");

        // Remove event listeners to prevent accidental taps
        lockoutButton.removeEventListener('touchstart', performLockoutTap);
        lockoutButton.removeEventListener('click', performLockoutTap);
    }
}


// Add variables for lockout functionality
let lockoutButtonVisible = false;
const BARBELL_LOAD_DECREASE_PER_TAP = 1; // Adjust as needed
const MIN_BARBELL_LOAD = 0; // Minimum barbell load
let originalBarbellLoad = 0; // Will be set when barbell is attached

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

        // Check if collision is between player and barbell
        if ((body0 === playerBody && body1 === barbellBody) || (body1 === playerBody && body0 === barbellBody)) {
            // Only proceed if the barbell is not already attached
            if (!barbellConstraint) {
                // You can include logic here if needed
                // For example, prevent the barbell from passing through the player
            }
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

}



// ==============================
// Camera Toggle Configuration
// ==============================

let isThirdPerson = false; // Flag to toggle between third-person and first-person

document.addEventListener("DOMContentLoaded", () => {
    // Toggle Camera Button Setup
    const toggleCameraButton = document.getElementById("toggleCameraButton");

    if (toggleCameraButton) {
        toggleCameraButton.addEventListener("touchstart", (e) => {
            e.preventDefault();
            e.stopPropagation();
            isThirdPerson = !isThirdPerson;

            if (isThirdPerson) {
                camera.fov = 75;
            } else {
                camera.fov = 100;
            }

            camera.updateProjectionMatrix();
        });
    } else {
        console.error("Toggle Camera Button not found in the DOM.");
    }

    // Initialize Timer Display
    const timerDisplay = document.getElementById("timerDisplay");
    if (timerDisplay) {
        timerDisplay.style.visibility = "hidden";
        timerDisplay.style.opacity = "0";
    } else {
        console.error("Timer Display element not found in the DOM.");
    }

    // Initialize Lift Feedback (if needed)
    const liftFeedback = document.getElementById("liftFeedback");
    if (!liftFeedback) {
        console.error("liftFeedback element not found in the DOM.");
    }
});


// Settings Elements
const settingsButton = document.getElementById('settingsButton');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettingsButton = document.getElementById('closeSettingsButton');
const barbellLoadSlider = document.getElementById('barbellLoadSlider');
const barbellLoadValueDisplay = document.getElementById('barbellLoadValue');
const springStrengthSlider = document.getElementById('springStrengthSlider');
const springStrengthValueDisplay = document.getElementById('springStrengthValue');

// Event listener to open the settings menu (touch event)
settingsButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling up
    settingsOverlay.style.display = 'flex';
    releaseBarbell(e)
}, { passive: false });

// Optional: Event listener for click event (desktop compatibility)
settingsButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    settingsOverlay.style.display = 'flex';
});

// Event listener to close the settings menu (touch event)
closeSettingsButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling up
    settingsOverlay.style.display = 'none';
}, { passive: false });

// Optional: Event listener for click event (desktop compatibility)
closeSettingsButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    settingsOverlay.style.display = 'none';
});

// Initialize display values
barbellLoadValueDisplay.textContent = barbellLoadSlider.value;
springStrengthValueDisplay.textContent = springStrengthSlider.value;

// Update barbell load when slider changes
barbellLoadSlider.addEventListener('input', () => {
    const newLoad = parseInt(barbellLoadSlider.value);
    barbellLoad = newLoad; // Update the global barbellLoad variable
    barbellLoadValueDisplay.textContent = newLoad;
});

// Update spring strength when slider changes
springStrengthSlider.addEventListener('input', () => {
    const newStrength = parseInt(springStrengthSlider.value);
    SPRING_CONFIG.stiffness = newStrength; // Update the stiffness in SPRING_CONFIG
    springStrengthValueDisplay.textContent = newStrength;
});

// Prevent default touch behavior on sliders
barbellLoadSlider.addEventListener('touchstart', (e) => {
    e.stopPropagation();
}, { passive: false });

springStrengthSlider.addEventListener('touchstart', (e) => {
    e.stopPropagation();
}, { passive: false });






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

// Global Material for the Barbell and Plates
let barMaterial;

// Create Barbell Visual
function createBarbellVisual() {
    barbell = new THREE.Group();

    // Define the material globally so it can be reused
    barMaterial = new THREE.MeshStandardMaterial({
        color: 0xC0C0C0, // Silver color for the barbell
        metalness: 0.9,
        roughness: 0.3,
    });

    // Create the central bar (shaft + implied sleeves)
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

    // Define the inward position for plates
    const sleeveLength = 0.9; // Adjust this for how much "sleeve" you want visible

    // Left plate
    const leftPlateGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.thickness,
        BARBELL_CONFIG.plate.segments
    );
    const leftPlate = new THREE.Mesh(leftPlateGeometry, barMaterial);
    leftPlate.rotation.z = Math.PI / 2;
    leftPlate.position.set(-BARBELL_CONFIG.centralBar.length / 2 + sleeveLength, 0, 0);
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
    rightPlate.position.set(BARBELL_CONFIG.centralBar.length / 2 - sleeveLength, 0, 0);
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


// Variables for tracking plate additions and gap width
let currentPlatesPerSide = 1; // Default: 1 plate per side
const maxPlatesPerSide = 8; // Maximum additional plates per side
const plateGap = 0.12; // Adjustable gap width between plates

// Reference the Add Plates Button
const addPlatesButton = document.getElementById("addPlatesButton");
addPlatesButton.style.display = "none"; // Initially hidden

// Add Plates Button Touch Event Handler
addPlatesButton.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentPlatesPerSide < maxPlatesPerSide) {
        addPlatesToBarbell();
        currentPlatesPerSide++;
    } else {
        console.log("Maximum plates reached.");
    }
});

// Function to add plates symmetrically to the barbell
function addPlatesToBarbell() {
    if (!barbell) return;

    const baseOffset = BARBELL_CONFIG.centralBar.length / 2 - 0.9; // Offset for initial plate
    const newPlateOffset = baseOffset + currentPlatesPerSide * plateGap; // Calculate new plate position

    // Left Plate
    const leftPlateGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.thickness,
        BARBELL_CONFIG.plate.segments
    );
    const leftPlate = new THREE.Mesh(leftPlateGeometry, barMaterial);
    leftPlate.rotation.z = Math.PI / 2;
    leftPlate.position.set(-newPlateOffset, 0, 0); // Place closer using `plateGap`
    leftPlate.castShadow = true;
    barbell.add(leftPlate);

    // Right Plate
    const rightPlateGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.radius,
        BARBELL_CONFIG.plate.thickness,
        BARBELL_CONFIG.plate.segments
    );
    const rightPlate = new THREE.Mesh(rightPlateGeometry, barMaterial);
    rightPlate.rotation.z = Math.PI / 2;
    rightPlate.position.set(newPlateOffset, 0, 0); // Place closer using `plateGap`
    rightPlate.castShadow = true;
    barbell.add(rightPlate);

    // Update barbell mass in physics
    const newPlateMass = 2 * BARBELL_CONFIG.plate.mass; // 2 plates added
    setBarbellMass(BARBELL_CONFIG.centralBar.mass + newPlateMass + currentPlatesPerSide * newPlateMass);

    console.log(`Added plates. Total plates per side: ${currentPlatesPerSide + 1}`);
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

    // Set gravity based on mass
    if (mass > 0) {
        barbellBody.setGravity(new Ammo.btVector3(0, -19.6, 0)); // Enable gravity
    } else {
        barbellBody.setGravity(new Ammo.btVector3(0, 0, 0)); // Disable gravity
    }

    // Add back to physics world
    physicsWorld.addRigidBody(barbellBody);
}

// ==============================
// Global Variables for Spring Force
// ==============================

// ==============================
// Global Variables for Spring Force
// ==============================

// Configurable parameters for the spring system
const SPRING_CONFIG = {
    stiffness: 200,        // Spring stiffness (higher = stiffer spring)
    damping: 50,           // Damping factor (higher = less oscillation)
    minHeight: PLAYER_CONFIG.height * 0.2, // Minimum player height
    maxHeight: PLAYER_CONFIG.height,       // Maximum player height
    additionalForce: 1000, // Additional force applied when pressing the button
};

// Fixed spring parameters for descent phase
const DESCENT_SPRING_CONFIG = {
    stiffness: 300, // Fixed stiffness during descent
    damping: 500,    // Fixed damping during descent
};

// Variables to track spring force and height
let originalHeight = PLAYER_CONFIG.height; // Original player height
let currentHeight = originalHeight;        // Current height of the player
let springVelocity = 0;                    // Velocity of the spring
let appliedForce = 0;                      // External force applied to the spring

// Reference to the Apply Force button
const applyForceButton = document.getElementById("applyForceButton");

// ==============================
// Spring Force System
// ==============================

let jumpInProgress = false; // Track if a jump is in progress
// Variables to track ascent state and velocities
let ascentCompleted = false;
let maxSpringVelocity = 0;
const velocityDecreaseThreshold = 1.5; // Adjust as needed based on testing
let originalAscentDamping = SPRING_CONFIG.damping; // Store the original ascent damping
const requiredDecreaseFrames = 1; // Adjust as needed

const minSquatDepth = PLAYER_CONFIG.height * 0.4; // Minimum height for a valid squat
let squatDepthReached = false; // Tracks whether the depth was reached
let liftStatus = null; // Tracks the status of the lift: "Good Lift" or "No Lift"
const LIFT_TIME_LIMIT = 20; // Time limit in seconds to complete the lift
let liftTimer = null; // Tracks the timer for the lift
let remainingTime = LIFT_TIME_LIMIT; // Countdown timer
let liftInProgress = false; // Flag to track if a lift is ongoing

function updateSpring(deltaTime) {
    if (!player) return;

    // Skip spring logic while jumping
    if (jumpInProgress) return;

    const isDescending = appliedForce > 0; // Check descent state
    const displacement = originalHeight - currentHeight;

    if (Math.abs(displacement) > 0.01 || appliedForce > 0) {
        let springForce, dampingForce, netForce;

        if (isDescending) {
            // Descent logic
            springForce = DESCENT_SPRING_CONFIG.stiffness * displacement;
            dampingForce = -DESCENT_SPRING_CONFIG.damping * springVelocity;
            netForce = springForce + dampingForce - appliedForce;

            // Update depth meter
            updateDepthMeter(currentHeight, minSquatDepth, originalHeight);

            // Check squat depth
            if (currentHeight <= minSquatDepth && !squatDepthReached) {
                squatDepthReached = true; // Mark as depth achieved
                console.log("Minimum squat depth reached!");
            }
        } else {
            // Ascent logic
            springForce = SPRING_CONFIG.stiffness * displacement;
            dampingForce = -SPRING_CONFIG.damping * springVelocity;

            // Include barbell load if attached
            const isBarbellAttached = barbellConstraint !== null;
            netForce = isBarbellAttached
                ? springForce + dampingForce - barbellLoad * 10
                : springForce + dampingForce;

            // Update depth meter (ascent reduces depth)
            updateDepthMeter(currentHeight, minSquatDepth, originalHeight);
        }

        // Update velocity and height
        springVelocity += (netForce / PLAYER_CONFIG.mass) * deltaTime;
        currentHeight += springVelocity * deltaTime;

        // Clamp height within limits
        currentHeight = Math.max(
            SPRING_CONFIG.minHeight,
            Math.min(SPRING_CONFIG.maxHeight, currentHeight)
        );

        // Reset velocity at equilibrium
        if (
            Math.abs(displacement) <= 0.01 &&
            Math.abs(springVelocity) <= 0.01 &&
            appliedForce === 0
        ) {
            springVelocity = 0;
            currentHeight = originalHeight;
        }
    }

    // Check for lift completion conditions
    if (!isApplyForceButtonPressed && squatDepthReached) {
        if (currentHeight >= SPRING_CONFIG.maxHeight * 0.9) {
            // Depth and lockout achieved
            if (liftInProgress) {
                liftInProgress = false;
                showLiftFeedback("Good Lift!", true);
                console.log("Good Lift: Depth and lockout achieved!");
                if (liftTimer) clearInterval(liftTimer); // Stop timer
                
                // Reset the barbell
                resetBarbellPosition();
            }
        }
    
    
        } else if (remainingTime <= 0) {
            // Timer expired without meeting conditions
            if (liftInProgress) {
                liftInProgress = false;
                releaseBarbell();
                showLiftFeedback("No Lift. Try Again!", false);
                console.log("No Lift: Timer expired.");
                if (liftTimer) clearInterval(liftTimer); // Stop timer
            }
        }
    }



// ==============================
// Apply Force Button Handlers
// ==============================

// Add a state variable to track if the apply force button is pressed
let isApplyForceButtonPressed = false;

if (applyForceButton) {
    applyForceButton.addEventListener("mousedown", () => {
        appliedForce = SPRING_CONFIG.additionalForce;
        isApplyForceButtonPressed = true; // Mark as pressed
    });

    applyForceButton.addEventListener("mouseup", () => {
        appliedForce = 0;
        isApplyForceButtonPressed = false; // Mark as released
    });

    applyForceButton.addEventListener(
        "touchstart",
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            appliedForce = SPRING_CONFIG.additionalForce;
            isApplyForceButtonPressed = true; // Mark as pressed
    
            if (barbellConstraint) {
                // Reset barbell load if attached
                barbellLoad = originalBarbellLoad;
                console.log("Barbell load reset on apply force button press.");
    
                // Timer functionality
                if (!liftInProgress) {
                    liftInProgress = true; // Start the lift
                    remainingTime = LIFT_TIME_LIMIT; // Reset the timer
                    squatDepthReached = false; // Reset depth flag
                    liftStatus = null; // Reset lift status
    
                    // Show the timer
                    timerDisplay.style.visibility = "visible";
                    timerDisplay.style.opacity = "1";
    
                    console.log("Lift started! Timer initiated.");
    
                    // Start the timer
                    if (liftTimer) clearInterval(liftTimer); // Clear any previous timer
                    liftTimer = setInterval(() => {
                        remainingTime -= 1;
                        updateTimerDisplay(remainingTime);
                    
                        if (remainingTime <= 0) {
                            clearInterval(liftTimer); // Stop the timer
                            liftTimer = null;
                            liftInProgress = false; // End the lift
                            timerDisplay.textContent = "Time's Up!";
                            liftStatus = "No Lift"; // Timer expired without completing lockout
                            console.log(`Lift failed: ${liftStatus}`);
                            releaseBarbell(); // No event object here
                            // Hide the timer
                            timerDisplay.style.visibility = "hidden";
                            timerDisplay.style.opacity = "0";
                    
                            // Provide feedback
                            showLiftFeedback("No Lift. Try Again!", false);
                        }
                    }, 1000); // Update every second
                    
                }
            } else {
                console.log("Timer not started: Barbell is not attached.");
            }
        },
        { passive: false }
    );
    
    
    applyForceButton.addEventListener("touchend", (e) => {
        e.preventDefault();
        e.stopPropagation();
        appliedForce = 0;
        isApplyForceButtonPressed = false;
    
        if (liftInProgress) {
            if (squatDepthReached) {
                // Player has reached the minimum squat depth
                liftStatus = "Lockout Phase";
                console.log("Lockout Phase Initiated.");
                
                // Show the Lockout Button
                showLockoutButton();
                
                // **Do NOT stop the timer here**; keep it running during lockout
            } else {
                // Player did not reach the minimum squat depth
                liftStatus = "No Lift";
                showLiftFeedback("No Lift. Try Again!", false);
                releaseBarbell(e);
                
                // **Stop the timer only if it's a "No Lift"**
                if (liftTimer) {
                    clearInterval(liftTimer);
                    liftTimer = null;
                }
                
                liftInProgress = false; // Reset the lift progress flag
            }
        }
    
        checkLockout();
    });
}    

const timerDisplay = document.getElementById("timerDisplay");

function updateTimerDisplay(time) {
    timerDisplay.textContent = `Time Left: ${time}s`;
}

// References to depth meter and feedback elements
const depthMeterBar = document.getElementById("depthMeterBar");
const liftFeedback = document.getElementById("liftFeedback");

// Function to update the depth meter
function updateDepthMeter(currentHeight, minDepth, maxHeight) {
    const depthMeterFill = document.getElementById("depthMeterFill");
    if (!depthMeterFill) return;

    // Calculate the fill percentage (0% at max height, 100% at minDepth)
    const fillPercent = Math.min(100, ((maxHeight - currentHeight) / (maxHeight - minDepth)) * 100);

    // Set the height of the fill (top stays fixed)
    depthMeterFill.style.height = `${fillPercent}%`;

    // Transition color from red to green as depth is reached
    if (currentHeight <= minDepth) {
        depthMeterFill.style.backgroundColor = "green";
    } else {
        // Linear interpolation for red to yellow gradient
        const colorFactor = Math.min(1, fillPercent / 100); // 0 to 1 for the gradient
        const red = Math.round(255 * (1 - colorFactor));
        const green = Math.round(255 * colorFactor);
        depthMeterFill.style.backgroundColor = `rgb(${red}, ${green}, 0)`;
    }
}

let liftInterrupted = false; // Flag to track if the lift was interrupted

function checkLockout() {
    console.log("checkLockout function called.");

    if (!liftInProgress) {
        console.log("Lift is not in progress. Skipping lockout check.");
        return;
    }

    if (
        !isApplyForceButtonPressed && // Ensure the button is released
        barbellConstraint &&           // Ensure the barbell is attached
        currentHeight >= SPRING_CONFIG.maxHeight * 0.95 // Check for maximum height
    ) {
        hideLockoutButton(); // Hide the lockout button
        console.log("Lockout completed.");

        // Check if lift conditions are met and lift was not interrupted
        if (squatDepthReached && remainingTime > 0 && !liftInterrupted) {
            liftStatus = "Good Lift";
            console.log("Good Lift: Depth and lockout achieved within time limit!");

            // Stop the timer
            clearInterval(liftTimer);
            liftInProgress = false; // End the lift

            // Hide the timer
            timerDisplay.style.visibility = "hidden";
            timerDisplay.style.opacity = "0";

            // Trigger Feedback
            showLiftFeedback("Good Lift!", true);

            // Reset the barbell position
            console.log("Attempting to reset barbell position after Good Lift.");
            resetBarbellPosition();
        }
    }
}



function showLiftFeedback(message, isGoodLift) {
    const liftFeedback = document.getElementById("liftFeedback");
    if (!liftFeedback) {
        console.error("liftFeedback element not found in the DOM.");
        return;
    }

    liftFeedback.textContent = message;

    if (isGoodLift) {
        liftFeedback.style.backgroundColor = "rgba(0, 128, 0, 0.7)"; // Green for good lift
    } else {
        liftFeedback.style.backgroundColor = "rgba(128, 0, 0, 0.7)"; // Red for no lift
    }

    liftFeedback.classList.remove("hidden");
    liftFeedback.classList.add("show");

    // Hide the Lockout Button when lift feedback is shown
    hideLockoutButton();

    // Hide the feedback after 3 seconds
    setTimeout(() => {
        liftFeedback.classList.remove("show");
        liftFeedback.classList.add("hidden");
    }, 3000);
}


function setupLockoutButton() {
    if (lockoutButton) {
        // Touch events for mobile
        lockoutButton.addEventListener(
            'touchstart',
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                performLockoutTap();
            },
            { passive: false }
        );

        // Click event for desktop
        lockoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            performLockoutTap();
        });
    }
}

setupLockoutButton();
// script.js

function performLockoutTap() {
    if (!liftInProgress) {
        console.warn("PerformLockoutTap called, but lift is not in progress. Ignoring tap.");
        return;
    }

    // Decrease barbell load
    barbellLoad = Math.max(barbellLoad - BARBELL_LOAD_DECREASE_PER_TAP, MIN_BARBELL_LOAD);
    console.log(`Barbell load decreased to: ${barbellLoad}`);

    // Trigger shaking animation
    if (lockoutButton) {
        lockoutButton.classList.add('active');
        
        // Remove the 'active' class after the animation duration (e.g., 500ms)
        setTimeout(() => {
            lockoutButton.classList.remove('active');
        }, 500);
    }

    // Check if barbellLoad has reached the minimum
    if (barbellLoad <= MIN_BARBELL_LOAD) {
        console.log('Lockout load reached minimum. Hiding Lockout Button.');
        hideLockoutButton();
    }

    checkLockout();
}


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

    if (barbellConstraint) {
        // Barbell is attached to the player
        const playerTopY = player.position.y + (currentHeight / 2) + (BARBELL_CONFIG.centralBar.radius);
        barbell.position.set(player.position.x, playerTopY, player.position.z);
        barbell.quaternion.copy(player.quaternion);

        // Update the physics body position
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(barbell.position.x, barbell.position.y, barbell.position.z));
        transform.setRotation(new Ammo.btQuaternion(
            barbell.quaternion.x,
            barbell.quaternion.y,
            barbell.quaternion.z,
            barbell.quaternion.w
        ));
        barbellBody.setWorldTransform(transform);
        barbellBody.getMotionState().setWorldTransform(transform);
    } else {
        // Barbell is not attached, update normally
        const transform = new Ammo.btTransform();
        barbellBody.getMotionState().getWorldTransform(transform);
        const origin = transform.getOrigin();
        const rotation = transform.getRotation();

        barbell.position.set(origin.x(), origin.y(), origin.z());
        barbell.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
    }
}


// Reference the action button
const actionButton = document.getElementById('actionButton');

// Attach the initial event listener for picking up the barbell
actionButton.addEventListener('touchstart', onActionButtonPress, { passive: false });

// Define the force value (you can adjust this as needed)
const forceValue = 0; // Set your desired force in Newtons (e.g., 100 N)

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

function moveBarbellToPlayerTop() {
    if (!barbell || !player || !barbellBody || !playerBody) return;

    // Calculate the target position on top of the player
    const playerTopY = player.position.y + (currentHeight / 2) + (BARBELL_CONFIG.centralBar.radius);
    const targetPosition = {
        x: player.position.x,
        y: playerTopY,
        z: player.position.z
    };

    // Current barbell position
    const startPosition = {
        x: barbell.position.x,
        y: barbell.position.y,
        z: barbell.position.z
    };

    // Use Tween.js to animate the barbell's position
    new TWEEN.Tween(startPosition)
        .to(targetPosition, 1000) // Duration in milliseconds
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            // Update barbell mesh position
            barbell.position.set(startPosition.x, startPosition.y, startPosition.z);

            // Update barbell physics body position
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(startPosition.x, startPosition.y, startPosition.z));
            transform.setRotation(new Ammo.btQuaternion(
                barbell.quaternion.x,
                barbell.quaternion.y,
                barbell.quaternion.z,
                barbell.quaternion.w
            ));

            barbellBody.setWorldTransform(transform);
            barbellBody.getMotionState().setWorldTransform(transform);
        })
        .onComplete(() => {
            // Attach the barbell
            attachBarbellToPlayer();

            // Change button text
            actionButton.innerText = "Release";

            // Update event listener
            actionButton.removeEventListener('touchstart', onActionButtonPress);
            actionButton.addEventListener('touchstart', onReleaseButtonPress, { passive: false });
        })
        .start();
}

function resetBarbellPosition() {
    console.log("resetBarbellPosition function called.");

    if (!barbell || !barbellBody) {
        console.error("Barbell or barbellBody is undefined.");
        return;
    }

    // Detach the barbell from the player
    if (barbellConstraint) {
        physicsWorld.removeConstraint(barbellConstraint);
        barbellConstraint = null;
        console.log("Barbell constraint removed. Barbell is now detached from the player.");
    } else {
        console.warn("No barbell constraint found to remove.");
    }

    // Define the target reset position
    const resetPosition = {
        x: BARBELL_CONFIG.position.initialPosition.x,
        y: BARBELL_CONFIG.position.initialPosition.y,
        z: BARBELL_CONFIG.position.initialPosition.z,
    };

    // Animate the barbell's position using Tween.js
    const startPosition = {
        x: barbell.position.x,
        y: barbell.position.y,
        z: barbell.position.z,
    };

    new TWEEN.Tween(startPosition)
        .to(resetPosition, 1000) // Duration of 1 second
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            // Update the barbell's mesh position during the tween
            barbell.position.set(startPosition.x, startPosition.y, startPosition.z);

            // Update the physics body's transform
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(startPosition.x, startPosition.y, startPosition.z));
            transform.setRotation(new Ammo.btQuaternion(0, 0, 0, 1));
            barbellBody.setWorldTransform(transform);
            barbellBody.getMotionState().setWorldTransform(transform);
        })
        .onComplete(() => {
            console.log("Barbell reset animation completed.");

            // Make the barbell kinematic (no gravity and immovable)
            setBarbellMass(0);
            barbellBody.setGravity(new Ammo.btVector3(0, 0, 0));
            barbellBody.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
            barbellBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0));

            // Ensure the mesh's position is exact after animation
            barbell.position.set(resetPosition.x, resetPosition.y, resetPosition.z);
            barbell.quaternion.set(0, 0, 0, 1);
        })
        .start();

    // Reset UI and state
    hideLockoutButton();
    squatDepthReached = false;
    liftInProgress = false;
    liftInterrupted = false;
    barbellLoad = 0;

    // Reset action button state
    if (actionButton) {
        actionButton.style.display = "block";
        actionButton.innerText = "Grab Bar";

        // Remove any existing event listener and attach the "grab" functionality
        actionButton.removeEventListener('touchstart', onReleaseButtonPress);
        actionButton.removeEventListener('touchstart', onActionButtonPress);
        actionButton.addEventListener('touchstart', onActionButtonPress, { passive: false });
    }
    console.log("Barbell reset initiated. Tween animation in progress.");
}


function releaseBarbell(e = null) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Proceed only if the barbell is attached
    if (barbellConstraint) {
        // Remove the constraint
        physicsWorld.removeConstraint(barbellConstraint);
        barbellConstraint = null;

        // Reset barbell mass to make it dynamic again
        setBarbellMass(
            BARBELL_CONFIG.centralBar.mass + 2 * BARBELL_CONFIG.plate.mass
        );

        // Ensure the barbell is affected by gravity
        barbellBody.setGravity(new Ammo.btVector3(0, -19.6, 0));

        // Activate the barbell to ensure physics are applied
        barbellBody.activate(true);

        // Apply force to the barbell to push it off the player's top
        const forwardVector = new THREE.Vector3(-1, 0.5, -1);
        forwardVector.applyQuaternion(player.quaternion);
        forwardVector.normalize();

        const forceMagnitude = BARBELL_CONFIG.releaseForce;
        const releaseForceVector = new Ammo.btVector3(
            forwardVector.x * forceMagnitude,
            forwardVector.y * forceMagnitude,
            forwardVector.z * forceMagnitude
        );

        barbellBody.applyCentralForce(releaseForceVector);

        // Reset barbellLoad since the player is no longer lifting the barbell
        barbellLoad = 0;

        console.log('Barbell released. Load set to 0.');

        // Change button text back
        actionButton.innerText = "Grab Bar";

        // Update event listener
        actionButton.removeEventListener('touchstart', onReleaseButtonPress);
        actionButton.addEventListener('touchstart', onActionButtonPress, {
            passive: false,
        });

        // **Set the lift as interrupted**
        liftInterrupted = true;

        // **Hide the Lockout Button**
        hideLockoutButton();

        // **Trigger "No Lift" Feedback**
        showLiftFeedback("No Lift. Try Again!", false);

        // **Stop the timer if it's running**
        if (liftTimer) {
            clearInterval(liftTimer);
            liftTimer = null;
        }

        // **Reset lift-related flags**
        liftInProgress = false;
        squatDepthReached = false;
    }
}


let barbellConstraint = null; // Initialize to null


// Global variable to represent the load the player is lifting
let barbellLoad = 0;

function attachBarbellToPlayer() {
    if (barbellConstraint) return; // Already attached

    // Set barbell mass to zero to make it kinematic while attached
    setBarbellMass(0);

    // Create a constraint to attach the barbell to the player
    const frameInA = new Ammo.btTransform();
    frameInA.setIdentity();
    frameInA.getOrigin().setY((currentHeight / 2) + BARBELL_CONFIG.centralBar.radius);

    const frameInB = new Ammo.btTransform();
    frameInB.setIdentity();

    // Create the constraint
    barbellConstraint = new Ammo.btGeneric6DofConstraint(
        playerBody,
        barbellBody,
        frameInA,
        frameInB,
        true
    );

    // Lock all movement and rotation between the bodies
    const zeroVec = new Ammo.btVector3(0, 0, 0);
    barbellConstraint.setLinearLowerLimit(zeroVec);
    barbellConstraint.setLinearUpperLimit(zeroVec);
    barbellConstraint.setAngularLowerLimit(zeroVec);
    barbellConstraint.setAngularUpperLimit(zeroVec);

    // Add the constraint to the physics world
    physicsWorld.addConstraint(barbellConstraint, true);

    // Set barbellLoad and originalBarbellLoad
    barbellLoad = BARBELL_CONFIG.centralBar.mass + 2 * BARBELL_CONFIG.plate.mass;
    originalBarbellLoad = barbellLoad;

    console.log(`Barbell attached. Load: ${barbellLoad}`);
}


function onActionButtonPress(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Barbell action triggered!');

    // **Reset lift interruption flag**
    liftInterrupted = false;

    moveBarbellToPlayerTop();
}


function onReleaseButtonPress(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Barbell release triggered!');
    releaseBarbell(e);
}


const PROXIMITY_THRESHOLD = 10; // Distance to trigger action
const ACTION_TEXT = "Squat";    // Text for the action button

function checkProximityToBarbell() {
    if (!player || !barbell) return;

    const distance = player.position.distanceTo(barbell.position);

    if (barbellConstraint) {
        // Barbell is attached, show buttons based on plate count
        actionButton.style.display = "block"; // Show "Release" button
        actionButton.innerText = "Release";
        if (currentPlatesPerSide < maxPlatesPerSide) {
            addPlatesButton.style.display = "block"; // Show "Add Plates" button
        } else {
            addPlatesButton.style.display = "none"; // Hide "Add Plates" if max plates reached
        }
    } else if (distance <= PROXIMITY_THRESHOLD) {
        // Barbell is nearby, show "Grab Bar" and "Add Plates" buttons if not maxed out
        actionButton.style.display = "block"; // Show "Grab Bar" button
        actionButton.innerText = "Grab Bar";
        if (currentPlatesPerSide < maxPlatesPerSide) {
            addPlatesButton.style.display = "block"; // Show "Add Plates" button
        } else {
            addPlatesButton.style.display = "none"; // Hide "Add Plates" if max plates reached
        }
    } else {
        // Barbell is not nearby or attached, hide both buttons
        actionButton.style.display = "none";
        addPlatesButton.style.display = "none";
    }
}


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
    // Update Tween animations
    TWEEN.update();

    renderer.render(scene, camera);
}

// ==============================
// Start the Game
// ==============================

loadAmmoAndStartGame();
