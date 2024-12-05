const { parentPort, workerData } = require('worker_threads');
const { performance } = require('perf_hooks');
const config = require('@config.js');

/**
 * Base worker class providing common functionality for sensor workers
 * @abstract
 */
class BaseWorker {
    /**
     * @param {Object} config - Worker configuration from workerData
     */
    constructor(config = workerData) {
        this.config = config;
        this.isProcessing = false;
        this.lastProcessTime = 0;

        this._setupMessageHandler();
    }

    /**
     * Set up message handler for parent thread communication
     * @private
     */
    _setupMessageHandler() {
        parentPort.on('message', async (message) => {
            if (message.type === 'healthCheck') {
                parentPort.postMessage({ type: 'healthCheck', status: 'ok' });
                return;
            }

            if (this.isProcessing) {
                return; // Skip if still processing previous frame
            }

            try {
                this.isProcessing = true;
                const startTime = performance.now();
                
                const processedData = await this.processFrame(message.frame);
                
                this.lastProcessTime = performance.now() - startTime;

                parentPort.postMessage({
                    data: processedData,
                    processTime: this.lastProcessTime
                });

            } catch (error) {
                parentPort.postMessage({
                    error: error.message,
                    stack: error.stack
                });
            } finally {
                this.isProcessing = false;
            }
        });
    }

    /**
     * Process a frame of sensor data
     * @abstract
     * @param {*} frame - Frame data to process
     * @returns {Promise<*>} Processed frame data
     */
    async processFrame(frame) {
        throw new Error('processFrame() must be implemented by derived class');
    }
}

module.exports = BaseWorker;
