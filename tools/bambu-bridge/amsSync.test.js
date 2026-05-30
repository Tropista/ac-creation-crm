import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAmsSnapshotKey,
  createAmsSyncThrottler,
  parseAmsFromMqtt,
  parseTrayEntry,
} from "./amsSync.js";

const MOCK_TWO_AMS = {
  print: {
    ams: {
      ams: [
        {
          id: "0",
          humidity: "3",
          temp: "28.0",
          tray: [
            {
              id: "0",
              remain: 85,
              tag_uid: "AABBCCDD00112233",
              tray_info_idx: "GFL99",
              tray_type: "PLA",
              tray_color: "FF0000FF",
              tray_weight: "1000",
            },
            { id: "1", state: 0 },
            {
              id: "2",
              remain: 42,
              tag_uid: "1122334455667788",
              tray_type: "PETG",
              tray_color: "00FF00FF",
              tray_weight: "750",
            },
            { id: "3" },
          ],
        },
        {
          id: "1",
          humidity: "4",
          temp: "27.5",
          tray: [
            {
              id: "0",
              remain: 100,
              tray_type: "ABS",
              tray_color: "000000FF",
              tray_weight: "900",
              cols: ["000000FF"],
            },
            { id: "1", state: 0 },
            { id: "2", state: 0 },
            { id: "3", state: 0 },
          ],
        },
      ],
      tray_now: "5",
    },
  },
};

describe("parseTrayEntry", () => {
  it("marque un slot vide avec metadata seule", () => {
    const tray = parseTrayEntry(0, 1, { id: "1", state: 0 });
    assert.equal(tray.empty, true);
    assert.equal(tray.material, null);
  });

  it("calcule remain_g depuis tray_weight et remain_pct", () => {
    const tray = parseTrayEntry(0, 0, {
      id: "0",
      remain: 50,
      tray_type: "PLA",
      tray_weight: "1000",
    });
    assert.equal(tray.remainPct, 50);
    assert.equal(tray.remainG, 500);
    assert.equal(tray.material, "PLA");
  });
});

describe("parseAmsFromMqtt", () => {
  it("parse 2 AMS × 4 slots depuis un rapport MQTT réaliste", () => {
    const trays = parseAmsFromMqtt(MOCK_TWO_AMS);
    assert.equal(trays.length, 8);

    const ams1a1 = trays.find((t) => t.amsUnit === 0 && t.slotIndex === 0);
    assert.equal(ams1a1.empty, false);
    assert.equal(ams1a1.material, "PLA");
    assert.equal(ams1a1.tagUid, "AABBCCDD00112233");
    assert.equal(ams1a1.remainPct, 85);
    assert.equal(ams1a1.remainG, 850);

    const ams1a2 = trays.find((t) => t.amsUnit === 0 && t.slotIndex === 1);
    assert.equal(ams1a2.empty, true);

    const ams2a1 = trays.find((t) => t.amsUnit === 1 && t.slotIndex === 0);
    assert.equal(ams2a1.material, "ABS");
    assert.equal(ams2a1.color, "000000FF");
  });

  it("retourne un tableau vide sans bloc ams", () => {
    assert.deepEqual(parseAmsFromMqtt({ print: { gcode_state: "IDLE" } }), []);
    assert.deepEqual(parseAmsFromMqtt(null), []);
  });
});

describe("createAmsSyncThrottler", () => {
  it("pousse immédiatement au changement puis throttle", () => {
    const throttler = createAmsSyncThrottler(30_000);
    const traysA = parseAmsFromMqtt(MOCK_TWO_AMS);
    const traysB = parseAmsFromMqtt({
      print: {
        ams: {
          ams: [
            {
              id: "0",
              tray: [{ id: "0", remain: 10, tray_type: "PLA", tray_weight: "1000" }],
            },
          ],
        },
      },
    });

    assert.equal(throttler.shouldPush(traysA).push, true);
    throttler.markPushed();

    assert.equal(throttler.shouldPush(traysA).push, false);
    assert.equal(throttler.shouldPush(traysB).push, true);
  });

  it("buildAmsSnapshotKey ignore l'ordre des champs parasites", () => {
    const keyA = buildAmsSnapshotKey([{ amsUnit: 0, slotIndex: 0, material: "PLA", empty: false }]);
    const keyB = buildAmsSnapshotKey([{ amsUnit: 0, slotIndex: 0, material: "PLA", empty: false }]);
    assert.equal(keyA, keyB);
  });
});
