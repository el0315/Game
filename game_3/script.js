// script.js

// Ensure that Three.js and Ammo.js are loaded via script tags in index.html

// ==============================
// Global Configuration
// ==============================

const BARBELL_CONFIG = {
    centralBar: {
        radius: 0.08,        // Radius of the central bar
        length: 5,          // Total length of the central bar
        mass: 10,           // Mass of the central bar
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
            z: 0
        }
    }
};

const RACK_CONFIG = {
    verticalHeight: 4,        // Height of the vertical supports
    verticalThickness: 0.2,  // Thickness of the vertical supports
    holderLength: 0.4,       // Length of the holder (horizontal dimension)
    holderHeight: 0.2,       // Height of the holder (vertical dimension)
    holderThickness: 0.7,    // Thickness of the holder (depth)
    holderOffsetFromTop: 0.5 // Distance of the holder from the top of the vertical support
};

// ==============================
// Declare Global Variables
// ==============================

let scene, camera, renderer;
let player, ground, platform, barbell;
let physicsWorld, playerBody, groundBody, platformBody, barbellBody;
let yaw = 0, pitch = 0;
let joystickMoveAngle = null, movementTouchId = null, rotationTouchId = null, lastTouchX = 0, lastTouchY = 0;
const playerRadius = 0.5;
const playerSpeed = 10; // Constant speed for player movement
const rotationSpeed = 0.005;

// Removed plateRadius and plateThickness as they are now part of BARBELL_CONFIG

let moveDirection = new THREE.Vector3();

// Constants for Camera Pitch Limitation
const maxPitch = Math.PI / 3;   // Maximum pitch (60 degrees up)
const minPitch = -Math.PI / 7;  // Minimum pitch (~25.7 degrees down)

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

    // Create the ground physics body
    const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(100, 1, 100));
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, -1, 0));
    const groundMass = 0; // Static
    const groundMotionState = new Ammo.btDefaultMotionState(groundTransform);
    const groundRbInfo = new Ammo.btRigidBodyConstructionInfo(groundMass, groundMotionState, groundShape, new Ammo.btVector3(0, 0, 0));
    groundBody = new Ammo.btRigidBody(groundRbInfo);
    groundBody.setFriction(0.9); // High friction for better interaction
    physicsWorld.addRigidBody(groundBody);

    // Create the platform physics body
    const platformSize = new THREE.Vector3(10, 0.5, 10); // Width, height, depth
    const platformShape = new Ammo.btBoxShape(new Ammo.btVector3(platformSize.x / 2, platformSize.y / 2, platformSize.z / 2));
    const platformTransform = new Ammo.btTransform();
    platformTransform.setIdentity();
    platformTransform.setOrigin(new Ammo.btVector3(0, platformSize.y / 2, 0));
    const platformMass = 0; // Static
    const platformMotionState = new Ammo.btDefaultMotionState(platformTransform);
    const platformRbInfo = new Ammo.btRigidBodyConstructionInfo(platformMass, platformMotionState, platformShape, new Ammo.btVector3(0, 0, 0));
    platformBody = new Ammo.btRigidBody(platformRbInfo);
    platformBody.setFriction(0.7); // Medium friction for rolling
    physicsWorld.addRigidBody(platformBody);

    // Create the player physics body
    const playerShape = new Ammo.btSphereShape(playerRadius);
    const playerTransform = new Ammo.btTransform();
    playerTransform.setIdentity();
    playerTransform.setOrigin(new Ammo.btVector3(0, playerRadius + 1, 0)); // Positioned slightly above the ground
    const playerMass = 1; // Dynamic object
    const playerInertia = new Ammo.btVector3(0, 0, 0);
    playerShape.calculateLocalInertia(playerMass, playerInertia);

    const playerMotionState = new Ammo.btDefaultMotionState(playerTransform);
    const playerRbInfo = new Ammo.btRigidBodyConstructionInfo(playerMass, playerMotionState, playerShape, playerInertia);
    playerBody = new Ammo.btRigidBody(playerRbInfo);
    playerBody.setActivationState(4); // Disable deactivation to keep the player active

    // Add to physics world
    physicsWorld.addRigidBody(playerBody);

    // Create the barbell physics body
    const barbellMass = BARBELL_CONFIG.centralBar.mass + 2 * BARBELL_CONFIG.plate.mass;
    const barbellInertia = new Ammo.btVector3(0, 0, 0);
    const barbellCompoundShape = new Ammo.btCompoundShape();

    // Central bar
    const barShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(BARBELL_CONFIG.centralBar.length / 2, BARBELL_CONFIG.centralBar.radius, BARBELL_CONFIG.centralBar.radius)
    );
    const barLocalTransform = new Ammo.btTransform();
    barLocalTransform.setIdentity();
    barLocalTransform.setOrigin(new Ammo.btVector3(0, 0, 0));
    barbellCompoundShape.addChildShape(barLocalTransform, barShape);

    // Left plate
    const leftPlateShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(BARBELL_CONFIG.plate.radius, BARBELL_CONFIG.plate.thickness / 2, BARBELL_CONFIG.plate.radius)
    );
    const leftPlateTransform = new Ammo.btTransform();
    leftPlateTransform.setIdentity();
    leftPlateTransform.setOrigin(new Ammo.btVector3(-BARBELL_CONFIG.centralBar.length / 2, 0, 0));
    leftPlateTransform.setRotation(new Ammo.btQuaternion(0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4))); // Rotate to align horizontally
    barbellCompoundShape.addChildShape(leftPlateTransform, leftPlateShape);

    // Right plate
    const rightPlateShape = new Ammo.btCylinderShape(
        new Ammo.btVector3(BARBELL_CONFIG.plate.radius, BARBELL_CONFIG.plate.thickness / 2, BARBELL_CONFIG.plate.radius)
    );
    const rightPlateTransform = new Ammo.btTransform();
    rightPlateTransform.setIdentity();
    rightPlateTransform.setOrigin(new Ammo.btVector3(BARBELL_CONFIG.centralBar.length / 2, 0, 0));
    rightPlateTransform.setRotation(new Ammo.btQuaternion(0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4))); // Rotate to align horizontally
    barbellCompoundShape.addChildShape(rightPlateTransform, rightPlateShape);

    barbellCompoundShape.calculateLocalInertia(barbellMass, barbellInertia);

    // Set the initial position of the barbell using BARBELL_CONFIG
    const barbellTransform = new Ammo.btTransform();
    barbellTransform.setIdentity();
    barbellTransform.setOrigin(new Ammo.btVector3(
        BARBELL_CONFIG.position.initialPosition.x,
        BARBELL_CONFIG.position.initialPosition.y,
        BARBELL_CONFIG.position.initialPosition.z
    ));

    const barbellMotionState = new Ammo.btDefaultMotionState(barbellTransform);
    const barbellRbInfo = new Ammo.btRigidBodyConstructionInfo(barbellMass, barbellMotionState, barbellCompoundShape, barbellInertia);
    barbellBody = new Ammo.btRigidBody(barbellRbInfo);

    // Set friction and damping for stability
    barbellBody.setFriction(0.5);
    barbellBody.setRollingFriction(0.1);
    barbellBody.setDamping(0.1, 0.2);

    // Add the barbell body to the physics world
    physicsWorld.addRigidBody(barbellBody);

    // Create the squat rack physics
    createSquatRackPhysics();
}


// ==============================
// Initialize Scene
// ==============================

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
    renderer.shadowMap.bias = -0.00005; // Adjusted shadow bias as per user specification
    renderer.outputEncoding = THREE.sRGBEncoding; // Improve color accuracy
    renderer.physicallyCorrectLights = false; // Disabled to prevent over darkening

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

    // Create the barbell on the central platform using global configuration
    createBarbellVisual();

    // Create the squat rack visual
    const squatRack = createSquatRack();
    
    // Position the squat rack relative to the barbell
    squatRack.position.set(0, 0.5, 0); // Adjust as needed based on your scene


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
// Create Central Platform
// ==============================

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

// ==============================
// Create Player
// ==============================

function createPlayer() {
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x4682B4 }); // Steel Blue
    player = new THREE.Mesh(new THREE.SphereGeometry(playerRadius, 32, 32), playerMaterial);
    player.castShadow = true;
    player.receiveShadow = true; // Optional: if you want the player to receive shadows
    scene.add(player);
}

// ==============================
// Create Barbell Visual
// ==============================

function createBarbellVisual() {
    barbell = new THREE.Group();

    // Create the central bar
    const barGeometry = new THREE.CylinderGeometry(
        BARBELL_CONFIG.centralBar.radius,
        BARBELL_CONFIG.centralBar.radius,
        BARBELL_CONFIG.centralBar.length,
        BARBELL_CONFIG.centralBar.segments
    );
    const barMaterial = new THREE.MeshStandardMaterial({
        color: 0xC0C0C0,
        metalness: 0.9,
        roughness: 0.3
    });
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    bar.rotation.z = Math.PI / 2; // Align with X-axis
    bar.castShadow = true;
    bar.receiveShadow = true;
    barbell.add(bar);

    // Left Plate
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

    // Right Plate
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

    // Set initial position
    barbell.position.set(
        BARBELL_CONFIG.position.initialPosition.x,
        BARBELL_CONFIG.position.initialPosition.y,
        BARBELL_CONFIG.position.initialPosition.z
    );
    scene.add(barbell);
}

function createSquatRack() {
    const squatRack = new THREE.Group();

    // Material for the squat rack
    const rackMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e2929, // rack color
        metalness: 0.3,
        roughness: 0.7,
    });

    // Offset to position the vertical supports
    const rackOffsetX = BARBELL_CONFIG.centralBar.length / 2 - 0.5; // Align with barbell length

    // Function to create a single vertical support with a holder
    function createSupportWithHolder() {
        const support = new THREE.Group();

        // Vertical support
        const verticalGeometry = new THREE.BoxGeometry(
            RACK_CONFIG.verticalThickness,
            RACK_CONFIG.verticalHeight,
            RACK_CONFIG.verticalThickness
        );
        const vertical = new THREE.Mesh(verticalGeometry, rackMaterial);
        vertical.position.set(0, RACK_CONFIG.verticalHeight / 2, 0); // Center vertically
        support.add(vertical);

        // Rectangular holder
        const holderGeometry = new THREE.BoxGeometry(
            RACK_CONFIG.holderLength,
            RACK_CONFIG.holderHeight,
            RACK_CONFIG.holderThickness
        );
        const holder = new THREE.Mesh(holderGeometry, rackMaterial);

        // Position the holder near the top of the vertical support
        const holderOffsetZ = RACK_CONFIG.holderThickness / 2; // Extend out from the vertical
        const holderOffsetY = RACK_CONFIG.verticalHeight - RACK_CONFIG.holderOffsetFromTop; // Position below the top
        holder.position.set(0, holderOffsetY, holderOffsetZ);
        support.add(holder);

        return support;
    }

    // Create the left vertical support with holder
    const leftSupport = createSupportWithHolder();
    leftSupport.position.set(-rackOffsetX, 0, 0); // Position on the left
    squatRack.add(leftSupport);

    // Create the right vertical support with holder
    const rightSupport = createSupportWithHolder();
    rightSupport.position.set(rackOffsetX, 0, 0); // Position on the right
    squatRack.add(rightSupport);

    // Enable shadows for all components
    squatRack.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Add the squat rack to the scene
    scene.add(squatRack);

    return squatRack;
}


function createSquatRackPhysics() {
    const compoundShape = new Ammo.btCompoundShape();

    // Vertical Supports
    const verticalShape = new Ammo.btBoxShape(new Ammo.btVector3(
        RACK_CONFIG.verticalThickness / 2,  // Half-width
        RACK_CONFIG.verticalHeight / 2,    // Half-height
        RACK_CONFIG.verticalThickness / 2  // Half-depth
    ));

    const leftVerticalTransform = new Ammo.btTransform();
    leftVerticalTransform.setIdentity();
    leftVerticalTransform.setOrigin(new Ammo.btVector3(
        -RACK_CONFIG.verticalHeight / 2,  // Position under barbell
        RACK_CONFIG.verticalHeight / 2,  // Centered vertically
        0                                // Centered depth-wise
    ));
    compoundShape.addChildShape(leftVerticalTransform, verticalShape);

    const rightVerticalTransform = new Ammo.btTransform();
    rightVerticalTransform.setIdentity();
    rightVerticalTransform.setOrigin(new Ammo.btVector3(
        RACK_CONFIG.verticalHeight / 2,
        RACK_CONFIG.verticalHeight / 2,
        0
    ));
    compoundShape.addChildShape(rightVerticalTransform, verticalShape);

    // Add Holder Collision Boxes
    const holderShape = new Ammo.btBoxShape(new Ammo.btVector3(
        RACK_CONFIG.holderLength / 2,   // Half-length
        RACK_CONFIG.holderHeight / 2,  // Half-height
        RACK_CONFIG.holderThickness / 2 // Half-thickness
    ));

    const leftHolderTransform = new Ammo.btTransform();
    leftHolderTransform.setIdentity();
    leftHolderTransform.setOrigin(new Ammo.btVector3(
        -RACK_CONFIG.verticalHeight / 2,
        RACK_CONFIG.verticalHeight - RACK_CONFIG.holderOffsetFromTop,
        0 // Centered depth-wise
    ));
    compoundShape.addChildShape(leftHolderTransform, holderShape);

    const rightHolderTransform = new Ammo.btTransform();
    rightHolderTransform.setIdentity();
    rightHolderTransform.setOrigin(new Ammo.btVector3(
        RACK_CONFIG.verticalHeight / 2,
        RACK_CONFIG.verticalHeight - RACK_CONFIG.holderOffsetFromTop,
        0 // Centered depth-wise
    ));
    compoundShape.addChildShape(rightHolderTransform, holderShape);

    // Add Compound Shape to the Physics World
    const rackMass = 0; // Static object
    const rackTransform = new Ammo.btTransform();
    rackTransform.setIdentity();
    rackTransform.setOrigin(new Ammo.btVector3(0, 0, 0));

    const motionState = new Ammo.btDefaultMotionState(rackTransform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    const rackBody = new Ammo.btRigidBody(
        new Ammo.btRigidBodyConstructionInfo(rackMass, motionState, compoundShape, localInertia)
    );

    physicsWorld.addRigidBody(rackBody);
}


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
    if (!playerBody) {
        console.warn("playerBody is undefined.");
        return;
    }
    const velocity = playerBody.getLinearVelocity();
    if (velocity.y() < 0.1) { // Threshold to determine if on or near the ground
        // Apply an upward impulse
        const jumpForce = new Ammo.btVector3(0, 15, 0); // Adjusted Y value for jump strength as per user specification
        playerBody.applyCentralImpulse(jumpForce);
    }
}

// ==============================
// Update Functions
// ==============================

// Function to update the player's position based on joystick input and physics
function updatePlayerPosition() {
    if (!playerBody) {
        console.warn("playerBody is undefined in updatePlayerPosition.");
        return;
    }

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
    const rotation = transform.getRotation();

    player.position.set(origin.x(), origin.y(), origin.z());
    player.quaternion.set(rotation.x(), rotation.y(), rotation.z(), rotation.w());
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

// ==============================
// Joystick Event Handlers
// ==============================

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
                // Clamping the pitch between minPitch and maxPitch
                pitch = Math.max(minPitch, Math.min(maxPitch, pitch + deltaY * rotationSpeed));
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

// ==============================
// Camera Update
// ==============================

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

// ==============================
// Animation Loop
// ==============================

function animate() {
    requestAnimationFrame(animate);
    physicsWorld.stepSimulation(1 / 60, 10);
    updatePlayerPosition();
    updateBarbellPosition();
    updateCameraPosition();
    renderer.render(scene, camera);
}

// ==============================
// Start the Game
// ==============================

loadAmmoAndStartGame();
