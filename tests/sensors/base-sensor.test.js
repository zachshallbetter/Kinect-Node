const { expect } = require('chai');
const sinon = require('sinon');
const BaseSensor = require('../../src/services/sensors/base-sensor');
const { performance } = require('perf_hooks');
const { Worker } = require('worker_threads');

class TestSensor extends BaseSensor {
    async _initializeReader() {}
    _setupEventListeners() {}
    _handleWorkerMessage() {}
}

describe('BaseSensor', () => {
    let sensor;
    let mockKinect;
    let config;
    let clock;

    beforeEach(() => {
        mockKinect = {
            on: sinon.stub(),
            removeAllListeners: sinon.stub()
        };

        config = {
            type: 'test',
            bufferPool: {
                maxPoolSize: 10,
                initialSize: 2,
                expandSize: 2
            },
            worker: {
                enabled: true,
                maxRestarts: 3,
                frameTimeout: 5000,
                healthCheckInterval: 30000
            },
            logger: {
                info: sinon.stub(),
                error: sinon.stub(),
                warn: sinon.stub()
            }
        };

        clock = sinon.useFakeTimers();
        sensor = new TestSensor(config, mockKinect);
    });

    afterEach(async () => {
        clock.restore();
        sinon.restore();
        await sensor.cleanup();
    });

    describe('initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(sensor.config).to.equal(config);
            expect(sensor.kinect).to.equal(mockKinect);
            expect(sensor.type).to.equal('test');
            expect(sensor.isRunning).to.be.false;
            expect(sensor.frameCount).to.equal(0);
            expect(sensor.workerRestartAttempts).to.equal(0);
            expect(sensor.maxWorkerRestarts).to.equal(3);
            expect(sensor.frameTimeout).to.equal(5000);
            expect(sensor.worker).to.be.null;
            expect(sensor.currentBuffer).to.be.null;
            expect(sensor.bufferPool).to.exist;
            expect(sensor.performanceStats).to.exist;
        });

        it('should throw if kinect is missing', () => {
            expect(() => new TestSensor(config, null))
                .to.throw(TypeError, 'Valid Kinect device instance is required');
        });

        it('should throw if config is missing', () => {
            expect(() => new TestSensor(null, mockKinect))
                .to.throw(TypeError, 'Valid configuration with buffer pool settings is required');
        });
    });

    describe('lifecycle methods', () => {
        it('should start sensor correctly', async () => {
            await sensor.start();
            
            expect(sensor.isRunning).to.be.true;
            expect(sensor.frameCount).to.equal(0);
            expect(sensor.worker).to.exist;
        });

        it('should not restart if already running', async () => {
            await sensor.start();
            const initialTime = sensor.lastFrameTime;
            
            clock.tick(1000);
            await sensor.start();
            
            expect(sensor.lastFrameTime).to.equal(initialTime);
        });

        it('should stop sensor correctly', async () => {
            await sensor.start();
            await sensor.stop();
            
            expect(sensor.isRunning).to.be.false;
            expect(sensor.worker).to.be.null;
        });

        it('should handle cleanup', async () => {
            await sensor.start();
            
            await sensor.cleanup();
            
            expect(sensor.isRunning).to.be.false;
            expect(sensor.worker).to.be.null;
            expect(sensor.healthCheckInterval).to.be.null;
            expect(sensor.currentBuffer).to.be.null;
        });
    });

    describe('worker management', () => {
        it('should handle worker errors', async () => {
            await sensor.start();
            await sensor._handleWorkerError();
            
            expect(sensor.workerRestartAttempts).to.equal(1);
            expect(sensor.worker).to.exist;
        });

        it('should stop after max worker restarts', async () => {
            await sensor.start();
            sensor.workerRestartAttempts = sensor.maxWorkerRestarts;
            
            await sensor._handleWorkerError();
            
            expect(sensor.isRunning).to.be.false;
        });
    });

    describe('metrics and status', () => {
        it('should update metrics correctly', () => {
            const processTime = 16;
            sensor.frameCount = 30;
            sensor.lastFrameTime = performance.now() - 1000;
            
            sensor.updateMetrics(processTime);
            
            expect(sensor.fps).to.equal(30);
            expect(sensor.performanceStats.processTime).to.equal(processTime);
        });

        it('should get sensor status', () => {
            const status = sensor.getStatus();
            
            expect(status.type).to.equal('test');
            expect(status.isRunning).to.be.false;
            expect(status.fps).to.equal(0);
            expect(status.performanceStats).to.exist;
            expect(status.bufferStats).to.exist;
            expect(status.workerStatus).to.deep.equal({
                restartAttempts: 0,
                maxRestarts: 3
            });
        });

        it('should reset metrics', () => {
            sensor.frameCount = 100;
            sensor.fps = 30;
            sensor.performanceStats.processTime = 1000;
            
            sensor.resetMetrics();
            
            expect(sensor.frameCount).to.equal(0);
            expect(sensor.performanceStats).to.deep.equal(sensor._createInitialStats());
        });
    });
});