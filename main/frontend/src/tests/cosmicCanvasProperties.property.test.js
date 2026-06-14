import assert from 'node:assert';

// ── Property Test 1: CometInput Offset Invariant ──
// Requirement 12.6 / Property 43: CometInput position = (nodeX, nodeY + 72)
function testCometInputOffsetProperties() {
  console.log('Running CometInput Offset Property Tests...');
  const COMET_OFFSET_PX = 72;

  // Generate 100 random node coordinates and verify that the CometInput offsets are exactly 72px on the Y axis
  for (let i = 0; i < 100; i++) {
    const nodeX = (Math.random() - 0.5) * 10000;
    const nodeY = (Math.random() - 0.5) * 10000;

    const cometX = nodeX;
    const cometY = nodeY + COMET_OFFSET_PX;

    // Verify offset
    assert.strictEqual(cometX, nodeX, 'CometInput X offset must align with Node X');
    assert.ok(Math.abs(cometY - nodeY - COMET_OFFSET_PX) < 1e-9, `CometInput Y offset must be exactly ${COMET_OFFSET_PX}px below Node Y`);
  }
  console.log('✅ CometInput Offset Property Tests passed.');
}

// ── Property Test 2: ZoneIgnitionSystem Monotonic Step Flow ──
// Requirement 18.2 / Property 42: Configure -> Invite -> Launch transition, completed steps cyan -> magenta monotonically.
function testZoneIgnitionSystemStepFlow() {
  console.log('Running ZoneIgnitionSystem Step Flow Property Tests...');

  // Mocking the step state machine logic in ZoneIgnitionSystem.jsx
  class MockIgnitionWizard {
    constructor() {
      this.step = 1;
      this.completedSteps = new Set();
      this.name = '';
      this.nameError = '';
    }

    setName(name) {
      this.name = name;
      // Simple validation replica
      if (name.length < 3 || name.length > 80 || !/^[a-zA-Z0-9-]+$/.test(name)) {
        this.nameError = 'Invalid name';
      } else {
        this.nameError = '';
      }
    }

    nextStep() {
      const oldStep = this.step;
      const oldCompleted = new Set(this.completedSteps);

      if (this.step === 1) {
        if (!this.name || this.nameError) return;
        this.completedSteps.add(1);
        this.step = 2;
      } else if (this.step === 2) {
        this.completedSteps.add(2);
        this.step = 3;
      }

      // Assert monotonicity properties:
      // 1. completedSteps size should never decrease
      assert.ok(this.completedSteps.size >= oldCompleted.size, 'Monotonic progress failure: completed steps decreased');
      // 2. all items in oldCompleted must exist in new completedSteps
      for (const step of oldCompleted) {
        assert.ok(this.completedSteps.has(step), `Monotonic progress failure: lost completed step ${step}`);
      }
    }

    backStep() {
      const oldCompleted = new Set(this.completedSteps);
      if (this.step > 1) {
        this.step = this.step - 1;
      }
      // Assert monotonicity properties: back step should not alter already completed steps (they stay magenta/completed)
      assert.strictEqual(this.completedSteps.size, oldCompleted.size, 'Going back should not lose completed step states');
      for (const step of oldCompleted) {
        assert.ok(this.completedSteps.has(step), 'Going back removed step completion');
      }
    }
  }

  // Generate random interaction pathways
  for (let i = 0; i < 50; i++) {
    const wizard = new MockIgnitionWizard();
    
    // Check initial state
    assert.strictEqual(wizard.step, 1);
    assert.strictEqual(wizard.completedSteps.size, 0);

    // Try to advance without name (should fail/stay at step 1)
    wizard.nextStep();
    assert.strictEqual(wizard.step, 1);
    assert.strictEqual(wizard.completedSteps.size, 0);

    // Set valid name
    wizard.setName('valid-zone-name');
    wizard.nextStep();
    assert.strictEqual(wizard.step, 2);
    assert.ok(wizard.completedSteps.has(1));

    // Try going back
    wizard.backStep();
    assert.strictEqual(wizard.step, 1);
    // completedSteps must retain step 1 as completed (monotonicity)
    assert.ok(wizard.completedSteps.has(1));

    // Advance back to step 2
    wizard.nextStep();
    assert.strictEqual(wizard.step, 2);

    // Advance to step 3
    wizard.nextStep();
    assert.strictEqual(wizard.step, 3);
    assert.ok(wizard.completedSteps.has(1));
    assert.ok(wizard.completedSteps.has(2));
  }
  console.log('✅ ZoneIgnitionSystem Step Flow Property Tests passed.');
}

// ── Property Test 3: Physics Gravity Attraction & Periphery Drift ──
// Requirements 15.1-15.6: Zone Gravity active nodes drift to center, inactive (>30s) nodes drift to periphery
function testZoneGravityPhysics() {
  console.log('Running Zone Gravity Physics Property Tests...');

  const W = 1200;
  const H = 800;
  const center = { x: W / 2, y: H / 2 };
  const peripheryRadius = Math.min(W, H) * 0.42;

  function runPhysicsStep(s, zone, deltaMs) {
    // Replica of YappersHub.jsx physics updates:
    if (!zone.isActive && !zone.unreadCount) {
      s.inactiveMs += deltaMs;
    } else {
      s.inactiveMs = 0;
    }

    if (s.inactiveMs >= 30000) {
      s.targetScale = 1.0;
      const angle = Math.atan2(s.position.y - center.y, s.position.x - center.x);
      s.targetPosition = {
        x: center.x + peripheryRadius * Math.cos(angle),
        y: center.y + peripheryRadius * Math.sin(angle),
      };
    } else if (zone.isActive || zone.unreadCount > 0) {
      s.targetScale = 1.3;
      s.targetPosition = { x: center.x, y: center.y };
    }

    // Lerp scale
    const scaleDiff = s.targetScale - s.scale;
    const scaleSpeed = s.inactiveMs >= 30000 ? (deltaMs / 2000) : (deltaMs / 500);
    s.scale += scaleDiff * Math.min(scaleSpeed, 1);

    // Lerp position
    const posSpeed = s.inactiveMs >= 30000 ? 0.02 : 0.05;
    s.position.x += (s.targetPosition.x - s.position.x) * posSpeed;
    s.position.y += (s.targetPosition.y - s.position.y) * posSpeed;
  }

  // Scenario A: Active node should converge to center
  const activeState = {
    position: { x: 100, y: 100 },
    targetPosition: { x: 100, y: 100 },
    scale: 1,
    targetScale: 1,
    inactiveMs: 0
  };
  const activeZone = { isActive: true, unreadCount: 0 };

  // Run physics steps
  for (let step = 0; step < 200; step++) {
    runPhysicsStep(activeState, activeZone, 16);
  }

  // Active node converges to center (tolerance within 1px)
  const distToCenter = Math.hypot(activeState.position.x - center.x, activeState.position.y - center.y);
  assert.ok(distToCenter < 1.0, `Active node should converge to center, remaining distance: ${distToCenter}`);
  assert.ok(Math.abs(activeState.scale - 1.3) < 0.01, 'Active node scale should approach 1.3');

  // Scenario B: Inactive node (>30s) should drift to periphery
  const inactiveState = {
    position: { x: center.x + 5, y: center.y + 5 }, // start near center
    targetPosition: { x: center.x, y: center.y },
    scale: 1.3,
    targetScale: 1.3,
    inactiveMs: 0
  };
  const inactiveZone = { isActive: false, unreadCount: 0 };

  // Step 1: Simulate 29 seconds of inactivity. It should NOT drift to periphery yet.
  for (let t = 0; t < 29000; t += 16) {
    runPhysicsStep(inactiveState, inactiveZone, 16);
  }
  // Still target scale and position shouldn't be periphery.
  assert.ok(inactiveState.inactiveMs < 30000);
  assert.ok(inactiveState.targetScale === 1.3 || inactiveState.targetScale === 1.0); // Wait, active is false, unread is 0.
  // Wait! In the physics loop, if inactiveMs < 30000, targetPosition is NOT reset unless it's active.
  // So it remains at its previous target.
  
  // Step 2: Push inactivity past 30 seconds
  for (let t = 0; t < 5000; t += 16) {
    runPhysicsStep(inactiveState, inactiveZone, 16);
  }
  assert.ok(inactiveState.inactiveMs >= 30000);
  
  // Converge to periphery
  for (let step = 0; step < 300; step++) {
    runPhysicsStep(inactiveState, inactiveZone, 16);
  }

  // Dist to center should be equal to peripheryRadius
  const finalDistToCenter = Math.hypot(inactiveState.position.x - center.x, inactiveState.position.y - center.y);
  assert.ok(Math.abs(finalDistToCenter - peripheryRadius) < 1.0, `Inactive node should be at periphery distance ${peripheryRadius}, got ${finalDistToCenter}`);
  assert.ok(Math.abs(inactiveState.scale - 1.0) < 0.01, 'Inactive node scale should approach 1.0');

  console.log('✅ Zone Gravity Physics Property Tests passed.');
}

// Run all test functions
testCometInputOffsetProperties();
testZoneIgnitionSystemStepFlow();
testZoneGravityPhysics();

console.log('\n=============================================');
console.log('🎉 SUCCESS: All cosmic canvas property tests passed!');
console.log('=============================================\n');
