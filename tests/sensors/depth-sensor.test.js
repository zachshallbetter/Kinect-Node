const { expect } = require('chai');
const sinon = require('sinon');
const DepthSensor = require('../../src/services/sensors/depth-sensor');

describe('DepthSensor', () => {
    let sensor;
    let mockKinect;
    let config;

    beforeEach(() => {
        mockKinect = {
            openDepthReader: sinon.stub().resolves(true),
            closeDepthReader: sinon.stub().resolves(),
            on: sinon.stub(),
            removeAllListeners: sinon.stub()
        };

        config = {
            baseSensor: {
                bufferPool: {
                    maxPoolSize: 10,
                    initialSize: 2,
                    expandSize: 2
                },
                worker: {
                    enabled: true
                },
                logger: {
                    debug: sinon.stub(),
                    error: sinon.stub(),
                    warn: sinon.stub()
                }
            },
            sensors: {
                depth: {
                    frameSize: {
                        width: 512,
                        height: 424
                    },
                    processing: {
                        filterThreshold: 100,
                        maxDepth: 4500
                    },
                    performance: {
                        maxQueueSize: 3
                    }
                }
            }
        };

        sensor = new DepthSensor(config, mockKinect);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(sensor.config).to.equal(config.sensors.depth);
            expect(sensor.frameQueue).to.deep.equal([]);
            expect(sensor.maxQueueSize).to.equal(3);
            expect(sensor.isRunning).to.be.false;
        });

        it('should throw if depth sensor config is missing', () => {
            const invalidConfig = {
                baseSensor: config.baseSensor
            };
            expect(() => new DepthSensor(invalidConfig, mockKinect))
                .to.throw(TypeError, 'Depth sensor configuration is required');
        });

        it('should throw if kinect is missing', () => {
            expect(() => new DepthSensor(config, null))
                .to.throw(TypeError, 'Valid Kinect device instance is required');
        });
    });

    describe('start/stop', () => {
        it('should start depth sensor correctly', async () => {
            await sensor.start();
            
            expect(mockKinect.openDepthReader.calledOnce).to.be.true;
            expect(mockKinect.on.calledWith('depth')).to.be.true;
            expect(sensor.isRunning).to.be.true;
        });

        it('should stop depth sensor correctly', async () => {
            await sensor.start();
            await sensor.stop();
            
            expect(mockKinect.removeAllListeners.calledWith('depth')).to.be.true;
            expect(sensor.isRunning).to.be.false;
        });

        it('should handle initialization errors', async () => {
            mockKinect.openDepthReader.resolves(false);
            
            try {
                await sensor.start();
                expect.fail('Should have thrown error');
            } catch (err) {
                expect(err.message).to.equal('Failed to open depth reader');
            }
            expect(sensor.isRunning).to.be.false;
        });
    });

    describe('frame processing', () => {
        let mockFrame;

        beforeEach(() => {
            mockFrame = Buffer.alloc(512 * 424 * 2);
            sensor.start();
        });

        it('should process depth frames correctly', () => {
            let frameEmitted = false;
            sensor.on('frame', frame => {
                expect(frame.type).to.equal('depth');
                expect(frame.data).to.exist;
                expect(frame.timestamp).to.be.a('number');
                expect(frame.frameNumber).to.be.a('number');
                expect(frame.width).to.equal(512);
                expect(frame.height).to.equal(424);
                expect(frame.processTime).to.be.a('number');
                frameEmitted = true;
            });

            sensor._handleWorkerMessage({
                type: 'frameProcessed',
                data: {
                    processTime: 16
                }
            });

            expect(frameEmitted).to.be.true;
        });

        it('should handle invalid frame size', () => {
            let errorEmitted = false;
            sensor.on('error', error => {
                expect(error.message).to.include('Invalid frame size');
                errorEmitted = true;
            });

            sensor._processFrame(Buffer.alloc(10));
            expect(errorEmitted).to.be.true;
        });

        it('should handle frame queue backpressure', () => {
            // Fill queue to max
            for (let i = 0; i <= sensor.maxQueueSize; i++) {
                sensor._processFrame(mockFrame);
            }

            expect(sensor.performanceStats.missedFrames).to.be.above(0);
            expect(sensor.logger.warn.called).to.be.true;
        });
    });

    describe('cleanup', () => {
        it('should cleanup resources properly', async () => {
            sensor.frameQueue = [Buffer.alloc(10), Buffer.alloc(10)];
            const releaseSpy = sinon.spy(sensor, 'releaseBuffer');

            await sensor.cleanup();

            expect(releaseSpy.callCount).to.equal(2);
            expect(sensor.frameQueue).to.have.length(0);
        });
    });
});