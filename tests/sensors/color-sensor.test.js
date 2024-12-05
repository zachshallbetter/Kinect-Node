const { expect } = require('chai');
const sinon = require('sinon');
const ColorSensor = require('../../src/services/sensors/color-sensor');

describe('ColorSensor', () => {
    let sensor;
    let mockKinect;
    let config;
    let clock;

    beforeEach(() => {
        mockKinect = {
            openColorReader: sinon.stub().returns(true),
            closeColorReader: sinon.stub().resolves(),
            on: sinon.stub(),
            removeAllListeners: sinon.stub()
        };

        config = {
            baseSensor: {
                bufferPool: {
                    maxPoolSize: 10,
                    initialSize: 3,
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
            },
            sensors: {
                color: {
                    frameSize: {
                        width: 1920,
                        height: 1080
                    },
                    processing: {
                        format: 'rgba',
                        compression: {
                            enabled: true,
                            quality: 0.8,
                            format: 'jpeg'
                        }
                    }
                }
            }
        };

        clock = sinon.useFakeTimers();
        sensor = new ColorSensor(config, mockKinect);
    });

    afterEach(async () => {
        clock.restore();
        sinon.restore();
        await sensor.cleanup();
    });

    describe('initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(sensor.frameWidth).to.equal(1920);
            expect(sensor.frameHeight).to.equal(1080);
            expect(sensor.format).to.equal('rgba');
            expect(sensor.compression).to.deep.equal({
                enabled: true,
                quality: 0.8,
                format: 'jpeg'
            });
            expect(sensor.isRunning).to.be.false;
            expect(sensor.frameCount).to.equal(0);
            expect(sensor.worker).to.be.null;
            expect(sensor.workerRestartAttempts).to.equal(0);
        });

        it('should throw if kinect is missing', () => {
            expect(() => new ColorSensor(config, null))
                .to.throw(TypeError, 'Valid Kinect device instance is required');
        });

        it('should throw if config is missing', () => {
            expect(() => new ColorSensor(null, mockKinect))
                .to.throw(TypeError, 'Valid configuration with buffer pool settings is required');
        });
    });

    describe('lifecycle methods', () => {
        it('should start color sensor correctly', async () => {
            await sensor.start();
            
            expect(mockKinect.openColorReader.calledOnce).to.be.true;
            expect(mockKinect.on.calledWith('colorFrame')).to.be.true;
            expect(sensor.isRunning).to.be.true;
            expect(sensor.worker).to.exist;
        });

        it('should stop color sensor correctly', async () => {
            await sensor.start();
            await sensor.stop();
            
            expect(mockKinect.closeColorReader.calledOnce).to.be.true;
            expect(mockKinect.removeAllListeners.calledWith('colorFrame')).to.be.true;
            expect(sensor.isRunning).to.be.false;
            expect(sensor.worker).to.be.null;
        });

        it('should handle initialization errors', async () => {
            mockKinect.openColorReader.returns(false);
            
            try {
                await sensor.start();
                expect.fail('Should have thrown error');
            } catch (err) {
                expect(err.message).to.equal('Failed to open color reader');
            }
            expect(sensor.isRunning).to.be.false;
        });
    });

    describe('frame processing', () => {
        it('should process color frames correctly', async () => {
            let frameEmitted = false;
            sensor.on('frame', frame => {
                expect(frame).to.deep.include({
                    type: 'color',
                    width: 1920,
                    height: 1080,
                    format: 'rgba',
                    frameNumber: 0,
                    metadata: {
                        processTime: 16,
                        compressed: true,
                        compressionFormat: 'jpeg',
                        quality: 0.8
                    }
                });
                expect(frame.timestamp).to.be.a('number');
                expect(frame.data).to.be.instanceOf(Buffer);
                frameEmitted = true;
            });

            await sensor.start();
            
            sensor._handleWorkerMessage({
                data: Buffer.alloc(1920 * 1080 * 4),
                processTime: 16
            });

            expect(frameEmitted).to.be.true;
        });

        it('should update metrics after frame processing', async () => {
            await sensor.start();
            
            sensor._handleWorkerMessage({
                data: Buffer.alloc(1920 * 1080 * 4),
                processTime: 16
            });

            const status = sensor.getStatus();
            expect(status.performanceStats.processTime).to.equal(16);
            expect(status.frameCount).to.equal(1);
        });
    });
});
