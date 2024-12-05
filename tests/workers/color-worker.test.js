const { expect } = require('chai');
const sinon = require('sinon');
const { Worker } = require('worker_threads');
const path = require('path');

describe('ColorWorker', () => {
    let mockParentPort;
    let config;
    let worker;

    beforeEach(() => {
        mockParentPort = {
            postMessage: sinon.stub(),
            on: sinon.stub()
        };

        config = {
            processing: {
                format: 'rgba',
                compression: {
                    enabled: true,
                    quality: 0.8
                }
            },
            frameSize: {
                width: 1920,
                height: 1080
            }
        };

        // Set up worker thread globals
        global.parentPort = mockParentPort;
        global.workerData = config;

        const ColorWorker = require('../../src/services/workers/color-worker');
        worker = new ColorWorker(config);
    });

    afterEach(() => {
        sinon.restore();
        delete global.parentPort;
        delete global.workerData;
    });

    describe('initialization', () => {
        it('should initialize with provided configuration', () => {
            expect(worker.config).to.equal(config);
            expect(worker.isProcessing).to.be.false;
            expect(worker.frameWidth).to.equal(config.frameSize.width);
            expect(worker.frameHeight).to.equal(config.frameSize.height);
        });

        it('should fall back to workerData if no config provided', () => {
            const defaultWorker = new ColorWorker();
            expect(defaultWorker.config).to.equal(config);
        });
    });

    describe('frame processing', () => {
        it('should process frames and track timing correctly', async () => {
            const mockFrame = Buffer.alloc(config.frameSize.width * config.frameSize.height * 4);
            mockFrame.fill(100); // Fill with test color value
            
            const message = { frame: mockFrame, timestamp: Date.now() };
            await mockParentPort.on.args[0][1](message);

            expect(mockParentPort.postMessage.calledOnce).to.be.true;
            
            const response = mockParentPort.postMessage.args[0][0];
            expect(Buffer.isBuffer(response.data)).to.be.true;
            expect(response.data.length).to.equal(mockFrame.length);
            expect(response.processTime).to.be.a('number');
            expect(response.metadata).to.deep.include({
                compressed: config.processing.compression.enabled,
                compressionFormat: config.processing.compression.format,
                quality: config.processing.compression.quality
            });
            expect(worker.isProcessing).to.be.false;
        });

        it('should skip processing if already handling a frame', async () => {
            worker.isProcessing = true;
            const message = { frame: Buffer.alloc(1024) };
            
            await mockParentPort.on.args[0][1](message);
            
            expect(mockParentPort.postMessage.called).to.be.false;
        });

        it('should handle processing errors gracefully', async () => {
            const error = new Error('Processing failed');
            worker.processFrame = sinon.stub().rejects(error);
            
            const message = { frame: Buffer.alloc(1024) };
            await mockParentPort.on.args[0][1](message);

            expect(mockParentPort.postMessage.calledOnce).to.be.true;
            expect(mockParentPort.postMessage.args[0][0]).to.deep.equal({
                error: error.message,
                stack: error.stack
            });
            expect(worker.isProcessing).to.be.false;
        });
    });

    describe('health checks', () => {
        it('should respond to health check messages', () => {
            const message = { type: 'healthCheck' };
            mockParentPort.on.args[0][1](message);

            expect(mockParentPort.postMessage.calledOnce).to.be.true;
            expect(mockParentPort.postMessage.args[0][0]).to.deep.equal({
                type: 'healthCheck',
                status: 'ok'
            });
        });
    });
});
