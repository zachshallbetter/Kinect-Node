const EventEmitter = require('events');

/**
 * Buffer pool manager for efficient memory reuse and allocation.
 * Manages typed array buffers for different sensor data types with automatic expansion and cleanup.
 * @extends EventEmitter
 * @fires BufferPool#poolExhausted - When pool is full and no buffers are available
 * @fires BufferPool#bufferReleased - When a buffer is released back to the pool
 * @fires BufferPool#poolResized - When pool size is changed
 */
class BufferPool extends EventEmitter {
    // Static buffer configurations based on sensor frame sizes
    static #BUFFER_CONFIGS = {
        depth: {
            create: () => new Uint16Array(512 * 424),
            size: 512 * 424 * 2, // 2 bytes per pixel
            description: 'Depth sensor frame buffer (512x424 16-bit)'
        },
        color: {
            create: () => new Uint8Array(1920 * 1080 * 4), 
            size: 1920 * 1080 * 4, // 4 bytes per pixel (RGBA)
            description: 'Color sensor frame buffer (1920x1080 32-bit)'
        },
        infrared: {
            create: () => new Uint16Array(512 * 424),
            size: 512 * 424 * 2, // 2 bytes per pixel
            description: 'Infrared sensor frame buffer (512x424 16-bit)'
        },
        body: {
            create: () => new Float32Array(25 * 3),
            size: 25 * 3 * 4, // 4 bytes per float
            description: 'Body tracking data buffer (25 joints x 3 coordinates)'
        }
    };

    // Private instance fields
    #pools = new Map();
    #config;
    #maxPoolSize;
    #initialSize; 
    #expandSize;
    #stats = {
        hits: 0,
        misses: 0,
        created: 0,
        released: 0,
        poolSize: 0,
        maxUsed: 0,
        lastResized: null
    };

    /**
     * Create a new BufferPool instance
     * @param {Object} [config={}] - Configuration object
     * @param {number} [config.maxPoolSize=20] - Maximum total buffers across all pools
     * @param {number} [config.initialSize=5] - Initial number of buffers per pool
     * @param {number} [config.expandSize=2] - Number of buffers to add when expanding
     * @param {boolean} [config.clearOnRelease=true] - Whether to zero buffers on release
     * @param {boolean} [config.trackStats=true] - Whether to track detailed usage statistics
     * @throws {TypeError} If configuration is invalid
     */
    constructor(config = {}) {
        super();
        this.#validateAndSetConfig(config);
        this.#initializePools();
    }

    /**
     * Validate and set configuration parameters
     * @private
     */
    #validateAndSetConfig(config) {
        if (typeof config !== 'object') {
            throw new TypeError('Configuration must be an object');
        }

        const maxPoolSize = Math.max(1, config.maxPoolSize || 20);
        const initialSize = Math.max(1, config.initialSize || 5);
        const expandSize = Math.max(1, config.expandSize || 2);

        if (initialSize > maxPoolSize) {
            throw new Error('Initial size cannot be larger than max pool size');
        }

        this.#config = {
            clearOnRelease: config.clearOnRelease !== false,
            trackStats: config.trackStats !== false
        };
        this.#maxPoolSize = maxPoolSize;
        this.#initialSize = initialSize;
        this.#expandSize = expandSize;
    }

    /**
     * Initialize buffer pools with initial size
     * @private
     */
    #initializePools() {
        for (const [type, config] of Object.entries(BufferPool.#BUFFER_CONFIGS)) {
            const pool = {
                ...config,
                buffers: [],
                inUse: new Set(),
                lastAccessed: Date.now()
            };
            this.#pools.set(type, pool);

            // Pre-allocate initial buffers
            for (let i = 0; i < this.#initialSize; i++) {
                pool.buffers.push(pool.create());
                this.#stats.created++;
                this.#stats.poolSize++;
            }
        }
    }

    /**
     * Acquire a buffer from the pool
     * @param {string} type - Buffer type ('depth', 'color', 'body', 'infrared')
     * @returns {TypedArray|null} Buffer from pool, or null if pool is exhausted
     * @throws {Error} If buffer type is invalid
     */
    acquire(type) {
        const pool = this.#pools.get(type);
        if (!pool) {
            throw new Error(`Unknown buffer type: ${type}`);
        }

        pool.lastAccessed = Date.now();
        let buffer = this.#getBufferFromPool(pool);
        
        if (!buffer) {
            buffer = this.#expandPoolAndGetBuffer(pool, type);
        }

        if (buffer) {
            pool.inUse.add(buffer);
            this.#stats.maxUsed = Math.max(this.#stats.maxUsed, pool.inUse.size);
        }

        return buffer;
    }

    /**
     * Get a buffer from the pool if available
     * @private
     */
    #getBufferFromPool(pool) {
        if (pool.buffers.length > 0) {
            this.#stats.hits++;
            return pool.buffers.pop();
        }
        return null;
    }

    /**
     * Attempt to expand pool and get new buffer
     * @private
     */
    #expandPoolAndGetBuffer(pool, type) {
        if (this.#stats.poolSize >= this.#maxPoolSize) {
            this.emit('poolExhausted', {
                type,
                poolSize: this.#stats.poolSize,
                inUse: pool.inUse.size,
                timestamp: Date.now()
            });
            return null;
        }

        this.#stats.misses++;
        const buffer = pool.create();
        this.#stats.created++;
        this.#stats.poolSize++;

        // Create additional buffers up to expandSize
        const buffersToAdd = Math.min(
            this.#expandSize - 1,
            this.#maxPoolSize - this.#stats.poolSize
        );
        
        for (let i = 0; i < buffersToAdd; i++) {
            pool.buffers.push(pool.create());
            this.#stats.created++;
            this.#stats.poolSize++;
        }

        return buffer;
    }

    /**
     * Release a buffer back to the pool
     * @param {string} type - Buffer type
     * @param {TypedArray} buffer - Buffer to release
     * @throws {Error} If buffer type is invalid or buffer is not tracked
     */
    release(type, buffer) {
        const pool = this.#pools.get(type);
        if (!pool) {
            throw new Error(`Unknown buffer type: ${type}`);
        }

        if (!buffer || !pool.inUse.has(buffer)) {
            throw new Error('Invalid or untracked buffer');
        }

        if (this.#config.clearOnRelease) {
            buffer.fill(0);
        }
        
        pool.buffers.push(buffer);
        pool.inUse.delete(buffer);
        this.#stats.released++;

        this.emit('bufferReleased', {
            type,
            poolSize: pool.buffers.length,
            inUse: pool.inUse.size,
            timestamp: Date.now()
        });
    }

    /**
     * Get current pool statistics
     * @returns {Object} Pool statistics
     */
    getStats() {
        const poolStats = {};
        for (const [type, pool] of this.#pools.entries()) {
            poolStats[type] = {
                available: pool.buffers.length,
                inUse: pool.inUse.size,
                totalSize: pool.size * (pool.buffers.length + pool.inUse.size),
                lastAccessed: pool.lastAccessed,
                description: pool.description
            };
        }

        return {
            ...this.#stats,
            pools: poolStats,
            memoryUsage: this.#calculateMemoryUsage(poolStats),
            timestamp: Date.now()
        };
    }

    /**
     * Calculate memory usage statistics
     * @private
     */
    #calculateMemoryUsage(poolStats) {
        let total = 0;
        let available = 0;
        let inUse = 0;

        for (const [type, stats] of Object.entries(poolStats)) {
            const pool = this.#pools.get(type);
            total += stats.totalSize;
            available += stats.available * pool.size;
            inUse += stats.inUse * pool.size;
        }

        return { 
            total,
            available,
            inUse,
            utilization: (inUse / total * 100).toFixed(2) + '%'
        };
    }

    /**
     * Clear all pools and reset statistics
     * @throws {Error} If buffers are still in use
     */
    clear() {
        for (const pool of this.#pools.values()) {
            if (pool.inUse.size > 0) {
                throw new Error('Cannot clear pool while buffers are in use');
            }
            pool.buffers = [];
            pool.inUse.clear();
        }

        this.#stats = {
            hits: 0,
            misses: 0,
            created: 0,
            released: 0,
            poolSize: 0,
            maxUsed: 0,
            lastResized: null
        };

        this.#initializePools();
    }

    /**
     * Resize the pool
     * @param {number} newSize - New maximum pool size
     * @throws {Error} If new size is invalid or smaller than current in-use buffers
     */
    resize(newSize) {
        if (typeof newSize !== 'number' || newSize < 1) {
            throw new TypeError('New size must be a positive number');
        }

        let totalInUse = 0;
        for (const pool of this.#pools.values()) {
            totalInUse += pool.inUse.size;
        }

        if (totalInUse > newSize) {
            throw new Error('New size is smaller than current in-use buffers');
        }

        this.#maxPoolSize = newSize;
        this.#shrinkPools();
        this.#stats.lastResized = Date.now();

        this.emit('poolResized', {
            maxPoolSize: this.#maxPoolSize,
            currentSize: this.#stats.poolSize,
            timestamp: Date.now()
        });
    }

    /**
     * Shrink pools to fit within new max size
     * @private
     */
    #shrinkPools() {
        for (const pool of this.#pools.values()) {
            while (pool.buffers.length + pool.inUse.size > this.#maxPoolSize && pool.buffers.length > 0) {
                pool.buffers.pop();
                this.#stats.poolSize--;
            }
        }
    }
}

module.exports = BufferPool;