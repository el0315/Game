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

let PLATE_WEIGHT = 15; // Default value, can be adjusted dynamically

// ==============================
// Declare Global Variables
// ==============================

let isCameraLocked = false;
const CAMERA_LOCK_CONFIG = {
    distance: 10,       // Distance in front of the player
    heightOffset: 2,    // Height above the player's position
    transitionDuration: 500, // Duration of camera movement in milliseconds
};

let scene, camera, renderer;
let player, ground, barbell;
let physicsWorld, playerBody, groundBody, barbellBody;
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerRadius = 0.5;
const playerSpeed = 10; // Constant speed for player movement
const rotationSpeed = 0.005;

// ==============================
// Stability Mechanic Setup
// ==============================

const TARGET_1_POSITION = { x: 100, y: 300 }; // Left target position
const TARGET_2_POSITION = { x: window.innerWidth - 100, y: 300 }; // Right target position


// Tracking variables for average distance calculation
let cumulativeDistance = 0;    // Sum of all distance measurements
let distanceMeasurements = 0;  // Number of measurements taken
let averageDistance = 0;       // Calculated average distance

// Define maximum distance for scoring
const MAX_DISTANCE = 100; // in pixels
// Initialize power score
let powerScore = 50; // Start at mid-point; adjust as needed

// Stability Mechanic State
let isStabilityActive = false; // Tracks whether the stability mechanic is active


// Removed plateRadius and plateThickness as they are now part of BARBELL_CONFIG

let moveDirection = new THREE.Vector3();

// Constants for Camera Pitch Limitation
const maxPitch = Math.PI / 3;   // Maximum pitch (60 degrees up)
const minPitch = -Math.PI / 6;  // Minimum pitch (~25.7 degrees down)

// DOM Elements
const joystickContainerMove = document.getElementById('joystickContainerMove');
const joystickKnobMove = document.getElementById('joystickKnobMove');
const lockoutButton = document.getElementById('lockoutButton'); // Reusing the same button
const powerScoreDisplay = document.getElementById("powerScoreDisplay");


/**
 * Applies a cooldown to a specified button.
 * @param {HTMLElement} button - The button element to apply cooldown to.
 * @param {number} cooldownTime - Cooldown duration in milliseconds.
 */
function applyCooldown(button, cooldownTime) {
    if (!button) return;

    // Disable the button
    button.disabled = true;
    button.classList.add('cooldown');

    // Initialize cooldown countdown
    let remainingTime = Math.ceil(cooldownTime / 1000); // Convert to seconds
    button.setAttribute('data-cooldown', `${remainingTime}s`);

    // Update the cooldown every second
    const interval = setInterval(() => {
        remainingTime -= 1;
        if (remainingTime > 0) {
            button.setAttribute('data-cooldown', `${remainingTime}s`);
        } else {
            // Re-enable the button
            clearInterval(interval);
            button.disabled = false;
            button.classList.remove('cooldown');
            button.removeAttribute('data-cooldown');
        }
    }, 1000);
}


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

// script.js

let lastTouchEnd = 0;

document.addEventListener('touchend', function(event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault(); // Prevent double-tap
    }
    lastTouchEnd = now;
}, false);


// Add variables for lockout functionality
let lockoutButtonVisible = false;
const BARBELL_LOAD_DECREASE_PER_TAP = 2; // Adjust as needed
const MIN_BARBELL_LOAD = 0; // Minimum barbell load
let originalBarbellLoad = 0; // Will be set when barbell is attached

// ==============================
// Player Strength Initialization
// ==============================

function initializePlayerStrength() {
    PLAYER_STRENGTH = parseFloat(strengthSlider.value); // Use slider's initial value
    strengthValueDisplay.textContent = PLAYER_STRENGTH.toFixed(1); // Update display
    console.log(`Initial Player Strength set to: ${PLAYER_STRENGTH}`);
}


// ==============================
// Initialize the Game
// ==============================

function loadAmmoAndStartGame() {
    Ammo().then(() => {
        console.log("Ammo.js loaded successfully.");
        initializePhysics();
        initializeScene();
        initializePlayerStrength();
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

let isThirdPerson = true; // Flag to toggle between third-person and first-person

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
const barbellLoadValueDisplay = document.getElementById('barbellLoadValue');
const springStrengthSlider = document.getElementById('springStrengthSlider');
const springStrengthValueDisplay = document.getElementById('springStrengthValue');

// Event listener to open the settings menu (touch event)
settingsButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent touch event from bubbling up
    settingsOverlay.style.display = 'flex';
    resetBarbellPosition();
    unlockCamera();
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
springStrengthValueDisplay.textContent = springStrengthSlider.value;


// Global variable for player strength (default value)
let PLAYER_STRENGTH = 1.0; // Default strength factor

// Reference to the strength slider and its display
const strengthSlider = document.getElementById("springStrengthSlider");
const strengthValueDisplay = document.getElementById("springStrengthValue");

// Initialize display value
strengthValueDisplay.textContent = strengthSlider.value;

// Update PLAYER_STRENGTH dynamically when the slider changes
strengthSlider.addEventListener("input", () => {
    PLAYER_STRENGTH = parseFloat(strengthSlider.value);
    strengthValueDisplay.textContent = PLAYER_STRENGTH.toFixed(1); // Display updated strength
    console.log(`Player strength updated to: ${PLAYER_STRENGTH}`);
});


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

    // Create the cylinder mesh for the player's body
    const playerGeometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.castShadow = true;
    player.receiveShadow = true;

    // Position the player visually to match the physics body
    player.position.set(initialPosition.x, initialPosition.y, initialPosition.z);

    // Create the material for the arms
    const blueMaterial = new THREE.MeshStandardMaterial({
        color: 0x4682B4, // Blue for the first arm
    });

    const greenMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00, // Green for the second arm
    });

    const armRadius = 0.2; // Smaller radius than the player body
    const armLength = 2;   // Length of the arm
    const armGeometry = new THREE.CylinderGeometry(armRadius, armRadius, armLength, 16);

    // First arm (Blue)
    const arm1 = new THREE.Mesh(armGeometry, blueMaterial);
    arm1.castShadow = true;
    arm1.receiveShadow = true;

    // Rotate the first arm to horizontal
    arm1.rotation.z = Math.PI / 2;

    // Position the first arm's base to touch the player's surface
    arm1.position.set(radius + armRadius, height / 4, 0); // Adjust X and Y for proper placement

    // Attach the first arm to the player
    player.add(arm1);

    // Second arm (Green)
    const arm2 = new THREE.Mesh(armGeometry, greenMaterial);
    arm2.castShadow = true;
    arm2.receiveShadow = true;

    // Rotate the second arm to be at a 90-degree angle to the first arm
    arm2.rotation.x = Math.PI / 2;

    // Position the second arm's base to touch the player's surface
    arm2.position.set(0, height / 4, radius + armRadius); // Adjust Z for proper placement

    // Attach the second arm to the player
    player.add(arm2);

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
    playerBody.setAngularFactor(new Ammo.btVector3(0, 1, 0)); // Allow rotation only on Y-axis

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
const plateGap = 0.02; // Adjustable gap width between plates

// Reference the Plate Slider
const plateSlider = document.getElementById("plateSlider");
const plateSliderValueDisplay = document.getElementById("plateSliderValue");

// Initialize the slider with the current number of plates per side
plateSlider.value = currentPlatesPerSide;
plateSliderValueDisplay.textContent = currentPlatesPerSide;

// Event listener for slider input
plateSlider.addEventListener("input", (e) => {
    const newPlateCount = parseInt(e.target.value, 10);
    if (newPlateCount !== currentPlatesPerSide) {
        adjustPlatesToBarbell(newPlateCount);
        currentPlatesPerSide = newPlateCount;
        plateSliderValueDisplay.textContent = newPlateCount;
    }
});

// Adjust plates dynamically
function adjustPlatesToBarbell(newPlateCount) {
    const baseOffset = BARBELL_CONFIG.centralBar.length / 2 - 0.9; // Initial offset

    // Remove all current plates
    barbell.children = barbell.children.filter(child => !child.isPlate);

    // Add new plates
    for (let i = 0; i < newPlateCount; i++) {
        const plateOffset = baseOffset + i * (BARBELL_CONFIG.plate.thickness + plateGap);

        // Left Plate
        const leftPlateGeometry = new THREE.CylinderGeometry(
            BARBELL_CONFIG.plate.radius,
            BARBELL_CONFIG.plate.radius,
            BARBELL_CONFIG.plate.thickness,
            BARBELL_CONFIG.plate.segments
        );
        const leftPlate = new THREE.Mesh(leftPlateGeometry, barMaterial);
        leftPlate.rotation.z = Math.PI / 2;
        leftPlate.position.set(-plateOffset, 0, 0);
        leftPlate.isPlate = true; // Mark as a plate for easy filtering
        leftPlate.castShadow = true;
        barbell.add(leftPlate);

        // Right Plate
        const rightPlate = leftPlate.clone();
        rightPlate.position.set(plateOffset, 0, 0);
        rightPlate.isPlate = true; // Mark as a plate for easy filtering
        barbell.add(rightPlate);
    }

    // Update barbell's physics properties
    //const newPlateMass = newPlateCount * 2 * BARBELL_CONFIG.plate.mass; // Total mass of new plates
    //setBarbellMass(BARBELL_CONFIG.centralBar.mass + newPlateMass);
    //console.log(`Plates adjusted. Total plates per side: ${newPlateCount}`);
}


function calculateBarbellLoad() {
    return (
        BARBELL_CONFIG.centralBar.mass + // Central bar weight
        2 * currentPlatesPerSide * PLATE_WEIGHT // Plates on both sides
    );
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

// Configurable parameters for the spring system
const SPRING_CONFIG = {
    stiffness: 100,        // Spring stiffness (higher = stiffer spring)
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
    const displacement = originalHeight - currentHeight; // Compression from original height
    let springForce, dampingForce, netForce;

    if (Math.abs(displacement) > 0.01 || appliedForce > 0) {
        if (isDescending) {
            // Descent logic: Calculate spring and damping forces during squat
            springForce = DESCENT_SPRING_CONFIG.stiffness * displacement;
            dampingForce = -DESCENT_SPRING_CONFIG.damping * springVelocity;
            netForce = springForce + dampingForce - appliedForce;

            // Update depth meter to track squat progress
            updateDepthMeter(currentHeight, minSquatDepth, originalHeight);

            // Start stability mechanic during descent
            if (!isStabilityActive) {
                startStabilityMechanic();
            }

            // Check if squat depth is reached
            if (currentHeight <= minSquatDepth && !squatDepthReached) {
                squatDepthReached = true; // Mark depth as achieved
                console.log("Minimum squat depth reached!");
                // End the stability mechanic
                endStabilityMechanic();
            }
        } else {
            // Ascent logic: Calculate forces to return to the original height
            springForce = SPRING_CONFIG.stiffness * displacement;
            dampingForce = -SPRING_CONFIG.damping * springVelocity;

            // Include barbell load and player strength as gameplay resistance
            const adjustedLoad = barbellLoad / PLAYER_STRENGTH;
            netForce = springForce + dampingForce - adjustedLoad * 10;

            // Update depth meter for ascent phase
            updateDepthMeter(currentHeight, minSquatDepth, originalHeight);

            // End stability mechanic when ascent begins
            if (isStabilityActive) {
                endStabilityMechanic();
            }
        }

        // Update velocity and height based on net force
        springVelocity += (netForce / PLAYER_CONFIG.mass) * deltaTime;
        currentHeight += springVelocity * deltaTime;

        // Clamp height within valid range
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
            // If depth and lockout achieved, mark lift as successful
            if (liftInProgress) {
                liftInProgress = false;
                showLiftFeedback("Good Lift!", true);
                console.log("Good Lift: Depth and lockout achieved!");

                // Stop the timer
                if (liftTimer) clearInterval(liftTimer);

                // Reset the barbell position after lift completion
                resetBarbellPosition();
            }
        } else if (remainingTime <= 0) {
            // If time runs out, mark lift as failed
            if (liftInProgress) {
                liftInProgress = false;
                releaseBarbell();
                showLiftFeedback("No Lift. Try Again!", false);
                console.log("No Lift: Timer expired.");

                // Stop the timer
                if (liftTimer) clearInterval(liftTimer);
            }
        }
    }

    // Update stability mechanic during descent
    if (isStabilityActive) {
        updateStabilityMechanic(deltaTime);
    }
}


function setupStabilityVisuals() {
    const overlay = document.getElementById('stabilityOverlay');
    const target1 = document.createElement('div');
    const target2 = document.createElement('div');
    const crosshair = document.getElementById('crosshair');

    if (!overlay || !crosshair) {
        console.error("Stability overlay elements not found!");
        return;
    }

    // Configure target 1 (left target)
    target1.id = "target1";
    target1.style.position = "absolute";
    target1.style.width = "30px";
    target1.style.height = "30px";
    target1.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
    target1.style.borderRadius = "50%";
    target1.style.top = `${TARGET_1_POSITION.y}px`;
    target1.style.left = `${TARGET_1_POSITION.x}px`;

    // Configure target 2 (right target)
    target2.id = "target2";
    target2.style.position = "absolute";
    target2.style.width = "30px";
    target2.style.height = "30px";
    target2.style.backgroundColor = "rgba(0, 0, 255, 0.8)";
    target2.style.borderRadius = "50%";
    target2.style.top = `${TARGET_2_POSITION.y}px`;
    target2.style.left = `${TARGET_2_POSITION.x}px`;

    // Add targets to the overlay
    overlay.appendChild(target1);
    overlay.appendChild(target2);

    // Center the crosshair between the two targets
    crosshair.style.position = "absolute";
    crosshair.style.width = "15px";
    crosshair.style.height = "15px";
    crosshair.style.backgroundColor = "rgba(0, 255, 0, 0.8)";
    crosshair.style.borderRadius = "50%";
    crosshair.style.top = `${(TARGET_1_POSITION.y + TARGET_2_POSITION.y) / 2}px`;
    crosshair.style.left = `${(TARGET_1_POSITION.x + TARGET_2_POSITION.x) / 2}px`;
}


// Function to show stability visuals and power score
function showStabilityVisuals() {
    const overlay = document.getElementById('stabilityOverlay');
    const target = document.getElementById('targetCircle');
    const crosshair = document.getElementById('crosshair');
    const powerScoreDisplay = document.getElementById("powerScoreDisplay");

    if (overlay && target && crosshair && powerScoreDisplay) {
        overlay.style.display = 'flex';
        target.style.display = 'block';
        crosshair.style.display = 'block';
        powerScoreDisplay.classList.remove('hidden');
        powerScoreDisplay.classList.add('show');
        powerScoreDisplay.textContent = `Stability Bonus: ${powerScore.toFixed(2)}`;
        console.log("Stability visuals and Power Score shown.");
    }
}

// Function to hide stability visuals and power score
function hideStabilityVisuals() {
    const overlay = document.getElementById('stabilityOverlay');
    const target = document.getElementById('targetCircle');
    const crosshair = document.getElementById('crosshair');
    const powerScoreDisplay = document.getElementById("powerScoreDisplay");

    if (overlay && target && crosshair && powerScoreDisplay) {
        overlay.style.display = 'none';
        target.style.display = 'none';
        crosshair.style.display = 'none';
        powerScoreDisplay.classList.remove('show');
        powerScoreDisplay.classList.add('hidden');
        powerScoreDisplay.textContent = `Stability Bonus: 0`; // Reset or set to default
        console.log("Stability visuals and Power Score hidden.");
    }
}

// Function to update the power score display
function updatePowerScoreDisplay(score) {
    const powerScoreDisplay = document.getElementById("powerScoreDisplay");
    if (powerScoreDisplay) {
        powerScoreDisplay.textContent = `Stability Bonus: ${score}`; // Display as integer
    }
}

function startStabilityMechanic() {
    if (!barbellConstraint) {
        console.warn("Stability mechanic cannot start: Barbell is not attached.");
        return;
    }

    if (!isStabilityActive && !squatDepthReached) {
        console.log("Stability mechanic started.");
        isStabilityActive = true;
        
        showStabilityVisuals(); // Ensure visuals are shown
        setupStabilityVisuals(); // Set up the crosshair and target

        // Reset tracking variables at the start of the mechanic
        cumulativeDistance = 0;
        distanceMeasurements = 0;
        averageDistance = 0;

        console.log("Tracking variables reset for new stability mechanic session.");
    }
}


function endStabilityMechanic() {
    if (isStabilityActive) {
        console.log("Stability mechanic ended.");
        isStabilityActive = false;
        hideStabilityVisuals(); // Ensure visuals are hidden

        // Use the final average distance to determine the outcome
        console.log(`Final Average Distance: ${averageDistance.toFixed(2)}px`);
        console.log(`Final Stability Bonus: ${powerScore}`);

        finalizePowerScore();
        // Additional end-of-mechanic logic as needed
    }
}

function finalizePowerScore() {
    SPRING_CONFIG.stiffness = 100 + powerScore;
    console.log(`Final spring stiffness set to: ${SPRING_CONFIG.stiffness}`);
}

function updateStabilityMechanic(deltaTime) {
    if (!isStabilityActive || !barbellConstraint) {
        endStabilityMechanic(); // End mechanic if conditions are not met
        return;
    }

    const crosshair = document.getElementById('crosshair');
    const overlay = document.getElementById('stabilityOverlay');

    if (!crosshair || !overlay) {
        console.error("Stability mechanic elements not found.");
        return;
    }

    // Current crosshair position
    let currentLeft = parseFloat(crosshair.style.left) || 0;
    let currentTop = parseFloat(crosshair.style.top) || 0;

    // Update crosshair based on joystick input
    if (joystickMoveAngle !== null) {
        const movementX = Math.cos(joystickMoveAngle) * 50 * deltaTime; // Adjust sensitivity
        const movementY = Math.sin(joystickMoveAngle) * 50 * deltaTime;

        currentLeft = Math.max(0, Math.min(window.innerWidth, currentLeft + movementX));
        currentTop = Math.max(0, Math.min(window.innerHeight, currentTop + movementY));

        crosshair.style.left = `${currentLeft}px`;
        crosshair.style.top = `${currentTop}px`;
    }

    // Calculate distances to both targets
    const distanceToTarget1 = Math.sqrt(
        Math.pow(currentLeft - TARGET_1_POSITION.x, 2) + Math.pow(currentTop - TARGET_1_POSITION.y, 2)
    );
    const distanceToTarget2 = Math.sqrt(
        Math.pow(currentLeft - TARGET_2_POSITION.x, 2) + Math.pow(currentTop - TARGET_2_POSITION.y, 2)
    );

    // Determine the average distance
    const averageDistance = (distanceToTarget1 + distanceToTarget2) / 2;

    // Update the power score
    powerScore = Math.round(Math.max(0, Math.min(100, 100 * (1 - averageDistance / MAX_DISTANCE))));

    // Update the power score display
    updatePowerScoreDisplay(powerScore);
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
            // Apply cooldown to applyForceButton
            

            // Apply additional force when the button is pressed
            appliedForce = SPRING_CONFIG.additionalForce;
            isApplyForceButtonPressed = true;
            updateActionButtonVisibility();
            
            
            if (barbellConstraint) {
                // Barbell is attached, start the stability mechanic
                console.log("Apply Force Button pressed. Barbell is attached.");
                startStabilityMechanic();
    
                // Reset barbell load to its original value if needed
                barbellLoad = originalBarbellLoad;
                console.log("Barbell load reset on button press.");
                
                // Timer-related logic
                if (!liftInProgress) {
                    liftInProgress = true; // Mark the lift as in progress
                    remainingTime = LIFT_TIME_LIMIT; // Reset timer
                    squatDepthReached = false; // Reset squat depth flag
                    liftStatus = null; // Reset lift status
                    
    
                    // Show the timer
                    timerDisplay.style.visibility = "visible";
                    timerDisplay.style.opacity = "1";
                    console.log("Lift started. Timer initiated.");
    
                    // Start the lift timer
                    if (liftTimer) clearInterval(liftTimer); // Clear any existing timer
                    liftTimer = setInterval(() => {
                        remainingTime -= 1;
                        updateTimerDisplay(remainingTime);
    
                        if (remainingTime <= 0) {
                            clearInterval(liftTimer); // Stop the timer
                            liftTimer = null;
                            liftInProgress = false; // End the lift
                            timerDisplay.textContent = "Time's Up!";
                            liftStatus = "No Lift"; // Timer expired
                            console.log("Lift failed: Timer expired.");
                            releaseBarbell(); // Release the barbell
                            hideStabilityVisuals(); // Stop stability visuals
                            resetAndHideTimer(); // Reset timer display
                            showLiftFeedback("No Lift. Try Again!", false); // Show failure feedback
                        }
                    }, 1000); // Update every second
                }
            } else {
                // Barbell is not attached, skip stability mechanic and timer
                console.log("Barbell not attached. Stability mechanic and timer not started.");
            }
        },
        { passive: false }
    );
    

    applyForceButton.addEventListener(
        "touchend",
        (e) => {
            e.preventDefault();
            e.stopPropagation();
    
            // Stop applying additional force
            appliedForce = 0;
            isApplyForceButtonPressed = false;
            updateActionButtonVisibility();
            applyCooldown(actionButton, ACTION_COOLDOWN_TIME);

            // Stop stability mechanic visuals
            hideStabilityVisuals();
            // Define the minimum height threshold for a successful lift
            const minHeightThreshold = 2; // Player must reach at least this height
                
            // Add a delay before checking the player's height
            const delay = 500; // Delay in milliseconds
            setTimeout(() => {
                if (currentHeight < minHeightThreshold) {
                    console.log(
                        `Lift failed due to insufficient height. Player height: ${currentHeight.toFixed(2)} units, Threshold: ${minHeightThreshold.toFixed(2)} units`
                    );

                    // Trigger "No Lift" logic
                    if (liftInProgress) {
                        liftInProgress = false;
                        squatDepthReached = false;

                        // Release the barbell and show feedback
                        releaseBarbell(); 
                        showLiftFeedback("No Lift. Too Weak!", false);

                        // Stop the lift timer if it's running
                        if (liftTimer) {
                            clearInterval(liftTimer);
                            liftTimer = null;
                        }

                        // Reset the timer UI
                        resetAndHideTimer();
                    }
                } else {
                    console.log(`Player successfully reached height threshold: ${currentHeight.toFixed(2)} units`);
                }
            }, delay);

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
                    showLiftFeedback("No Lift. Insufficient Depth!", false);
                    releaseBarbell(e);

                    // Stop the timer if it's a "No Lift"
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

function resetAndHideTimer() {
    if (timerDisplay) {
        timerDisplay.style.visibility = "hidden";
        timerDisplay.style.opacity = "0";
        timerDisplay.textContent = `Time Left: ${LIFT_TIME_LIMIT}s`; // Reset timer text
    }
    if (liftTimer) {
        clearInterval(liftTimer); // Stop any running timer
        liftTimer = null;
    }
    remainingTime = LIFT_TIME_LIMIT; // Reset remaining time
    console.log("Timer reset and hidden.");
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

    // Decrease barbell load from current value
    barbellLoad = Math.max(barbellLoad - BARBELL_LOAD_DECREASE_PER_TAP, MIN_BARBELL_LOAD);
    console.log(`Barbell load decreased to: ${barbellLoad}`);

    // Trigger shaking animation (visual feedback)
    if (lockoutButton) {
        lockoutButton.classList.add('active');
        setTimeout(() => lockoutButton.classList.remove('active'), 500); // Reset animation
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

    // Skip joystick-based movement if the barbell is attached
    if (barbellConstraint) {
        console.log("Barbell is attached. Player movement disabled.");
    } else if (joystickMoveAngle !== null) {
        // Joystick is active, calculate movement direction
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
            playerBody.getLinearVelocity().y(), // Preserve vertical velocity (compression)
            moveDirection.z * playerSpeed
        );
        playerBody.setLinearVelocity(desiredVelocity);
    } else {
        // Joystick is inactive, ensure the player stops horizontally
        const currentVelocity = playerBody.getLinearVelocity();
        if (currentVelocity.length() > 0.1) {
            // Stop movement only if the player is still moving
            playerBody.setLinearVelocity(new Ammo.btVector3(
                0, // Stop movement on X-axis
                currentVelocity.y(), // Preserve vertical velocity (compression)
                0  // Stop movement on Z-axis
            ));
        }
    }

    // Update player's position based on physics simulation
    const transform = new Ammo.btTransform();
    playerBody.getMotionState().getWorldTransform(transform);
    const origin = transform.getOrigin();

    // Update player mesh position
    player.position.set(origin.x(), origin.y(), origin.z());

    // Apply spring compression
    const heightReduction = originalHeight - currentHeight;
    player.scale.set(1, currentHeight / originalHeight, 1); // Adjust Y-scale for compression
    player.position.y = origin.y() - heightReduction / 2;   // Adjust vertical position
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

function updateActionButtonVisibility() {
    if (isApplyForceButtonPressed) {
        actionButton.style.display = "none";
    }
}

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

    // Hide the timer now that the barbell is reset
    resetAndHideTimer();
    updateActionButtonVisibility();
    unlockCamera();
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

        // Hide the Lockout Button
        hideLockoutButton();

        if (squatDepthReached) {
            // Trigger "No Lift" Feedback
            showLiftFeedback("No Lift. Try Again!", false);
        }

        // Stop the timer if it's running
        if (liftTimer) {
            clearInterval(liftTimer);
            liftTimer = null;
        }

        // Reset lift-related flags
        liftInProgress = false;
        squatDepthReached = false;

        resetAndHideTimer();

        // **Unlock the camera to resume third-person view**
        unlockCamera();
    }
}

let barbellConstraint = null; // Initialize to null


// Global variable to represent the load the player is lifting
let barbellLoad = 0;

function attachBarbellToPlayer() {
    if (barbellConstraint) return; // Already attached

    // Set barbell mass to zero to make it kinematic while attached
    setBarbellMass(0);

    // Calculate load dynamically
    barbellLoad = calculateBarbellLoad();
    originalBarbellLoad = barbellLoad; // Store for reset
    console.log(`Barbell attached. Load: ${barbellLoad}`);

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

    // **Lock the camera to a frontal view**
    lockCamera();
}





// Define cooldown duration (e.g., 3 seconds for actionButton)
const ACTION_COOLDOWN_TIME = 1000; // in milliseconds

function onActionButtonPress(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Barbell action triggered!');
    // Apply cooldown to actionButton
    applyCooldown(actionButton, ACTION_COOLDOWN_TIME);
    applyCooldown(applyForceButton, ACTION_COOLDOWN_TIME);
    applyCooldown(plateSlider,ACTION_COOLDOWN_TIME);
    applyCooldown(settingsButton,ACTION_COOLDOWN_TIME);

    // **Reset lift interruption flag**
    liftInterrupted = false;

    moveBarbellToPlayerTop();
    function onActionButtonPress(e) {
    e.preventDefault();
    e.stopPropagation();

    console.log('Barbell action triggered!');

    // Perform barbell-related logic...

    // Update visibility after performing action
    updateActionButtonVisibility();
}
}

function onReleaseButtonPress(e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Barbell release triggered!');
    // Apply cooldown to actionButton
    applyCooldown(actionButton, ACTION_COOLDOWN_TIME);
    applyCooldown(applyForceButton, ACTION_COOLDOWN_TIME);
    applyCooldown(plateSlider,ACTION_COOLDOWN_TIME);
    applyCooldown(settingsButton,ACTION_COOLDOWN_TIME);
    releaseBarbell(e);
    updateActionButtonVisibility();
    
}

const PROXIMITY_THRESHOLD = 10; // Distance to trigger action

function checkProximityToBarbell() {
    if (!player || !barbell) return;

    const distance = player.position.distanceTo(barbell.position);

    if (barbellConstraint) {
        // Barbell is attached, show "Release" button and hide "Add Plates"
        actionButton.style.display = "block";
        actionButton.innerText = "Release";
        plateSlider.style.display = "none"; // Hide "Add Plates" button
    } else if (distance <= PROXIMITY_THRESHOLD) {
        // Barbell is nearby, show "Grab Bar" and optionally "Add Plates"
        actionButton.style.display = "block";
        actionButton.innerText = "Grab Bar";

        if (currentPlatesPerSide < maxPlatesPerSide + 1) {
            plateSlider.style.display = "block"; // Show "Add Plates" button if not maxed out
        } else {
            plateSlider.style.display = "none"; // Hide "Add Plates" button if max plates reached
        }
    } else {
        // Barbell is not nearby or attached, hide both buttons
        actionButton.style.display = "none";
        plateSlider.style.display = "none";
    }
    updateActionButtonVisibility()
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
    updateActionButtonVisibility();
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
    if (isCameraLocked) return; // Prevent rotation when camera is locked
    e.preventDefault();
    if (rotationTouchId === null) {
        const touch = e.changedTouches[0];
        rotationTouchId = touch.identifier;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
    }
}

function onRotationTouchMove(e) {
    if (isCameraLocked) return; // Prevent rotation when camera is locked
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
    if (isCameraLocked) return; // Prevent rotation when camera is locked
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
    if (isCameraLocked) return; // Prevent camera updates when locked

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

function lockCamera() {
    if (isCameraLocked) return; // Prevent multiple locks
    isCameraLocked = true;

    const cameraZoomOffset = 8; // Distance from the green arm (adjust this as needed)

    // Green arm's local offset relative to the player
    const armRadius = 0.2; // Radius of the green arm cylinder
    const playerHeight = PLAYER_CONFIG.height;

    // Calculate the green arm's local offset in player space
    const armOffset = new THREE.Vector3(0, playerHeight / 4, PLAYER_CONFIG.radius + armRadius);

    // Convert to world space to get the green arm's position
    const greenArmWorldPosition = player.localToWorld(armOffset.clone());

    // Flat face direction: Local +Z axis of the green arm
    const flatFaceDirection = new THREE.Vector3(0, 0, 1);
    const worldFlatFaceDirection = flatFaceDirection.clone().applyQuaternion(player.quaternion).normalize();

    console.log("Green Arm World Position:", greenArmWorldPosition);
    console.log("World Flat Face Direction:", worldFlatFaceDirection);

    // Place the camera at a fixed distance along the flat face direction with zoom offset
    const cameraPosition = greenArmWorldPosition.clone().add(worldFlatFaceDirection.multiplyScalar(cameraZoomOffset));

    console.log("Calculated Camera Position with Zoom Offset:", cameraPosition);

    // Smoothly move the camera to the calculated position
    new TWEEN.Tween(camera.position)
        .to({
            x: cameraPosition.x,
            y: cameraPosition.y,
            z: cameraPosition.z
        }, CAMERA_LOCK_CONFIG.transitionDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            camera.lookAt(greenArmWorldPosition); // Ensure the camera looks at the arm's center
        })
        .onComplete(() => {
            console.log("Camera locked to flat face of the green arm with zoom offset.");
        })
        .start();
}



function unlockCamera() {
    if (!isCameraLocked) return; // Prevent unlocking if not locked
    isCameraLocked = false;

    // Recalculate the desired third-person camera position based on current yaw and pitch
    const cameraDistance = 10; // Adjust as needed
    const elevation = 5 + (currentHeight - originalHeight) / 2; // Adjust elevation based on player's compression

    const offsetX = cameraDistance * Math.cos(pitch) * Math.sin(yaw);
    const offsetY = elevation + cameraDistance * Math.sin(pitch);
    const offsetZ = cameraDistance * Math.cos(pitch) * Math.cos(yaw);

    const desiredPosition = new THREE.Vector3(
        player.position.x + offsetX,
        player.position.y + offsetY,
        player.position.z + offsetZ
    );

    // Use Tween.js to animate the camera's return to third-person position
    new TWEEN.Tween(camera.position)
        .to({
            x: desiredPosition.x,
            y: desiredPosition.y,
            z: desiredPosition.z
        }, CAMERA_LOCK_CONFIG.transitionDuration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
            camera.lookAt(player.position);
        })
        .onComplete(() => {
            // Re-enable rotation controls by allowing touch events
            // Again, rely on guard clauses in touch handlers
        })
        .start();

    console.log("Camera unlocked and returned to third-person view.");
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
    updateActionButtonVisibility();

    // Check collisions and proximity
    checkCollisions();
    checkProximityToBarbell();
    // Update Stability Mechanic
    // Update Stability Mechanic only if barbell is attached
    if (barbellConstraint) {
        updateStabilityMechanic(deltaTime);
    } else {
        endStabilityMechanic();
    }

    // Update Tween animations
    TWEEN.update();

    renderer.render(scene, camera);
}

// ==============================
// Start the Game
// ==============================

loadAmmoAndStartGame();
