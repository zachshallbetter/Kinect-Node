const { expect } = require('chai');
const WebSocket = require('ws');
const WebSocketService = require('../src/services/websocket-service');

describe('WebSocketService', () => {
    let wsService;
    let client;
    const config = {
        network: {
            port: 8008
        }
    };

    beforeEach(async () => {
        wsService = new WebSocketService(config);
        await wsService.start();
    });

    afterEach(async () => {
        if (client && client.readyState === WebSocket.OPEN) {
            client.close();
        }
        await wsService.stop();
    });

    function createClient() {
        return new WebSocket(`ws://127.0.0.1:${config.network.port}`);
    }

    describe('initialization', () => {
        it('should start on the configured port', async () => {
            expect(wsService.isRunning).to.be.true;
        });

        it('should handle port conflicts', async () => {
            const wsService2 = new WebSocketService(config);
            const port = await wsService2.start();
            expect(port).to.be.above(config.network.port);
            await wsService2.stop();
        });
    });

    describe('client management', () => {
        it('should handle client connections', done => {
            wsService.once('clientConnected', clientId => {
                expect(clientId).to.be.a('string');
                expect(wsService.clientCount).to.equal(1);
                done();
            });

            client = createClient();
            client.on('message', message => {
                const data = JSON.parse(message);
                if (data.type === 'identify') {
                    client.send(JSON.stringify({
                        type: 'identify',
                        name: 'Test Client',
                        version: '1.0.0',
                        platform: 'test',
                        capabilities: {}
                    }));
                }
            });
        });

        it('should handle client disconnections', done => {
            let connected = false;

            wsService.once('clientConnected', () => {
                connected = true;
                client.close();
            });

            wsService.once('clientDisconnected', clientId => {
                expect(clientId).to.be.a('string');
                expect(wsService.clientCount).to.equal(0);
                expect(connected).to.be.true;
                done();
            });

            client = createClient();
            client.on('message', message => {
                const data = JSON.parse(message);
                if (data.type === 'identify') {
                    client.send(JSON.stringify({
                        type: 'identify',
                        name: 'Test Client',
                        version: '1.0.0',
                        platform: 'test',
                        capabilities: {}
                    }));
                }
            });
        });

        it('should track multiple clients', done => {
            const clientCount = 3;
            const clients = [];
            let connectedCount = 0;

            wsService.on('clientConnected', () => {
                connectedCount++;
                if (connectedCount === clientCount) {
                    expect(wsService.clientCount).to.equal(clientCount);
                    setTimeout(() => {
                        clients.forEach(c => c.close());
                        done();
                    }, 100);
                }
            });

            for (let i = 0; i < clientCount; i++) {
                const ws = new WebSocket(`ws://localhost:${config.network.port}`);
                ws.on('message', message => {
                    const data = JSON.parse(message);
                    if (data.type === 'identify') {
                        ws.send(JSON.stringify({
                            type: 'identify',
                            name: `Test Client ${i}`,
                            version: '1.0.0',
                            platform: 'test',
                            capabilities: {}
                        }));
                    }
                });
                clients.push(ws);
            }
        });
    });

    describe('message handling', () => {
        it('should broadcast messages to all clients', done => {
            const testMessage = { type: 'test', data: 'Hello World' };
            let receivedCount = 0;
            const clientCount = 3;
            const clients = [];
            let identifiedCount = 0;

            const messageHandler = function (message) {
                const data = JSON.parse(message);
                if (data.type === 'identify') {
                    this.send(JSON.stringify({
                        type: 'identify',
                        name: 'Test Client',
                        version: '1.0.0',
                        platform: 'test',
                        capabilities: {}
                    }));
                } else if (data.type === 'welcome') {
                    identifiedCount++;
                    if (identifiedCount === clientCount) {
                        setTimeout(() => wsService.broadcast(testMessage), 100);
                    }
                } else if (data.type === 'test') {
                    expect(data).to.deep.equal(testMessage);
                    receivedCount++;
                    if (receivedCount === clientCount) {
                        clients.forEach(c => c.close());
                        done();
                    }
                }
            };

            for (let i = 0; i < clientCount; i++) {
                const ws = new WebSocket(`ws://localhost:${config.network.port}`);
                ws.on('message', messageHandler.bind(ws));
                clients.push(ws);
            }
        });

        it('should handle invalid messages gracefully', done => {
            wsService.once('log', (type, message) => {
                if (type === 'error' && message.includes('Invalid message format')) {
                    done();
                }
            });

            client = new WebSocket(`ws://localhost:${config.network.port}`);
            client.on('message', message => {
                const data = JSON.parse(message);
                if (data.type === 'identify') {
                    client.send('invalid json');
                }
            });
        });
    });

    describe('cleanup', () => {
        it('should close all client connections on stop', async () => {
            const clients = [];
            const clientCount = 3;
            let identifiedCount = 0;

            // Connect and identify clients
            for (let i = 0; i < clientCount; i++) {
                const ws = new WebSocket(`ws://localhost:${config.network.port}`);
                ws.on('message', message => {
                    const data = JSON.parse(message);
                    if (data.type === 'identify') {
                        ws.send(JSON.stringify({
                            type: 'identify',
                            name: `Test Client ${i}`,
                            version: '1.0.0',
                            platform: 'test',
                            capabilities: {}
                        }));
                    } else if (data.type === 'welcome') {
                        identifiedCount++;
                    }
                });
                clients.push(ws);
            }

            // Wait for all clients to identify
            await new Promise(resolve => {
                const interval = setInterval(() => {
                    if (identifiedCount === clientCount) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });

            expect(wsService.clientCount).to.equal(clientCount);

            // Stop service
            await wsService.stop();

            // Verify all clients are closed
            clients.forEach(client => {
                expect(client.readyState).to.equal(WebSocket.CLOSED);
            });
        });

        it('should clean up resources on stop', async () => {
            await wsService.stop();
            expect(wsService.isRunning).to.be.false;
            expect(wsService.clientCount).to.equal(0);
        });
    });
});