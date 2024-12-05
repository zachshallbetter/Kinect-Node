const { expect } = require('chai');
const sinon = require('sinon');
const { Worker } = require('worker_threads');
const { performance } = require('perf_hooks');
const path = require('path');

describe('BaseWorker', () => {
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
            }
        };

        // Set up worker thread globals
        global.parentPort = mockParentPort;
        global.workerData = config;

        const BaseWorker = require('../../src/services/workers/base-worker');
        worker = new BaseWorker(config);
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
            expect(worker.lastProcessTime).to.equal(0);
        });

        it('should fall back to workerData if no config provided', () => {
            const defaultWorker = new BaseWorker();
            expect(defaultWorker.config).to.equal(config);
        });
    });

    describe('frame processing', () => {
        it('should process frames and track timing correctly', async () => {
            const mockFrame = Buffer.from([1, 2, 3]);
            const mockProcessedData = Buffer.from([4, 5, 6]);
            
            worker.processFrame = sinon.stub().resolves(mockProcessedData);
            
            const message = { frame: mockFrame };
            await mockParentPort.on.args[0][1](message);

            expect(worker.processFrame.calledWith(mockFrame)).to.be.true;
            expect(mockParentPort.postMessage.calledOnce).to.be.true;
            
            const response = mockParentPort.postMessage.args[0][0];
            expect(response.data).to.equal(mockProcessedData);
            expect(response.processTime).to.be.a('number');
            expect(worker.isProcessing).to.be.false;
        });

        it('should skip processing if already handling a frame', async () => {
            worker.isProcessing = true;
            const message = { frame: Buffer.from([1, 2, 3]) };
            
            await mockParentPort.on.args[0][1](message);
            
            expect(mockParentPort.postMessage.called).to.be.false;
        });

        it('should handle processing errors gracefully', async () => {
            const error = new Error('Processing failed');
            worker.processFrame = sinon.stub().rejects(error);
            
            const message = { frame: Buffer.from([1, 2, 3]) };
            await mockParentPort.on.args[0][1](message);

            expect(mockParentPort.postMessage.calledOnce).to.be.true;
            expect(mockParentPort.postMessage.args[0][0]).to.deep.equal({
                error: error.message,
                stack: error.stack
            });
            expect(worker.isProcessing).to.be.false;
        });

        it('should require processFrame implementation in derived classes', async () => {
            try {
                await worker.processFrame(Buffer.from([1, 2, 3]));
                expect.fail('Should have thrown error');
            } catch (err) {
                expect(err.message).to.equal('processFrame() must be implemented by derived class');
            }
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
