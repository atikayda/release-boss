// Sample commit lines from the actual logs
const sampleLines = [
  '* **changelog:** implement PR-based changelog tracking system ([6b515af](https://github.com/atikayda/release-boss/commit/6b515afcfbc0b519b2f2037fcef7db34cd57e72a))',
  '* **pr:** correct variable name in PR creation process ([e3fc5e4](https://github.com/atikayda/release-boss/commit/e3fc5e4aac81eb1ef846c9ae11cc133629fc0a9e))',
  '* rename commits parameter to changelog to match actual type 💅 ([877cd5d](https://github.com/atikayda/release-boss/commit/877cd5d1128fe1dd217f8adba50edb1e74e3d2a6))',
  '* enhance commitsToChangelogEntries to handle different commit structures 💁‍♀️ ([45fd00d](https://github.com/atikayda/release-boss/commit/45fd00dc6e8762bb83f10ca754725c9f23f42d0e))',
  '* use conventional commits parser instead ([a9de56e](https://github.com/atikayda/release-boss/commit/a9de56e88303cc6b7b22cdaddd9d622fe5b8b1a3))'
];

// Regex for conventional commit format (with ** and type/scope)
const conventionalRegex = /^\*\s+\*\*([^\(]+)(?:\(([^\)]+)\))?:\*\*\s+(.+?)\s+\(\[([a-f0-9]+)\]/;

// Regex for non-conventional format (without ** and type/scope)
const nonConventionalRegex = /^\*\s+([^\[\(]+)\s+\(\[([a-f0-9]+)\]/;

console.log('Testing conventional regex pattern:');
sampleLines.forEach(line => {
  const match = line.match(conventionalRegex);
  console.log(`Line: ${line}`);
  console.log(`Match: ${match ? 'YES' : 'NO'}`);
  if (match) {
    console.log(`  Type: ${match[1] || 'N/A'}`);
    console.log(`  Scope: ${match[2] || 'N/A'}`);
    console.log(`  Message: ${match[3] || 'N/A'}`);
    console.log(`  Hash: ${match[4] || 'N/A'}`);
  }
  console.log('---');
});

console.log('\nTesting non-conventional regex pattern:');
sampleLines.forEach(line => {
  const match = line.match(nonConventionalRegex);
  console.log(`Line: ${line}`);
  console.log(`Match: ${match ? 'YES' : 'NO'}`);
  if (match) {
    console.log(`  Message: ${match[1] || 'N/A'}`);
    console.log(`  Hash: ${match[2] || 'N/A'}`);
  }
  console.log('---');
});

// Combined approach - try both patterns
console.log('\nTesting combined approach:');
sampleLines.forEach(line => {
  let match = line.match(conventionalRegex);
  let type, scope, message, hash;
  
  // Try conventional format first
  if (match) {
    type = match[1]?.trim();
    scope = match[2]?.trim() || '';
    message = match[3]?.trim();
    hash = match[4];
    console.log(`Line: ${line}`);
    console.log(`Match: YES (conventional)`);
    console.log(`  Type: ${type || 'N/A'}`);
    console.log(`  Scope: ${scope || 'N/A'}`);
    console.log(`  Message: ${message || 'N/A'}`);
    console.log(`  Hash: ${hash || 'N/A'}`);
  } 
  // If that fails, try non-conventional format
  else {
    match = line.match(nonConventionalRegex);
    if (match) {
      message = match[1]?.trim();
      hash = match[2];
      console.log(`Line: ${line}`);
      console.log(`Match: YES (non-conventional)`);
      console.log(`  Message: ${message || 'N/A'}`);
      console.log(`  Hash: ${hash || 'N/A'}`);
    } else {
      console.log(`Line: ${line}`);
      console.log(`Match: NO`);
    }
  }
  console.log('---');
});
