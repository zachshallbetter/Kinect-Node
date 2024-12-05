# KinectNode Project Introduction

## Project Overview
This is a high-performance Node.js service for real-time Kinect sensor data streaming and processing. The project is built around the Kinect v2 SDK and implements a modular, event-driven architecture with worker thread processing for optimal performance.

## System Specifics
- Commands can be run from any shell.
- In PowerShell use semicolons (;) for command chaining.
- Start with the README.md to get the project running.

## Current State
- ✅ Core infrastructure is in place with working WebSocket streaming
- ✅ Color sensor worker implementation is complete
- ✅ Basic buffer pool management system is operational
- ✅ Base testing framework is established
- ✅ Configuration system is implemented

## Key Components
1. **Sensor Layer**:
   - Base sensor abstraction with specialized implementations
   - Color, Depth, Body, and IR sensor support
   - Worker thread processing for each sensor type

2. **Core Services**:
   - WebSocket service for client communication
   - Buffer pool for memory management
   - Multi-source reader for frame synchronization
   - Logging and metrics collection

3. **Performance Features**:
   - Worker thread processing for CPU-intensive tasks
   - Buffer pooling to minimize GC pressure
   - Frame processing state tracking
   - Health monitoring and error recovery

## Priority Areas
1. **Immediate Focus**:
   - Complete IR sensor worker implementation
   - Implement frame synchronization across sensors
   - Add comprehensive health monitoring
   - Enhance error recovery mechanisms

2. **Technical Debt**:
   - Worker thread pooling and load balancing
   - Memory optimization for large frame processing
   - Enhanced error handling and recovery
   - Test coverage expansion

3. **Future Enhancements**:
   - Audio sensor integration
   - Advanced gesture recognition
   - Multi-person tracking optimization
   - Performance profiling and optimization

## Development Environment
- Windows with PowerShell
- Node.js 16.0.0+
- Kinect for Windows SDK 2.0
- NPM for dependency management
- ESLint for code quality
- Mocha/Chai for testing

## Getting Started
1. Review the `config.json` for current service settings
2. Check `TODO.md` for detailed task breakdown
3. Run tests with `npm test` to verify environment
4. Use `npm run dev` for development with hot-reload

## Best Practices
1. **Code Quality**:
   - Maintain modular architecture
   - Follow event-driven patterns
   - Add tests for new features
   - Document API changes

2. **Performance**:
   - Use worker threads for heavy processing
   - Implement buffer pooling for memory efficiency
   - Monitor frame processing times
   - Profile CPU and memory usage

3. **Error Handling**:
   - Implement graceful degradation
   - Add comprehensive error logging
   - Handle edge cases in frame processing
   - Monitor worker thread health

## Known Issues
1. Frame synchronization needs improvement
2. Worker thread pooling not yet implemented
3. Memory usage optimization needed for large frames
4. Some error recovery scenarios need enhancement

## Contact
For questions or clarifications:
- Review the documentation in `/docs`
- Check the test cases for implementation details
- Refer to `NOTES.md` for architectural decisions

Good luck with the development! The project has a solid foundation and clear direction for future improvements.