/**
 * Generate a changelog from analyzed commits
 * @param {Array} commits - Array of parsed commits
 * @param {String} newVersion - New version to be released
 * @param {String} currentVersion - Current version
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} config - Release manager configuration
 * @returns {String} - Generated changelog
 */
async function generateChangelog(commits, newVersion, currentVersion, octokit, context, config) {
  const { owner, repo } = context.repo;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Group commits by their type
  const groupedCommits = {};
  
  // Define the default sections if not specified in config
  const sections = config.changelogSections || [
    { type: 'feat', section: 'Features', hidden: false },
    { type: 'fix', section: 'Bug Fixes', hidden: false },
    { type: 'perf', section: 'Performance Improvements', hidden: false },
    { type: 'refactor', section: 'Code Refactoring', hidden: false },
    { type: 'docs', section: 'Documentation', hidden: false },
    { type: 'test', section: 'Tests', hidden: false },
    { type: 'ci', section: 'Continuous Integration', hidden: false },
    { type: 'build', section: 'Build System', hidden: false }
  ];
  
  // Filter and exclude commits like 'chore' or with scope 'no-release'
  const filteredCommits = commits.filter(commit => {
    // Skip commits with no type
    if (!commit.parsed.type) return false;
    
    // Exclude chore commits from changelog
    if (commit.parsed.type === 'chore') return false;
    
    // Exclude commits with scope no-release
    if (commit.parsed.scope === 'no-release') return false;
    
    return true;
  });
  
  // Group commits by type
  for (const commit of filteredCommits) {
    const type = commit.parsed.type;
    
    if (!groupedCommits[type]) {
      groupedCommits[type] = [];
    }
    
    groupedCommits[type].push(commit);
  }
  
  // Generate changelog
  let changelog = '';
  changelog += `## [${newVersion}](${repoUrl}/compare/v${currentVersion}...v${newVersion}) (${date})\n\n`;
  
  // Add sections according to defined order
  for (const section of sections) {
    const commits = groupedCommits[section.type] || [];
    
    // Skip if section is hidden or has no commits
    if (section.hidden || commits.length === 0) continue;
    
    changelog += `### ${section.section}\n\n`;
    
    // Add commit entries
    for (const commit of commits) {
      let entry = '';
      
      // Format: * **scope:** message (hash) (#PR)
      entry += '* ';
      
      // Add scope if available
      if (commit.parsed.scope) {
        entry += `**${commit.parsed.scope}:** `;
      }
      
      // Add commit message
      entry += commit.parsed.subject;
      
      // Add commit link
      const shortHash = commit.hash.substring(0, 7);
      entry += ` ([${shortHash}](${commit.url}))`;
      
      // Look for PR number in commit message
      const prMatch = commit.message.match(/#(\d+)/);
      if (prMatch) {
        const prNumber = prMatch[1];
        entry += ` ([#${prNumber}](${repoUrl}/pull/${prNumber}))`;
      }
      
      changelog += `${entry}\n`;
    }
    
    changelog += '\n';
  }
  
  return changelog;
}

module.exports = {
  generateChangelog
};
