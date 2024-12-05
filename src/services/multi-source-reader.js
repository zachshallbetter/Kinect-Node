const EventEmitter = require('events');
const Kinect2 = require('kinect2');

/**
 * MultiSourceReader for synchronized frame capture from multiple Kinect sensors
 * @extends EventEmitter
 * @fires MultiSourceReader#started - When reader starts successfully
 * @fires MultiSourceReader#stopped - When reader stops successfully
 * @fires MultiSourceReader#synchronizedFrame - When synchronized frames are ready
 * @fires MultiSourceReader#frameDropped - When frames are dropped due to staleness
 * @fires MultiSourceReader#bufferOverflow - When frame buffer is full
 * @fires MultiSourceReader#error - When an error occurs
 */
class MultiSourceReader extends EventEmitter {
    // Configuration settings
    #config;
    #frameTypes;
    #requiredFrameTypes;
    #syncWindow;
    #maxSyncDelay;
    #dropFramesAfter;
    #bufferSize;

    // Runtime state
    #kinect;
    #running = false;
    #frameBuffer;
    #lastSyncTime = 0;

    // Performance metrics
    #stats = {
        syncedFrames: 0,
        droppedFrames: 0,
        lastSyncDelay: 0,
        maxSyncDelay: 0,
        frameDelays: new Map(),
        bufferOverflows: 0,
        syncAttempts: 0
    };

    /**
     * Create a new MultiSourceReader instance
     * @param {Kinect2} kinect - Kinect device instance
     * @param {Object} config - Configuration object
     * @throws {TypeError} If parameters are invalid
     */
    constructor(kinect, config) {
        super();
        this.#validateConstructorParams(kinect, config);

        this.#kinect = kinect;
        this.#config = config;
        this.#frameBuffer = new Map();

        this.#initializeConfiguration();
        this.#setupCleanupHandlers();
    }

    /**
     * Start capturing synchronized frames
     * @async
     * @throws {Error} If reader fails to start
     */
    async start() {
        if (this.#running) {
            throw new Error('MultiSourceReader is already running');
        }

        try {
            this.#resetState();
            
            if (!this.#kinect.openMultiSourceReader({ frameTypes: this.#frameTypes })) {
                throw new Error('Failed to open multi-source reader');
            }

            this.#kinect.on('multiSourceFrame', this.#handleMultiSourceFrame.bind(this));
            this.#running = true;
            this.emit('started');

        } catch (error) {
            this.emit('error', { message: 'Failed to start reader', error });
            throw error;
        }
    }

    /**
     * Stop capturing frames
     * @async
     */
    async stop() {
        if (!this.#running) return;

        try {
            this.#running = false;
            await this.#kinect.closeMultiSourceReader();
            this.#resetState();
            this.emit('stopped');
        } catch (error) {
            this.emit('error', { message: 'Failed to stop reader', error });
            throw error;
        }
    }

    /**
     * Get current performance statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        return {
            syncedFrames: this.#stats.syncedFrames,
            droppedFrames: this.#stats.droppedFrames,
            lastSyncDelay: this.#stats.lastSyncDelay,
            maxSyncDelay: this.#stats.maxSyncDelay,
            frameDelays: Object.fromEntries(this.#stats.frameDelays),
            bufferSize: this.#frameBuffer.size,
            bufferOverflows: this.#stats.bufferOverflows,
            syncAttempts: this.#stats.syncAttempts,
            running: this.#running
        };
    }

    // Private initialization methods

    #initializeConfiguration() {
        const { frameSync = {} } = this.#config;

        this.#syncWindow = frameSync.syncWindow || 33;
        this.#maxSyncDelay = frameSync.maxDelay || 100;
        this.#dropFramesAfter = frameSync.dropAfter || 66;
        this.#bufferSize = frameSync.bufferSize || 5;
        this.#requiredFrameTypes = new Set();

        this.#configureFrameTypes();
    }

    #configureFrameTypes() {
        const frameTypeMap = {
            depth: Kinect2.FrameType.depth,
            color: Kinect2.FrameType.color,
            body: Kinect2.FrameType.body,
            infrared: Kinect2.FrameType.infrared
        };

        this.#frameTypes = Object.entries(this.#config.sensors)
            .reduce((types, [key, config]) => {
                if (config?.enabled && frameTypeMap[key]) {
                    this.#requiredFrameTypes.add(key);
                    return types | frameTypeMap[key];
                }
                return types;
            }, 0);

        if (this.#frameTypes === 0) {
            throw new Error('At least one frame type must be enabled');
        }
    }

    // Frame processing methods

    #handleMultiSourceFrame(frame) {
        if (!this.#running || !frame) return;

        const timestamp = Date.now();

        try {
            this.#processFrameData(frame, timestamp);
            this.#checkSynchronization(timestamp);
        } catch (error) {
            this.emit('error', {
                message: 'Frame processing error',
                timestamp,
                error
            });
        }
    }

    #processFrameData(frame, timestamp) {
        for (const frameType of this.#requiredFrameTypes) {
            if (frame[frameType]) {
                this.#bufferFrame(frameType, frame[frameType], timestamp);
            }
        }
    }

    #bufferFrame(frameType, frameData, timestamp) {
        if (this.#frameBuffer.size >= this.#bufferSize) {
            this.#handleBufferOverflow(frameType, timestamp);
            return;
        }

        this.#frameBuffer.set(frameType, { frame: frameData, timestamp });
        this.#stats.frameDelays.set(frameType, timestamp - this.#lastSyncTime);
    }

    #checkSynchronization(timestamp) {
        this.#stats.syncAttempts++;

        if (!this.#isFrameBufferComplete()) return;

        const delays = Array.from(this.#frameBuffer.values())
            .map(data => timestamp - data.timestamp);
        
        const maxDelay = Math.max(...delays);
        const minDelay = Math.min(...delays);

        if (maxDelay - minDelay <= this.#syncWindow) {
            this.#emitSynchronizedFrame(timestamp);
        } else if (maxDelay > this.#dropFramesAfter) {
            this.#dropStaleFrames(timestamp);
        }
    }

    // Helper methods

    #validateConstructorParams(kinect, config) {
        if (!kinect || !(kinect instanceof Kinect2)) {
            throw new TypeError('Valid Kinect device instance required');
        }
        if (!config || typeof config !== 'object') {
            throw new TypeError('Valid configuration object required');
        }
    }

    #isFrameBufferComplete() {
        return Array.from(this.#requiredFrameTypes)
            .every(type => this.#frameBuffer.has(type));
    }

    #handleBufferOverflow(frameType, timestamp) {
        this.#stats.bufferOverflows++;
        this.emit('bufferOverflow', {
            frameType,
            bufferSize: this.#frameBuffer.size,
            timestamp
        });
    }

    #emitSynchronizedFrame(timestamp) {
        const syncedFrame = {
            timestamp,
            frames: Object.fromEntries(
                Array.from(this.#frameBuffer.entries())
                    .map(([type, data]) => [type, data.frame])
            )
        };

        this.#updateSyncStats(timestamp);
        this.#frameBuffer.clear();
        this.emit('synchronizedFrame', syncedFrame);
    }

    #updateSyncStats(timestamp) {
        this.#stats.syncedFrames++;
        this.#stats.lastSyncDelay = timestamp - this.#lastSyncTime;
        this.#stats.maxSyncDelay = Math.max(
            this.#stats.maxSyncDelay,
            this.#stats.lastSyncDelay
        );
        this.#lastSyncTime = timestamp;
    }

    #dropStaleFrames(timestamp) {
        for (const [frameType, data] of this.#frameBuffer.entries()) {
            if (timestamp - data.timestamp > this.#dropFramesAfter) {
                this.#frameBuffer.delete(frameType);
                this.#stats.droppedFrames++;
                this.emit('frameDropped', {
                    frameType,
                    timestamp: data.timestamp,
                    delay: timestamp - data.timestamp
                });
            }
        }
    }

    #resetState() {
        this.#frameBuffer.clear();
        this.#stats.frameDelays.clear();
        Object.assign(this.#stats, {
            syncedFrames: 0,
            droppedFrames: 0,
            lastSyncDelay: 0,
            maxSyncDelay: 0,
            bufferOverflows: 0,
            syncAttempts: 0
        });
        this.#lastSyncTime = 0;
    }

    #setupCleanupHandlers() {
        process.on('exit', () => this.stop());
        process.on('SIGINT', () => this.stop());
    }
}

module.exports = MultiSourceReader;