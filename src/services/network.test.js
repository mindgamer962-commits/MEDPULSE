import test from 'node:test';
import assert from 'node:assert';
import { findNearestPHCs, validatePHCLocation } from './network.js';

test('validatePHCLocation', async (t) => {
  await t.test('returns true for valid coordinates', () => {
    assert.strictEqual(validatePHCLocation({ latitude: 0, longitude: 0 }), true);
    assert.strictEqual(validatePHCLocation({ latitude: -90, longitude: 180 }), true);
    assert.strictEqual(validatePHCLocation({ latitude: 90, longitude: -180 }), true);
  });

  await t.test('returns false for missing or non-numeric coordinates', () => {
    assert.strictEqual(validatePHCLocation(null), false);
    assert.strictEqual(validatePHCLocation(undefined), false);
    assert.strictEqual(validatePHCLocation({}), false);
    assert.strictEqual(validatePHCLocation({ latitude: 0 }), false);
    assert.strictEqual(validatePHCLocation({ longitude: 0 }), false);
    assert.strictEqual(validatePHCLocation({ latitude: "0", longitude: 0 }), false);
  });

  await t.test('returns false for out of bounds coordinates', () => {
    assert.strictEqual(validatePHCLocation({ latitude: 91, longitude: 0 }), false);
    assert.strictEqual(validatePHCLocation({ latitude: -91, longitude: 0 }), false);
    assert.strictEqual(validatePHCLocation({ latitude: 0, longitude: 181 }), false);
    assert.strictEqual(validatePHCLocation({ latitude: 0, longitude: -181 }), false);
  });
});

test('findNearestPHCs', async (t) => {
  const MOCK_PHCS = [
    {
      phc_id: "phc-center",
      name: "Center PHC",
      state_id: "GJ",
      district_id: "AHM",
      latitude: 23.0,
      longitude: 72.0
    },
    {
      phc_id: "phc-near",
      name: "Near PHC",
      state_id: "GJ",
      district_id: "AHM",
      latitude: 23.01,
      longitude: 72.01
    },
    {
      phc_id: "phc-far",
      name: "Far PHC",
      state_id: "GJ",
      district_id: "GAN",
      latitude: 24.0,
      longitude: 73.0
    },
    {
      phc_id: "phc-no-coords",
      name: "No Coords PHC",
      state_id: "GJ",
      district_id: "NAV"
    },
    {
      phc_id: "phc-very-far",
      name: "Very Far PHC",
      state_id: "GJ",
      district_id: "SUR",
      latitude: 25.0,
      longitude: 74.0
    },
    {
      phc_id: "phc-near2",
      name: "Near 2 PHC",
      latitude: 23.02,
      longitude: 72.02
    },
    {
      phc_id: "phc-near3",
      name: "Near 3 PHC",
      latitude: 23.03,
      longitude: 72.03
    },
    {
      phc_id: "phc-near4",
      name: "Near 4 PHC",
      latitude: 23.04,
      longitude: 72.04
    }
  ];

  await t.test('returns nearest PHCs up to the limit', async () => {
    const response = await findNearestPHCs("phc-center", 3, MOCK_PHCS);
    
    assert.strictEqual(response.location_available, true);
    assert.strictEqual(response.results.length, 3);
    assert.strictEqual(response.results[0].phc_id, "phc-near");
    assert.strictEqual(response.results[1].phc_id, "phc-near2");
    assert.strictEqual(response.results[2].phc_id, "phc-near3");
  });

  await t.test('target PHC is excluded', async () => {
    const response = await findNearestPHCs("phc-center", 100, MOCK_PHCS);
    const hasTarget = response.results.some(p => p.phc_id === "phc-center");
    assert.strictEqual(hasTarget, false);
  });

  await t.test('results are sorted by distance', async () => {
    const response = await findNearestPHCs("phc-center", 5, MOCK_PHCS);
    assert.ok(response.results[0].distance_km < response.results[1].distance_km);
  });

  await t.test('PHC without coordinates is safely skipped', async () => {
    const response = await findNearestPHCs("phc-center", 100, MOCK_PHCS);
    const hasNoCoords = response.results.some(p => p.phc_id === "phc-no-coords");
    assert.strictEqual(hasNoCoords, false);
  });

  await t.test('target without coordinates returns location_available: false', async () => {
    const response = await findNearestPHCs("phc-no-coords", 5, MOCK_PHCS);
    assert.strictEqual(response.location_available, false);
    assert.strictEqual(response.results.length, 0);
  });
});

import { findPHCsInSameDistrict } from './network.js';

test('findPHCsInSameDistrict', async (t) => {
  const MOCK_PHCS = [
    {
      phc_id: "phc-center",
      name: "Center PHC",
      state_id: "GJ",
      district_id: "AHM",
      district: "Ahmedabad"
    },
    {
      phc_id: "phc-same-dist",
      name: "Same Dist PHC",
      state_id: "GJ",
      district_id: "AHM",
      district: "Ahmedabad"
    },
    {
      phc_id: "phc-other-dist",
      name: "Other Dist PHC",
      state_id: "GJ",
      district_id: "GAN"
    },
    {
      phc_id: "phc-no-coords",
      name: "No Coords PHC",
      state_id: "GJ",
      district_id: "AHM"
    },
    {
      phc_id: "phc-missing-dist",
      name: "Missing Dist PHC",
      state_id: "GJ"
    }
  ];

  await t.test('Target PHC returns other PHCs from the same district', async () => {
    const results = await findPHCsInSameDistrict("phc-center", MOCK_PHCS);
    assert.strictEqual(results.length, 2);
    assert.ok(results.some(r => r.phc_id === "phc-same-dist"));
  });

  await t.test('PHCs from another district are excluded', async () => {
    const results = await findPHCsInSameDistrict("phc-center", MOCK_PHCS);
    assert.ok(!results.some(r => r.phc_id === "phc-other-dist"));
  });

  await t.test('Target PHC itself is excluded', async () => {
    const results = await findPHCsInSameDistrict("phc-center", MOCK_PHCS);
    assert.ok(!results.some(r => r.phc_id === "phc-center"));
  });

  await t.test('PHC without coordinates can still be returned', async () => {
    const results = await findPHCsInSameDistrict("phc-center", MOCK_PHCS);
    assert.ok(results.some(r => r.phc_id === "phc-no-coords"));
  });

  await t.test('Missing district_id safely returns []', async () => {
    const results = await findPHCsInSameDistrict("phc-missing-dist", MOCK_PHCS);
    assert.strictEqual(results.length, 0);
  });

  await t.test('Non-existent target PHC safely returns []', async () => {
    const results = await findPHCsInSameDistrict("phc-not-exist", MOCK_PHCS);
    assert.strictEqual(results.length, 0);
  });
});

import { findPHCsInOtherDistricts } from './network.js';

test('findPHCsInOtherDistricts', async (t) => {
  const MOCK_PHCS = [
    {
      phc_id: "phc-center",
      name: "Center PHC",
      state_id: "GJ",
      district_id: "AHM",
      district: "Ahmedabad"
    },
    {
      phc_id: "phc-same-dist",
      name: "Same Dist PHC",
      state_id: "GJ",
      district_id: "AHM",
      district: "Ahmedabad"
    },
    {
      phc_id: "phc-other-dist",
      name: "Other Dist PHC",
      state_id: "GJ",
      district_id: "GAN",
      district: "Gandhinagar"
    },
    {
      phc_id: "phc-other-no-coords",
      name: "Other Dist No Coords PHC",
      state_id: "GJ",
      district_id: "NAV",
      district: "Navsari"
    },
    {
      phc_id: "phc-missing-dist",
      name: "Missing Dist PHC",
      state_id: "GJ"
    }
  ];

  await t.test('PHCs from another district are returned', async () => {
    const results = await findPHCsInOtherDistricts("phc-center", MOCK_PHCS);
    assert.strictEqual(results.length, 2);
    assert.ok(results.some(r => r.phc_id === "phc-other-dist"));
  });

  await t.test('PHCs from the target district are excluded', async () => {
    const results = await findPHCsInOtherDistricts("phc-center", MOCK_PHCS);
    assert.ok(!results.some(r => r.phc_id === "phc-same-dist"));
  });

  await t.test('Target PHC is excluded', async () => {
    const results = await findPHCsInOtherDistricts("phc-center", MOCK_PHCS);
    assert.ok(!results.some(r => r.phc_id === "phc-center"));
  });

  await t.test('PHCs without coordinates are still returned', async () => {
    const results = await findPHCsInOtherDistricts("phc-center", MOCK_PHCS);
    assert.ok(results.some(r => r.phc_id === "phc-other-no-coords"));
  });

  await t.test('Missing target district_id returns []', async () => {
    const results = await findPHCsInOtherDistricts("phc-missing-dist", MOCK_PHCS);
    assert.strictEqual(results.length, 0);
  });

  await t.test('Non-existent target PHC returns []', async () => {
    const results = await findPHCsInOtherDistricts("phc-not-exist", MOCK_PHCS);
    assert.strictEqual(results.length, 0);
  });

  await t.test('Results correctly include state and district information', async () => {
    const results = await findPHCsInOtherDistricts("phc-center", MOCK_PHCS);
    const target = results.find(r => r.phc_id === "phc-other-dist");
    assert.strictEqual(target.state_id, "GJ");
    assert.strictEqual(target.district_id, "GAN");
    assert.strictEqual(target.district_name, "Gandhinagar");
  });
});

import { getPHCResourceAvailability } from './network.js';

test('getPHCResourceAvailability', async (t) => {
  const MOCK_INVENTORY_WITH_DATA = [
    {
      medicine_id: "med-1",
      name: "Paracetamol",
      unit: "Tablets",
      currentStock: 500,
      totalReceived: 600,
      totalUsed: 100
    }
  ];

  const MOCK_INVENTORY_NO_DATA = [
    {
      medicine_id: "med-1",
      name: "Paracetamol",
      unit: "Tablets",
      currentStock: 0,
      totalReceived: 0,
      totalUsed: 0
    }
  ];

  await t.test('PHC with existing medicine data returns that data', async () => {
    const result = await getPHCResourceAvailability("phc-1", MOCK_INVENTORY_WITH_DATA);
    assert.strictEqual(result.data_available, true);
    assert.ok(result.resources.medicines);
    assert.strictEqual(result.resources.medicines[0].current_stock, 500);
    assert.strictEqual(result.resources.medicines[0].name, "Paracetamol");
  });

  await t.test('PHC with no resource data does not receive invented values', async () => {
    const result = await getPHCResourceAvailability("phc-2", MOCK_INVENTORY_NO_DATA);
    assert.strictEqual(result.data_available, false);
    assert.deepStrictEqual(result.resources, {});
  });

  await t.test('Missing PHC safely returns an appropriate empty result', async () => {
    // If it throws or returns empty array
    const result = await getPHCResourceAvailability("phc-missing", []);
    assert.strictEqual(result.data_available, false);
    assert.deepStrictEqual(result.resources, {});
  });
  
  await t.test('Existing medicine calculations remain unchanged', async () => {
    // Ensuring the return shape is exact and doesn't pollute or change calculation methods
    const result = await getPHCResourceAvailability("phc-1", MOCK_INVENTORY_WITH_DATA);
    assert.strictEqual(result.resources.medicines[0].current_stock, 500);
  });
});

import { findTransferSourcesByDistrict } from './network.js';

test('findTransferSourcesByDistrict', async (t) => {
  const MOCK_PHCS = [
    { phc_id: "dest", name: "Dest", district_id: "D1", latitude: 10, longitude: 10 },
    { phc_id: "same1", name: "Same1", district_id: "D1", latitude: 10.1, longitude: 10.1 },
    { phc_id: "same2", name: "Same2", district_id: "D1", latitude: 10.2, longitude: 10.2 },
    { phc_id: "other1", name: "Other1", district_id: "D2", latitude: 10.15, longitude: 10.15 },
    { phc_id: "no-surplus", name: "NoSurplus", district_id: "D1", latitude: 10.3, longitude: 10.3 },
    { phc_id: "missing-coords", name: "NoCoords", district_id: "D1" }
  ];

  const mockPredictStockOut = async (phcId, medicineId) => {
    if (phcId === "same1") return { currentStock: 100, predicted7DayDemand: 50 }; // safe: 50
    if (phcId === "same2") return { currentStock: 150, predicted7DayDemand: 50 }; // safe: 100
    if (phcId === "other1") return { currentStock: 100, predicted7DayDemand: 50 }; // safe: 50
    if (phcId === "no-surplus") return { currentStock: 40, predicted7DayDemand: 50 }; // safe: -10
    if (phcId === "missing-coords") return { currentStock: 100, predicted7DayDemand: 50 }; // safe: 50
    return { error: "Not found" };
  };

  await t.test('Same-district source is identified and classified', async () => {
    const results = await findTransferSourcesByDistrict("dest", "med-1", MOCK_PHCS, mockPredictStockOut);
    const same1 = results.find(r => r.phc_id === "same1");
    assert.ok(same1);
    assert.strictEqual(same1.classification, "SAME_DISTRICT");
  });

  await t.test('Other-district source is identified and classified', async () => {
    const results = await findTransferSourcesByDistrict("dest", "med-1", MOCK_PHCS, mockPredictStockOut);
    const other1 = results.find(r => r.phc_id === "other1");
    assert.ok(other1);
    assert.strictEqual(other1.classification, "OTHER_DISTRICT");
  });

  await t.test('PHC with insufficient surplus is excluded', async () => {
    const results = await findTransferSourcesByDistrict("dest", "med-1", MOCK_PHCS, mockPredictStockOut);
    const noSurplus = results.find(r => r.phc_id === "no-surplus");
    assert.strictEqual(noSurplus, undefined);
  });

  await t.test('Destination PHC is excluded as its own source', async () => {
    const results = await findTransferSourcesByDistrict("dest", "med-1", MOCK_PHCS, mockPredictStockOut);
    assert.strictEqual(results.some(r => r.phc_id === "dest"), false);
  });

  await t.test('Missing coordinates do not crash query and return null distance', async () => {
    const results = await findTransferSourcesByDistrict("dest", "med-1", MOCK_PHCS, mockPredictStockOut);
    const noCoords = results.find(r => r.phc_id === "missing-coords");
    assert.ok(noCoords);
    assert.strictEqual(noCoords.distance_km, null);
  });

  await t.test('Missing district_id on destination returns []', async () => {
    const MOCK_PHCS_MISSING = [{ phc_id: "dest-missing", name: "Dest" }];
    const results = await findTransferSourcesByDistrict("dest-missing", "med-1", MOCK_PHCS_MISSING, mockPredictStockOut);
    assert.strictEqual(results.length, 0);
  });

  await t.test('Results are sorted correctly (Same district first, then nearest)', async () => {
    const results = await findTransferSourcesByDistrict("dest", "med-1", MOCK_PHCS, mockPredictStockOut);
    // same1 is distance 15.6km, same2 is 31km, other1 is 23km
    assert.strictEqual(results[0].phc_id, "same1");
    assert.strictEqual(results[1].phc_id, "same2");
    assert.strictEqual(results[2].phc_id, "missing-coords"); // null distance last in same district
    assert.strictEqual(results[3].phc_id, "other1");
  });
});

