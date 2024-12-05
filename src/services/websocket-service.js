const WebSocket = require('ws');
const http = require('http');
const EventEmitter = require('events');

/**
 * WebSocket service that handles client connections, message routing, and lifecycle management.
 * Implements a simple protocol with client identification and message validation.
 * @extends EventEmitter
 * @fires WebSocketService#log - When logging events occur
 * @fires WebSocketService#clientConnected - When a client successfully connects and identifies
 * @fires WebSocketService#clientDisconnected - When a client disconnects
 * @fires WebSocketService#message - When a valid message is received from an identified client
 */
class WebSocketService extends EventEmitter {
    // Private fields
    #config;
    #sessionId;
    #server;
    #wss;
    #clients = new Set();

    // Constants
    static #DEFAULT_PORT = 8008;
    static #IDENTIFICATION_TIMEOUT = 5000;
    static #CLOSE_CODES = {
        NORMAL: 1000,
        TIMEOUT: 1002,
        ABNORMAL: 1006
    };

    /**
     * Creates a new WebSocketService instance
     * @param {Object} config - Configuration object
     * @param {Object} [config.network] - Network configuration
     * @param {number} [config.network.port] - Port to listen on (default: 8008)
     * @throws {Error} If config is invalid
     */
    constructor(config) {
        super();
        this.#validateConfig(config);
        this.#config = config;
        this.#sessionId = this.#generateId('session');
    }

    // Public API

    /**
     * Starts the WebSocket service
     * @returns {Promise<number>} Port number the service is listening on
     */
    async start() {
        const port = this.#config.network?.port || WebSocketService.#DEFAULT_PORT;
        return this.#startServer(port);
    }

    /**
     * Stops the WebSocket service gracefully
     */
    async stop() {
        this.emit('log', 'info', 'Stopping WebSocket service...');
        await this.#closeAllClients();
        await this.#closeServer();
    }

    /**
     * Broadcasts a message to all connected clients
     * @param {Object} data - Message to broadcast
     */
    broadcast(data) {
        if (!this.#wss) return;

        const message = JSON.stringify(data);
        for (const client of this.#clients) {
            if (client.readyState === WebSocket.OPEN) {
                this.#sendRaw(client, message);
            }
        }
    }

    /**
     * Sends a message to a specific client
     * @param {WebSocket} client - Client to send to
     * @param {Object} data - Message to send
     */
    send(client, data) {
        if (client.readyState === WebSocket.OPEN) {
            this.#sendRaw(client, JSON.stringify(data));
        }
    }

    /**
     * Returns the number of connected clients
     */
    get clientCount() {
        return this.#clients.size;
    }

    /**
     * Checks if the service is running
     */
    get isRunning() {
        return Boolean(this.#wss);
    }

    // Private Server Methods

    async #startServer(port) {
        return new Promise((resolve, reject) => {
            this.#server = http.createServer();

            this.#server.on('error', error => {
                if (error.code === 'EADDRINUSE') {
                    this.emit('log', 'warn', `Port ${port} in use, trying ${port + 1}...`);
                    this.#startServer(port + 1).then(resolve).catch(reject);
                } else {
                    this.emit('log', 'error', `HTTP server error: ${error.message}`, { error });
                    reject(error);
                }
            });

            this.#server.listen(port, () => {
                this.#wss = new WebSocket.Server({ server: this.#server });
                this.emit('log', 'info', `WebSocket server listening on port ${port}`);

                this.#wss.on('connection', this.#handleConnection.bind(this));
                this.#wss.on('error', error => {
                    this.emit('log', 'error', `WebSocket server error: ${error.message}`, { error });
                });

                resolve(port);
            });
        });
    }

    async #closeServer() {
        if (this.#wss) {
            await new Promise(resolve => this.#wss.close(() => {
                this.#wss = null;
                this.emit('log', 'info', 'WebSocket server closed');
                resolve();
            }));
        }

        if (this.#server) {
            await new Promise(resolve => this.#server.close(() => {
                this.#server = null;
                this.emit('log', 'info', 'HTTP server closed');
                resolve();
            }));
        }
    }

    // Client Connection Handling

    #handleConnection(ws) {
        const clientId = this.#generateId('client');
        this.emit('log', 'info', `New client connection pending: ${clientId}`);
        
        const identificationTimeout = setTimeout(() => {
            this.emit('log', 'warn', `Client ${clientId} failed to identify within timeout`);
            this.#closeConnection(ws, WebSocketService.#CLOSE_CODES.TIMEOUT, 'Client identification timeout');
        }, WebSocketService.#IDENTIFICATION_TIMEOUT);

        ws.on('message', message => this.#handleMessage(ws, message, clientId, identificationTimeout));
        ws.on('close', () => this.#handleClientDisconnect(ws, clientId, identificationTimeout));
        ws.on('error', error => this.#handleClientError(ws, clientId, error, identificationTimeout));

        this.send(ws, { type: 'identify', clientId });
    }

    #handleClientDisconnect(ws, clientId, identificationTimeout) {
        clearTimeout(identificationTimeout);
        this.#clients.delete(ws);
        if (ws.clientInfo) {
            this.emit('clientDisconnected', clientId);
            this.emit('log', 'info', `Client disconnected: ${clientId}`);
        }
    }

    #handleClientError(ws, clientId, error, identificationTimeout) {
        clearTimeout(identificationTimeout);
        this.emit('log', 'error', `Client error: ${error.message}`, { clientId, error });
        this.#closeConnection(ws, WebSocketService.#CLOSE_CODES.ABNORMAL, error.message);
    }

    // Message Handling

    #handleMessage(ws, message, clientId, identificationTimeout) {
        try {
            const data = this.#parseMessage(message);
            
            if (data.type === 'identify') {
                this.#handleIdentification(ws, data, clientId, identificationTimeout);
            } else if (ws.clientInfo) {
                this.emit('message', data, clientId);
            } else {
                throw new Error('Client not identified');
            }
        } catch (error) {
            this.emit('log', 'error', `Message error from client ${clientId}: ${error.message}`, { error });
            this.send(ws, { type: 'error', error: error.message });
        }
    }

    #handleIdentification(ws, data, clientId, identificationTimeout) {
        clearTimeout(identificationTimeout);
        ws.clientInfo = {
            id: clientId,
            name: data.name || 'Unknown Client',
            version: data.version || 'Unknown Version',
            platform: data.platform || 'Unknown Platform',
            capabilities: data.capabilities || {},
            connectedAt: new Date().toISOString()
        };
        
        this.#clients.add(ws);
        this.emit('log', 'info', `Client identified: ${clientId}`, ws.clientInfo);
        
        this.send(ws, {
            type: 'welcome',
            sessionId: this.#sessionId,
            serverVersion: '2.0',
            timestamp: new Date().toISOString()
        });
        
        this.emit('clientConnected', clientId, ws);
    }

    // Utility Methods

    #validateConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Configuration must be an object');
        }
        if (config.network?.port !== undefined) {
            const { port } = config.network;
            if (!Number.isInteger(port) || port < 0 || port > 65535) {
                throw new Error('Port must be an integer between 0 and 65535');
            }
        }
    }

    #generateId(prefix) {
        return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    }

    #parseMessage(message) {
        const data = JSON.parse(message.toString());
        if (!data || typeof data !== 'object' || !data.type) {
            throw new Error('Invalid message format');
        }
        return data;
    }

    #sendRaw(client, message) {
        try {
            client.send(message);
        } catch (error) {
            this.emit('log', 'error', `Failed to send message to client: ${error.message}`, { error });
            this.#clients.delete(client);
            this.#closeConnection(client, WebSocketService.#CLOSE_CODES.ABNORMAL, error.message);
        }
    }

    #closeConnection(ws, code, reason) {
        try {
            ws.close(code, reason);
        } catch (error) {
            this.emit('log', 'error', `Error closing client: ${error.message}`, { error });
        }
    }

    async #closeAllClients() {
        const closePromises = Array.from(this.#clients).map(client => 
            new Promise(resolve => {
                client.once('close', resolve);
                this.#closeConnection(client, WebSocketService.#CLOSE_CODES.NORMAL, 'Service shutting down');
            })
        );

        await Promise.all(closePromises);
        this.#clients.clear();
    }
}

module.exports = WebSocketService;