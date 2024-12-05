const { expect } = require('chai');
const sinon = require('sinon');
const WebSocket = require('ws');
const KinectClient = require('../src/client');

describe('KinectClient', () => {
    let client;
    let mockWs;
    let config;

    beforeEach(() => {
        config = {
            network: {
                websocket: {
                    host: 'localhost',
                    port: 8080,
                    reconnect: {
                        delay: 1000
                    }
                }
            }
        };

        mockWs = {
            on: sinon.stub(),
            send: sinon.spy(),
            close: sinon.spy()
        };

        // Stub WebSocket constructor
        sinon.stub(WebSocket.prototype, 'constructor').returns(mockWs);

        client = new KinectClient(config);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('connection', () => {
        it('should connect to WebSocket server', async () => {
            await client.connect();
            expect(mockWs.on.calledWith('open')).to.be.true;
            expect(mockWs.on.calledWith('message')).to.be.true;
            expect(mockWs.on.calledWith('close')).to.be.true;
            expect(mockWs.on.calledWith('error')).to.be.true;
        });

        it('should handle successful connection', done => {
            client.on('connected', () => {
                done();
            });

            client.connect();
            mockWs.on.args.find(args => args[0] === 'open')[1]();
        });

        it('should handle disconnection', done => {
            client.on('disconnected', (code, reason) => {
                expect(code).to.equal(1000);
                expect(reason).to.equal('test');
                done(); 
            });

            client.connect();
            mockWs.on.args.find(args => args[0] === 'close')[1](1000, 'test');
        });

        it('should attempt reconnect after disconnect', done => {
            const clock = sinon.useFakeTimers();
            
            client.connect();
            mockWs.on.args.find(args => args[0] === 'close')[1]();
            
            clock.tick(config.network.websocket.reconnect.delay);
            expect(WebSocket.prototype.constructor.callCount).to.equal(2);
            
            clock.restore();
            done();
        });
    });

    describe('message handling', () => {
        beforeEach(async () => {
            await client.connect();
        });

        it('should handle identify message', () => {
            const message = {
                type: 'identify',
                clientId: '123'
            };

            mockWs.on.args.find(args => args[0] === 'message')[1](JSON.stringify(message));
            expect(mockWs.send.calledOnce).to.be.true;
            
            const sent = JSON.parse(mockWs.send.args[0][0]);
            expect(sent.type).to.equal('identify');
            expect(sent.name).to.equal('Kinect Client');
        });

        it('should handle welcome message', done => {
            client.on('ready', data => {
                expect(data.sessionId).to.equal('abc');
                expect(data.serverVersion).to.equal('1.0');
                done();
            });

            const message = {
                type: 'welcome',
                sessionId: 'abc',
                serverVersion: '1.0'
            };

            mockWs.on.args.find(args => args[0] === 'message')[1](JSON.stringify(message));
        });

        it('should handle frame message', done => {
            client.on('frame', (sensorType, data) => {
                expect(sensorType).to.equal('depth');
                expect(data).to.deep.equal([1, 2, 3]);
                done();
            });

            const message = {
                type: 'frame',
                sensorType: 'depth',
                data: [1, 2, 3]
            };

            mockWs.on.args.find(args => args[0] === 'message')[1](JSON.stringify(message));
        });

        it('should handle error message', done => {
            client.on('error', error => {
                expect(error.message).to.equal('test error');
                done();
            });

            const message = {
                type: 'error',
                error: 'test error'
            };

            mockWs.on.args.find(args => args[0] === 'message')[1](JSON.stringify(message));
        });
    });

    describe('sensor control', () => {
        beforeEach(async () => {
            await client.connect();
        });

        it('should start sensor stream', () => {
            client.startSensor('depth');
            expect(mockWs.send.calledOnce).to.be.true;
            
            const sent = JSON.parse(mockWs.send.args[0][0]);
            expect(sent.type).to.equal('startSensor');
            expect(sent.sensorType).to.equal('depth');
        });

        it('should stop sensor stream', () => {
            client.stopSensor('depth');
            expect(mockWs.send.calledOnce).to.be.true;
            
            const sent = JSON.parse(mockWs.send.args[0][0]);
            expect(sent.type).to.equal('stopSensor');
            expect(sent.sensorType).to.equal('depth');
        });
    });
});