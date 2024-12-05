# Kinect Streaming Service written in Node.js

A high-performance Node.js service for real-time Kinect sensor data streaming and processing, providing robust multi-sensor integration, advanced data processing pipelines, and flexible network distribution capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Core Capabilities](#core-capabilities)
3. [Key Features](#key-features) 
4. [Architecture](#architecture)
5. [Installation](#installation)
6. [Configuration](#configuration)
7. [Development Guide](#development-guide)
8. [API Documentation](#api-documentation)

## Overview

The Kinect Node Service enables distributed access to Kinect sensor data with enterprise-grade reliability, performance optimization, and comprehensive monitoring capabilities. The service handles complex sensor synchronization, provides configurable processing pipelines, and offers flexible deployment options.

### Core Capabilities
- Real-time synchronized capture of depth, color, body tracking and infrared data streams
- Multi-threaded frame processing with configurable worker pools
- Memory-efficient buffer management with automatic expansion and cleanup
- Comprehensive logging and performance monitoring
- WebSocket-based network distribution with client identification
- Modular event-driven architecture with robust error handling

## Key Features

- **Multi-Sensor Support**: Seamlessly integrate and synchronize data from multiple Kinect sensors
- **High Performance**: Optimized frame processing with configurable worker pools and efficient memory management
- **Flexible Distribution**: Stream sensor data to multiple clients over WebSocket connections with automatic reconnection
- **Robust Error Handling**: Comprehensive error detection and recovery mechanisms with graceful degradation
- **Detailed Monitoring**: Built-in performance metrics, health checks, and real-time diagnostics
- **Easy Integration**: Simple client SDK with event-driven API for Node.js applications
- **Advanced Processing**: Built-in gesture recognition and skeletal tracking with movement detection
- **Optimized Data Handling**: Efficient frame compression and buffer pooling for minimal memory footprint

## Installation

### Prerequisites

- Node.js 16.0.0 or higher
- Compatible Kinect v2 sensor
- Windows 8.1 or higher (for Kinect SDK)
- Kinect for Windows SDK 2.0
- Visual Studio Build Tools (for native dependencies)


### Project Setup

1. Clone the repository:
```bash:README.md
git clone https://github.com/zachshallbetter/kinect-node
cd kinect-node
```

2. Install dependencies:
```bash
npm install
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start:service` | Start the Kinect service |
| `npm run start:viewer` | Launch the Electron viewer application |
| `npm run dev:service` | Start service with Node inspector and hot-reload |
| `npm run dev:viewer` | Start viewer with Electron inspector |
| `npm run dev` | Run both service and viewer in development mode |
| `npm test` | Run all tests with linting |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:client` | Run client-specific tests |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |

### Project Structure

```
kinect-node/
├── src/
│   ├── services/           # Core service implementations
│   ├── client/            # Client SDK
│   ├── viewer/            # Electron viewer application
│   └── workers/           # Worker thread implementations
├── tests/                 # Test suites
├── config/               # Configuration files
└── docs/                # Documentation
```

### Dependencies

#### Core Dependencies
- `kinect2` (^0.3.0): Kinect v2 SDK integration
- `ws` (^8.14.2): WebSocket server implementation
- `express` (^4.18.2): HTTP server framework
- `axios` (^1.6.2): HTTP client
- `events` (^3.3.0): Event handling
- `node-record-lpcm16` (^1.0.1): Audio recording support

#### Development Dependencies
- `electron` (^27.1.0): Desktop application framework
- `mocha` (^10.2.0): Testing framework
- `chai` (^4.3.10): Assertion library
- `sinon` (^17.0.1): Test spies, stubs, and mocks
- `nodemon` (^3.0.1): Development auto-reload
- `eslint` (^8.55.0): Code linting
- `npm-run-all` (^4.1.5): Parallel script execution

### Development Workflow

1. **Service Development**
   ```bash
   npm run dev:service
   ```
   - Enables Node.js inspector
   - Auto-reloads on file changes
   - Provides real-time debugging

2. **Viewer Development**
   ```bash
   npm run dev:viewer
   ```
   - Opens Electron DevTools
   - Enables hot-reload
   - Provides UI debugging tools

3. **Full Development Environment**
   ```bash
   npm run dev
   ```
   - Starts both service and viewer
   - Enables all development tools
   - Provides complete debugging environment

### Testing

The project uses Mocha for testing with the following setup:

```bash
# Run all tests with linting
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suites
npm run test:client
```

Test coverage includes:
- Unit tests for all core components
- Integration tests for service communication
- End-to-end tests for complete workflows
- Performance benchmarks
- Resource management tests

### Code Quality

- ESLint configuration for consistent code style
- Automated linting before tests
- Git hooks for pre-commit validation
- Comprehensive error handling
- TypeScript definitions for better IDE support

### Building for Production

1. **Service Build**
   ```bash
   npm run build:service
   ```

2. **Viewer Build**
   ```bash
   npm run build:viewer
   ```

3. **Complete Build**
   ```bash
   npm run build
   ```

### Deployment

1. **Service Deployment**
   - Configure environment variables
   - Set up logging directory
   - Configure network settings
   - Start service process

2. **Viewer Deployment**
   - Package Electron application
   - Configure update server
   - Set up crash reporting
   - Distribute to users

### Install from NPM

```bash
npm install kinectnode
```

```javascript
const KinectNode = require('kinectnode');
```

```javascript
const kinect = new KinectNode();
```

```javascript
kinect.start();
```

```javascript
kinect.stop();
```
## Configuration

The service can be configured via a `config.json` file in the project root. The configuration is divided into several sections:

### Service Configuration

Core service behavior settings:

```json
{
  "service": {
    "bufferPool": {
      "maxPoolSize": 20,      // Maximum number of buffers to maintain
      "initialSize": 5,       // Initial buffer pool size
      "expandSize": 2,        // Number of buffers to add when pool expands
      "clearOnRelease": true  // Clear buffer contents when released
    },
    "metrics": {
      "enabled": true,
      "logInterval": 1000,    // Metrics logging interval (ms)
      "trackDelays": true     // Track processing delays
    },
    "workers": {
      "maxRestarts": 3,       // Maximum worker thread restarts
      "healthCheckInterval": 30000,  // Health check interval (ms)
      "frameTimeout": 5000    // Frame processing timeout (ms)
    }
  }
}
```

### Sensor Configuration

Individual sensor settings for depth, color, body tracking, and infrared:

#### Depth Sensor

```json
{
  "sensors": {
    "depth": {
      "enabled": true,
      "frameSize": {
        "width": 512,
        "height": 424
      },
      "processing": {
        "normalize": true,
        "colorize": true,
        "colorMap": "jet",
        "gammaCorrection": true,
        "generatePointCloud": true,
        "confidenceThreshold": 0.7
      },
      "performance": {
        "fps": 30,
        "maxQueueSize": 3,
        "maxWorkers": 2,
        "batchSize": 1024
      }
    }
  }
}
```

#### Body Tracking

```json
{
  "sensors": {
    "body": {
      "enabled": true,
      "processing": {
        "smoothing": {
          "correction": 0.5,
          "prediction": 0.5,
          "jitterRadius": 0.05,
          "maxDeviationRadius": 0.04
        },
        "tracking": {
          "confidenceThreshold": 0.5,
          "timeout": 5000
        },
        "movement": {
          "threshold": 0.01,
          "minConfidence": 0.5
        }
      }
    }
  }
}
```

### Frame Synchronization

Settings for multi-source frame synchronization:

```json
{
  "frameSync": {
    "enabled": true,
    "useMultiSourceReader": true,
    "syncWindow": 33,        // Frame sync window in ms (~30fps)
    "maxDelay": 100,        // Maximum allowed delay
    "dropAfter": 66,        // Drop frames after 2x sync window
    "bufferSize": 5         // Sync buffer size
  }
}
```

### Network Configuration

WebSocket and network-related settings:

```json
{
  "network": {
    "websocket": {
      "port": 8008,
      "host": "127.0.0.1",
      "reconnect": {
        "delay": 5000,
        "maxAttempts": 5
      }
    }
  }
}
```

### Debug and Logging

Development and troubleshooting settings:

```json
{
  "debug": {
    "logLevel": "info",      // error, warn, info, debug, verbose
    "performance": {
      "showStats": true,
      "showSensorStats": true,
      "logFrameData": false
    },
    "logging": {
      "saveImmediately": true,
      "maxLogSize": 10485760,  // 10MB
      "maxLogFiles": 10,
      "logsDir": "./logs/service"
    }
  }
}
```

### Configuration Usage

1. **Default Configuration**: The service includes default settings in `service-config.js`

2. **Custom Configuration**: Create a `config.json` file in the project root to override defaults:
   ```bash
   cp config.example.json config.json
   ```

3. **Configuration Merging**: Custom settings are deep-merged with defaults, so you only need to specify the values you want to override

4. **Runtime Updates**: Some configuration values can be updated at runtime through the API

### Configuration Best Practices

1. **Performance Tuning**:
   - Adjust `bufferPool` settings based on memory availability
   - Configure `maxWorkers` based on CPU cores
   - Set appropriate `fps` and `maxQueueSize` for your use case

2. **Memory Management**:
   - Monitor `maxPoolSize` and `bufferSize` settings
   - Adjust `maxLogSize` and `maxMemoryEntries` based on system resources
   - Enable `clearOnRelease` for better memory management

3. **Network Optimization**:
   - Configure `syncWindow` based on network latency
   - Adjust `reconnect` settings for your network conditions
   - Set appropriate `maxDelay` for your use case

4. **Debug & Development**:
   - Use appropriate `logLevel` for your environment
   - Enable `showStats` and `logProcessingTime` for performance analysis
   - Configure `logsDir` for your deployment environment

## Development Guide

### API Documentation

The Kinect Node Service provides a comprehensive API documentation for developers to understand and use the service effectively.
I'll extend the README.md further to include installation, requirements, and development information based on the package.json:

````markdown:README.md
# Kinect Node Service

High-performance Node.js service for real-time Kinect sensor data processing and streaming.

## Requirements

- Node.js >= 16.0.0
- Kinect v2 Sensor
- Windows SDK (for Kinect drivers)

## Installation

```bash
npm install kinect-node
```

## Quick Start

1. Start the Kinect service:
```bash
npm run start:service
```

2. Start the viewer application (optional):
```bash
npm run start:viewer
```

3. For development with hot-reload:
```bash
npm run dev
```

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run start:service` | Start the Kinect service |
| `npm run start:viewer` | Launch the Electron viewer application |
| `npm run dev:service` | Start service with Node inspector and hot-reload |
| `npm run dev:viewer` | Start viewer with Electron inspector |
| `npm run dev` | Run both service and viewer in development mode |
| `npm test` | Run all tests with linting |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:client` | Run client-specific tests |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |

## Configuration

[Previous configuration documentation...]

## Architecture

### Core Components

1. **Kinect Service**
   - Real-time sensor data processing
   - Multi-source frame synchronization
   - Buffer pool management
   - Worker thread processing

2. **WebSocket Server**
   - Real-time data streaming
   - Client session management
   - Event-based communication
   - Automatic reconnection handling

3. **Sensor Framework**
   - Modular sensor implementations
   - Configurable processing pipelines
   - Performance optimization
   - Resource management

4. **Viewer Application**
   - Electron-based visualization
   - Real-time data display
   - Debug and monitoring tools

## Features

- Real-time sensor data streaming
- Multi-source frame synchronization
- Optimized buffer pool management
- Worker thread processing
- Configurable processing pipelines
- Built-in visualization tools
- Comprehensive error handling
- Extensive debugging capabilities
- Performance monitoring
- Automatic resource management

## Dependencies

### Core
- `kinect2`: Kinect v2 SDK integration
- `ws`: WebSocket server implementation
- `express`: HTTP server framework
- `axios`: HTTP client
- `events`: Event handling

### Development
- `electron`: Desktop application framework
- `mocha`: Testing framework
- `chai`: Assertion library
- `sinon`: Test spies, stubs, and mocks
- `nodemon`: Development auto-reload
- `eslint`: Code linting
- `npm-run-all`: Parallel script execution

## Testing

The project includes comprehensive tests for all components:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm run test:client
```

Test coverage includes:
- Client communication
- Sensor processing
- Worker threads
- Buffer management
- Frame synchronization
- Error handling
- Resource cleanup

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email team@kinectnode.dev or open an issue in the GitHub repository.

## Authors

KinectNode Team - team@kinectnode.dev

## Repository

https://github.com/zachshallbetter/kinect-node
````
