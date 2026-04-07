#!/usr/bin/env node

/**
 * Unhandled Promise Rejection Audit Script
 * 
 * Scans the codebase for potential unhandled promise rejections:
 * - .then() without .catch()
 * - async functions called without await or error handling
 * - Promise.all() without proper error handling
 * 
 * Run: node scripts/audit-promises.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const results = {
  thenWithoutCatch: [],
  floatingPromises: [],
  promiseAllWithoutCatch: [],
  stats: {
    filesScanned: 0,
    issuesFound: 0,
  }
};

function scanFile(filePath) {
  if (!filePath.match(/\.(tsx?|jsx?)$/)) return;
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  results.stats.filesScanned++;
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    
    // Check for .then() without .catch()
    if (trimmed.includes('.then(')) {
      // Look ahead to see if there's a .catch() or try-catch
      const nextLines = lines.slice(index, Math.min(index + 5, lines.length)).join('\n');
      
      if (!nextLines.includes('.catch(') && !nextLines.includes('try {')) {
        results.thenWithoutCatch.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
          severity: 'high',
        });
        results.stats.issuesFound++;
      }
    }
    
    // Check for Promise.all without .catch()
    if (trimmed.includes('Promise.all(')) {
      const nextLines = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
      
      if (!nextLines.includes('.catch(') && !nextLines.includes('try {')) {
        results.promiseAllWithoutCatch.push({
          file: filePath,
          line: lineNum,
          code: trimmed,
          severity: 'medium',
        });
        results.stats.issuesFound++;
      }
    }
    
    // Check for async function calls without await (floating promises)
    // This is a simple heuristic - may have false positives
    const asyncCallMatch = trimmed.match(/(\w+)\(.*\)\.then\(/);
    if (asyncCallMatch && !trimmed.includes('await') && !trimmed.includes('const') && !trimmed.includes('let')) {
      results.floatingPromises.push({
        file: filePath,
        line: lineNum,
        code: trimmed,
        severity: 'low',
      });
    }
  });
}

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  entries.forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath);
      }
    } else {
      scanFile(fullPath);
    }
  });
}

// Scan src directory
console.log('🔍 Scanning for unhandled promise rejections...\n');
scanDirectory(path.join(__dirname, '..', 'src'));

// Print results
console.log('=' .repeat(80));
console.log('📊 UNHANDLED PROMISE REJECTION AUDIT RESULTS');
console.log('='.repeat(80) + '\n');

console.log(`📁 Files scanned: ${results.stats.filesScanned}`);
console.log(`⚠️  Issues found: ${results.stats.issuesFound}\n`);

if (results.thenWithoutCatch.length > 0) {
  console.log('🔴 HIGH SEVERITY: .then() without .catch()\n');
  results.thenWithoutCatch.forEach(issue => {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    ${issue.code}`);
    console.log('');
  });
}

if (results.promiseAllWithoutCatch.length > 0) {
  console.log('🟡 MEDIUM SEVERITY: Promise.all() without .catch()\n');
  results.promiseAllWithoutCatch.forEach(issue => {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    ${issue.code}`);
    console.log('');
  });
}

if (results.floatingPromises.length > 0) {
  console.log('🟢 LOW SEVERITY: Potential floating promises\n');
  results.floatingPromises.forEach(issue => {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    ${issue.code}`);
    console.log('');
  });
}

console.log('='.repeat(80));

if (results.stats.issuesFound === 0) {
  console.log('✅ No unhandled promise rejections found!');
  process.exit(0);
} else {
  console.log('⚠️  Found potential unhandled promise rejections.');
  console.log('Please review and add appropriate error handling.');
  
  // Write detailed report to file
  fs.writeFileSync(
    path.join(__dirname, '..', 'promise-audit-report.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n📄 Detailed report written to: promise-audit-report.json');
  
  process.exit(1);
}
