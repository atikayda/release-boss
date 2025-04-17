const { getBumpTypeForCommit, isExcludedFromChangelog } = require('../src/core/commitAnalyzer');

// Helper function to create a parsed commit object
function createParsedCommit(type, scope = null, subject = 'test commit', notes = []) {
  return {
    type,
    scope,
    subject,
    notes
  };
}

// Test the commit type mapping
console.log('=== Testing Conventional Commit Parser ===');

// Test major bump commits (breaking changes)
console.log('\n== Testing Major Bump Detection ==');
const breakingChanges = [
  { commit: createParsedCommit('feat!'), expected: 'major', desc: 'Feature with breaking change marker' },
  { commit: createParsedCommit('fix!'), expected: 'major', desc: 'Fix with breaking change marker' },
  { 
    commit: createParsedCommit('feat', 'api', 'new API', [{ title: 'BREAKING CHANGE', text: 'changes API' }]), 
    expected: 'major', 
    desc: 'Feature with BREAKING CHANGE note' 
  },
  { 
    commit: createParsedCommit('refactor', null, 'change structure', [{ title: 'BREAKING-CHANGE', text: 'changes structure' }]), 
    expected: 'major', 
    desc: 'Refactor with BREAKING-CHANGE note' 
  }
];

for (const test of breakingChanges) {
  const result = getBumpTypeForCommit(test.commit);
  console.log(`${result === test.expected ? '✅' : '❌'} ${test.desc}: ${result}`);
}

// Test minor bump commits (features)
console.log('\n== Testing Minor Bump Detection ==');
const minorChanges = [
  { commit: createParsedCommit('feat'), expected: 'minor', desc: 'Standard feature' },
  { commit: createParsedCommit('feat', 'ui'), expected: 'minor', desc: 'Feature with scope' }
];

for (const test of minorChanges) {
  const result = getBumpTypeForCommit(test.commit);
  console.log(`${result === test.expected ? '✅' : '❌'} ${test.desc}: ${result}`);
}

// Test patch bump commits (fixes, etc.)
console.log('\n== Testing Patch Bump Detection ==');
const patchChanges = [
  { commit: createParsedCommit('fix'), expected: 'patch', desc: 'Bug fix' },
  { commit: createParsedCommit('perf'), expected: 'patch', desc: 'Performance improvement' },
  { commit: createParsedCommit('refactor'), expected: 'patch', desc: 'Code refactor' }
];

for (const test of patchChanges) {
  const result = getBumpTypeForCommit(test.commit);
  console.log(`${result === test.expected ? '✅' : '❌'} ${test.desc}: ${result}`);
}

// Test no-bump commits
console.log('\n== Testing No-Bump Detection ==');
const noBumpChanges = [
  { commit: createParsedCommit('docs'), expected: null, desc: 'Documentation change' },
  { commit: createParsedCommit('style'), expected: null, desc: 'Style change' },
  { commit: createParsedCommit('test'), expected: null, desc: 'Test addition' },
  { commit: createParsedCommit('ci'), expected: null, desc: 'CI configuration' },
  { commit: createParsedCommit('build'), expected: null, desc: 'Build system change' }
];

for (const test of noBumpChanges) {
  const result = getBumpTypeForCommit(test.commit);
  console.log(`${result === test.expected ? '✅' : '❌'} ${test.desc}: ${result === null ? 'null' : result}`);
}

// Test excluded commits
console.log('\n== Testing Excluded Commits ==');
const excludedChanges = [
  { commit: createParsedCommit('chore'), expected: true, desc: 'Chore commit' },
  { commit: createParsedCommit('fix', 'no-release'), expected: true, desc: 'Commit with no-release scope' },
  { commit: createParsedCommit('feat'), expected: false, desc: 'Non-excluded commit' }
];

for (const test of excludedChanges) {
  const result = isExcludedFromChangelog(test.commit);
  console.log(`${result === test.expected ? '✅' : '❌'} ${test.desc}: ${result}`);
}

console.log('\n=== Testing Complete ===');
