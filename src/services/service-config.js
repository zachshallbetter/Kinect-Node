/**
 * Kinect Service Configuration
 * Centralized configuration for all Kinect service components including sensors,
 * device settings, and performance tuning parameters.
 */

// Default configuration object with comprehensive settings for the Kinect service
const defaultConfig = {
    /**
     * Base sensor configuration that applies to all sensors
     */
    baseSensor: {
        bufferPool: {
            maxPoolSize: 20,
            initialSize: 5,
            expandSize: 2,
            clearOnRelease: true,
            trackStats: true
        },
        worker: {
            maxRestarts: 3,
            healthCheckInterval: 30000,
            frameTimeout: 5000
        }
    },

    /**
     * Core Service Configuration
     * Global settings that affect overall service behavior
     */
    service: {
        bufferPool: {
            maxPoolSize: 20,
            initialSize: 5,
            expandSize: 2,
            clearOnRelease: true
        },
        metrics: {
            enabled: true,
            logInterval: 1000,
            trackDelays: true,
            calculateProcessingTime: true
        },
        workers: {
            maxRestarts: 3,
            healthCheckInterval: 30000,
            frameTimeout: 5000
        }
    },

    /**
     * Sensor Configurations
     * Settings for individual sensor types and their processing pipelines
     */
    sensors: {
        // Depth Sensor Configuration
        depth: {
            enabled: true,
            frameSize: { width: 512, height: 424 },
            processing: {
                normalize: true,
                colorize: true,
                colorMap: 'jet',
                gammaCorrection: true,
                generatePointCloud: true,
                confidenceThreshold: 0.7
            },
            performance: {
                fps: 30,
                maxQueueSize: 3,
                maxWorkers: 2,
                batchSize: 1024,
                skipFrames: 0
            },
            calibration: {
                minReliableDistance: 500,
                maxReliableDistance: 4500
            }
        },

        // Color Sensor Configuration 
        color: {
            enabled: true,
            frameSize: { width: 1920, height: 1080 },
            processing: {
                format: 'rgba',
                forceOpacity: true,
                compression: {
                    enabled: true,
                    quality: 0.8,
                    format: 'jpeg'
                }
            },
            performance: {
                fps: 30,
                maxQueueSize: 3,
                maxWorkers: 1,
                skipFrames: 0
            }
        },

        // Body Tracking Sensor Configuration
        body: {
            enabled: true,
            processing: {
                smoothing: {
                    correction: 0.5,
                    prediction: 0.5,
                    jitterRadius: 0.05,
                    maxDeviationRadius: 0.04
                },
                tracking: {
                    confidenceThreshold: 0.5,
                    timeout: 5000,
                    jointFilter: joint => joint.trackingState > 0
                },
                movement: {
                    threshold: 0.01,
                    minConfidence: 0.5,
                    smoothingFactor: 0.3,
                    velocityWindow: 5
                },
                metrics: {
                    calculateBoundingBox: true,
                    calculateCenterOfMass: true,
                    calculateConfidence: true,
                    trackVelocity: true
                }
            },
            performance: {
                fps: 30,
                maxQueueSize: 5,
                maxWorkers: 2,
                skipFrames: 0
            }
        },

        // Infrared Sensor Configuration
        infrared: {
            enabled: false,
            frameSize: { width: 512, height: 424 },
            processing: {
                gammaCorrection: true,
                format: 'uint16'
            },
            performance: {
                fps: 30,
                maxQueueSize: 3,
                maxWorkers: 1,
                skipFrames: 0
            }
        }
    },

    /**
     * Hardware Configuration
     * Physical device settings and monitoring
     */
    device: {
        features: {
            led: {
                enabled: true,
                defaultState: 'off' // Possible states: off, green, red, yellow, blinkGreen
            },
            irEmitter: {
                enabled: true,
                defaultState: false
            },
            tilt: {
                enabled: true,
                defaultAngle: 0
            }
        },
        monitoring: {
            statusInterval: 1000,
            enableLogging: true
        }
    },

    /**
     * Frame Synchronization Configuration
     * Settings for multi-source frame synchronization
     */
    frameSync: {
        enabled: true,
        useMultiSourceReader: true,
        syncWindow: 33, // ~30fps in milliseconds
        maxDelay: 100,
        dropAfter: 66, // Drop frames after 2x sync window
        bufferSize: 5,
        stats: {
            enabled: true,
            logInterval: 1000,
            trackDelays: true
        }
    },

    /**
     * Network Configuration
     * WebSocket and network-related settings
     */
    network: {
        websocket: {
            port: 8008,
            host: '127.0.0.1',
            reconnect: {
                delay: 5000,
                maxAttempts: 5
            }
        }
    },

    /**
     * Debug and Logging Configuration
     * Development and troubleshooting settings
     */
    debug: {
        logLevel: 'debug', // Levels: error, warn, info, debug, verbose
        performance: {
            showStats: true,
            showSensorStats: true,
            logFrameData: false,
            logProcessingTime: true
        },
        logging: {
            saveImmediately: true,
            maxLogSize: 10 * 1024 * 1024, // 10MB
            maxLogFiles: 10,
            maxMemoryEntries: 1000,
            logsDir: './logs/service'
        }
    }
};

module.exports = {
    defaultConfig
};