const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * Client for connecting to the Kinect WebSocket service
 * @extends EventEmitter
 */
class KinectClient extends EventEmitter {
    #ws;
    #config;
    #reconnectTimeout;
    #clientId;
    #sessionId;
    #connected = false;

    constructor(config) {
        super();
        this.#config = config;
    }

    /**
     * Connect to the WebSocket server
     */
    async connect() {
        const { host, port } = this.#config.network.websocket;
        
        this.#ws = new WebSocket(`ws://${host}:${port}`);
        this.#setupWebSocketHandlers();
    }

    /**
     * Disconnect from the WebSocket server
     */
    async disconnect() {
        if (this.#reconnectTimeout) {
            clearTimeout(this.#reconnectTimeout);
        }
        if (this.#ws) {
            this.#ws.close();
        }
        this.#connected = false;
    }

    /**
     * Start a sensor stream
     * @param {string} sensorType - Type of sensor to start (depth, color, body)
     */
    startSensor(sensorType) {
        this.#send({
            type: 'startSensor',
            sensorType
        });
    }

    /**
     * Stop a sensor stream
     * @param {string} sensorType - Type of sensor to stop
     */
    stopSensor(sensorType) {
        this.#send({
            type: 'stopSensor', 
            sensorType
        });
    }

    #setupWebSocketHandlers() {
        this.#ws.on('open', () => {
            if (this.#reconnectTimeout) {
                clearTimeout(this.#reconnectTimeout);
            }
            this.emit('connected');
        });

        this.#ws.on('message', data => {
            try {
                const message = JSON.parse(data);
                this.#handleMessage(message);
            } catch (error) {
                this.emit('error', error);
            }
        });

        this.#ws.on('close', (code, reason) => {
            this.#connected = false;
            this.emit('disconnected', code, reason);
            
            // Attempt reconnect
            const { delay } = this.#config.network.websocket.reconnect;
            this.#reconnectTimeout = setTimeout(() => this.connect(), delay);
        });

        this.#ws.on('error', error => {
            this.emit('error', error);
        });
    }

    #handleMessage(message) {
        switch (message.type) {
            case 'identify':
                this.#clientId = message.clientId;
                this.#sendIdentification();
                break;

            case 'welcome':
                this.#sessionId = message.sessionId;
                this.#connected = true;
                this.emit('ready', {
                    sessionId: message.sessionId,
                    serverVersion: message.serverVersion
                });
                break;

            case 'frame':
                this.emit('frame', message.sensorType, message.data);
                break;

            case 'error':
                this.emit('error', new Error(message.error));
                break;

            case 'stats':
                this.emit('stats', message.stats);
                break;

            default:
                this.emit('message', message);
        }
    }

    #sendIdentification() {
        this.#send({
            type: 'identify',
            name: 'Kinect Client',
            version: '1.0.0',
            platform: process.platform,
            capabilities: {
                sensors: ['depth', 'color', 'body'],
                features: ['frameProcessing']
            }
        });
    }

    #send(data) {
        if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
            this.#ws.send(JSON.stringify(data));
        }
    }
}

module.exports = KinectClient;
