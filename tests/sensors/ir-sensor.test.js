const { expect } = require('chai');
const sinon = require('sinon');
const IRSensor = require('../../src/services/sensors/ir-sensor');

describe('IRSensor', () => {
    let sensor;
    let mockKinect;
    let config;

    beforeEach(() => {
        mockKinect = {
            openInfraredReader: sinon.stub().returns(true),
            closeInfraredReader: sinon.stub().resolves(),
            on: sinon.stub(),
            removeAllListeners: sinon.stub()
        };

        config = {
            baseSensor: {
                bufferPool: {
                    maxPoolSize: 10,
                    initialSize: 3,
                    expandSize: 2
                }
            },
            sensors: {
                infrared: {
                    frameSize: {
                        width: 512,
                        height: 424
                    },
                    processing: {
                        format: 'uint16',
                        gammaCorrection: true
                    }
                }
            }
        };

        sensor = new IRSensor(mockKinect, config);
    });

    afterEach(async () => {
        await sensor.cleanup();
    });

    describe('initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(sensor.sensorType).to.equal('infrared');
            expect(sensor.isRunning).to.be.false;
            expect(sensor.frameWidth).to.equal(512);
            expect(sensor.frameHeight).to.equal(424);
            expect(sensor.format).to.equal('uint16');
            expect(sensor.gammaCorrection).to.be.true;
        });

        it('should throw if kinect is missing', () => {
            expect(() => new IRSensor(null))
                .to.throw(TypeError, 'Valid Kinect device instance is required');
        });
    });

    describe('start/stop', () => {
        it('should start IR sensor correctly', async () => {
            await sensor.start();
            
            expect(mockKinect.openInfraredReader.calledOnce).to.be.true;
            expect(mockKinect.on.calledWith('infraredFrame')).to.be.true;
            expect(sensor.isRunning).to.be.true;
        });

        it('should stop IR sensor correctly', async () => {
            await sensor.start();
            await sensor.stop();
            
            expect(mockKinect.closeInfraredReader.calledOnce).to.be.true;
            expect(mockKinect.removeAllListeners.calledWith('infraredFrame')).to.be.true;
            expect(sensor.isRunning).to.be.false;
        });

        it('should handle initialization errors', async () => {
            mockKinect.openInfraredReader.returns(false);
            
            try {
                await sensor.start();
                expect.fail('Should have thrown error');
            } catch (err) {
                expect(err.message).to.equal('Failed to open IR reader');
            }
            expect(sensor.isRunning).to.be.false;
        });
    });

    describe('frame processing', () => {
        it('should process IR frames correctly', async () => {
            let frameEmitted = false;
            sensor.on('frame', frame => {
                expect(frame.type).to.equal('infrared');
                expect(frame.width).to.equal(512);
                expect(frame.height).to.equal(424);
                expect(frame.timestamp).to.be.a('number');
                expect(frame.frameNumber).to.be.a('number');
                expect(frame.metadata).to.exist;
                expect(frame.metadata.processTime).to.be.a('number');
                expect(frame.metadata.format).to.equal('uint16');
                frameEmitted = true;
            });

            await sensor.start();
            
            // Simulate worker message
            sensor._handleWorkerMessage({
                data: Buffer.alloc(512 * 424 * 2),
                processTime: 16
            });

            expect(frameEmitted).to.be.true;
        });
    });
});
