import fs from 'node:fs';
import path from 'node:path';
import { runStorageAcceptanceSuite } from './storageAcceptanceSuite.ts';

async function main() {
  console.log('=== STARTING STAGE 1 STORAGE ACCEPTANCE TEST RUNNER ===');
  
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
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
