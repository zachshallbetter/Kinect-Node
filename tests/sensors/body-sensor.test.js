const { expect } = require('chai');
const sinon = require('sinon');
const BodySensor = require('../../src/services/sensors/body-sensor');
const { Worker } = require('worker_threads');
const path = require('path');
const config = require('../../src/services/service-config');

describe('BodySensor', () => {
    let sensor;
    let mockKinect;

    beforeEach(() => {
        mockKinect = {
            openBodyReader: sinon.stub().resolves(),
            closeBodyReader: sinon.stub().resolves(),
            on: sinon.stub(),
            removeAllListeners: sinon.stub()
        };

        sensor = new BodySensor(mockKinect);
    });

    afterEach(async () => {
        await sensor.cleanup();
        sinon.restore();
    });

    describe('initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(sensor.type).to.equal('body');
            expect(sensor.isRunning).to.be.false;
            expect(sensor.kinect).to.equal(mockKinect);
            expect(sensor.frameCount).to.equal(0);
            expect(sensor.processingConfig).to.equal(config.sensors.body.processing);
            expect(sensor.workerPath).to.include('body-worker.js');
        });

        it('should throw if kinect is missing', () => {
            expect(() => new BodySensor(null))
                .to.throw(TypeError, 'Valid Kinect device instance is required');
        });
    });

    describe('start/stop', () => {
        it('should start body sensor correctly', async () => {
            await sensor.start();
            
            expect(mockKinect.openBodyReader.calledOnce).to.be.true;
            expect(mockKinect.on.calledWith('bodyFrame')).to.be.true;
            expect(sensor.isRunning).to.be.true;
        });

        it('should stop body sensor correctly', async () => {
            await sensor.start();
            await sensor.stop();
            
            expect(mockKinect.closeBodyReader.calledOnce).to.be.true;
            expect(mockKinect.removeAllListeners.calledWith('bodyFrame')).to.be.true;
            expect(sensor.isRunning).to.be.false;
        });

        it('should handle start errors', async () => {
            mockKinect.openBodyReader.rejects(new Error('Failed to open'));
            
            await sensor.start();
            expect(sensor.isRunning).to.be.false;
        });

        it('should handle stop errors', async () => {
            mockKinect.closeBodyReader.rejects(new Error('Failed to close'));
            
            await sensor.start();
            await sensor.stop();
            expect(sensor.isRunning).to.be.false;
        });
    });

    describe('frame processing', () => {
        beforeEach(async () => {
            await sensor.start();
        });

        it('should process body frames correctly', () => {
            const mockFrame = {
                bodies: [{
                    id: 1,
                    tracked: true,
                    joints: []
                }]
            };

            let frameEmitted = false;
            sensor.on('frame', frame => {
                expect(frame.type).to.equal('body');
                expect(frame.timestamp).to.be.a('number');
                expect(frame.frameNumber).to.be.a('number');
                expect(frame.bodies).to.exist;
                expect(frame.metadata).to.exist;
                frameEmitted = true;
            });

            sensor._handleWorkerMessage({
                type: 'frameProcessed',
                data: {
                    bodies: mockFrame.bodies,
                    processTime: 10,
                    metrics: {}
                }
            });

            expect(frameEmitted).to.be.true;
        });

        it('should emit movement events', () => {
            let movementEmitted = false;
            sensor.on('movement', data => {
                expect(data).to.exist;
                movementEmitted = true;
            });

            sensor._handleWorkerMessage({
                type: 'movement',
                data: { bodyId: 1, movement: 'jump' }
            });

            expect(movementEmitted).to.be.true;
        });

        it('should emit gesture events', () => {
            let gestureEmitted = false;
            sensor.on('gesture', data => {
                expect(data).to.exist;
                gestureEmitted = true;
            });

            sensor._handleWorkerMessage({
                type: 'gesture',
                data: { bodyId: 1, gesture: 'wave' }
            });

            expect(gestureEmitted).to.be.true;
        });
    });

    describe('cleanup', () => {
        it('should cleanup all resources', async () => {
            await sensor.start();
            await sensor.cleanup();
            
            expect(sensor.worker).to.be.null;
            expect(sensor.isRunning).to.be.false;
            expect(mockKinect.removeAllListeners.calledWith('bodyFrame')).to.be.true;
            expect(mockKinect.closeBodyReader.calledOnce).to.be.true;
        });
    });
});