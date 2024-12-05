const { expect } = require('chai');
const sinon = require('sinon');
const { Worker } = require('worker_threads');
const path = require('path');

describe('BodyWorker', () => {
    let mockParentPort;
    let workerData;
    let mockBuffer;

    beforeEach(() => {
        mockParentPort = {
            postMessage: sinon.spy(),
            on: sinon.stub()
        };

        workerData = {
            config: {
                smoothing: 0.5,
                confidenceThreshold: 0.5,
                movementThreshold: 0.01
            }
        };

        mockBuffer = Buffer.alloc(1024);
    });

    afterEach(() => {
        sinon.restore();
    });

    // Helper function to create mock body data
    const createMockBody = (overrides = {}) => ({
        trackingId: 1,
        tracked: true,
        joints: {
            'spineMid': {
                position: { x: 0, y: 0, z: 2 },
                trackingState: 2,
                confidence: 0.8
            },
            'head': {
                position: { x: 0, y: 1, z: 2 },
                trackingState: 2,
                confidence: 0.9
            }
        },
        handStates: {
            leftHandState: 2,
            rightHandState: 3
        },
        ...overrides
    });

    // Helper function to verify common message properties
    const verifyMessageCommonProps = (msg) => {
        expect(msg.data.timestamp).to.be.a('number').and.be.above(0);
        expect(msg.data.memoryUsage).to.exist.and.be.an('object');
    };

    describe('health checks', () => {
        it('should respond to health check messages with status and metrics', () => {
            mockParentPort.on.withArgs('message').yields({
                type: 'healthCheck'
            });

            mockParentPort.postMessage.callsFake(msg => {
                expect(msg.type).to.equal('healthCheck');
                expect(msg.data.status).to.equal('ok');
                verifyMessageCommonProps(msg);
            });
        });
    });

    describe('frame processing', () => {
        it('should process body frames and return valid processed data', () => {
            const mockBodies = [createMockBody()];
            const timeoutId = setTimeout(() => {}, 1000);

            mockParentPort.on.withArgs('message').yields({
                type: 'processFrame',
                buffer: mockBuffer,
                bodies: mockBodies,
                config: workerData.config,
                timeoutId
            });

            mockParentPort.postMessage.callsFake(msg => {
                expect(msg.type).to.equal('frameProcessed');
                expect(msg.data.bodies).to.be.an('array').with.length(1);
                
                const processedBody = msg.data.bodies[0];
                expect(processedBody).to.have.property('trackingId', 1);
                expect(processedBody.joints).to.have.all.keys(['spineMid', 'head']);
                expect(processedBody.handStates).to.deep.equal({
                    leftHandState: 2,
                    rightHandState: 3
                });

                expect(msg.data.processTime).to.be.a('number').and.be.above(0);
                verifyMessageCommonProps(msg);
            });
        });

        it('should detect and report significant joint movements', () => {
            const mockBodies = [createMockBody({
                joints: {
                    'spineMid': {
                        position: { x: 0, y: 0, z: 2 },
                        previousPosition: { x: 0, y: 0, z: 2.5 }, // 0.5m movement
                        trackingState: 2,
                        confidence: 0.8
                    }
                }
            })];

            mockParentPort.on.withArgs('message').yields({
                type: 'processFrame',
                buffer: mockBuffer,
                bodies: mockBodies,
                config: workerData.config
            });

            let movementDetected = false;
            mockParentPort.postMessage.callsFake(msg => {
                if (msg.type === 'movement') {
                    movementDetected = true;
                    expect(msg.data).to.deep.include({
                        bodyId: mockBodies[0].trackingId,
                        jointName: 'spineMid'
                    });
                    expect(msg.data.distance).to.be.a('number')
                        .and.be.above(workerData.config.movementThreshold);
                    verifyMessageCommonProps(msg);
                }
            });

            expect(movementDetected).to.be.true;
        });
    });

    describe('error handling', () => {
        it('should handle invalid frame data with appropriate error message', () => {
            mockParentPort.on.withArgs('message').yields({
                type: 'processFrame',
                buffer: null,
                bodies: null,
                config: workerData.config
            });

            mockParentPort.postMessage.callsFake(msg => {
                expect(msg.type).to.equal('error');
                expect(msg.data).to.deep.include({
                    code: 'INVALID_FRAME_DATA',
                    message: 'Invalid frame data'
                });
                verifyMessageCommonProps(msg);
            });
        });

        it('should handle missing configuration with appropriate error message', () => {
            const mockBodies = [createMockBody()];

            mockParentPort.on.withArgs('message').yields({
                type: 'processFrame',
                buffer: mockBuffer,
                bodies: mockBodies,
                config: null
            });

            mockParentPort.postMessage.callsFake(msg => {
                expect(msg.type).to.equal('error');
                expect(msg.data).to.deep.include({
                    code: 'MISSING_CONFIG',
                    message: 'Missing processing configuration'
                });
                verifyMessageCommonProps(msg);
            });
        });
    });
});