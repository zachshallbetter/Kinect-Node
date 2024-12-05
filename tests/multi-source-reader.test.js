const { expect } = require('chai');
const sinon = require('sinon');
const Kinect2 = require('kinect2');
const MultiSourceReader = require('../src/services/multi-source-reader');

describe('MultiSourceReader', () => {
    let reader;
    let mockKinect;
    let config;
    let clock;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        
        mockKinect = {
            openMultiSourceReader: sinon.stub().returns(true),
            closeMultiSourceReader: sinon.stub().resolves(),
            on: sinon.stub(),
            removeListener: sinon.stub()
        };
        Object.setPrototypeOf(mockKinect, Kinect2.prototype);

        config = {
            frameSync: {
                syncWindow: 33,
                maxDelay: 100,
                dropAfter: 66,
                bufferSize: 5
            },
            sensors: {
                depth: { enabled: true },
                color: { enabled: true },
                body: { enabled: true }
            }
        };

        reader = new MultiSourceReader(mockKinect, config);
    });

    afterEach(() => {
        clock.restore();
        sinon.restore();
    });

    describe('initialization', () => {
        it('should validate constructor parameters', () => {
            expect(() => new MultiSourceReader()).to.throw(TypeError, 'Valid Kinect device instance required');
            expect(() => new MultiSourceReader(mockKinect)).to.throw(TypeError, 'Valid configuration object required');
        });

        it('should require at least one enabled frame type', () => {
            config.sensors = {};
            expect(() => new MultiSourceReader(mockKinect, config))
                .to.throw('At least one frame type must be enabled');
        });

        it('should initialize with default sync settings if not configured', () => {
            delete config.frameSync;
            reader = new MultiSourceReader(mockKinect, config);
            const stats = reader.getStats();
            expect(stats.running).to.be.false;
        });
    });

    describe('start()', () => {
        it('should start successfully', async () => {
            await reader.start();
            expect(mockKinect.openMultiSourceReader.calledOnce).to.be.true;
            expect(reader.getStats().running).to.be.true;
        });

        it('should fail if already running', async () => {
            await reader.start();
            await expect(reader.start()).to.be.rejectedWith('MultiSourceReader is already running');
        });

        it('should fail if multi-source reader cannot be opened', async () => {
            mockKinect.openMultiSourceReader.returns(false);
            await expect(reader.start()).to.be.rejectedWith('Failed to open multi-source reader');
        });
    });

    describe('stop()', () => {
        beforeEach(async () => {
            await reader.start();
        });

        it('should stop successfully', async () => {
            await reader.stop();
            expect(mockKinect.closeMultiSourceReader.calledOnce).to.be.true;
            expect(reader.getStats().running).to.be.false;
        });

        it('should do nothing if not running', async () => {
            await reader.stop();
            await reader.stop();
            expect(mockKinect.closeMultiSourceReader.calledOnce).to.be.true;
        });

        it('should reset state after stopping', async () => {
            const frame = {
                depth: new Uint16Array(10),
                color: new Uint8Array(10),
                body: { bodies: [] }
            };
            mockKinect.on.args[0][1](frame);
            
            await reader.stop();
            const stats = reader.getStats();
            expect(stats.syncedFrames).to.equal(0);
            expect(stats.droppedFrames).to.equal(0);
            expect(stats.bufferSize).to.equal(0);
        });
    });

    describe('frame processing', () => {
        beforeEach(async () => {
            await reader.start();
        });

        it('should process synchronized frames within window', done => {
            reader.on('synchronizedFrame', frame => {
                expect(frame.frames).to.have.all.keys('depth', 'color', 'body');
                expect(frame.timestamp).to.be.a('number');
                done();
            });

            const timestamp = Date.now();
            const frame = {
                depth: new Uint16Array(10),
                color: new Uint8Array(10),
                body: { bodies: [] }
            };
            mockKinect.on.args[0][1](frame);
        });

        it('should drop stale frames', done => {
            reader.on('frameDropped', event => {
                expect(event.frameType).to.equal('depth');
                expect(event.delay).to.be.above(config.frameSync.dropAfter);
                done();
            });

            const timestamp = Date.now();
            mockKinect.on.args[0][1]({ depth: new Uint16Array(10) });
            clock.tick(config.frameSync.dropAfter + 1);
            mockKinect.on.args[0][1]({ color: new Uint8Array(10) });
        });

        it('should handle buffer overflow', done => {
            reader.on('bufferOverflow', event => {
                expect(event.frameType).to.equal('depth');
                expect(event.bufferSize).to.equal(config.frameSync.bufferSize);
                done();
            });

            for (let i = 0; i <= config.frameSync.bufferSize; i++) {
                mockKinect.on.args[0][1]({ depth: new Uint16Array(10) });
                clock.tick(5);
            }
        });
    });

    describe('performance monitoring', () => {
        beforeEach(async () => {
            await reader.start();
        });

        it('should track sync statistics', () => {
            const frame = {
                depth: new Uint16Array(10),
                color: new Uint8Array(10),
                body: { bodies: [] }
            };

            mockKinect.on.args[0][1](frame);
            clock.tick(16);
            mockKinect.on.args[0][1](frame);

            const stats = reader.getStats();
            expect(stats.syncedFrames).to.equal(2);
            expect(stats.lastSyncDelay).to.equal(16);
            expect(stats.maxSyncDelay).to.equal(16);
        });

        it('should track frame delays per sensor', () => {
            const timestamp = Date.now();
            mockKinect.on.args[0][1]({ depth: new Uint16Array(10) });
            clock.tick(10);
            mockKinect.on.args[0][1]({ color: new Uint8Array(10) });

            const stats = reader.getStats();
            expect(stats.frameDelays.depth).to.equal(0);
            expect(stats.frameDelays.color).to.equal(10);
        });
    });
});