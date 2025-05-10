/**
 * Changelog Integration Module for Release Boss
 * 
 * This module integrates the PR-based changelog tracking system
 * with the existing Release Boss codebase. It provides functions
 * for creating and updating PRs with changelog tables.
 */

const { 
  updatePRDescriptionWithChangelog,
  generateFileChangelog
} = require('./changelogTable');

/**
 * Create a new PR with a changelog table
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} newVersion - New version to be released
 * @param {Array} commits - Analyzed commits for the release
 * @param {Object} config - Release Boss configuration
 * @param {String} stagingBranch - Name of the staging branch
 * @returns {Object} - PR creation result
 */
async function createPRWithChangelog(octokit, context, newVersion, commits, config, stagingBranch) {
  const { owner, repo } = context.repo;
  
  // Generate PR title
  const title = config.pullRequestTitle.replace('{version}', newVersion);
  
  // Create PR body with changelog table
  const initialBody = `${config.pullRequestHeader || 'Release PR'}`;
  const body = updatePRDescriptionWithChangelog(initialBody, commits, config);
  
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
 * Update an existing PR with new commits
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Number} prNumber - PR number to update
 * @param {String} newVersion - New version to be released
 * @param {Array} commits - New commits to add to the changelog
 * @param {Object} config - Release Boss configuration
 * @returns {Object} - PR update result
 */
async function updatePRWithChangelog(octokit, context, prNumber, newVersion, commits, config) {
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
 * Generate a file-based changelog for a release
 * @param {Array} commits - Analyzed commits for the release
 * @param {String} newVersion - New version to be released
 * @param {String} baseContent - Existing changelog content (optional)
 * @returns {Object|null} - Changelog file info or null if disabled
 */
function generateChangelogFile(commits, newVersion, baseContent = '', config) {
  if (!config.changelogPath) return null;
  
  // Generate changelog content
  const changelogContent = generateFileChangelog(commits, newVersion, baseContent);
  
  return {
    path: config.changelogPath,
    content: changelogContent
  };
}

module.exports = {
  createPRWithChangelog,
  updatePRWithChangelog,
  generateChangelogFile
};
