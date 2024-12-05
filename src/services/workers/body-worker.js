const { performance } = require('perf_hooks');
const BaseWorker = require('./base-worker');

class BodyWorker extends BaseWorker {
    constructor(config) {
        super(config);
        // Track previous positions for gesture detection
        this.previousPositions = new Map();
    }

    async processFrame(frame) {
        const { buffer, bodies } = frame;
        const { processing } = this.config;

        if (!buffer || !bodies || !Array.isArray(bodies)) {
            throw new Error('Invalid frame data');
        }

        const processedBodies = [];
        
        for (const body of bodies) {
            if (body?.tracked) {
                const processedBody = this._processBody(body, processing);
                processedBodies.push(processedBody);

                // Check for movements and gestures if enabled in config
                if (processing.metrics.trackVelocity) {
                    const movements = this._detectMovements(processedBody, processing.movement);
                    if (movements.length > 0) {
                        parentPort.postMessage({
                            type: 'movement',
                            data: movements
                        });
                    }
                }

                const gestures = this._detectGestures(processedBody, processing);
                if (gestures.length > 0) {
                    parentPort.postMessage({
                        type: 'gesture',
                        data: gestures
                    });
                }
            }
        }

        return {
            bodies: processedBodies,
            timestamp: performance.now()
        };
    }

    _processBody(body, config) {
        if (!body?.joints) {
            throw new Error('Invalid body data');
        }

        const { smoothing, tracking, metrics } = config;
        const processedJoints = {};
        const movements = {};

        // Get spine position for relative calculations
        const spinePosition = body.joints[1]?.position; // Spine mid point

        for (const [jointName, joint] of Object.entries(body.joints)) {
            if (joint && tracking.jointFilter(joint)) {
                processedJoints[jointName] = this._smoothJoint(joint, smoothing);
                if (metrics.trackVelocity) {
                    movements[jointName] = this._detectMovement(joint, config.movement.threshold, spinePosition);
                }
            }
        }

        const bodyMetrics = metrics.calculateBoundingBox || metrics.calculateCenterOfMass ? 
            this._calculateBodyMetrics(processedJoints, metrics) : null;

        return {
            trackingId: body.trackingId,
            tracked: true,
            joints: processedJoints,
            handStates: this._processHandStates(body.handStates),
            movements: metrics.trackVelocity ? movements : undefined,
            metrics: bodyMetrics,
            confidence: metrics.calculateConfidence ? this._calculateBodyConfidence(processedJoints) : undefined
        };
    }

    _smoothJoint(joint, smoothing) {
        if (!joint?.position) {
            throw new Error('Invalid joint data');
        }

        const { correction, prediction, jitterRadius, maxDeviationRadius } = smoothing;
        const smoothed = JSON.parse(JSON.stringify(joint));
        
        if (joint.previousPosition) {
            smoothed.position = {
                x: joint.position.x * (1 - correction) + joint.previousPosition.x * correction,
                y: joint.position.y * (1 - correction) + joint.previousPosition.y * correction,
                z: joint.position.z * (1 - correction) + joint.previousPosition.z * correction
            };

            const distance = this._calculateVelocity(smoothed.position, joint.previousPosition);
            if (distance > maxDeviationRadius) {
                const scale = maxDeviationRadius / distance;
                smoothed.position.x = joint.previousPosition.x + (smoothed.position.x - joint.previousPosition.x) * scale;
                smoothed.position.y = joint.previousPosition.y + (smoothed.position.y - joint.previousPosition.y) * scale;
                smoothed.position.z = joint.previousPosition.z + (smoothed.position.z - joint.previousPosition.z) * scale;
            } else if (distance < jitterRadius) {
                smoothed.position = joint.previousPosition;
            }
        }

        smoothed.previousPosition = joint.position;
        return smoothed;
    }

    _detectMovement(joint, threshold, spinePosition) {
        if (!joint?.position) {
            throw new Error('Invalid joint data');
        }

        // Calculate position relative to spine
        const relativePosition = {
            x: joint.position.x - (spinePosition?.x || 0),
            y: joint.position.y - (spinePosition?.y || 0),
            z: joint.position.z - (spinePosition?.z || 0)
        };

        if (!joint.previousPosition) {
            return { moving: false, velocity: 0, relativePosition };
        }

        const relativePrevious = {
            x: joint.previousPosition.x - (spinePosition?.x || 0),
            y: joint.previousPosition.y - (spinePosition?.y || 0),
            z: joint.previousPosition.z - (spinePosition?.z || 0)
        };

        const velocity = this._calculateVelocity(relativePosition, relativePrevious);
        return {
            moving: velocity > threshold,
            velocity,
            relativePosition,
            direction: this._calculateMovementDirection(relativePosition, relativePrevious)
        };
    }

    _calculateVelocity(current, previous) {
        if (!current?.x || !current?.y || !current?.z || 
            !previous?.x || !previous?.y || !previous?.z) {
            throw new Error('Invalid position data');
        }

        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        const dz = current.z - previous.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    _calculateMovementDirection(current, previous) {
        if (!current?.x || !current?.y || !current?.z || 
            !previous?.x || !previous?.y || !previous?.z) {
            throw new Error('Invalid position data');
        }

        return {
            x: current.x - previous.x,
            y: current.y - previous.y,
            z: current.z - previous.z
        };
    }

    _processHandStates(handStates) {
        if (!handStates?.leftHandState || !handStates?.rightHandState) {
            return {
                leftHandState: 'unknown',
                rightHandState: 'unknown'
            };
        }

        return {
            leftHandState: this._interpretHandState(handStates.leftHandState),
            rightHandState: this._interpretHandState(handStates.rightHandState)
        };
    }

    _interpretHandState(state) {
        const states = ['unknown', 'notTracked', 'open', 'closed', 'lasso'];
        return states[state] || 'unknown';
    }

    _calculateBodyMetrics(joints, metrics) {
        if (!joints || typeof joints !== 'object') {
            throw new Error('Invalid joints data');
        }

        const result = {};

        if (metrics.calculateCenterOfMass) {
            result.centerOfMass = this._calculateCenterOfMass(joints);
        }

        if (metrics.calculateBoundingBox) {
            const boundingBox = this._calculateBoundingBox(joints);
            result.boundingBox = boundingBox;
            result.height = boundingBox.max.y - boundingBox.min.y;
            result.width = boundingBox.max.x - boundingBox.min.x;
        }

        return result;
    }

    _calculateCenterOfMass(joints) {
        let count = 0;
        const sum = { x: 0, y: 0, z: 0 };
        
        for (const joint of Object.values(joints)) {
            if (joint?.trackingState > 0 && joint?.position) {
                sum.x += joint.position.x;
                sum.y += joint.position.y;
                sum.z += joint.position.z;
                count++;
            }
        }

        if (count === 0) {
            throw new Error('No valid joints found for center of mass calculation');
        }
        
        return {
            x: sum.x / count,
            y: sum.y / count,
            z: sum.z / count
        };
    }

    _calculateBoundingBox(joints) {
        const min = { x: Infinity, y: Infinity, z: Infinity };
        const max = { x: -Infinity, y: -Infinity, z: -Infinity };
        let validJointsFound = false;
        
        for (const joint of Object.values(joints)) {
            if (joint?.trackingState > 0 && joint?.position) {
                validJointsFound = true;
                min.x = Math.min(min.x, joint.position.x);
                min.y = Math.min(min.y, joint.position.y);
                min.z = Math.min(min.z, joint.position.z);
                max.x = Math.max(max.x, joint.position.x);
                max.y = Math.max(max.y, joint.position.y);
                max.z = Math.max(max.z, joint.position.z);
            }
        }

        if (!validJointsFound) {
            throw new Error('No valid joints found for bounding box calculation');
        }
        
        return { min, max };
    }

    _calculateBodyConfidence(joints) {
        let totalConfidence = 0;
        let trackedJoints = 0;
        
        for (const joint of Object.values(joints)) {
            if (joint?.trackingState > 0 && typeof joint.confidence === 'number') {
                totalConfidence += joint.confidence;
                trackedJoints++;
            }
        }
        
        return trackedJoints > 0 ? totalConfidence / trackedJoints : 0;
    }

    _detectMovements(body, movementConfig) {
        const movements = [];
        if (body.movements) {
            for (const [jointName, movement] of Object.entries(body.movements)) {
                if (movement.velocity > movementConfig.threshold && 
                    movement.confidence >= movementConfig.minConfidence) {
                    movements.push({
                        joint: jointName,
                        velocity: movement.velocity,
                        direction: movement.direction,
                        relativePosition: movement.relativePosition,
                        timestamp: performance.now()
                    });
                }
            }
        }
        return movements;
    }

    _detectGestures(body, config) {
        const gestures = [];
        const { joints } = body;

        // Get spine position for relative calculations
        const spinePosition = joints[1]?.position;
        if (!spinePosition) return gestures;

        // Detect swipe gestures
        const rightHand = joints[11]; // Right hand joint
        if (rightHand?.position) {
            const relativePos = {
                x: rightHand.position.x - spinePosition.x,
                y: rightHand.position.y - spinePosition.y,
                z: rightHand.position.z - spinePosition.z
            };

            // Check if hand is above waist
            if (relativePos.y > 0) {
                const prevPos = this.previousPositions.get(body.trackingId);
                if (prevPos) {
                    const relativeSpeed = relativePos.x - prevPos.x;
                    
                    if (Math.abs(relativeSpeed) > config.tracking.gestureThreshold) {
                        gestures.push({
                            type: relativeSpeed < 0 ? 'swipeLeft' : 'swipeRight',
                            joint: 'rightHand',
                            speed: Math.abs(relativeSpeed),
                            timestamp: performance.now()
                        });
                    }
                }
            }
            
            this.previousPositions.set(body.trackingId, relativePos);
        }

        return gestures;
    }
}

module.exports = BodyWorker;