const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const LoggingService = require('../src/services/logging-service');

describe('LoggingService', () => {
    let logger;
    let config;
    let clock;
    let consoleLogStub;
    let writeStub;
    const testTimestamp = '2023-12-05T00:00:00.000Z';

    beforeEach(() => {
        clock = sinon.useFakeTimers(new Date(testTimestamp));
        config = {
            logLevel: 'info',
            maxLogSize: 1024,
            maxLogFiles: 3,
            maxMemoryEntries: 1000,
            logsDir: path.join(__dirname, '../logs/test')
        };
        consoleLogStub = sinon.stub(console, 'log');
        writeStub = sinon.stub(process.stdout, 'write');
        sinon.stub(fs, 'readdir').resolves([]);
        sinon.stub(fsSync, 'statSync').returns({ mtime: new Date() });
        logger = new LoggingService(config);
    });

    afterEach(async () => {
        clock.restore();
        consoleLogStub.restore();
        writeStub.restore();
        sinon.restore();
        await logger.cleanup();
    });

    describe('initialization', () => {
        it('should throw if no config provided', () => {
            expect(() => new LoggingService()).to.throw(TypeError, 'Configuration object is required');
        });

        it('should create logs directory if it does not exist', () => {
            const mkdirStub = sinon.stub(fsSync, 'mkdirSync');
            const existsStub = sinon.stub(fsSync, 'existsSync').returns(false);

            new LoggingService(config);

            expect(mkdirStub.calledOnce).to.be.true;
            expect(existsStub.calledOnce).to.be.true;
            expect(mkdirStub.firstCall.args[0]).to.equal(config.logsDir);
        });

        it('should not create logs directory if it exists', () => {
            const mkdirStub = sinon.stub(fsSync, 'mkdirSync');
            const existsStub = sinon.stub(fsSync, 'existsSync').returns(true);

            new LoggingService(config);

            expect(mkdirStub.called).to.be.false;
            expect(existsStub.calledOnce).to.be.true;
        });

        it('should initialize with default values if not specified', () => {
            const defaultLogger = new LoggingService({ logLevel: 'info' });
            expect(defaultLogger.getLogPath()).to.include('/logs/service/session_');
        });

        it('should handle directory creation errors', () => {
            const mkdirStub = sinon.stub(fsSync, 'mkdirSync').throws(new Error('Permission denied'));
            const existsStub = sinon.stub(fsSync, 'existsSync').returns(false);

            expect(() => new LoggingService(config)).to.throw('Failed to create logs directory: Permission denied');
        });
    });

    describe('logging methods', () => {
        it('should log messages with correct level and data', async () => {
            await logger.log('info', 'test message', { test: true });

            const sessionLog = logger.getSessionLog();
            expect(sessionLog).to.have.lengthOf(1);
            expect(sessionLog[0]).to.deep.include({
                level: 'info',
                message: 'test message',
                data: { test: true },
                timestamp: testTimestamp
            });
        });

        it('should emit log event', done => {
            logger.once('log', logEntry => {
                expect(logEntry).to.deep.include({
                    level: 'info',
                    message: 'test message',
                    data: null,
                    timestamp: testTimestamp
                });
                done();
            });

            logger.log('info', 'test message');
        });

        it('should respect log level hierarchy', async () => {
            logger.setLogLevel('warn');
            
            await logger.log('debug', 'debug message');
            await logger.log('info', 'info message');
            await logger.log('warn', 'warn message');
            await logger.log('error', 'error message');

            const sessionLog = logger.getSessionLog();
            expect(sessionLog).to.have.lengthOf(2);
            expect(sessionLog[0].level).to.equal('warn');
            expect(sessionLog[1].level).to.equal('error');
        });

        it('should throw on invalid log level', () => {
            expect(() => logger.setLogLevel('invalid')).to.throw('Invalid log level: invalid');
        });
    });

    describe('stats logging', () => {
        it('should log stats to console', () => {
            const stats = {
                depth: { fps: 30.5, frames: 100 },
                color: { fps: 15.2, frames: 50 }
            };

            logger.logStats(stats);

            expect(writeStub.calledOnce).to.be.true;
            expect(writeStub.firstCall.args[0]).to.include('depth: 30.5 | color: 15.2');
        });

        it('should clear stats display', () => {
            logger.logStats({ depth: { fps: 30, frames: 100 } });
            logger.clearStats();

            expect(writeStub.calledWith('\r\x1b[K')).to.be.true;
        });

        it('should ignore empty stats', () => {
            logger.logStats({});
            expect(writeStub.called).to.be.false;
        });
    });

    describe('file operations', () => {
        it('should save session log to file', async () => {
            const writeFileStub = sinon.stub(fs, 'writeFile').resolves();
            await logger.log('info', 'test message');
            await logger.saveSessionLog();

            expect(writeFileStub.calledOnce).to.be.true;
            const savedData = JSON.parse(writeFileStub.firstCall.args[1]);
            expect(savedData[0].message).to.equal('test message');
        });

        it('should rotate logs when size limit reached', async () => {
            const writeFileStub = sinon.stub(fs, 'writeFile').resolves();
            const statStub = sinon.stub(fs, 'stat').resolves({ size: config.maxLogSize + 1 });
            const renameStub = sinon.stub(fs, 'rename').resolves();

            await logger.log('info', 'test message');
            await logger.saveSessionLog();

            expect(renameStub.calledOnce).to.be.true;
            expect(writeFileStub.calledOnce).to.be.true;
        });

        it('should cleanup old log files', async () => {
            const oldFiles = Array.from({ length: config.maxLogFiles + 2 }, (_, i) => 
                `session_${i}.json`
            );
            
            sinon.stub(fs, 'readdir').resolves(oldFiles);
            const unlinkStub = sinon.stub(fs, 'unlink').resolves();

            await logger.initializeLogRotation();

            expect(unlinkStub.callCount).to.equal(2); // Should remove 2 oldest files
        });

        it('should handle write errors', async () => {
            const writeError = new Error('Write failed');
            sinon.stub(fs, 'writeFile').rejects(writeError);
            
            let errorEmitted = false;
            logger.on('error', error => {
                expect(error.type).to.equal('saveLog');
                expect(error.error).to.equal(writeError);
                errorEmitted = true;
            });

            await logger.log('info', 'test message');
            await logger.saveSessionLog();

            expect(errorEmitted).to.be.true;
        });
    });

    describe('cleanup', () => {
        it('should save pending logs on cleanup', async () => {
            const writeFileStub = sinon.stub(fs, 'writeFile').resolves();
            await logger.log('info', 'final message');
            await logger.cleanup();

            expect(writeFileStub.calledOnce).to.be.true;
            const savedData = JSON.parse(writeFileStub.firstCall.args[1]);
            expect(savedData[0].message).to.equal('final message');
        });

        it('should handle cleanup errors', async () => {
            const cleanupError = new Error('Cleanup failed');
            sinon.stub(fs, 'writeFile').rejects(cleanupError);

            let errorEmitted = false;
            logger.on('error', error => {
                expect(error.type).to.equal('cleanup');
                expect(error.error).to.equal(cleanupError);
                errorEmitted = true;
            });

            await logger.log('info', 'test');
            await logger.cleanup();

            expect(errorEmitted).to.be.true;
        });
    });
});