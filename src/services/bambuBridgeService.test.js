import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({
  isSupabaseConfigured: false,
  getSupabase: vi.fn(),
}));

import {
  JOB_STATUS,
  applyJobToStock,
  createBambuPrinter,
  createBambuPrintJob,
  getPrinterAccessCode,
  getQueueJobs,
  ignoreAllQueueJobs,
  ignoreBambuPrintJob,
  mergeBambuPrintJobsFromCloud,
  decodeTrayNow,
  formatAmsSlotLabel,
  parseBambuColor,
  resolveFilamentForJob,
  setPrinterAccessCode,
  simulatePrintFinish,
  upsertAmsSlotMapping,
} from "./bambuBridgeService";
import { createFilament } from "./filamentService";

const filamentData = createFilament({}, {
  name: "PLA Test",
  spoolWeightFullG: 1000,
  remainingWeightG: 500,
  purchasePrice: 20,
});

describe("bambuBridgeService", () => {
  it("stocke le code d'accès uniquement dans les réglages locaux", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "X1C",
      host: "192.168.1.50",
      serial: "ABC123",
    });
    const withSecret = setPrinterAccessCode(withPrinter, withPrinter.printer.id, "12345678");

    expect(getPrinterAccessCode(withSecret, withPrinter.printer.id)).toBe("12345678");
    expect(withSecret.bambuPrinters[0].accessCodeEncrypted).toContain("localement");
  });

  it("simule une fin d'impression et place le job en file", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "A1",
      host: "10.0.0.2",
      serial: "SER001",
    });
    const withJob = simulatePrintFinish(withPrinter, {
      printerId: withPrinter.printer.id,
      jobName: "piece-test.3mf",
      grams: 42,
    });

    const queue = getQueueJobs(withJob);
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe(JOB_STATUS.FINISHED);
    expect(queue[0].gramsEstimated).toBe(42);
  });

  it("résout le filament via le mapping AMS", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "P1S",
      host: "192.168.0.10",
      serial: "SN99",
    });
    const filamentId = filamentData.filaments[0].id;
    const withMapping = upsertAmsSlotMapping(withPrinter, {
      printerId: withPrinter.printer.id,
      slotIndex: 1,
      filamentId,
    });
    const job = {
      printerId: withPrinter.printer.id,
      rawMqttJson: { amsTrayIndex: 1 },
    };

    expect(resolveFilamentForJob(withMapping, job)).toBe(filamentId);
  });

  it("applyJobToStock déduit le stock et marque le job appliqué", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "X1",
      host: "192.168.1.1",
      serial: "X1",
    });
    const filamentId = filamentData.filaments[0].id;
    const withJob = createBambuPrintJob(withPrinter, {
      printerId: withPrinter.printer.id,
      jobName: "support.gcode.3mf",
      status: JOB_STATUS.FINISHED,
      gramsEstimated: 30,
      filamentId,
    });

    const result = applyJobToStock(withJob, withJob.job.id, { grams: 30 });
    const applied = result.bambuPrintJobs.find((entry) => entry.id === withJob.job.id);

    expect(applied.status).toBe(JOB_STATUS.APPLIED);
    expect(result.filament.remainingWeightG).toBe(470);
    expect(result.filamentMovements.length).toBeGreaterThan(0);
  });

  it("ignoreBambuPrintJob marque le job comme ignoré", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "A1 mini",
      host: "10.0.0.3",
      serial: "MINI1",
    });
    const withJob = simulatePrintFinish(withPrinter, { printerId: withPrinter.printer.id });
    const ignored = ignoreBambuPrintJob(withJob, withJob.job.id);
    const job = ignored.bambuPrintJobs.find((entry) => entry.id === withJob.job.id);

    expect(job.status).toBe(JOB_STATUS.FAILED);
    expect(job.rawMqttJson.ignoredByUser).toBe(true);
    expect(getQueueJobs(ignored)).toHaveLength(0);
  });

  it("mergeBambuPrintJobsFromCloud conserve un job ignoré localement", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "X1",
      host: "192.168.1.2",
      serial: "MERGE1",
    });
    const withJob = simulatePrintFinish(withPrinter, { printerId: withPrinter.printer.id });
    const ignored = ignoreBambuPrintJob(withJob, withJob.job.id);
    const localJob = ignored.bambuPrintJobs.find((entry) => entry.id === withJob.job.id);
    const staleCloud = [
      {
        ...localJob,
        status: JOB_STATUS.FINISHED,
        rawMqttJson: { gcode_state: "FINISH" },
      },
    ];

    const merged = mergeBambuPrintJobsFromCloud(ignored.bambuPrintJobs, staleCloud);
    const mergedJob = merged.find((entry) => entry.id === withJob.job.id);

    expect(mergedJob.status).toBe(JOB_STATUS.FAILED);
    expect(getQueueJobs({ bambuPrintJobs: merged })).toHaveLength(0);
  });

  it("ignoreAllQueueJobs vide la file d'attente", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "P1",
      host: "10.0.0.5",
      serial: "P1SN",
    });
    let data = withPrinter;
    data = simulatePrintFinish(data, { printerId: withPrinter.printer.id, jobName: "a" });
    data = simulatePrintFinish(data, { printerId: withPrinter.printer.id, jobName: "b" });
    expect(getQueueJobs(data)).toHaveLength(2);

    const cleared = ignoreAllQueueJobs(data);
    expect(getQueueJobs(cleared)).toHaveLength(0);
    expect(cleared.ignoredJobs).toHaveLength(2);
  });

  it("résout le filament AMS2 via amsUnit + slotIndex", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "H2C",
      host: "192.168.178.21",
      serial: "31B8BP611200939",
    });
    const filamentId = filamentData.filaments[0].id;
    const withMapping = upsertAmsSlotMapping(withPrinter, {
      printerId: withPrinter.printer.id,
      amsUnit: 1,
      slotIndex: 2,
      filamentId,
    });
    const job = {
      printerId: withPrinter.printer.id,
      rawMqttJson: { tray_now: "6" },
    };

    expect(decodeTrayNow("10")).toEqual({ amsUnit: 2, slotIndex: 2 });
    expect(formatAmsSlotLabel(1, 2)).toBe("AMS2 A3");
    expect(parseBambuColor("FF0000FF")).toBe("#FF0000");
    expect(resolveFilamentForJob(withMapping, job)).toBe(filamentId);
  });

  it("résout le filament via tray_now décodé (AMS1 A2)", () => {
    const withPrinter = createBambuPrinter(filamentData, {
      name: "H2C",
      host: "192.168.178.21",
      serial: "31B8BP611200939",
    });
    const filamentId = filamentData.filaments[0].id;
    const withMapping = upsertAmsSlotMapping(withPrinter, {
      printerId: withPrinter.printer.id,
      amsUnit: 0,
      slotIndex: 1,
      filamentId,
    });
    const job = {
      printerId: withPrinter.printer.id,
      rawMqttJson: { tray_now: "1" },
    };

    expect(decodeTrayNow("1")).toEqual({ amsUnit: 0, slotIndex: 1 });
    expect(resolveFilamentForJob(withMapping, job)).toBe(filamentId);
  });
});
