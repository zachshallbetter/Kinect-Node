const { expect } = require('chai');
const sinon = require('sinon');
const { Worker } = require('worker_threads');
const path = require('path');

describe('DepthWorker', () => {
    const FRAME_WIDTH = 512;
    const FRAME_HEIGHT = 424;
    const BYTES_PER_PIXEL = 2;
    const FRAME_SIZE = FRAME_WIDTH * FRAME_HEIGHT;
    const BUFFER_SIZE = FRAME_SIZE * BYTES_PER_PIXEL;

    let mockParentPort;
    let workerData;
    let worker;

    beforeEach(() => {
        mockParentPort = {
            postMessage: sinon.spy(),
            on: sinon.stub()
        };

        workerData = {
            config: {
                frameSize: {
                    width: FRAME_WIDTH,
                    height: FRAME_HEIGHT
                },
                processing: {
                    normalize: true,
                    confidenceThreshold: 0.5,
                    gammaCorrection: true,
                    generatePointCloud: false,
                    colorize: false
                },
                calibration: {
                    minReliableDistance: 500,
                    maxReliableDistance: 4500,
                    focalLength: 365.456,
                    principalPointX: FRAME_WIDTH / 2,
                    principalPointY: FRAME_HEIGHT / 2
                }
            }
        };

        global.parentPort = mockParentPort;
        global.workerData = workerData;

        const DepthWorker = require('../../src/services/workers/depth-worker');
        worker = new DepthWorker(workerData.config);
    });

    afterEach(() => {
        sinon.restore();
        delete global.parentPort;
        delete global.workerData;
    });

    describe('initialization', () => {
        it('should initialize with provided configuration', () => {
            expect(worker.frameWidth).to.equal(FRAME_WIDTH);
            expect(worker.frameHeight).to.equal(FRAME_HEIGHT);
            expect(worker.processing).to.deep.equal(workerData.config.processing);
            expect(worker.calibration).to.deep.equal(workerData.config.calibration);
            expect(worker.chunkSize).to.equal(1024);
        });
    });

    describe('frame processing', () => {
        it('should process depth frames correctly', async () => {
            const mockFrame = {
                buffer: Buffer.alloc(BUFFER_SIZE)
            };
            for (let i = 0; i < mockFrame.buffer.length; i += BYTES_PER_PIXEL) {
                mockFrame.buffer.writeUInt16LE(2000, i); // Mid-range depth value
            }

            const result = await worker.processFrame(mockFrame);

            expect(result.processedFrame).to.be.instanceOf(Uint16Array);
            expect(result.processedFrame.length).to.equal(FRAME_SIZE);
            expect(result.width).to.equal(FRAME_WIDTH);
            expect(result.height).to.equal(FRAME_HEIGHT);
            expect(result.minDepth).to.equal(workerData.config.calibration.minReliableDistance);
            expect(result.maxDepth).to.equal(workerData.config.calibration.maxReliableDistance);
        });

        it('should validate frame buffer', async () => {
            const invalidInputs = [
                { buffer: null },
                { buffer: undefined },
                { buffer: 'not a buffer' },
                { buffer: Buffer.alloc(10) } // Wrong size
            ];

            for (const invalidInput of invalidInputs) {
                try {
                    await worker.processFrame(invalidInput);
                    expect.fail('Should have thrown error');
                } catch (err) {
                    expect(err.message).to.match(/Invalid.*buffer/);
                }
            }
        });

        it('should filter and normalize depth values', async () => {
            const mockFrame = {
                buffer: Buffer.alloc(BUFFER_SIZE)
            };
            const testValues = [
                { value: 100, expected: 0 },     // Below min
                { value: 5000, expected: 0 },    // Above max
                { value: 2000, expected: 0.375 } // Valid, normalized with gamma
            ];

            testValues.forEach(({ value }, index) => {
                mockFrame.buffer.writeUInt16LE(value, index * BYTES_PER_PIXEL);
            });

            const result = await worker.processFrame(mockFrame);
            
            testValues.forEach(({ expected }, index) => {
                expect(result.processedFrame[index]).to.be.closeTo(expected, 0.001);
            });
        });

        it('should generate point cloud when enabled', async () => {
            worker.processing.generatePointCloud = true;
            
            const mockFrame = {
                buffer: Buffer.alloc(BUFFER_SIZE)
            };
            mockFrame.buffer.writeUInt16LE(2000, 0); // Single valid point

            const result = await worker.processFrame(mockFrame);

            expect(result.pointCloud).to.be.instanceOf(Float32Array);
            expect(result.pointCloud.length).to.be.at.least(3); // At least one 3D point
        });

        it('should process frames efficiently', async () => {
            const mockFrame = {
                buffer: Buffer.alloc(BUFFER_SIZE)
            };
            for (let i = 0; i < mockFrame.buffer.length; i += BYTES_PER_PIXEL) {
                mockFrame.buffer.writeUInt16LE(Math.floor(Math.random() * 4000) + 500, i);
            }

            const MAX_PROCESSING_TIME = 50;
            const startTime = performance.now();
            
            await worker.processFrame(mockFrame);
            
            const processTime = performance.now() - startTime;
            expect(processTime).to.be.below(MAX_PROCESSING_TIME);
        });
    });
});