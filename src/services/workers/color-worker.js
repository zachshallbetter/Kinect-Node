const BaseWorker = require('./base-worker');
const { performance } = require('perf_hooks');

class ColorWorker extends BaseWorker {
    constructor(config) {
        super(config);
        const { frameSize, processing } = config;
        this.frameWidth = frameSize.width;
        this.frameHeight = frameSize.height;
        this.processing = processing;
        this.chunkSize = 1024; // Match other workers' batch processing approach
    }

    /**
     * Process a single frame of color data
     * @param {Object} frame - Frame data object
     * @param {Buffer} frame.buffer - Raw RGBA color data
     * @returns {Object} Processed frame data
     */
    async processFrame(frame) {
        this._validateFrame(frame.buffer);

        let processedFrame = Buffer.from(frame.buffer);

        if (this.processing.compression.enabled) {
            processedFrame = await this._compressFrame(processedFrame);
        }

        if (this.processing.forceOpacity) {
            this._enforceOpacity(processedFrame);
        }

        return {
            processedFrame,
            width: this.frameWidth,
            height: this.frameHeight,
            format: this.processing.format,
            compressed: this.processing.compression.enabled
        };
    }

    /**
     * Validate incoming frame data
     * @private
     * @param {Buffer} buffer - Frame buffer to validate
     * @throws {Error} If frame data is invalid
     */
    _validateFrame(buffer) {
        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Invalid frame data: missing buffer');
        }

        const expectedSize = this.frameWidth * this.frameHeight * 4; // 4 bytes per pixel (RGBA)
        if (buffer.length !== expectedSize) {
            throw new Error(`Invalid frame size: ${buffer.length}, expected: ${expectedSize}`);
        }
    }

    /**
     * Ensure full opacity for all pixels in chunks
     * @private
     * @param {Buffer} buffer - Frame buffer to process
     */
    _enforceOpacity(buffer) {
        for (let offset = 3; offset < buffer.length; offset += this.chunkSize * 4) {
            const end = Math.min(offset + (this.chunkSize * 4), buffer.length);
            for (let i = offset; i < end; i += 4) {
                buffer[i] = 255; // Set alpha channel to fully opaque
            }
        }
    }

    /**
     * Compress frame data according to config settings
     * @private
     * @param {Buffer} buffer - Frame buffer to compress
     * @returns {Promise<Buffer>} Compressed frame data
     */
    async _compressFrame(buffer) {
        // TODO: Implement compression using config.sensors.color.processing.compression settings
        // For now, return uncompressed buffer
        return buffer;
    }
}

module.exports = new ColorWorker();
