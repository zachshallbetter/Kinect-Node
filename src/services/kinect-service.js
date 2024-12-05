/**
 * KinectService for managing Kinect device and sensor interactions
 * @extends EventEmitter
 * @fires KinectService#initialized - When service is fully initialized
 * @fires KinectService#error - When an error occurs
 * @fires KinectService#frame - When a frame is received from any sensor
 * @fires KinectService#stats - When performance stats are updated
 */
const EventEmitter = require('events');
const Kinect2 = require('kinect2');
const { performance } = require('perf_hooks');
const path = require('path');

// Service dependencies
const config = require('./service-config');
const WebSocketService = require('./websocket-service');
const LoggingService = require('./logging-service');
const MultiSourceReader = require('./multi-source-reader');
const BufferPool = require('./buffer-pool');

// Sensor dependencies
const BaseSensor = require('./sensors/base-sensor');
const DepthSensor = require('./sensors/depth-sensor');
const ColorSensor = require('./sensors/color-sensor');
const BodySensor = require('./sensors/body-sensor');
const IRSensor = require('./sensors/ir-sensor');

// Constants
const FRAME_TYPES = {
    DEPTH: 'depth',
    COLOR: 'color',
    BODY: 'body',
    IR: 'infrared'
};

const MESSAGE_TYPES = {
    START_SENSOR: 'startSensor',
    STOP_SENSOR: 'stopSensor',
    SET_LED: 'setLED',
    SET_IR_EMITTER: 'setIREmitter',
    FRAME: 'frame',
    STATUS: 'status',
    STATS: 'stats',
    ERROR: 'error',
    DEVICE_INFO: 'deviceInfo',
    FRAME_SYNC: 'frameSync',
    SENSOR_STATUS: 'sensorStatus',
    MOVEMENT: 'movement',
    GESTURE: 'gesture'
};

/**
 * Main service class for managing Kinect device and sensor interactions
 * @extends EventEmitter
 */
class KinectService extends EventEmitter {
    // Private fields
    #kinect;
    #config;
    #logger;
    #wsService;
    #bufferPool;
    #multiSourceReader;
    #sensors = new Map();
    #isInitialized = false;
    #performanceStats;
    #lastFrameTime;

    constructor() {
        super();
        
        // Load default configuration
        this.#config = require('./service-config').defaultConfig;

        // Initialize core services
        this.#kinect = new Kinect2();
        this.#logger = new LoggingService(this.#config);
        this.#wsService = new WebSocketService(this.#config);
        this.#bufferPool = new BufferPool(this.#config.service.bufferPool);
        this.#multiSourceReader = this.#initializeMultiSourceReader();

        this.#performanceStats = this.#createInitialStats();
        this.#lastFrameTime = performance.now();

        this.#initializeSensors();
        this.#setupEventHandlers();
    }

    async initialize() {
        if (this.#isInitialized) return;

        try {
            await this.#kinect.open();
            this.#logger.log('info', 'Kinect device opened successfully');

            await this.#wsService.start();
            this.#logger.log('info', 'WebSocket server started');

            if (this.#config.frameSync.enabled) {
                await this.#multiSourceReader.start();
            }

            this.#isInitialized = true;
            this.emit('initialized');
            this.#logger.log('info', 'KinectService initialized successfully');

        } catch (error) {
            this.#logger.log('error', 'Failed to initialize KinectService', { error });
            throw error;
        }
    }

    async cleanup() {
        try {
            await Promise.all([
                ...Array.from(this.#sensors.values()).map(sensor => sensor.cleanup()),
                this.#wsService.stop(),
                this.#multiSourceReader?.stop()
            ]);

            this.#bufferPool.clear();
            this.#kinect.close();
            
            this.#logger.log('info', 'KinectService cleanup completed');
            process.exit(0);
        } catch (error) {
            this.#logger.log('error', 'Error during cleanup', { error });
            process.exit(1);
        }
    }

    // Private initialization methods

    #initializeSensors() {
        const sensorConfigs = {
            depth: DepthSensor,
            color: ColorSensor,
            body: BodySensor,
            ir: IRSensor
        };

        for (const [type, SensorClass] of Object.entries(sensorConfigs)) {
            if (this.#config.sensors[type]?.enabled) {
                try {
                    const sensor = new SensorClass(this.#config, this.#kinect);
                    this.#sensors.set(type, sensor);
                    this.#setupSensorHandlers(type, sensor);
                    this.#logger.log('info', `Initialized ${type} sensor`);
                } catch (error) {
                    this.#logger.log('error', `Failed to initialize ${type} sensor`, { error });
                }
            }
        }
    }

    #initializeMultiSourceReader() {
        if (!this.#config.frameSync.enabled) return null;

        const reader = new MultiSourceReader(this.#kinect, this.#config);
        
        reader.on('synchronizedFrame', frame => {
            this.#wsService.broadcast({
                type: MESSAGE_TYPES.FRAME_SYNC,
                frame
            });
        });

        reader.on('error', error => {
            this.#logger.log('error', 'MultiSourceReader error', { error });
        });

        return reader;
    }

    #setupEventHandlers() {
        // WebSocket handlers
        this.#wsService.on('message', this.#handleClientMessage.bind(this));
        this.#wsService.on('clientConnected', this.#handleClientConnected.bind(this));
        this.#wsService.on('clientDisconnected', this.#handleClientDisconnected.bind(this));
        this.#wsService.on('log', (level, message, meta) => this.#logger.log(level, message, meta));

        // Process handlers
        process.on('SIGINT', () => this.cleanup());
        process.on('SIGTERM', () => this.cleanup());
        process.on('uncaughtException', error => {
            this.#logger.log('error', 'Uncaught exception', { error });
            this.cleanup();
        });

        // Kinect handlers
        this.#kinect.on('error', error => {
            this.#logger.log('error', 'Kinect device error', { error });
        });

        // Buffer pool handlers
        this.#bufferPool.on('poolExhausted', data => {
            this.#logger.log('warn', 'Buffer pool exhausted', data);
        });

        this.#bufferPool.on('bufferReleased', data => {
            if (this.#config.debug.performance.logFrameData) {
                this.#logger.log('debug', 'Buffer released', data);
            }
        });

        this.#bufferPool.on('poolResized', data => {
            this.#logger.log('info', 'Buffer pool resized', data);
        });
    }

    #setupSensorHandlers(type, sensor) {
        sensor.on('frame', frameData => {
            this.#wsService.broadcast({
                type: MESSAGE_TYPES.FRAME,
                sensorType: type,
                data: frameData
            });
            this.#updateMetrics(sensor.getStatus());
        });

        sensor.on('error', error => {
            this.#logger.log('error', `Sensor error: ${type}`, { error });
        });

        if (type === FRAME_TYPES.BODY) {
            sensor.on('movement', data => {
                this.#wsService.broadcast({
                    type: MESSAGE_TYPES.MOVEMENT,
                    data
                });
            });

            sensor.on('gesture', data => {
                this.#wsService.broadcast({
                    type: MESSAGE_TYPES.GESTURE,
                    data
                });
            });
        }
    }

    // Private helper methods

    #createInitialStats() {
        return {
            processTime: 0,
            maxProcessTime: 0,
            minProcessTime: Number.MAX_VALUE,
            totalProcessTime: 0,
            bufferWaitTime: 0,
            missedFrames: 0,
            lastUpdate: performance.now()
        };
    }

    #updateMetrics(sensorStats) {
        const now = performance.now();
        const elapsed = now - this.#lastFrameTime;

        if (elapsed >= this.#config.debug.performance.logInterval) {
            this.#performanceStats.lastUpdate = now;
            this.#lastFrameTime = now;

            const stats = {
                ...this.#performanceStats,
                ...sensorStats,
                bufferStats: this.#bufferPool.getStats(),
                multiSourceStats: this.#multiSourceReader?.getStats()
            };

            this.#logger.logStats(stats);
            this.emit('stats', stats);
        }
    }

    #handleClientMessage(message, clientId) {
        try {
            switch (message.type) {
                case MESSAGE_TYPES.START_SENSOR:
                    this.#startSensor(message.sensorType);
                    break;
                case MESSAGE_TYPES.STOP_SENSOR:
                    this.#stopSensor(message.sensorType);
                    break;
                case MESSAGE_TYPES.SET_LED:
                    this.#kinect.setLed(message.color);
                    break;
                case MESSAGE_TYPES.SET_IR_EMITTER:
                    this.#kinect.setIrEmitter(message.enabled);
                    break;
                default:
                    this.#logger.log('warn', `Unknown message type: ${message.type}`, { clientId });
            }
        } catch (error) {
            this.#logger.log('error', 'Error handling client message', { error, clientId });
            this.#wsService.send(clientId, {
                type: MESSAGE_TYPES.ERROR,
                error: error.message
            });
        }
    }

    #handleClientConnected(clientId) {
        this.#logger.log('info', 'Client connected', { clientId });
        this.#wsService.send(clientId, {
            type: MESSAGE_TYPES.DEVICE_INFO,
            info: {
                initialized: this.#isInitialized,
                sensors: Object.fromEntries(
                    Array.from(this.#sensors.entries()).map(([type, sensor]) => [
                        type,
                        sensor.getStatus()
                    ])
                ),
                config: this.#config
            }
        });
    }

    #handleClientDisconnected(clientId) {
        this.#logger.log('info', 'Client disconnected', { clientId });
        if (this.#wsService.clientCount === 0) {
            this.#stopAllSensors();
        }
    }

    async #startSensor(sensorType) {
        const sensor = this.#sensors.get(sensorType);
        if (sensor) {
            await sensor.start();
            this.#logger.log('info', `Started sensor: ${sensorType}`);
        }
    }

    async #stopSensor(sensorType) {
        const sensor = this.#sensors.get(sensorType);
        if (sensor) {
            await sensor.stop();
            this.#logger.log('info', `Stopped sensor: ${sensorType}`);
        }
    }

    async #stopAllSensors() {
        await Promise.all(
            Array.from(this.#sensors.values()).map(sensor => sensor.stop())
        );
        this.#logger.log('info', 'Stopped all sensors');
    }
}

// Service instance creation and initialization
const service = new KinectService();
service.initialize().catch(error => {
    console.error('Failed to initialize service:', error);
    process.exit(1);
});

module.exports = service;