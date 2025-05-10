/**
 * Integration example for the PR-based changelog tracking system
 * This file demonstrates how to use the new changelog table approach
 * with the existing Release Boss codebase
 */

const { 
  generateChangelogTable,
  commitsToChangelogEntries,
  extractChangelogTable, 
  parseChangelogTable,
  mergeChangelogEntries,
  updatePRDescriptionWithChangelog
} = require('./changelogTable');

/**
 * Example of creating a new PR with a changelog table
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} newVersion - New version to be released
 * @param {Array} commits - Analyzed commits for the release
 * @param {Object} config - Release Boss configuration
 * @returns {Object} - PR creation result
 */
async function createPRWithChangelogTable(octokit, context, newVersion, commits, config, stagingBranch) {
  const { owner, repo } = context.repo;
  
  // Generate PR title
  const title = config.pullRequestTitle.replace('{version}', newVersion);
  
  // Generate PR description with changelog table
  const header = config.pullRequestHeader || 'Release PR';
  const changelogTable = generateChangelogTable(commits, config);
  const body = `${header}\n\n${changelogTable}\n\n` +
    `Time to freshen up our codebase with a fabulous new release! 💅✨\n\n` +
    `This PR bumps the version to **${newVersion}** and includes all the changes from the main branch.`;
  
  // Create the PR
  const { data: newPR } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: stagingBranch,
    base: config.releaseBranch
  });
  
  console.log(`Created PR #${newPR.number} with changelog table! 💁‍♀️`);
  
  return {
    prNumber: newPR.number,
    prUrl: newPR.html_url,
    prStatus: newPR.state
  };
}

/**
 * Example of updating an existing PR with new commits
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} newVersion - New version to be released
 * @param {Array} commits - New commits to add to the changelog
 * @param {Object} config - Release Boss configuration
 * @returns {Object} - PR update result
 */
async function updatePRWithChangelogTable(octokit, context, newVersion, commits, config, prNumber) {
  const { owner, repo } = context.repo;
  
  // Get existing PR
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  });
  
  // Update PR title if needed
  const title = config.pullRequestTitle.replace('{version}', newVersion);
  
  // Update PR description with new changelog entries
  const updatedBody = updatePRDescriptionWithChangelog(pr.body, commits, config);
  
  // Update the PR
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    title,
    body: updatedBody
  });
  
  console.log(`Updated PR #${prNumber} with new changelog entries! 💅`);
  
  return {
    prNumber,
    prUrl: pr.html_url,
    prStatus: pr.state
  };
}

/**
 * Example of how to integrate the changelog table approach with the existing codebase
 * This function shows how to use the new approach in place of the old changelog generation
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} newVersion - New version to be released
 * @param {Array} commits - Analyzed commits for the release
 * @param {Object} config - Release Boss configuration
 * @returns {Object} - PR creation/update result
 */
async function integratedPRManager(octokit, context, newVersion, commits, config, updatedFiles = []) {
  const { owner, repo } = context.repo;
  
  // Check if we're in a PR context and need to update an existing PR
  if (context.payload.pull_request) {
    const prNumber = context.payload.pull_request.number;
    return await updatePRWithChangelogTable(octokit, context, newVersion, commits, config, prNumber);
  }
  
  // Create a new staging branch and PR
  // Format: stagingBranch-vX.Y.Z
  const stagingBranch = `${config.stagingBranch}-v${newVersion}`;
  
  // ... (existing code to create/update staging branch) ...
  
  // Create a new PR with changelog table
  return await createPRWithChangelogTable(octokit, context, newVersion, commits, config, stagingBranch);
}

// Example of how to use the file-based changelog generation with the new table-based approach
async function generateFileBasedChangelog(commits, newVersion, config) {
  if (!config.changelogPath) return null;
  
  // Convert commits to changelog entries
  const entries = commitsToChangelogEntries(commits);
  
  // Generate markdown content for the changelog file
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Format entries as markdown list items
  const markdownContent = entries.map(entry => {
    return `* **${entry.type}${entry.scope ? `(${entry.scope})` : ''}:** ${entry.description} ${entry.pr} ${entry.commit}`;
  }).join('\n');
  
  // Create the changelog content
  const changelogContent = `# Changelog\n\n## ${newVersion} (${today})\n\n${markdownContent}\n`;
  
  return {
    path: config.changelogPath,
    content: changelogContent
  };
}

module.exports = {
  createPRWithChangelogTable,
  updatePRWithChangelogTable,
  integratedPRManager,
  generateFileBasedChangelog
};
