const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const path = require('path');
const { Worker } = require('worker_threads');

/**
 * Base class for all Kinect sensors providing common functionality
 * @abstract
 * @fires BaseSensor#started - Emitted when sensor starts
 * @fires BaseSensor#stopped - Emitted when sensor stops
 * @fires BaseSensor#frame - Emitted when a frame is processed
 * @fires BaseSensor#frameMissed - Emitted when a frame is dropped
 * @fires BaseSensor#metrics - Emitted with performance metrics
 * @fires BaseSensor#error - Emitted on errors
 */
class BaseSensor extends EventEmitter {
    /**
     * @param {Object} config - Sensor configuration
     * @param {Object} kinect - Kinect device instance
     * @throws {TypeError} If config or kinect parameters are invalid
     */
    constructor(config, kinect) {
        super();
        
        // Validate constructor parameters
        if (!config) {
            throw new TypeError('Valid configuration is required');
        }
        if (!kinect) {
            throw new TypeError('Valid Kinect device instance is required');
        }

        // Initialize core properties
        this.config = config;
        this.kinect = kinect;
        this.type = config.type || 'unknown';
        this.logger = config.logger || console;
        
        // Frame tracking state
        this.isRunning = false;
        this.frameCount = 0;
        this.lastFrameTime = performance.now();
        this.fps = 0;

        // Worker management
        this.worker = null;
        this.workerRestartAttempts = 0;
        this.maxWorkerRestarts = config.worker?.maxRestarts || 3;
        this.frameTimeout = config.worker?.frameTimeout || 5000;
        this.healthCheckInterval = null;
        
        // Initialize performance monitoring
        this.performanceStats = this._createInitialStats();
    }

    // Lifecycle Methods
    
    /**
     * Start the sensor
     * @async
     * @fires BaseSensor#started
     * @throws {Error} If sensor fails to start
     */
    async start() {
        if (this.isRunning) return;

        try {
            this.logger.info(`Starting ${this.type} sensor...`);
            this.isRunning = true;
            this.frameCount = 0;
            this.lastFrameTime = performance.now();
            
            await this._initializeReader();
            await this._initializeWorker();
            this._setupEventListeners();

            this.logger.info(`${this.type} sensor started successfully`);
            this.emit('started');
        } catch (error) {
            this.isRunning = false;
            this.logger.error(`Failed to start ${this.type} sensor:`, error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Stop the sensor
     * @async
     * @fires BaseSensor#stopped
     */
    async stop() {
        if (!this.isRunning) return;

        try {
            this.logger.info(`Stopping ${this.type} sensor...`);
            this.isRunning = false;

            await this._cleanupResources();
            this.logger.info(`${this.type} sensor stopped successfully`);
            this.emit('stopped');
        } catch (error) {
            this.logger.error(`Error stopping ${this.type} sensor:`, error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Clean up resources
     * @async
     */
    async cleanup() {
        if (this.isRunning) {
            await this.stop();
        }

        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
    }

    // Worker Management Methods

    /**
     * Initialize worker thread
     * @protected
     * @async
     */
    async _initializeWorker() {
        const workerPath = path.join(__dirname, `../workers/${this.type}-worker.js`);
        
        this.worker = new Worker(workerPath, {
            workerData: this.config.processing
        });

        this._setupWorkerEventHandlers();
        this._startWorkerHealthCheck();
    }

    /**
     * Set up worker event handlers
     * @protected
     */
    _setupWorkerEventHandlers() {
        this.worker.on('message', this._handleWorkerMessage.bind(this));
        
        this.worker.on('error', error => {
            this.logger.error(`${this.type} worker error:`, error);
            this.emit('error', error);
            this._handleWorkerError();
        });
    }

    /**
     * Handle worker errors and attempt restart
     * @protected
     * @async
     */
    async _handleWorkerError() {
        if (this.workerRestartAttempts >= this.maxWorkerRestarts) {
            this.logger.error('Max worker restart attempts reached');
            await this.stop();
            return;
        }

        this.workerRestartAttempts++;
        this.logger.info(`Attempting worker restart (${this.workerRestartAttempts}/${this.maxWorkerRestarts})`);
        
        if (this.worker) {
            await this.worker.terminate();
        }
        await this._initializeWorker();
    }

    /**
     * Start worker health check interval
     * @protected
     */
    _startWorkerHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(() => {
            this.worker.postMessage({ type: 'healthCheck' });
        }, this.config.worker?.healthCheckInterval || 30000);
    }

    // Performance Monitoring Methods

    /**
     * Update performance metrics after frame processing
     * @protected
     * @param {number} processTime - Time taken to process the frame in milliseconds
     * @fires BaseSensor#metrics
     */
    updateMetrics(processTime) {
        this.frameCount++;
        const now = performance.now();
        const timeDiff = now - this.lastFrameTime;

        if (timeDiff >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / timeDiff);
            this.frameCount = 0;
            this.lastFrameTime = now;
            
            this._updateProcessingStats(processTime);

            this.emit('metrics', {
                type: this.type,
                fps: this.fps,
                ...this.performanceStats
            });

            this.performanceStats.lastUpdate = now;
        }
    }

    /**
     * Get current sensor status and metrics
     * @returns {Object} Status object with metrics
     */
    getStatus() {
        return {
            type: this.type,
            isRunning: this.isRunning,
            fps: this.fps,
            performanceStats: { ...this.performanceStats },
            workerStatus: {
                restartAttempts: this.workerRestartAttempts,
                maxRestarts: this.maxWorkerRestarts
            }
        };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics() {
        this.frameCount = 0;
        this.lastFrameTime = performance.now();
        this.performanceStats = this._createInitialStats();
    }

    // Abstract Methods (to be implemented by subclasses)
    
    /**
     * Initialize sensor-specific reader
     * @abstract
     * @protected
     * @async
     */
    async _initializeReader() {
        throw new Error('_initializeReader must be implemented by subclass');
    }

    /**
     * Set up sensor-specific event listeners
     * @abstract
     * @protected
     */
    _setupEventListeners() {
        throw new Error('_setupEventListeners must be implemented by subclass');
    }

    /**
     * Handle worker messages
     * @abstract
     * @protected
     * @param {Object} message - Message from worker
     */
    _handleWorkerMessage(message) {
        throw new Error('_handleWorkerMessage must be implemented by subclass');
    }

    // Private Helper Methods

    /**
     * Create initial performance stats object
     * @private
     * @returns {Object} Initial stats object
     */
    _createInitialStats() {
        return {
            processTime: 0,
            maxProcessTime: 0,
            minProcessTime: Number.MAX_VALUE,
            totalProcessTime: 0,
            missedFrames: 0,
            lastUpdate: performance.now()
        };
    }

    /**
     * Update processing time statistics
     * @private
     * @param {number} processTime - Processing time in milliseconds
     */
    _updateProcessingStats(processTime) {
        this.performanceStats.processTime = processTime;
        this.performanceStats.maxProcessTime = Math.max(
            this.performanceStats.maxProcessTime,
            processTime
        );
        this.performanceStats.minProcessTime = Math.min(
            this.performanceStats.minProcessTime,
            processTime
        );
        this.performanceStats.totalProcessTime += processTime;
    }
}

module.exports = { BaseSensor };