const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const EventEmitter = require('events');
const config = require('./service-config');

/**
 * Service for handling application logging with file rotation and stats display
 * @extends EventEmitter
 * @fires LoggingService#log - When a new log entry is created
 * @fires LoggingService#logSaved - When logs are saved to disk
 * @fires LoggingService#error - When an error occurs
 */
class LoggingService extends EventEmitter {
    // Log level constants
    static LOG_LEVELS = {
        error: 0,
        warn: 1, 
        info: 2,
        debug: 3
    };

    // Default configuration
    static DEFAULTS = {
        logLevel: config.debug.logLevel || 'info',
        maxLogSize: config.debug.logging.maxLogSize || 10 * 1024 * 1024, // 10MB
        maxLogFiles: config.debug.logging.maxLogFiles || 10,
        maxMemoryEntries: config.debug.logging.maxMemoryEntries || 1000,
        logsDir: config.debug.logging.logsDir || path.join(__dirname, '../../../logs/service')
    };

    // Private fields
    #config;
    #sessionId;
    #sessionLog = [];
    #showingStats = false;
    #currentLogLevel;
    #writeQueue = Promise.resolve();
    
    constructor(config) {
        super();
        
        if (!config || typeof config !== 'object') {
            throw new TypeError('Configuration object is required');
        }

        // Merge defaults with provided config
        this.#config = {
            ...LoggingService.DEFAULTS,
            ...config
        };

        this.#sessionId = this.#generateSessionId();
        this.#currentLogLevel = this.#config.logLevel;

        // Initialize logging system
        this.#createLogsDirectory();
        this.#initializeLogRotation().catch(error => {
            console.error('Failed to initialize log rotation:', error);
            this.emit('error', { type: 'initialization', error });
        });
    }

    // Public API methods
    async log(level, message, data = null) {
        if (!this.#shouldLog(level)) return;

        this.#clearStatsIfShowing();

        const logEntry = this.#createLogEntry(level, message, data);
        this.#addToMemoryBuffer(logEntry);
        this.#logToConsole(logEntry);
        this.emit('log', logEntry);

        if (config.debug.logging.saveImmediately) {
            await this.saveSessionLog();
        }
    }

    logStats(stats) {
        if (!stats || Object.keys(stats).length === 0) return;

        const timeStr = new Date().toISOString().split('T')[1].split('.')[0];
        const statsStr = Object.entries(stats)
            .filter(([, data]) => data?.frames > 0)
            .map(([type, data]) => `${type}: ${data.fps.toFixed(1)}`)
            .join(' | ');

        if (statsStr) {
            process.stdout.write(`\r\x1b[K[${timeStr}] FPS → ${statsStr}`);
            this.#showingStats = true;
        }
    }

    clearStats() {
        this.#clearStatsIfShowing();
    }

    async saveSessionLog() {
        this.#writeQueue = this.#writeQueue.then(async () => {
            const logPath = this.getLogPath();
            
            try {
                const currentSize = await this.#getCurrentFileSize(logPath);
                if (currentSize > this.#config.maxLogSize) {
                    await this.#rotateLog(logPath);
                }

                await fs.writeFile(logPath, JSON.stringify(this.#sessionLog, null, 2));
                this.emit('logSaved', { path: logPath });
            } catch (error) {
                console.error('Failed to save session log:', error);
                this.emit('error', { type: 'saveLog', error });
            }
        }).catch(error => {
            console.error('Error in write queue:', error);
            this.emit('error', { type: 'writeQueue', error });
        });

        return this.#writeQueue;
    }

    setLogLevel(level) {
        if (!LoggingService.LOG_LEVELS[level]) {
            throw new Error(`Invalid log level: ${level}`);
        }
        this.#currentLogLevel = level;
    }

    getSessionId() {
        return this.#sessionId;
    }

    getLogPath() {
        return path.join(this.#config.logsDir, `session_${this.#sessionId}.json`);
    }

    async cleanup() {
        try {
            await this.#writeQueue;
            if (this.#sessionLog.length > 0) {
                await this.saveSessionLog();
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
            this.emit('error', { type: 'cleanup', error });
        }
    }

    // Private helper methods
    #generateSessionId() {
        return new Date().toISOString().replace(/[:.]/g, '-');
    }

    #createLogsDirectory() {
        try {
            if (!fsSync.existsSync(this.#config.logsDir)) {
                fsSync.mkdirSync(this.#config.logsDir, { recursive: true });
            }
        } catch (error) {
            const msg = 'Failed to create logs directory';
            console.error(msg, error);
            throw new Error(`${msg}: ${error.message}`);
        }
    }

    async #initializeLogRotation() {
        const files = await fs.readdir(this.#config.logsDir);
        const logFiles = await this.#getLogFilesSorted(files);

        if (logFiles.length > this.#config.maxLogFiles) {
            await this.#removeOldLogFiles(logFiles);
        }
    }

    async #getLogFilesSorted(files) {
        return files.filter(file => file.endsWith('.json'))
            .map(file => ({
                name: file,
                path: path.join(this.#config.logsDir, file),
                time: fsSync.statSync(path.join(this.#config.logsDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);
    }

    async #removeOldLogFiles(logFiles) {
        const filesToRemove = logFiles.slice(this.#config.maxLogFiles);
        await Promise.all(filesToRemove.map(file => 
            fs.unlink(file.path)
                .catch(error => {
                    console.error(`Failed to remove old log file ${file.name}:`, error);
                    this.emit('error', { type: 'logRotation', error });
                })
        ));
    }

    #shouldLog(level) {
        if (!LoggingService.LOG_LEVELS[level]) {
            console.warn(`Invalid log level: ${level}`);
            return false;
        }
        return LoggingService.LOG_LEVELS[level] <= LoggingService.LOG_LEVELS[this.#currentLogLevel];
    }

    #createLogEntry(level, message, data) {
        return {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };
    }

    #addToMemoryBuffer(logEntry) {
        this.#sessionLog.push(logEntry);
        if (this.#sessionLog.length > this.#config.maxMemoryEntries) {
            this.#sessionLog = this.#sessionLog.slice(-this.#config.maxMemoryEntries);
        }
    }

    #logToConsole(logEntry) {
        const timeStr = logEntry.timestamp.split('T')[1].split('.')[0];
        console.log(`[${timeStr}] ${logEntry.level.toUpperCase()}: ${logEntry.message}`);
    }

    #clearStatsIfShowing() {
        if (this.#showingStats) {
            process.stdout.write('\r\x1b[K');
            this.#showingStats = false;
        }
    }

    async #getCurrentFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return stats.size;
        } catch (error) {
            return 0; // File doesn't exist yet
        }
    }

    async #rotateLog(logPath) {
        try {
            const ext = path.extname(logPath);
            const base = path.basename(logPath, ext);
            const rotatedPath = path.join(
                this.#config.logsDir,
                `${base}_${Date.now()}${ext}`
            );
            
            if (fsSync.existsSync(logPath)) {
                await fs.rename(logPath, rotatedPath);
            }

            await this.#initializeLogRotation();
        } catch (error) {
            console.error('Failed to rotate log file:', error);
            this.emit('error', { type: 'logRotation', error });
            throw error;
        }
    }
}

module.exports = LoggingService;