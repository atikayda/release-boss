# ✨ PR-Based Changelog Tracking Upgrade Plan ✨

This document outlines the plan to enhance Release Boss with a table-based changelog tracking system in PRs. This approach will be both machine-readable and human-editable, perfect for our workflow!

## 💎 Overview of Changes

We'll modify Release Boss to:

1. Create and maintain a structured changelog table in the PR description
2. Parse existing PR descriptions when updating PRs
3. Add new changes from main branch commits
4. Allow human editing while preserving machine-readable format

## 🌟 Detailed Implementation Plan

### Phase 1: Design the Table Format

The changelog table should be:
- Enclosed in special marker comments for easy parsing
- Structured as a markdown table with specific columns
- Flexible enough to handle human edits

```markdown
<!-- RELEASE_BOSS_CHANGELOG_START -->
| Type | Scope | Description | PR | Commit | Author |
|------|-------|-------------|----|---------| ------|
| feat | auth | Add OAuth2 support | #123 | abc1234 | @username |
| fix | api | Fix rate limiting bug | #124 | def5678 | @username |
<!-- RELEASE_BOSS_CHANGELOG_END -->
```

### Phase 2: Create PR Description Parser

1. Create a new module `src/github/prDescriptionParser.js`:
   - Function to extract changelog table from PR description
   - Function to parse table into structured data
   - Function to merge new changes into existing table
   - Function to generate updated table with new entries

2. Core functions needed:
   - `extractChangelogTable(description)` - Extract table from PR description
   - `parseChangelogTable(tableContent)` - Parse table into structured data
   - `generateChangelogTable(entries)` - Generate table from entries
   - `mergeChangelogEntries(existingEntries, newEntries)` - Merge entries

### Phase 3: Modify PR Creation/Update Logic

1. Update `src/github/prManager.js`:
   - Modify `createOrUpdatePR` to handle changelog table generation
   - Add logic to parse existing PR description when updating
   - Implement merging of new changes into existing table

2. Key changes:
   - When creating a new PR, generate initial changelog table
   - When updating a PR, parse existing table, add new entries, and update

### Phase 4: Update Commit Analysis

1. Modify `src/core/commitAnalyzer.js`:
   - Update to generate changelog entries in the new format
   - Add functionality to convert commits to table rows

2. Key changes:
   - Add function to convert commit objects to changelog entry objects
   - Modify `analyzeCommits` to track only new commits since last update

### Phase 5: Add Configuration Options

1. Update `src/utils/config.js`:
   - Add configuration options for changelog table format
   - Add options to customize columns and behavior

2. New configuration options:
   ```yaml
   changelogTable:
     enabled: true
     columns:
       - name: "Type"
         field: "type"
       - name: "Scope"
         field: "scope"
       - name: "Description"
         field: "description"
       - name: "PR"
         field: "pr"
       - name: "Commit"
         field: "commit"
       - name: "Author"
         field: "author"
     markers:
       start: "<!-- RELEASE_BOSS_CHANGELOG_START -->"
       end: "<!-- RELEASE_BOSS_CHANGELOG_END -->"
   ```

## 💅 Detailed Code Changes

### 1. Create `src/github/prDescriptionParser.js`

```javascript
/**
 * Extract changelog table from PR description
 * @param {String} description - PR description
 * @param {Object} config - Release Boss configuration
 * @returns {String|null} - Extracted table or null if not found
 */
function extractChangelogTable(description, config) {
  const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
  const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
  
  const tableRegex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
  const match = description.match(tableRegex);
  return match ? match[1].trim() : null;
}

/**
 * Parse changelog table into structured data
 * @param {String} tableContent - Markdown table content
 * @returns {Array} - Array of changelog entries
 */
function parseChangelogTable(tableContent) {
  if (!tableContent) return [];
  
  // Split table into lines and remove header and separator rows
  const lines = tableContent.split('\n').filter(line => line.trim());
  if (lines.length < 3) return []; // Need at least header, separator, and one entry
  
  const dataRows = lines.slice(2); // Skip header and separator rows
  
  return dataRows.map(row => {
    // Parse table row: | type | scope | description | PR | commit | author |
    const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
    if (cells.length < 6) return null; // Invalid row
    
    return {
      type: cells[0],
      scope: cells[1],
      description: cells[2],
      pr: cells[3],
      commit: cells[4],
      author: cells[5]
    };
  }).filter(entry => entry !== null);
}

/**
 * Generate changelog table from entries
 * @param {Array} entries - Array of changelog entries
 * @param {Object} config - Release Boss configuration
 * @returns {String} - Markdown table
 */
function generateChangelogTable(entries, config) {
  const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
  const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
  
  const header = '| Type | Scope | Description | PR | Commit | Author |';
  const separator = '|------|-------|-------------|----|---------| ------|';
  
  const rows = entries.map(entry => {
    return `| ${entry.type} | ${entry.scope || ''} | ${entry.description} | ${entry.pr} | ${entry.commit} | ${entry.author} |`;
  });
  
  return [
    startMarker,
    header,
    separator,
    ...rows,
    endMarker
  ].join('\n');
}

/**
 * Merge new entries into existing changelog entries
 * @param {Array} existingEntries - Existing changelog entries
 * @param {Array} newEntries - New changelog entries to add
 * @returns {Array} - Merged entries
 */
function mergeChangelogEntries(existingEntries, newEntries) {
  // Create a map of existing entries by commit hash to avoid duplicates
  const entriesMap = new Map();
  
  existingEntries.forEach(entry => {
    entriesMap.set(entry.commit, entry);
  });
  
  // Add new entries, overwriting if they already exist
  newEntries.forEach(entry => {
    entriesMap.set(entry.commit, entry);
  });
  
  // Convert back to array and sort by type (features first, then fixes, etc.)
  return Array.from(entriesMap.values()).sort((a, b) => {
    const typeOrder = { feat: 1, fix: 2, perf: 3, refactor: 4, docs: 5 };
    return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
  });
}

/**
 * Convert commit objects to changelog entries
 * @param {Array} commits - Array of parsed commits
 * @param {Object} context - GitHub context
 * @returns {Array} - Array of changelog entries
 */
function commitsToChangelogEntries(commits, context) {
  const { owner, repo } = context.repo;
  
  return commits.map(commit => {
    // Extract PR number from commit message if available
    const prMatch = commit.message.match(/#(\d+)/);
    const prNumber = prMatch ? prMatch[1] : '';
    const prRef = prNumber ? `#${prNumber}` : '';
    
    return {
      type: commit.parsed.type || 'other',
      scope: commit.parsed.scope || '',
      description: commit.parsed.subject || commit.message.split('\n')[0],
      pr: prRef,
      commit: commit.hash.substring(0, 7),
      author: commit.author ? `@${commit.author}` : ''
    };
  });
}

module.exports = {
  extractChangelogTable,
  parseChangelogTable,
  generateChangelogTable,
  mergeChangelogEntries,
  commitsToChangelogEntries
};
```

### 2. Update `src/github/prManager.js`

Modify the `createOrUpdatePR` function to handle changelog tables:

```javascript
const { 
  extractChangelogTable, 
  parseChangelogTable, 
  generateChangelogTable, 
  mergeChangelogEntries,
  commitsToChangelogEntries
} = require('./prDescriptionParser');

// In createOrUpdatePR function, add:
async function createOrUpdatePR(octokit, context, newVersion, commits, config, updatedFiles = []) {
  // ... existing code ...
  
  // Generate changelog entries from commits
  const changelogEntries = commitsToChangelogEntries(commits, context);
  
  // Generate changelog table
  const changelogTable = generateChangelogTable(changelogEntries, config);
  
  // Add changelog table to PR description
  const prDescription = `${config.pullRequestHeader || '# 🎉 Release Time! 💃'}\n\n${changelogTable}`;
  
  // ... continue with PR creation ...
}

// In updateExistingPR function, add:
async function updateExistingPR(octokit, context, newVersion, commits, config, updatedFiles = []) {
  // ... existing code ...
  
  // Get existing PR description
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: existingPR.number
  });
  
  // Extract existing changelog table
  const existingTable = extractChangelogTable(pr.body, config);
  const existingEntries = parseChangelogTable(existingTable);
  
  // Generate new changelog entries from commits
  const newEntries = commitsToChangelogEntries(commits, context);
  
  // Merge entries
  const mergedEntries = mergeChangelogEntries(existingEntries, newEntries);
  
  // Generate updated changelog table
  const updatedTable = generateChangelogTable(mergedEntries, config);
  
  // Replace changelog table in PR description
  let updatedDescription = pr.body;
  if (existingTable) {
    // Replace existing table
    const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
    const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
    updatedDescription = updatedDescription.replace(
      new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
      updatedTable
    );
  } else {
    // Add table to description
    updatedDescription = `${updatedDescription}\n\n${updatedTable}`;
  }
  
  // Update PR with new description
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: existingPR.number,
    body: updatedDescription
  });
  
  // ... continue with PR update ...
}
```

### 3. Update `src/utils/config.js`

Add new configuration options:

```javascript
// Default configuration
const defaultConfig = {
  // ... existing defaults ...
  
  // Add changelog table configuration
  changelogTable: {
    enabled: true,
    columns: [
      { name: "Type", field: "type" },
      { name: "Scope", field: "scope" },
      { name: "Description", field: "description" },
      { name: "PR", field: "pr" },
      { name: "Commit", field: "commit" },
      { name: "Author", field: "author" }
    ],
    markers: {
      start: "<!-- RELEASE_BOSS_CHANGELOG_START -->",
      end: "<!-- RELEASE_BOSS_CHANGELOG_END -->"
    }
  }
};

// In validateConfig function, add:
function validateConfig(config) {
  // ... existing validation ...
  
  // Validate changelog table config if enabled
  if (config.changelogTable && config.changelogTable.enabled) {
    if (!config.changelogTable.columns || !Array.isArray(config.changelogTable.columns)) {
      config.changelogTable.columns = defaultConfig.changelogTable.columns;
    }
    
    if (!config.changelogTable.markers) {
      config.changelogTable.markers = defaultConfig.changelogTable.markers;
    }
  }
  
  return config;
}
```

### 4. Update `src/index.js`

Modify the main workflow to use the new PR-based changelog system:

```javascript
// In the run function, modify:
async function run() {
  // ... existing code ...
  
  // When analyzing commits, pass them to PR creation/update
  startGroup('🔍 Commit Analysis - Reading the room, hunty! 🙌');
  let commits;
  try {
    commits = await analyzeCommits(octokit, context, config);
    // ... existing code ...
  } catch (error) {
    // ... error handling ...
  }
  endGroup();
  
  // Skip the changelog generation step since we'll handle it in the PR
  // Instead, pass commits directly to createOrUpdatePR
  
  // Create or update PR
  startGroup('💋 Pull Request Management - Serving lewks! 💃');
  try {
    // ... existing code ...
    
    const result = await createOrUpdatePR(octokit, context, newVersion, commits, config, updatedFiles);
    
    // ... existing code ...
  } catch (error) {
    // ... error handling ...
  }
  endGroup();
  
  // ... existing code ...
}
```

## 🚀 Testing Plan

1. **Unit Tests**:
   - Create tests for `prDescriptionParser.js` functions
   - Update tests for PR management functions
   - Test with various PR description formats

2. **Integration Tests**:
   - Test with real GitHub repositories
   - Verify table parsing and generation
   - Test human-edited tables to ensure they're still parseable

3. **Manual Testing**:
   - Create test PRs with the new system
   - Edit PR descriptions manually to verify flexibility
   - Verify changelog entries are correctly maintained

## 💃 Implementation Timeline

1. **Week 1**: Design and implement PR description parser
2. **Week 2**: Update PR management logic
3. **Week 3**: Update configuration and main workflow
4. **Week 4**: Testing and refinement

## 💅 Future Enhancements

1. **UI for Editing**: Add a simple UI for editing changelog entries directly
2. **Automatic PR Detection**: Improve PR number detection from commits
3. **Custom Column Support**: Allow fully customizable table columns
4. **Markdown Formatting**: Support rich markdown in description fields
5. **Conflict Resolution**: Better handling of manually edited entries

---

This upgrade will make Release Boss even more fabulous by aligning with our actual workflow and giving us more control over our changelogs! 💁‍♀️✨
