import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinishDedupeKey,
  createFinishTransitionTracker,
  extractPrintState,
} from "./index.js";

describe("extractPrintState", () => {
  it("extrait task_id et gcode_state FINISH", () => {
    const state = extractPrintState({
      print: {
        gcode_state: "finish",
        subtask_name: "piece.3mf",
        task_id: "12345",
        mc_percent: 100,
      },
    });
    assert.equal(state.gcodeState, "FINISH");
    assert.equal(state.jobName, "piece.3mf");
    assert.equal(state.jobId, "12345");
  });
});

describe("buildFinishDedupeKey", () => {
  it("préfère task_id au nom de fichier", () => {
    const key = buildFinishDedupeKey("SERIAL1", {
      jobId: "99",
      jobName: "a.3mf",
    });
    assert.equal(key, "SERIAL1:99");
  });
});

describe("createFinishTransitionTracker", () => {
  it("n'enregistre qu'à la transition vers FINISH", () => {
    const tracker = createFinishTransitionTracker();
    const serial = "31B8BP611200939";
    const payload = { gcodeState: "FINISH", jobName: "test.3mf", jobId: "42" };

    assert.deepEqual(tracker.shouldRecordFinish(serial, { gcodeState: "RUNNING", jobName: "x" }), {
      record: false,
      reason: "not_finish",
    });

    const first = tracker.shouldRecordFinish(serial, payload);
    assert.equal(first.record, true);
    assert.equal(first.reason, "transition_to_finish");
    tracker.markFinishRecorded(serial, first.dedupeKey);

    assert.deepEqual(tracker.shouldRecordFinish(serial, payload), {
      record: false,
      reason: "already_finish",
    });
    assert.deepEqual(tracker.shouldRecordFinish(serial, payload), {
      record: false,
      reason: "already_finish",
    });
  });

  it("autorise un nouvel enregistrement après RUNNING puis FINISH", () => {
    const tracker = createFinishTransitionTracker();
    const serial = "S1";
    const job = { gcodeState: "FINISH", jobName: "a.3mf", jobId: "1" };

    const first = tracker.shouldRecordFinish(serial, job);
    tracker.markFinishRecorded(serial, first.dedupeKey);

    tracker.shouldRecordFinish(serial, { gcodeState: "RUNNING", jobName: "a.3mf", jobId: "1" });
    const second = tracker.shouldRecordFinish(serial, job);
    assert.equal(second.record, true);
    assert.equal(second.reason, "transition_to_finish");
  });

  it("bloque un second FINISH identique si l'état a clignoté", () => {
    const tracker = createFinishTransitionTracker();
    const serial = "S1";
    const job = { gcodeState: "FINISH", jobName: "a.3mf", jobId: "7" };

    const first = tracker.shouldRecordFinish(serial, job);
    tracker.markFinishRecorded(serial, first.dedupeKey);

    tracker.shouldRecordFinish(serial, { gcodeState: "PAUSE", jobName: "a.3mf", jobId: "7" });
    const again = tracker.shouldRecordFinish(serial, job);
    assert.equal(again.record, false);
    assert.equal(again.reason, "duplicate_job");
  });
});
