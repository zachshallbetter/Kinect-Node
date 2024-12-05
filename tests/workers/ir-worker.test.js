const { expect } = require('chai');
const sinon = require('sinon');
const { Worker } = require('worker_threads');
const path = require('path');

describe('IRWorker', () => {
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
                minIR: 0,
                maxIR: 65535,
                frameSize: {
                    width: 512,
                    height: 424
                }
            }
        };

        // Set up worker thread globals
        global.parentPort = mockParentPort;
        global.workerData = config;

        const IRWorker = require('../../src/services/workers/ir-worker');
        worker = new IRWorker(config);
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
            expect(worker.frameWidth).to.equal(config.processing.frameSize.width);
            expect(worker.frameHeight).to.equal(config.processing.frameSize.height);
        });

        it('should fall back to workerData if no config provided', () => {
            const defaultWorker = new IRWorker();
            expect(defaultWorker.config).to.equal(config);
        });
    });

    describe('frame processing', () => {
        it('should process IR frames correctly', async () => {
            const frameSize = config.processing.frameSize.width * config.processing.frameSize.height;
            const mockFrame = new Uint16Array(frameSize);
            mockFrame.fill(1000); // Mid-range IR value

            worker.processFrame = sinon.stub().resolves(mockFrame);

            const message = { frame: mockFrame };
            await mockParentPort.on.args[0][1](message);

            expect(worker.processFrame.calledWith(mockFrame)).to.be.true;
            expect(mockParentPort.postMessage.calledOnce).to.be.true;

            const response = mockParentPort.postMessage.args[0][0];
            expect(response.data).to.equal(mockFrame);
            expect(response.processTime).to.be.a('number');
            expect(worker.isProcessing).to.be.false;
        });

        it('should skip processing if already handling a frame', async () => {
            worker.isProcessing = true;
            const message = { frame: new Uint16Array(10) };
            
            await mockParentPort.on.args[0][1](message);
            
            expect(mockParentPort.postMessage.called).to.be.false;
        });

        it('should handle processing errors gracefully', async () => {
            const error = new Error('Processing failed');
            worker.processFrame = sinon.stub().rejects(error);
            
            const message = { frame: new Uint16Array(10) };
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
