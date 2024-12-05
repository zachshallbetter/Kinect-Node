const { BaseSensor } = require('./base-sensor');

/**
 * @extends BaseSensor
 * Handles color sensor data processing and worker thread management
 */
class ColorSensor extends BaseSensor {
    /**
     * @param {Object} config - Sensor configuration
     * @param {Object} kinect - Kinect device instance
     * @throws {Error} If required config or kinect instance is missing
     */
    constructor(config, kinect) {
        super(config, kinect);
        
        // Initialize processing config
        this.frameWidth = config.sensors?.color?.frameSize?.width;
        this.frameHeight = config.sensors?.color?.frameSize?.height;
        this.format = config.sensors?.color?.processing?.format;
        this.compression = config.sensors?.color?.processing?.compression;
    }

    /**
     * Initialize color reader
     * @protected
     * @async
     * @throws {Error} If color reader fails to initialize
     */
    async _initializeReader() {
        if (!this.kinect.openColorReader()) {
            throw new Error('Failed to open color reader');
        }
    }

    /**
     * Handle worker messages
     * @protected
     * @param {Object} processedFrame - Processed frame data from worker
     */
    _handleWorkerMessage(processedFrame) {
        const frameData = {
            type: 'color',
            timestamp: Date.now(),
            frameNumber: this.frameCount++,
            width: this.frameWidth,
            height: this.frameHeight,
            format: this.format,
            data: processedFrame.data,
            metadata: {
                processTime: processedFrame.processTime,
                compressed: this.compression?.enabled,
                compressionFormat: this.compression?.enabled ? this.compression.format : null,
                quality: this.compression?.enabled ? this.compression.quality : null
            }
        };

        this.emit('frame', frameData);
        this.updateMetrics(processedFrame.processTime);
    }

    /**
     * Set up event listeners for color frames
     * @protected
     */
    _setupEventListeners() {
        this.kinect.on('colorFrame', (frame) => {
            if (this.worker && this.isRunning) {
                this.worker.postMessage({ 
                    frame,
                    timestamp: Date.now()
                });
            }
        });
    }

    /**
     * Clean up resources
     * @protected
     * @async
     */
    async _cleanupResources() {
        // Clean up event listeners
        this.kinect.removeAllListeners('colorFrame');
        await this.kinect.closeColorReader();

        // Terminate worker
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = ColorSensor;
