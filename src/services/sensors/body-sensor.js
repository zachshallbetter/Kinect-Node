const { BaseSensor } = require('./base-sensor');

/**
 * @extends BaseSensor
 * Handles body tracking sensor data processing and worker thread management
*/
class BodySensor extends BaseSensor {
    /**
     * @param {Object} kinect - Kinect device instance
     * @throws {Error} If required kinect instance is missing
     */
    constructor(kinect) {
        const sensorConfig = {
            ...config.baseSensor,
            ...config.sensors.body,
            type: 'body'
        };
        super(sensorConfig, kinect);

        this.workerPath = path.resolve(__dirname, '../workers/body-worker.js');
        this.processingConfig = config.sensors.body.processing;
    }

    /**
     * Initialize body reader
     * @protected
     * @async
     */
    async _initializeReader() {
        await this.kinect.openBodyReader();
    }

    /**
     * Set up body frame event listeners
     * @protected
     */
    _setupEventListeners() {
        this.kinect.on('bodyFrame', (frame) => {
            if (this.worker && this.isRunning) {
                this.worker.postMessage({ frame });
            }
        });
    }

    /**
     * Handle worker messages
     * @protected
     * @param {Object} message - Message from worker
     */
    _handleWorkerMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'frameProcessed':
                this.emit('frame', {
                    type: 'body',
                    timestamp: Date.now(),
                    frameNumber: this.frameCount++,
                    bodies: data.bodies,
                    metadata: {
                        processTime: data.processTime,
                        metrics: data.metrics
                    }
                });
                this.updateMetrics(data.processTime);
                break;
                
            case 'movement':
                this.emit('movement', data);
                break;
                
            case 'gesture':
                this.emit('gesture', data);
                break;
        }
    }

    /**
     * Clean up resources
     * @protected
     * @async
     */
    async _cleanupResources() {
        // Clean up event listeners
        this.kinect.removeAllListeners('bodyFrame');
        await this.kinect.closeBodyReader();

        // Terminate worker
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = BodySensor;