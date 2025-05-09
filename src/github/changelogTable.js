/**
 * Changelog Table Generator for Release Boss
 * Handles generating and updating changelog tables in PR descriptions
 */

/**
 * Generate a changelog table from commits
 * @param {Array} commits - Array of analyzed commits
 * @param {Object} config - Release Boss configuration
 * @returns {String} - Markdown table with changelog entries
 */
function generateChangelogTable(commits, config) {
  // Check if config is valid
  if (!config || typeof config !== 'object') {
    console.log('Warning: config is not a valid object! 💁‍♀️ Using default markers.');
    config = {}; // Use empty object to avoid errors
  }
  
  // Get marker configuration
  const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
  const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
  
  // Ensure commits is an array before processing
  if (!Array.isArray(commits)) {
    console.log('Warning: commits is not an array in generateChangelogTable! 💅 Type:', typeof commits);
    commits = []; // Set to empty array to avoid errors
  }
  
  // Convert commits to changelog entries
  const entries = commitsToChangelogEntries(commits);
  
  // Ensure entries is an array
  if (!Array.isArray(entries)) {
    console.log('Warning: entries is not an array after conversion! 💁‍♀️ Type:', typeof entries);
    return `${startMarker}\n\n${endMarker}`; // Return empty table
  }
  
  // Generate table header
  const header = '| Type | Scope | Description | PR | Commit | Author |';
  const separator = '|------|-------|-------------|----|---------| ------|';
  
  // Generate table rows
  const rows = entries.map(entry => {
    // Check if entry is valid
    if (!entry || typeof entry !== 'object') {
      console.log('Warning: Invalid entry in entries, skipping 💅', entry);
      return null;
    }
    
    return `| ${entry.type || 'unknown'} | ${entry.scope || ''} | ${entry.description || 'No description'} | ${entry.pr || ''} | ${entry.commit || ''} | ${entry.author || ''} |`;
  }).filter(row => row !== null);
  
  // Combine everything into a table
  return [
    startMarker,
    header,
    separator,
    ...rows,
    endMarker
  ].join('\n');
}

/**
 * Convert commit objects to changelog entries
 * @param {Array} commits - Array of parsed commits
 * @returns {Array} - Array of changelog entries
 */
function commitsToChangelogEntries(commits) {
  // Ensure commits is an array before using map
  if (!Array.isArray(commits)) {
    console.log('Warning: commits is not an array! 💅 Type:', typeof commits);
    return [];
  }
  
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

/**
 * Extract changelog table from PR description
 * @param {String} description - PR description
 * @param {Object} config - Release Boss configuration
 * @returns {String|null} - Extracted table or null if not found
 */
function extractChangelogTable(description, config) {
  // Check if description is valid
  if (!description || typeof description !== 'string') {
    console.log('Warning: PR description is not a valid string! 💅 Type:', typeof description);
    return null;
  }
  
  // Check if config is valid
  if (!config || typeof config !== 'object') {
    console.log('Warning: config is not a valid object! 💁‍♀️ Using default markers.');
    config = {}; // Use empty object to avoid errors
  }
  
  const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
  const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
  
  try {
    const tableRegex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
    const match = description.match(tableRegex);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.log(`Error extracting changelog table: ${error.message} 💅`);
    return null;
  }
}

/**
 * Parse changelog table into structured data
 * @param {String} tableContent - Markdown table content
 * @returns {Array} - Array of changelog entries
 */
function parseChangelogTable(tableContent) {
  if (!tableContent || typeof tableContent !== 'string') {
    console.log('Warning: tableContent is not a valid string! 💅 Type:', typeof tableContent);
    return [];
  }
  
  // Split table into lines and remove header and separator rows
  const lines = tableContent.split('\n').filter(line => line.trim());
  if (lines.length < 3) {
    console.log('Warning: table has fewer than 3 lines, skipping parsing 💁‍♀️');
    return []; // Need at least header, separator, and one entry
  }
  
  const dataRows = lines.slice(2); // Skip header and separator rows
  
  // Make sure dataRows is an array before mapping
  if (!Array.isArray(dataRows)) {
    console.log('Warning: dataRows is not an array! 💅 Type:', typeof dataRows);
    return [];
  }
  
  return dataRows.map(row => {
    if (typeof row !== 'string') {
      console.log('Warning: row is not a string! 💁‍♀️ Type:', typeof row);
      return null;
    }
    
    // Parse table row: | type | scope | description | PR | commit | author |
    const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
    if (cells.length < 6) {
      console.log('Warning: row has fewer than 6 cells, skipping 💅');
      return null; // Invalid row
    }
    
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
 * Merge new entries into existing changelog entries
 * @param {Array} existingEntries - Existing changelog entries
 * @param {Array} newEntries - New changelog entries to add
 * @returns {Array} - Merged entries
 */
function mergeChangelogEntries(existingEntries, newEntries) {
  // Ensure both parameters are arrays
  if (!Array.isArray(existingEntries)) {
    console.log('Warning: existingEntries is not an array! 💅 Type:', typeof existingEntries);
    existingEntries = [];
  }
  
  if (!Array.isArray(newEntries)) {
    console.log('Warning: newEntries is not an array! 💁‍♀️ Type:', typeof newEntries);
    newEntries = [];
  }
  
  // Create a map of existing entries by commit hash to avoid duplicates
  const entriesMap = new Map();
  
  existingEntries.forEach(entry => {
    if (!entry || typeof entry !== 'object' || !entry.commit) {
      console.log('Warning: Invalid entry in existingEntries, skipping 💅', entry);
      return;
    }
    entriesMap.set(entry.commit, entry);
  });
  
  // Add new entries, overwriting if they already exist
  newEntries.forEach(entry => {
    if (!entry || typeof entry !== 'object' || !entry.commit) {
      console.log('Warning: Invalid entry in newEntries, skipping 💁‍♀️', entry);
      return;
    }
    entriesMap.set(entry.commit, entry);
  });
  
  // Convert back to array and sort by type (features first, then fixes, etc.)
  return Array.from(entriesMap.values()).sort((a, b) => {
    const typeOrder = { feat: 1, fix: 2, perf: 3, refactor: 4, docs: 5 };
    return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
  });
}

/**
 * Update PR description with changelog table
 * @param {String} description - Existing PR description
 * @param {Array} commits - New commits to add to the changelog
 * @param {Object} config - Release Boss configuration
 * @returns {String} - Updated PR description
 */
function updatePRDescriptionWithChangelog(description, commits, config) {
  // Extract existing changelog table if it exists
  const existingTable = extractChangelogTable(description || '', config);
  const existingEntries = parseChangelogTable(existingTable);
  
  // Generate new changelog entries from commits
  const newEntries = commitsToChangelogEntries(commits);
  
  // Merge entries
  const mergedEntries = mergeChangelogEntries(existingEntries, newEntries);
  
  // Generate updated changelog table
  const updatedTable = generateChangelogTable(mergedEntries, config);
  
  // Replace or add changelog table in PR description
  if (existingTable) {
    // Replace existing table
    const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
    const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
    return description.replace(
      new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
      updatedTable
    );
  } else {
    // Add table to description (after the header if it exists)
    const headerEnd = description?.indexOf('\n\n');
    if (headerEnd !== -1) {
      return description.substring(0, headerEnd + 2) + updatedTable + description.substring(headerEnd + 2);
    } else {
      return `${description || ''}\n\n${updatedTable}`;
    }
  }
}

/**
 * Generate file-based changelog content from commits
 * @param {Array} commits - Array of analyzed commits
 * @param {String} newVersion - New version to be released
 * @param {String} baseContent - Existing changelog content (optional)
 * @returns {String} - Generated changelog content
 */
function generateFileChangelog(commits, newVersion, baseContent = '') {
  // Ensure commits is an array before processing
  if (!Array.isArray(commits)) {
    console.log('Warning: commits is not an array in generateFileChangelog! 💁‍♀️ Type:', typeof commits);
    commits = []; // Set to empty array to avoid errors
  }
  
  // Convert commits to changelog entries
  const entries = commitsToChangelogEntries(commits);
  
  // Format entries as markdown list items
  const markdownContent = entries.map(entry => {
    return `* **${entry.type}${entry.scope ? `(${entry.scope})` : ''}:** ${entry.description} ${entry.pr} ${entry.commit}`;
  }).join('\n');
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  
  // If we have existing content, add the new section at the top
  if (baseContent && baseContent.includes('# Changelog')) {
    const changelogStart = baseContent.indexOf('# Changelog');
    const afterHeader = baseContent.indexOf('\n\n', changelogStart) + 2;
    
    return baseContent.substring(0, afterHeader) +
      `## ${newVersion} (${today})\n\n${markdownContent}\n\n` +
      baseContent.substring(afterHeader);
  } else {
    // Create a new changelog
    return `# Changelog\n\n## ${newVersion} (${today})\n\n${markdownContent}\n`;
  }
}

module.exports = {
  generateChangelogTable,
  commitsToChangelogEntries,
  extractChangelogTable,
  parseChangelogTable,
  mergeChangelogEntries,
  updatePRDescriptionWithChangelog,
  generateFileChangelog
};
