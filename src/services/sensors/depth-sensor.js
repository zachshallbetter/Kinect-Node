const { BaseSensor } = require('./base-sensor');

/**
 * @extends BaseSensor
 * Handles depth sensor data processing and worker thread management
 */
class DepthSensor extends BaseSensor {
    /**
     * @param {Object} config - Sensor configuration
     * @param {Object} config.sensors.depth - Depth sensor configuration
     * @param {Object} config.baseSensor - Base sensor configuration
     * @param {Object} kinect - Kinect device instance
     * @throws {TypeError} If config or kinect parameters are invalid
     */
    constructor(config, kinect) {
        if (!config?.sensors?.depth) {
            throw new TypeError('Depth sensor configuration is required');
        }

        const baseConfig = {
            ...config.baseSensor,
            type: 'depth',
            bufferPool: config.baseSensor.bufferPool,
            worker: config.baseSensor.worker,
            logger: config.baseSensor.logger
        };

        super(baseConfig, kinect);
        
        this.config = config.sensors.depth;
        this.frameQueue = [];
        this.maxQueueSize = config.sensors.depth.performance.maxQueueSize;
    }

    /**
     * Initialize sensor-specific reader
     * @protected
     * @async
     */
    async _initializeReader() {
        await this.kinect.openDepthReader();
    }

    /**
     * Set up sensor-specific event listeners
     * @protected
     */
    _setupEventListeners() {
        this.kinect.on('depth', this._processFrame.bind(this));
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
                    type: 'depth',
                    data: this.currentBuffer,
                    timestamp: Date.now(),
                    frameNumber: this.frameCount,
                    width: this.config.frameSize.width,
                    height: this.config.frameSize.height,
                    processTime: data.processTime,
                    ...data
                });
                
                if (this.currentBuffer) {
                    this.releaseBuffer('depth', this.currentBuffer);
                    this.currentBuffer = null;
                }
                
                this.updateMetrics(data.processTime);
                break;
        }
    }

    /**
     * Processes incoming depth frames and sends to worker thread
     * @private
     * @param {Buffer} depthFrame - Raw depth frame data
     */
    _processFrame(depthFrame) {
        if (!this.isRunning) return;

        try {
            // Validate frame size
            const expectedSize = this.config.frameSize.width * this.config.frameSize.height * 2;
            if (depthFrame.length !== expectedSize) {
                throw new Error(`Invalid frame size: ${depthFrame.length}, expected: ${expectedSize}`);
            }

            // Handle backpressure with frame queue
            if (this.frameQueue.length >= this.maxQueueSize) {
                this.logger.warn('Frame queue full, dropping oldest frame');
                const oldFrame = this.frameQueue.shift();
                this.releaseBuffer('depth', oldFrame);
                this.performanceStats.missedFrames++;
                return;
            }

            // Acquire new buffer for frame data
            this.currentBuffer = this.acquireBuffer('depth');
            if (!this.currentBuffer) return;

            // Copy frame data to buffer
            depthFrame.copy(this.currentBuffer);
            this.frameQueue.push(this.currentBuffer);

            this.worker.postMessage({
                type: 'processFrame',
                buffer: this.currentBuffer,
                config: this.config.processing
            }, [this.currentBuffer.buffer]);

        } catch (error) {
            this.logger.error('Error processing depth frame:', error);
            this.emit('error', error);
            if (this.currentBuffer) {
                this.releaseBuffer('depth', this.currentBuffer);
                this.currentBuffer = null;
            }
        }
    }

    /**
     * Clean up resources
     * @async
     */
    async cleanup() {
        // Clean up queued frames
        while (this.frameQueue.length > 0) {
            const frame = this.frameQueue.shift();
            this.releaseBuffer('depth', frame);
        }

        await super.cleanup();
    }
}

module.exports = DepthSensor;