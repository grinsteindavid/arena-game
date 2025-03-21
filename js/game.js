import { Player } from './player.js';
import { HomeTownMap } from './maps/HomeTownMap.js';
import { ForestMap } from './maps/darkForest/base.js';
import { InputHandler } from './input.js';
import { Dialog } from './UI/Dialog.js';
import { Transition } from './UI/Transition.js';
import { GameOver } from './UI/GameOver.js';
import { IntroScene } from './UI/IntroScene.js';
import { MenuUI } from './UI/MenuUI.js';
// InventoryUI is now imported in Player class
import { DepthsDarkForestMap } from './maps/darkForest/depths.js';
import { DragonLairMap } from './maps/dragonLair/base.js';

/**
 * Main game controller class that manages the game loop, maps, and player interactions.
 */
export class Game {
    /** @private @type {HTMLCanvasElement} Canvas element for rendering */
    _canvas;
    /** @private @type {CanvasRenderingContext2D} 2D rendering context */
    _ctx;
    /** @private @type {Object.<string, BaseMap>} Collection of game maps */
    _maps;
    /** @private @type {BaseMap} Currently active map */
    _currentMap;
    /** @private @type {Player} Player instance */
    _player;
    /** @private @type {InputHandler} Input handler instance */
    _input;
    /** @private @type {boolean} Debug mode state */
    _debug = false;
    /** @private @type {Dialog} Dialog instance */
    _dialog;
    /** @private @type {Transition} Transition system for scene changes */
    _transition;
    /** @private @type {GameOver} Game over screen manager */
    _gameOver;
    /** @private @type {IntroScene} Intro scene manager */
    _introScene;
    /** @private @type {MenuUI} Menu UI manager */
    _menuUI;
    // Inventory UI manager is now part of the Player class

    /**
     * Creates a new Game instance.
     * @param {HTMLCanvasElement} canvas - The canvas element for rendering the game
     */
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._initializeCanvas();
        this._initializeMaps();
        this._initializeGameComponents();
        this._dialog = new Dialog();
        this._transition = new Transition();
        this._gameOver = new GameOver();
        this._introScene = new IntroScene();
        this._menuUI = new MenuUI(this);
        // InventoryUI is now initialized in the Player class
        
        // Flag to track if the page is currently visible/active
        this._isPageVisible = true;
        
        // Set up visibility change detection
        this._setupVisibilityChangeDetection();
        
        // Show intro scene first instead of starting game immediately
        this._showIntroScreen();
        
        requestAnimationFrame(this._gameLoop.bind(this));
    }

    /**
     * Initializes canvas properties and focus.
     * @private
     */
    _initializeCanvas() {
        this._canvas.width = 800;
        this._canvas.height = 600;
        this._canvas.focus();
    }

    /**
     * Initializes and connects game maps.
     * @private
     */
    _initializeMaps() {
        this._maps = {
            hometown: new HomeTownMap({ game: this }),
            darkForest: new ForestMap({ game: this }),
            darkForestDepths: new DepthsDarkForestMap({ game: this }),
            dragonLair: new DragonLairMap({ game: this })
        };

        this._currentMap = this._maps.hometown;
    }

    /**
     * Initializes player, input handler and other game components.
     * @private
     */
    _initializeGameComponents() {
        const startPos = this._currentMap.getInitialPlayerPosition();
        this._input = new InputHandler();
        this._player = new Player(startPos.x, startPos.y);
        
        this._player.setGame(this);
        this._player.setMap(this._currentMap);
        this._player.setInput(this._input);
    }

    /**
     * Changes the current map and updates player position with a transition effect.
     * @param {string} mapName - Name of the destination map
     * @param {Object} [destination] - Optional destination coordinates
     * @param {number} destination.x - X coordinate in tiles
     * @param {number} destination.y - Y coordinate in tiles
     */
    changeMap(mapName, destination) {
        // Don't allow changing map during transition
        if (this._transition.isActive() || this._player.isTransitioning) {
            return;
        }
        
        // Lock player movement during transition
        this._player.isTransitioning = true;
        
        // Start the transition sequence
        this._transition.transition(async () => {
            // This callback runs between fade out and fade in
            this._currentMap = this._maps[mapName];
            const pos = destination ? {
                x: destination.x * this._currentMap.tileSize,
                y: destination.y * this._currentMap.tileSize
            } : this._currentMap.getInitialPlayerPosition();

            this._player.x = pos.x;
            this._player.y = pos.y;
            this._player.targetX = pos.x;
            this._player.targetY = pos.y;
            this._player.setMap(this._currentMap);
            
            // Small delay to ensure map is fully loaded
            return new Promise(resolve => setTimeout(resolve, 100));
        }).then(() => {
            // Release player movement lock after fade-in plus a delay
            setTimeout(() => {
                this._player.isTransitioning = false;
            }, 100); // Keep player locked for 2 seconds after fade-in completes
        });
    }

    // NOTE: _setupDebugMode method removed - MenuUI now directly accesses game instance
    
    /**
     * Sets up visibility change detection for tab switching.
     * @private
     */
    _setupVisibilityChangeDetection() {
        // Listen for visibility change events
        document.addEventListener('visibilitychange', () => {
            this._isPageVisible = document.visibilityState === 'visible';
            
            // Reset the frame timing when the page becomes visible again
            // This prevents large deltaTime values when coming back to the tab
            if (this._isPageVisible) {
                this._lastUpdateTime = performance.now();
                this._lastFrameTime = performance.now();
                
                // Force a render to prevent black screen
                this._render();
            }
        });
    }

    /**
     * Updates debug state for game components.
     * @private
     */
    _updateDebugState() {
        this._player.setDebug(this._debug);
        this._currentMap.setDebug(this._debug);
    }

    /**
     * Updates game state.
     * @private
     */
    _update() {
        // Don't update the game if dialog is active, transition is in progress, intro is showing, menu is open, inventory is open, or game over is shown
        if (this._dialog.isActive()) {
            if (this._input.isPressed('e') || this._input.isPressed(' ')) {
                this._dialog.hide();
            }
            return; // Pause game updates while dialog is showing
        }
        
        if (this._menuUI.isVisible() || this._player.inventoryUI.isVisible()) {
            return; // Pause game updates while menu or inventory is open
        }
        
        // Pausing during transitions is handled at the individual component level
        if (this._transition.isActive() || this._gameOver.isVisible() || this._introScene.isVisible()) {
            return;
        }
        
        // Get current timestamp for delta time calculation
        const now = performance.now();
        const deltaTime = now - (this._lastUpdateTime || now);
        this._lastUpdateTime = now;
        
        // Update map first (including NPCs)
        if (this._currentMap && typeof this._currentMap.update === 'function') {
            this._currentMap.update(this._player, deltaTime);
        }
        
        // Then update player
        this._player.update();
        this._updateDebugState();
    }

    /**
     * Renders the current game state.
     * @private
     */
    _render() {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._ctx.save();
        this._currentMap.render(this._ctx);
        this._player.render(this._ctx);
        this._ctx.restore();
    }

    /**
     * Main game loop that handles updates and rendering.
     * @private
     */
    _gameLoop = () => {
        // Get current timestamp for delta time calculation
        const now = performance.now();
        
        // Prevent huge deltaTime when tab is inactive
        // This can cause issues with particle effects when returning to the tab
        const deltaTime = Math.min(now - (this._lastFrameTime || now), 100);
        this._lastFrameTime = now;
        
        // Only update if the page is visible to save resources when tab is inactive
        if (this._isPageVisible) {
            this._update();
            this._render();
        }
        
        requestAnimationFrame(this._gameLoop);
    }

    /**
     * Shows a dialog with the given message or conversation.
     * @param {string|string[]} messages - The message(s) to display
     * @param {Function} [onComplete] - Optional callback when conversation ends
     */
    showDialog(messages, onComplete = null) {
        this._dialog.startConversation(messages, onComplete);
    }
    
    /**
     * Shows the intro screen and hides game controls
     * @private
     */
    _showIntroScreen() {
        console.log('Showing intro screen - hiding controls');
        // Hide controls when showing intro screen
        if (this._input && this._input.hideControls) {
            this._input.hideControls();
        }
        
        // Show intro scene with callback for starting game
        this._introScene.show(() => {
            // Start the actual game when START is clicked
            console.log('Game started from intro screen!');
            
            // Show controls when game starts
            if (this._input && this._input.showControls) {
                this._input.showControls();
            }
        });
    }

     /**
     * Handles game over event when player dies
     */
     handleGameOver() {
        console.log('Game Over triggered!');
        
        // Hide controls when showing game over screen
        if (this._input && this._input.hideControls) {
            this._input.hideControls();
        }
        
        // Show the game over screen with a callback for restart
        this._gameOver.show(() => {
            // Use the restartGame method to restart
            this.restartGame();
            console.log('Game restarted!');
        });
    }
    
    /**
     * Restarts the game and shows the intro screen
     */
    restartGame() {
        // Reset the player's health
        this._player.resetHealth();
        this._initializeMaps();
        
        // Reset player to starting position
        const startPos = this._maps.hometown.getInitialPlayerPosition();
        this._player.x = startPos.x;
        this._player.y = startPos.y;
        this._player.targetX = startPos.x;
        this._player.targetY = startPos.y;
        this._player.setMap(this._currentMap);
        
        // Show the intro screen again
        this._showIntroScreen();
    }
}

// Initialize game when window loads
window.addEventListener('load', () => {
    const canvas = document.getElementById('gameCanvas');
    canvas.tabIndex = 0;
    new Game(canvas);
});
