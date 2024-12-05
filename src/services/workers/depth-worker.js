const BaseWorker = require('./base-worker');
const { performance } = require('perf_hooks');

class DepthWorker extends BaseWorker {
    constructor(config) {
        super(config);
        const { frameSize, processing, calibration } = config;
        this.frameWidth = frameSize.width;
        this.frameHeight = frameSize.height;
        this.processing = processing;
        this.calibration = calibration;
        this.chunkSize = 1024;
    }

    async processFrame(frame) {
        this._validateFrame(frame.buffer);

        const { minReliableDistance, maxReliableDistance } = this.calibration;
        const sourceFrame = new Uint16Array(frame.buffer.buffer);
        const processed = new Uint16Array(sourceFrame.length);

        this._processFrameChunks(sourceFrame, processed, minReliableDistance, maxReliableDistance);

        let result = {
            processedFrame: processed,
            minDepth: minReliableDistance,
            maxDepth: maxReliableDistance,
            width: this.frameWidth,
            height: this.frameHeight
        };

        if (this.processing.generatePointCloud) {
            result.pointCloud = this._generatePointCloud(processed, {
                width: this.frameWidth,
                height: this.frameHeight,
                focalLength: this.calibration.focalLength,
                ppx: this.calibration.principalPointX,
                ppy: this.calibration.principalPointY
            });
        }

        if (this.processing.colorize) {
            result.colorized = this._colorizeDepth(processed, {
                colorMap: this.processing.colorMap,
                minDepth: minReliableDistance,
                maxDepth: maxReliableDistance
            });
        }

        return result;
    }

    _validateFrame(buffer) {
        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Invalid or missing frame buffer');
        }

        const expectedSize = this.frameWidth * this.frameHeight * 2;
        if (buffer.length !== expectedSize) {
            throw new Error(`Invalid buffer size: Expected ${expectedSize} bytes`);
        }
    }

    _processFrameChunks(frame, processed, minDepth, maxDepth) {
        const chunkSize = Math.min(this.chunkSize, frame.length);
        for (let offset = 0; offset < frame.length; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, frame.length);
            for (let i = offset; i < end; i++) {
                const depth = frame[i];
                if (this.processing.normalize) {
                    processed[i] = this._isValidDepth(depth, minDepth, maxDepth) ? 
                        this._normalizeDepth(depth, minDepth, maxDepth) : 0;
                } else {
                    processed[i] = this._isValidDepth(depth, minDepth, maxDepth) ? depth : 0;
                }
            }
        }
    }

    _isValidDepth(depth, min, max) {
        return depth >= min && 
               depth <= max && 
               depth > 0 &&
               (!this.processing.confidenceThreshold || depth >= this.processing.confidenceThreshold * max);
    }

    _normalizeDepth(depth, min, max) {
        const normalized = (depth - min) / (max - min);
        if (this.processing.gammaCorrection) {
            return Math.pow(normalized, 0.5);
        }
        return normalized;
    }

    _generatePointCloud(depthFrame, data) {
        this._validatePointCloudInput(data);
        
        const { width, height, focalLength, ppx, ppy } = data;
        const points = new Float32Array(width * height * 3);
        let pointIndex = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const depth = depthFrame[y * width + x];
                if (depth > 0) {
                    points[pointIndex++] = (x - ppx) * depth / focalLength;
                    points[pointIndex++] = (y - ppy) * depth / focalLength;
                    points[pointIndex++] = depth;
                }
            }
        }

        return points.slice(0, pointIndex);
    }

    _validatePointCloudInput(data) {
        const { width, height, focalLength, ppx, ppy } = data;
        
        if (!width || !height || width <= 0 || height <= 0) {
            throw new Error('Invalid dimensions');
        }
        if (!focalLength || focalLength <= 0) {
            throw new Error('Invalid focal length');
        }
        if (typeof ppx !== 'number' || typeof ppy !== 'number') {
            throw new Error('Invalid principal points');
        }
    }
}

module.exports = DepthWorker;