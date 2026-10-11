import fs from 'node:fs';
import path from 'node:path';
import { runStorageAcceptanceSuite } from './storageAcceptanceSuite.ts';
import { runCohort1ForensicSuite } from './cohort1ForensicSuite.ts';
import { runCohort2PatientForensicSuite } from './cohort2PatientForensicSuite.ts';

async function main() {
  console.log('=== STARTING STORAGE ACCEPTANCE TEST RUNNER ===');
  
  // In Node.js, we can optionally provide the WASM binary buffer if wa-sqlite cannot locate it automatically
  let wasmBinary: Buffer | undefined;
  try {
    const wasmPath = path.resolve(process.cwd(), 'node_modules/wa-sqlite/dist/wa-sqlite-async.wasm');
    if (fs.existsSync(wasmPath)) {
      wasmBinary = fs.readFileSync(wasmPath);
      console.log(`Loaded wa-sqlite-async.wasm (${wasmBinary.byteLength} bytes)`);
    }
  } catch (err) {
    console.warn('Could not preload WASM binary:', err);
  }

  // 1. Storage Acceptance Suite
  const report = await runStorageAcceptanceSuite({
    wasmBinary,
    environmentName: 'Node.js / tsx Runner (MemoryAsyncVFS Engine)',
  });

  console.log('\n=== STORAGE ACCEPTANCE REPORT SUMMARY ===');
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Total Gates: ${report.totalGates}`);
  console.log(`Passed: ${report.passedGates}`);
  console.log(`Failed: ${report.failedGates}`);
  console.log(`Blocked / Not Run: ${report.blockedGates}\n`);

  for (const r of report.results) {
    console.log(`[${r.status}] ${r.gateId} - ${r.gateName} (${r.testLevel})`);
    console.log(`       Evidence: ${r.observableEvidence}`);
    if (r.limitation) {
      console.log(`       Limitation: ${r.limitation}`);
    }
  }

  // 2. Cohort 1 Forensic Suite
  console.log('\n=== STARTING COHORT 1 INFRASTRUCTURE FORENSIC SUITE ===');
  const c1Report = await runCohort1ForensicSuite({ wasmBinary });
  console.log(`Cohort 1 Total: ${c1Report.total}, Passed: ${c1Report.passed}`);
  for (const r of c1Report.results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
  }

  // 3. Cohort 2 Patient Vertical Slice Forensic Suite (Phase R2-A)
  console.log('\n=== STARTING COHORT 2 PATIENT VERTICAL SLICE FORENSIC SUITE (R2-A) ===');
  const c2Report = await runCohort2PatientForensicSuite({ wasmBinary });
  console.log(`Cohort 2 Total: ${c2Report.total}, Passed: ${c2Report.passed}, Failed: ${c2Report.failed}, Blocked: ${c2Report.blocked}`);
  for (const r of c2Report.results) {
    console.log(`[${r.status}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
    if (r.limitation) {
      console.log(`       Limitation: ${r.limitation}`);
    }
  }

  const anyFailures = report.failedGates > 0 || (c1Report.total - c1Report.passed > 0) || c2Report.failed > 0;
  if (anyFailures) {
    console.error('\nOne or more test suites failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
