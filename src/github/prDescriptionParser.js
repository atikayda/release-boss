/**
 * PR Description Parser for Release Boss
 * Handles parsing and generating changelog tables in PR descriptions
 */

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
  const match = description?.match(tableRegex);
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
function commitsToChangelogEntries(commits) {
  // We'll just use the commit information without context for now
  
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
