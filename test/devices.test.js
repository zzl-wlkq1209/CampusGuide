const assert = require("node:assert/strict");
const test = require("node:test");

const { DEVICES } = require("../server");

test("charging device catalog keeps the configured order and mini metadata", () => {
  assert.equal(DEVICES.length, 27);
  assert.equal(new Set(DEVICES.map((device) => device.id)).size, DEVICES.length);

  const insertedIds = [
    "graduate-one-southeast",
    "optoelectronics-north",
    "graduate-a-1",
    "graduate-a-2",
    "graduate-a-3",
    "graduate-b-1",
    "graduate-b-2",
    "graduate-b-3",
    "graduate-c-1",
    "graduate-c-2",
    "graduate-c-3",
    "graduate-d-1",
    "graduate-d-2",
    "graduate-d-3",
    "graduate-two-northwest-1",
    "graduate-two-northwest-2",
  ];
  const newBuildingIndex = DEVICES.findIndex(
    (device) => device.id === "new-building-1",
  );

  assert.deepEqual(
    DEVICES.slice(newBuildingIndex - insertedIds.length, newBuildingIndex).map(
      (device) => device.id,
    ),
    insertedIds,
  );

  for (const id of insertedIds) {
    const device = DEVICES.find((item) => item.id === id);
    assert.equal(device.mode, "mini");
    assert.equal(device.operatorId, "100664");
    assert.match(device.gid, /^FFFF\d{12}$/);
  }
});
