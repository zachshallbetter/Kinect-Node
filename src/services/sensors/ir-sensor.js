const { BaseSensor } = require('./base-sensor');

/**
 * IR sensor implementation for Kinect V2
 * Handles processing and management of infrared frame data
 * 
 * @extends BaseSensor
 * @fires IRSensor#frame - Emitted when an IR frame is processed
 * @fires IRSensor#error - Emitted on processing errors
 */
class IRSensor extends BaseSensor {
    /**
     * @param {Object} kinect - Kinect device instance
     * @throws {TypeError} If kinect parameter is invalid
     */
    constructor(kinect) {
        const sensorConfig = {
            ...config.baseSensor,
            ...config.sensors.infrared,
            type: 'infrared'
        };
        super(sensorConfig, kinect);

        // Initialize from config
        this.frameWidth = config.sensors.infrared.frameSize.width;
        this.frameHeight = config.sensors.infrared.frameSize.height;
        this.format = config.sensors.infrared.processing.format;
        this.gammaCorrection = config.sensors.infrared.processing.gammaCorrection;
    }

    // Protected Methods

    async _initializeReader() {
        if (!this.kinect.openInfraredReader()) {
            throw new Error('Failed to open IR reader');
        }
    }

    _setupEventListeners() {
        this.kinect.on('infraredFrame', (frame) => {
            if (this.worker && this.isRunning) {
                this.worker.postMessage({ frame });
            }
        });
    }

    _handleWorkerMessage(processedFrame) {
        this.emit('frame', {
            type: 'infrared',
            timestamp: Date.now(),
            frameNumber: this.frameCount++,
            width: this.frameWidth,
            height: this.frameHeight,
            data: processedFrame.data,
            metadata: {
                processTime: processedFrame.processTime,
                format: this.format
            }
        });
        this.updateMetrics(processedFrame.processTime);
    }

    /**
     * Clean up IR sensor specific resources
     * @protected
     * @async
     */
    async _cleanupResources() {
        // Clean up event listeners
        this.kinect.removeAllListeners('infraredFrame');
        await this.kinect.closeInfraredReader();
        await super._cleanupResources();
    }
}

module.exports = IRSensor;