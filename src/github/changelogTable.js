/**
 * Changelog Table Generator for Release Boss
 * Handles generating and updating changelog tables in PR descriptions
 */

// Import the conventional-commits-parser for robust parsing
const conventionalCommitsParser = require('conventional-commits-parser');

/**
 * Generate a changelog table from commits
 * @param {Array} commits - Array of analyzed commits
 * @param {Object} config - Release Boss configuration
 * @returns {String} - Markdown table with changelog entries
 */
function generateChangelogTable(commits, config = {}) {
  // Ensure commits is an array
  if (!Array.isArray(commits)) {
    console.log('Warning: commits is not an array in generateChangelogTable! 💅 Type:', typeof commits);
    commits = [];
  }
  
  // Get marker configuration
  const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
  const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
  
  // Generate table header
  const header = '| Type | Scope | Description | PR | Commit | Author |';
  const separator = '|------|-------|-------------|----|---------| ------|';
  
  // Generate table rows
  const rows = commits.map(entry => {
    // Skip invalid entries
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
 * Convert commits to changelog entries
 * @param {Array} commits - Array of analyzed commits
 * @returns {Array} - Array of changelog entries
 */
function commitsToChangelogEntries(commits) {
  // Ensure commits is an array
  if (!Array.isArray(commits)) {
    console.log('Warning: commits is not an array! 💅 Type:', typeof commits);
    return [];
  }
  
  return commits.map(commit => {
    // Handle case where commit might already be in the expected format
    if (commit.type && commit.description) {
      return {
        type: commit.type,
        scope: commit.scope || '',
        description: commit.description,
        pr: commit.pr || '',
        commit: commit.commit || '',
        author: commit.author || ''
      };
    }
    
    // Check if commit has message property
    if (!commit.message && !commit.subject) {
      console.log('Warning: commit object has no message or subject property! 💅', commit);
      return {
        type: commit.type || 'unknown',
        scope: commit.scope || '',
        description: 'No description available',
        pr: '',
        commit: commit.hash || commit.commit || '',
        author: commit.author || ''
      };
    }
    
    // Extract PR number from commit message if available
    const message = commit.message || commit.subject || '';
    const prMatch = message.match(/#(\d+)/);
    const prNumber = prMatch ? prMatch[1] : '';
    const prRef = prNumber ? `#${prNumber}` : '';
    
    // If we have a raw commit with a message but no parsed type, try to parse it
    if (!commit.type && message) {
      try {
        // Parse with conventional-commits-parser
        const parsed = conventionalCommitsParser.sync(message, {
          headerPattern: /^(\w*)(?:\(([\w\$\.\-\*\s]*)\))?\: (.*)$/,
          headerCorrespondence: ['type', 'scope', 'subject'],
          noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
          revertPattern: /^revert:\s([\s\S]*?)/,
          revertCorrespondence: ['header'],
          issuePrefixes: ['#']
        });
        
        if (parsed && parsed.type) {
          console.log(`Parsed commit message: type=${parsed.type}, subject=${parsed.subject || ''} 💅`);
          return {
            type: parsed.type,
            scope: parsed.scope || '',
            description: parsed.subject || message.split('\n')[0],
            pr: prRef || commit.pr || '',
            commit: commit.hash || commit.commit || '',
            author: commit.author ? `@${commit.author}` : ''
          };
        }
      } catch (error) {
        console.log(`Error parsing commit message: ${error.message} 💁‍♀️`);
      }
    }
    
    return {
      type: commit.type || 'other',
      scope: commit.scope || '',
      description: commit.subject || (commit.message ? commit.message.split('\n')[0] : ''),
      pr: prRef || commit.pr || '',
      commit: commit.hash || commit.commit || '',
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
function extractChangelogTable(description, config = {}) {
  // Check if description is valid
  if (!description || typeof description !== 'string') {
    console.log('Warning: PR description is not a valid string! 💅 Type:', typeof description);
    return null;
  }
  
  const startMarker = config.changelogTable?.markers?.start || '<!-- RELEASE_BOSS_CHANGELOG_START -->';
  const endMarker = config.changelogTable?.markers?.end || '<!-- RELEASE_BOSS_CHANGELOG_END -->';
  
  try {
    // Simple regex to extract content between markers
    const tableRegex = new RegExp(`${startMarker}([\\s\\S]*?)${endMarker}`);
    const match = description.match(tableRegex);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.log(`Error extracting changelog table: ${error.message} 💅`);
    return null;
  }
}

/**
 * Parse changelog table into entries
 * @param {String} tableContent - Changelog table content
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
 * Merge existing and new changelog entries
 * @param {Array} existingEntries - Existing changelog entries
 * @param {Array} newEntries - New changelog entries
 * @returns {Array} - Merged entries
 */
function mergeChangelogEntries(existingEntries, newEntries) {
  // Ensure both parameters are arrays
  if (!Array.isArray(existingEntries)) {
    console.log('Warning: existingEntries is not an array! 💅 Type:', typeof existingEntries);
    existingEntries = [];
  }
  
  if (!Array.isArray(newEntries)) {
    console.log('Warning: newEntries is not an array! 👱‍♀️ Type:', typeof newEntries);
    newEntries = [];
  }
  
  // Create a map of existing entries by commit hash or description to avoid duplicates
  const entriesMap = new Map();
  let entryCounter = 0;
  
  existingEntries.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      console.log('Warning: Invalid entry in existingEntries, skipping 💅', entry);
      return;
    }
    
    // Use commit as key if available, otherwise use description + type or a counter
    const key = entry.commit || `${entry.type}-${entry.description}-${entryCounter++}`;
    entriesMap.set(key, entry);
  });
  
  // Add new entries, overwriting if they already exist
  newEntries.forEach(entry => {
    if (!entry || typeof entry !== 'object') {
      console.log('Warning: Invalid entry in newEntries, skipping 👱‍♀️', entry);
      return;
    }
    
    // Use commit as key if available, otherwise use description + type or a counter
    const key = entry.commit || `${entry.type}-${entry.description}-${entryCounter++}`;
    entriesMap.set(key, entry);
  });
  
  // Convert map back to array
  const result = Array.from(entriesMap.values());
  
  // If we couldn't extract any valid entries, add a fallback entry
  if (result.length === 0) {
    console.log('No valid entries in mergeChangelogEntries, adding fallback entry 💅');
    result.push({
      type: 'chore',
      scope: 'release',
      description: 'Version bump',
      pr: '',
      commit: 'fallback',
      author: ''
    });
  }
  
  return result.sort((a, b) => {
    const typeOrder = { feat: 1, fix: 2, perf: 3, refactor: 4, docs: 5 };
    return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
  });
}

/**
 * Parse a changelog string into commit objects using conventional-commits-parser
 * @param {String} changelog - Changelog string to parse
 * @returns {Array} - Array of parsed commit objects
 */
function parseChangelogString(changelog) {
  // Ensure changelog is a string
  if (typeof changelog !== 'string') {
    console.log(`Warning: changelog is not a string! 💅 Type: ${typeof changelog}`);
    changelog = String(changelog || '');
  }
  
  let parsedCommits = [];
  
  try {
    // First check if it's a JSON string of commits
    if (changelog.trim().startsWith('[')) {
      try {
        parsedCommits = JSON.parse(changelog);
        console.log(`Successfully parsed changelog string into an array with ${parsedCommits.length} items 💁‍♀️`);
        return parsedCommits;
      } catch (jsonError) {
        console.log(`Not a valid JSON string: ${jsonError.message} 💅`);
        // Continue with other parsing methods
      }
    }
    
    // Split the changelog into lines
    const lines = changelog.split('\n');
    
    // Log the first line for debugging
    if (lines.length > 0) {
      console.log(`First line of changelog: "${lines[0]}" 💁‍♀️`);
    }
    
    // Process each line
    lines.forEach(line => {
      // Skip empty lines and section headers
      if (!line.trim() || line.trim().startsWith('#')) {
        return;
      }
      
      try {
        // Extract commit info from markdown-formatted line
        // This is a simple extraction to get the commit message without markdown formatting
        let commitMessage = line;
        
        // If line starts with bullet point and has markdown formatting, clean it up
        if (line.startsWith('*')) {
          // Remove bullet point and any markdown formatting
          commitMessage = line.replace(/^\s*\*\s+/, '').replace(/\*\*/g, '');
        }
        
        // Extract hash if present
        let hash = '';
        const hashMatch = line.match(/\[([a-f0-9]+)\]|\(([a-f0-9]+)\)/);
        if (hashMatch) {
          hash = hashMatch[1] || hashMatch[2] || '';
        }
        
        // Parse with conventional-commits-parser
        const parsed = conventionalCommitsParser.sync(commitMessage, {
          headerPattern: /^(\w*)(?:\(([\w\$\.\-\*\s]*)\))?\: (.*)$/,
          headerCorrespondence: ['type', 'scope', 'subject'],
          noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
          revertPattern: /^revert:\s([\s\S]*?)/,
          revertCorrespondence: ['header'],
          issuePrefixes: ['#']
        });
        
        // Extract PR number if present
        const prMatch = line.match(/#(\d+)/);
        const prRef = prMatch ? `#${prMatch[1]}` : '';
        
        if (parsed && parsed.type) {
          console.log(`Successfully parsed commit: type=${parsed.type}, subject=${parsed.subject || ''} 💁‍♀️`);
          
          parsedCommits.push({
            type: parsed.type,
            scope: parsed.scope || '',
            message: parsed.subject || commitMessage,
            subject: parsed.subject || commitMessage,
            pr: prRef,
            hash: hash,
            author: ''
          });
        } else {
          // If parsing fails, try to guess the type from the message
          console.log(`Failed to parse as conventional commit, using fallback: "${commitMessage}" 💅`);
          
          let type = 'chore';
          if (commitMessage.includes('fix') || commitMessage.includes('bug')) type = 'fix';
          if (commitMessage.includes('feat') || commitMessage.includes('add')) type = 'feat';
          if (commitMessage.startsWith('✨')) type = 'feat';
          
          parsedCommits.push({
            type: type,
            scope: '',
            message: commitMessage,
            subject: commitMessage,
            pr: prRef,
            hash: hash,
            author: ''
          });
        }
      } catch (parseError) {
        console.log(`Error parsing line "${line}": ${parseError.message} 💁‍♀️`);
      }
    });
    
    // Add fallback entry if no commits were parsed
    if (parsedCommits.length === 0) {
      console.log('No commits parsed, adding fallback entry 💅');
      parsedCommits.push({
        type: 'chore',
        scope: 'release',
        message: 'Version bump',
        pr: '',
        hash: 'fallback',
        author: ''
      });
    }
    
    return parsedCommits;
  } catch (error) {
    console.log(`Error processing changelog: ${error.message} 💁‍♀️`);
    
    // Return fallback entry
    return [{
      type: 'chore',
      scope: 'release',
      message: 'Version bump',
      pr: '',
      hash: 'fallback',
      author: ''
    }];
  }
}

/**
 * Update PR description with changelog table
 * @param {String} description - Existing PR description
 * @param {String} changelog - Changelog content for the release
 * @param {Object} config - Release Boss configuration
 * @returns {String} - Updated PR description
 */
function updatePRDescriptionWithChangelog(description, changelog, config = {}) {
  // Extract existing changelog table if it exists
  const existingTable = extractChangelogTable(description || '', config);
  
  // Parse existing table into entries
  let existingEntries = [];
  if (existingTable !== null && typeof existingTable === 'string') {
    existingEntries = parseChangelogTable(existingTable);
  } else {
    console.log('No existing table found or table is not a string, starting with empty entries 💅');
  }
  
  // Parse changelog string into commit objects
  const parsedCommits = parseChangelogString(changelog);
  
  // Convert parsed commits to changelog entries
  const newEntries = commitsToChangelogEntries(parsedCommits);
  
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
 * Generate file-based changelog content from changelog string
 * @param {String} changelog - Changelog content for the release
 * @param {String} newVersion - New version to be released
 * @param {String} baseContent - Existing changelog content (optional)
 * @returns {String} - Generated changelog content
 */
function generateFileChangelog(changelog, newVersion, baseContent = '') {
  // Parse changelog string into commit objects
  const parsedCommits = parseChangelogString(changelog);
  
  // Convert parsed commits to changelog entries
  const entries = commitsToChangelogEntries(parsedCommits);
  
  // Format entries as markdown list items
  const markdownContent = entries.map(entry => {
    // Check if entry is valid
    if (!entry || typeof entry !== 'object') {
      console.log('Warning: Invalid entry in generateFileChangelog, skipping 💅', entry);
      return null;
    }
    
    // Use optional chaining and nullish coalescing to handle potentially undefined properties
    const type = entry.type ?? 'unknown';
    const scope = entry.scope ?? '';
    const description = entry.description ?? 'No description';
    const pr = entry.pr ?? '';
    const commit = entry.commit ?? '';
    
    return `* **${type}${scope ? `(${scope})` : ''}:** ${description} ${pr} ${commit}`;
  })
  .filter(item => item !== null) // Remove any null entries
  .join('\n');
  
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
  generateFileChangelog,
  parseChangelogString
};
