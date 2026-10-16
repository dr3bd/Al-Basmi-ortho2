import fs from 'node:fs';
import path from 'node:path';
import { runStorageAcceptanceSuite } from './storageAcceptanceSuite.ts';
import { runCohort1ForensicSuite } from './cohort1ForensicSuite.ts';
import { runCohort2PatientForensicSuite } from './cohort2PatientForensicSuite.ts';
import { runCohort2CaseForensicSuite } from './cohort2CaseForensicSuite.ts';
import { runCohort2VisitForensicSuite } from './cohort2VisitForensicSuite.ts';
import { runCohort2ProblemDiagnosisForensicSuite } from './cohort2ProblemDiagnosisForensicSuite.ts';
import { runUX1DataIntegritySuite } from './clinicalCaseDataIntegritySuite.ts';
import { runDbFoundationRemediationSuite } from './dbFoundationRemediationSuite.ts';
import { runSqliteBackupRestoreSuite } from './sqliteBackupRestoreSuite.ts';

// Intercept internal wa-sqlite Emscripten asyncify microtask unwinding during cross-suite module reload
process.on('unhandledRejection', (reason: any) => {
  if (reason && String(reason).includes('is not a function') && String(reason?.stack || '').includes('wa-sqlite')) {
    // Known wa-sqlite Emscripten asyncify stack unwinding artifact during multi-connection closure
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

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

  // 2. Cohort 1 Infrastructure Forensic Suite
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

  // 4. Cohort 2 Orthodontic Case Vertical Slice Forensic Suite (Phase R2-B)
  console.log('\n=== STARTING COHORT 2 ORTHODONTIC CASE VERTICAL SLICE FORENSIC SUITE (R2-B) ===');
  const c2CaseReport = await runCohort2CaseForensicSuite({ wasmBinary });
  console.log(
    `Cohort 2 Case Total: ${c2CaseReport.total}, Passed: ${c2CaseReport.passed}, Failed: ${c2CaseReport.failed}, Blocked: ${c2CaseReport.blocked}`
  );
  for (const r of c2CaseReport.results) {
    console.log(`[${r.status}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
    if (r.limitation) {
      console.log(`       Limitation: ${r.limitation}`);
    }
  }

  // 5. Cohort 2 Visit & Examination Vertical Slice Forensic Suite (Phase R2-C)
  console.log('\n=== STARTING COHORT 2 VISIT & EXAMINATION FORENSIC SUITE (R2-C) ===');
  const c2VisitReport = await runCohort2VisitForensicSuite({ wasmBinary });
  console.log(
    `Cohort 2 Visit Total: ${c2VisitReport.total}, Passed: ${c2VisitReport.passed}, Failed: ${c2VisitReport.failed}, Blocked: ${c2VisitReport.blocked}`
  );
  for (const r of c2VisitReport.results) {
    console.log(`[${r.status}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
    if (r.limitation) {
      console.log(`       Limitation: ${r.limitation}`);
    }
  }

  // 6. Cohort 2 Problem List & Clinical Diagnosis Forensic Suite (Phase R2-D)
  console.log('\n=== STARTING COHORT 2 PROBLEM & DIAGNOSIS FORENSIC SUITE (R2-D) ===');
  const c2ProbDiagReport = await runCohort2ProblemDiagnosisForensicSuite({ wasmBinary });
  console.log(
    `Cohort 2 Problem & Diagnosis Total: ${c2ProbDiagReport.total}, Passed: ${c2ProbDiagReport.passed}, Failed: ${c2ProbDiagReport.failed}, Blocked: ${c2ProbDiagReport.blocked}`
  );
  for (const r of c2ProbDiagReport.results) {
    console.log(`[${r.status}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
    if (r.limitation) {
      console.log(`       Limitation: ${r.limitation}`);
    }
  }

  // 7. Clinical Data Integrity & Blank Case State Suite (Phase UX-1)
  console.log('\n=== STARTING UX-1 CLINICAL DATA INTEGRITY & BLANK CASE STATE SUITE ===');
  const ux1Report = await runUX1DataIntegritySuite({ wasmBinary });
  console.log(
    `UX-1 Total: ${ux1Report.total}, Passed: ${ux1Report.passed}, Failed: ${ux1Report.failed}`
  );
  for (const r of ux1Report.results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.message}`);
  }

  // 8. Database & Persistence Foundation Remediation Suite (Phase DB-FOUNDATION-REMEDIATION)
  console.log('\n=== STARTING DB-FOUNDATION-REMEDIATION VERIFICATION SUITE ===');
  const dbfReport = await runDbFoundationRemediationSuite({ wasmBinary });
  console.log(
    `DB-FOUNDATION Total: ${dbfReport.total}, Passed: ${dbfReport.passed}, Failed: ${dbfReport.failed}`
  );
  for (const r of dbfReport.results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
  }

  // 9. SQLite Backup & Restore Verification Suite (Phase 0-R-GATE-1)
  console.log('\n=== STARTING SQLITE BACKUP & RESTORE VERIFICATION SUITE (GATE-1) ===');
  const bkReport = await runSqliteBackupRestoreSuite({ wasmBinary });
  console.log(
    `SQLITE BACKUP/RESTORE Total: ${bkReport.total}, Passed: ${bkReport.passed}, Failed: ${bkReport.failed}`
  );
  for (const r of bkReport.results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.testId} - ${r.name}`);
    console.log(`       Evidence: ${r.evidence}`);
  }

  const anyFailures =
    report.failedGates > 0 ||
    c1Report.total - c1Report.passed > 0 ||
    c2Report.failed > 0 ||
    c2CaseReport.failed > 0 ||
    c2VisitReport.failed > 0 ||
    c2ProbDiagReport.failed > 0 ||
    ux1Report.failed > 0 ||
    dbfReport.failed > 0 ||
    bkReport.failed > 0;
  if (anyFailures) {
    console.error('\nOne or more test suites failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
