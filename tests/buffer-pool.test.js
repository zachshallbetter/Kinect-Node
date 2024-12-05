const { expect } = require('chai');
const sinon = require('sinon');
const BufferPool = require('../src/services/buffer-pool');

describe('BufferPool', () => {
    let pool;
    let config;

    beforeEach(() => {
        config = {
            maxPoolSize: 10,
            initialSize: 3,
            expandSize: 2,
            clearOnRelease: true,
            trackStats: true
        };
        pool = new BufferPool(config);
    });

    afterEach(() => {
        pool.clear();
    });

    describe('initialization', () => {
        it('should initialize with correct configuration', () => {
            const stats = pool.getStats();
            expect(stats.poolSize).to.equal(config.initialSize * 4); // depth, color, infrared, body
            expect(stats.created).to.equal(config.initialSize * 4);
        });

        it('should validate configuration', () => {
            expect(() => new BufferPool()).to.throw(TypeError, 'Configuration object is required');
            expect(() => new BufferPool({ initialSize: 20, maxPoolSize: 10 }))
                .to.throw('Initial size cannot be larger than max pool size');
        });

        it('should initialize with default values if not specified', () => {
            const defaultPool = new BufferPool({});
            const stats = defaultPool.getStats();
            expect(stats.poolSize).to.equal(20); // 5 initial * 4 types
        });
    });

    describe('buffer acquisition', () => {
        it('should acquire buffers of correct type and size', () => {
            const depthBuffer = pool.acquire('depth');
            const colorBuffer = pool.acquire('color');
            const infraredBuffer = pool.acquire('infrared');
            const bodyBuffer = pool.acquire('body');

            expect(depthBuffer).to.be.instanceof(Uint16Array);
            expect(depthBuffer.length).to.equal(512 * 424);

            expect(colorBuffer).to.be.instanceof(Uint8Array);
            expect(colorBuffer.length).to.equal(1920 * 1080 * 4);

            expect(infraredBuffer).to.be.instanceof(Uint16Array);
            expect(infraredBuffer.length).to.equal(512 * 424);

            expect(bodyBuffer).to.be.instanceof(Float32Array);
            expect(bodyBuffer.length).to.equal(25 * 3);
        });

        it('should track buffer usage correctly', () => {
            const buffer = pool.acquire('depth');
            const stats = pool.getStats();
            
            expect(stats.hits).to.equal(1);
            expect(stats.pools.depth.inUse).to.equal(1);
        });

        it('should expand pool when needed', () => {
            const initialStats = pool.getStats();
            
            // Acquire more buffers than initial size
            const buffers = [];
            for (let i = 0; i < config.initialSize + 1; i++) {
                const buffer = pool.acquire('depth');
                if (buffer) buffers.push(buffer);
            }

            const newStats = pool.getStats();
            expect(newStats.poolSize).to.be.above(initialStats.poolSize);
            expect(newStats.misses).to.be.above(0);

            // Cleanup
            buffers.forEach(buffer => pool.release('depth', buffer));
        });

        it('should handle pool exhaustion', done => {
            pool.on('poolExhausted', stats => {
                expect(stats.poolSize).to.equal(config.maxPoolSize);
                done();
            });

            // Acquire more buffers than max size
            for (let i = 0; i < config.maxPoolSize + 1; i++) {
                pool.acquire('depth');
            }
        });

        it('should throw on invalid buffer type', () => {
            expect(() => pool.acquire('invalid')).to.throw('Unknown buffer type');
        });
    });

    describe('buffer release', () => {
        it('should return buffers to pool', () => {
            const buffer = pool.acquire('depth');
            pool.release('depth', buffer);
            
            const stats = pool.getStats();
            expect(stats.released).to.equal(1);
            expect(stats.pools.depth.inUse).to.equal(0);
        });

        it('should clear buffer data on release', () => {
            const buffer = pool.acquire('depth');
            buffer.fill(255);
            pool.release('depth', buffer);
            
            expect(buffer.every(val => val === 0)).to.be.true;
        });

        it('should throw on releasing untracked buffer', () => {
            const buffer = new Uint16Array(512 * 424);
            expect(() => pool.release('depth', buffer)).to.throw('Invalid or untracked buffer');
        });

        it('should emit release event', done => {
            const buffer = pool.acquire('depth');
            
            pool.on('bufferReleased', stats => {
                expect(stats.type).to.equal('depth');
                expect(stats.inUse).to.equal(0);
                done();
            });

            pool.release('depth', buffer);
        });
    });

    describe('pool management', () => {
        it('should track memory usage correctly', () => {
            const buffer = pool.acquire('depth');
            const stats = pool.getStats();
            
            expect(stats.memoryUsage.total).to.be.above(0);
            expect(stats.memoryUsage.available).to.be.above(0);
            expect(stats.memoryUsage.inUse).to.be.above(0);
            expect(stats.memoryUsage.utilization).to.match(/%$/);
        });

        it('should resize pool correctly', () => {
            const newSize = 5;
            pool.resize(newSize);
            
            const stats = pool.getStats();
            expect(stats.poolSize).to.be.at.most(newSize);
            expect(stats.lastResized).to.be.a('number');
        });

        it('should clear pools correctly', () => {
            pool.acquire('depth');
            pool.clear();
            
            const stats = pool.getStats();
            expect(stats.poolSize).to.equal(config.initialSize * 4);
            expect(stats.hits).to.equal(0);
            expect(stats.released).to.equal(0);
            expect(stats.created).to.equal(config.initialSize * 4);
        });
    });

    describe('performance', () => {
        it('should handle rapid acquire/release cycles', () => {
            const cycles = 1000;
            const startTime = Date.now();
            
            for (let i = 0; i < cycles; i++) {
                const buffer = pool.acquire('depth');
                pool.release('depth', buffer);
            }
            
            const duration = Date.now() - startTime;
            expect(duration).to.be.below(1000); // Should complete within 1 second
        });

        it('should maintain consistent memory usage', () => {
            const initialStats = pool.getStats();
            
            for (let i = 0; i < 100; i++) {
                const buffer = pool.acquire('depth');
                pool.release('depth', buffer);
            }
            
            const finalStats = pool.getStats();
            expect(finalStats.poolSize).to.equal(initialStats.poolSize);
        });
    });

    describe('error handling', () => {
        it('should handle concurrent operations safely', () => {
            const operations = [];
            for (let i = 0; i < 100; i++) {
                operations.push(
                    Promise.resolve().then(() => {
                        const buffer = pool.acquire('depth');
                        if (buffer) {
                            pool.release('depth', buffer);
                        }
                    })
                );
            }
            
            return Promise.all(operations).then(() => {
                const stats = pool.getStats();
                expect(stats.pools.depth.inUse).to.equal(0);
            });
        });

        it('should handle invalid release operations', () => {
            expect(() => pool.release('depth', null)).to.throw('Invalid or untracked buffer');
            expect(() => pool.release('invalid', new Uint16Array(10))).to.throw('Unknown buffer type');
        });

        it('should handle resize with active buffers', () => {
            const buffer = pool.acquire('depth');
            const newSize = 5;
            
            expect(() => pool.resize(-1)).to.throw(TypeError, 'New size must be a positive number');
            expect(() => pool.resize(0)).to.throw(TypeError, 'New size must be a positive number');
            
            pool.resize(newSize);
            const stats = pool.getStats();
            
            expect(stats.poolSize).to.be.at.most(newSize);
            expect(stats.pools.depth.inUse).to.equal(1);
        });
    });
});