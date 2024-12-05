const BaseWorker = require('./base-worker');
const { performance } = require('perf_hooks');

class IRWorker extends BaseWorker {
    constructor(config) {
        super(config);
        const { frameSize, processing } = config;
        this.frameWidth = frameSize.width;
        this.frameHeight = frameSize.height;
        this.processing = processing;
        this.chunkSize = 1024;
    }

    async processFrame(frame) {
        this._validateFrame(frame.buffer);

        const sourceFrame = new Uint16Array(frame.buffer);
        const processed = new Uint16Array(sourceFrame.length);

        this._processFrameChunks(sourceFrame, processed);

        return {
            processedFrame: processed,
            width: this.frameWidth,
            height: this.frameHeight,
            format: this.processing.format
        };
    }

    _validateFrame(buffer) {
        if (!buffer) {
            throw new Error('Invalid frame data: missing buffer');
        }

        const frame = new Uint16Array(buffer);
        const expectedSize = this.frameWidth * this.frameHeight;
        if (frame.length !== expectedSize) {
            throw new Error(`Invalid frame size: ${frame.length}, expected: ${expectedSize}`);
        }
    }

    _processFrameChunks(frame, processed) {
        for (let offset = 0; offset < frame.length; offset += this.chunkSize) {
            const end = Math.min(offset + this.chunkSize, frame.length);
            for (let i = offset; i < end; i++) {
                processed[i] = frame[i];
            }
        }

        if (this.processing.gammaCorrection) {
            this._applyGammaCorrection(processed);
        }
    }

    _applyGammaCorrection(data) {
        const gamma = 0.5;
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.pow(data[i] / 65535, gamma) * 65535;
        }
    }
}

module.exports = new IRWorker();
