const assert = require("node:assert/strict");
const test = require("node:test");

const { DEVICES } = require("../server");

test("charging device catalog keeps the configured order and mini metadata", () => {
  assert.equal(DEVICES.length, 35);
  assert.equal(new Set(DEVICES.map((device) => device.id)).size, DEVICES.length);

  const expectedIds = [
    "building-13-1",
    "building-13-2",
    "building-7-1",
    "building-7-2",
    "building-12-1",
    "building-12-2",
    "defense-1",
    "defense-2",
    "building-11-1",
    "building-11-2",
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
    "new-building-1",
    "qiushi-south",
    "graduate-teaching-north",
    "information-science-south",
    "teaching-5-1",
    "teaching-5-2",
    "teaching-5-3",
    "teaching-5-4",
    "main-building-west",
  ];
  assert.deepEqual(DEVICES.map((device) => device.id), expectedIds);

  const addedIds = expectedIds.slice(-8);
  for (const id of addedIds) {
    const device = DEVICES.find((item) => item.id === id);
    assert.equal(device.mode, "mini");
    assert.equal(device.operatorId, "100664");
    assert.match(device.gid, /^FFFF\d{12}$/);
  }
});
