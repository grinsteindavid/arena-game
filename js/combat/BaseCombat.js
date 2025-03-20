/**
 * BaseCombat.js
 * Base class for combat systems that handles shared functionality between player and NPC combat.
 * Provides common methods and properties for health management, animations, and combat mechanics.
 */
import { HealthBar } from '../UI/HealthBar.js';
import { AnimationManager } from '../animations/AnimationManager.js';
import { DamageNumberAnimation } from '../animations/DamageNumber.js';
import { HitAnimation } from '../animations/HitAnimation.js';
import { BuffAnimation } from '../animations/BuffAnimation.js';

export class BaseCombat {
    /** @type {number} Maximum health points */
    maxHealth = 100;
    /** @type {number} Current health points */
    currentHealth = 100;
    /** @type {boolean} Whether to show the health bar */
    showHealthBar = true;
    /** @type {number} Time in milliseconds to show health bar after taking damage */
    healthBarDisplayTime = 3000;
    /** @type {number} Timestamp when health bar should hide */
    healthBarHideTime = 0;
    /** @type {number} Cooldown duration between attacks in milliseconds */
    attackCooldown = 1000;
    /** @type {number} Timestamp when entity can attack again */
    nextAttackTime = 0;
    /** @type {number} Amount of damage dealt per attack */
    attackDamage = 10;
    /** @type {number} Range in pixels of attack */
    attackRange = 40;
    /** @type {boolean} Whether entity is showing damage effect */
    isDamaged = false;
    /** @type {number} Duration of damage visual effect in frames */
    damageEffectDuration = 20;
    /** @type {number} Timer for damage effect */
    damageEffectTimer = 0;
    
    /** @type {Object} Reference to the entity object */
    entity = null;
    
    /**
     * Creates a new BaseCombat instance.
     * @param {Object} entity - Reference to the entity (player or NPC)
     * @param {Object} options - Configuration options
     */
    constructor(entity, options = {}) {
        this.entity = entity;
        
        // Apply options if provided
        if (options.maxHealth) this.maxHealth = options.maxHealth;
        if (options.attackDamage) this.attackDamage = options.attackDamage;
        if (options.attackRange) this.attackRange = options.attackRange;
        if (options.attackCooldown) this.attackCooldown = options.attackCooldown;
        
        // Initialize current health
        this.currentHealth = this.maxHealth;
        this.healthBarHideTime = Date.now() + this.healthBarDisplayTime;
        
        // Initialize UI components
        this.healthBar = new HealthBar({
            width: options.healthBarWidth || 32,
            height: options.healthBarHeight || 5,
            yOffset: options.healthBarYOffset || -10,
            colors: options.healthBarColors || {
                background: 'rgba(40, 40, 40, 0.8)',
                border: 'rgba(0, 0, 0, 0.8)',
                fill: 'rgba(200, 0, 0, 0.9)',
                low: 'rgba(200, 200, 0, 0.8)',
                critical:'rgba(255, 50, 50, 1.0)'
            }
        });
        
        // Initialize animations
        this.animations = new AnimationManager(this.entity);
        this.animations.registerAnimationType('hit', HitAnimation);
        this.animations.registerAnimationType('damage', DamageNumberAnimation);
        
        // Register buff animation if available (not in all implementations)
        if (typeof BuffAnimation !== 'undefined') {
            this.animations.registerAnimationType('buff', BuffAnimation);
        }
    }
    
    /**
     * Takes damage and reduces health
     * @param {number} amount - Amount of damage to take
     * @returns {boolean} - Whether the entity was defeated
     */
    takeDamage(amount) {
        this.currentHealth = Math.max(0, this.currentHealth - amount);
        this.healthBarHideTime = Date.now() + this.healthBarDisplayTime;
        
        // Visual effects
        this.isDamaged = true;
        this.damageEffectTimer = this.damageEffectDuration;
        
        // Show hit animation
        this.animations.play('hit');
        this.animations.play('damage', {value: amount});
        
        // Check if entity is defeated
        if (this.currentHealth <= 0) {
            this._handleDefeat();
            return true;
        }
        
        return false;
    }
    
    /**
     * Heals the entity by increasing health
     * @param {number} amount - Amount of health to restore
     */
    heal(amount) {
        this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
        this.healthBarHideTime = Date.now() + this.healthBarDisplayTime;
        
        // Show heal animation if available
        if (this.animations.hasType('heal')) {
            this.animations.play('heal', {value: amount});
        } else if (this.animations.hasType('buff')) {
            this.animations.play('buff', {value: amount});
        }
    }
    
    /**
     * Resets the entity's health to maximum
     */
    resetHealth() {
        this.currentHealth = this.maxHealth;
        this.isDamaged = false;
    }
    
    /**
     * Handles entity defeat when health reaches zero
     * @protected
     */
    _handleDefeat() {
        // Implementation in subclasses
    }
    
    /**
     * Faces the entity towards a target based on relative position
     * @param {number} dx - X distance to target (target.x - entity.x)
     * @param {number} dy - Y distance to target (target.y - entity.y)
     * @protected
     */
    _faceTowardsTarget(dx, dy) {
        // Determine predominant direction (horizontal or vertical)
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal direction is predominant
            this.entity.direction = dx > 0 ? 'right' : 'left';
        } else {
            // Vertical direction is predominant
            this.entity.direction = dy > 0 ? 'down' : 'up';
        }
    }
    
    /**
     * Check if target is in attack range
     * @param {Object} target - The target object
     * @returns {boolean} - Whether target is in attack range
     */
    isTargetInAttackRange(target) {
        // Calculate distance between entity and target
        const entityCenterX = this.entity.x + (this.entity.width / 2);
        const entityCenterY = this.entity.y + (this.entity.height / 2);
        const targetCenterX = target.x + (target.width / 2);
        const targetCenterY = target.y + (target.height / 2);
        
        const dx = targetCenterX - entityCenterX;
        const dy = targetCenterY - entityCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= this.attackRange;
    }
    
    /**
     * Updates the combat system state each frame.
     */
    update() {
        // Update damage effect timer if active
        if (this.isDamaged) {
            this.damageEffectTimer--;
            if (this.damageEffectTimer <= 0) {
                this.isDamaged = false;
            }
        }
        
        // Update animations
        this.animations.update();
    }
    
    /**
     * Renders the health bar and animations above the entity
     * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
     * @param {number} screenX - Screen X coordinate
     * @param {number} screenY - Screen Y coordinate
     */
    render(ctx, screenX, screenY) {
        // Draw health bar if enabled and not at full health
        if (this.showHealthBar && this.currentHealth < this.maxHealth) {
            this.healthBar.render(ctx, screenX, screenY, this.currentHealth, this.maxHealth, this.entity.width);
        }

        // Render animations
        this.animations.render(ctx, screenX, screenY, this.entity.width, this.entity.height);
    }
    
    /**
     * Gets whether the entity should be currently displayed (for damage flashing effects)
     * @returns {boolean} - Whether the entity should be visible
     */
    shouldRenderEntity() {
        return !this.isDamaged || Math.floor(Date.now() / 100) % 2 === 0;
    }
}
