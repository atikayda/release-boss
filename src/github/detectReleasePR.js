/**
 * This fabulous module helps detect PR merges even when they come through as regular push events! 💁‍♀️
 * Sometimes GitHub is a little sneaky and runs our workflow as a push instead of a PR merge,
 * but we're too smart for that! We'll detect if it's actually a merged PR by checking:
 * 1. Are we on the release branch?
 * 2. Was the push a merge commit?
 * 3. Did it come from a staging branch?
 * 
 * If so, we'll find the PR that created this merge and extract all its juicy details! 💅
 */

/**
 * Detect if a push event is actually a merged release PR
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context (has repo, payload info)
 * @param {Object} config - Release Boss config
 * @returns {Promise<Object>} PR info if detected, null otherwise
 */
async function detectReleasePR(octokit, context, config) {
  const { owner, repo } = context.repo;
  
  console.log(`👌 STEALTH PR DETECTION ACTIVATED - Looking for sneaky PR merges disguised as pushes! 👩‍🕵️‍♀️`);
  
  // Only check push events
  if (context.eventName !== 'push') {
    console.log('Not a push event, skipping stealth PR detection 💅');
    return null;
  }
  
  // Are we on the release branch?
  const currentBranch = context.ref.replace('refs/heads/', '');
  if (currentBranch !== config.releaseBranch) {
    console.log(`Push is to ${currentBranch}, not the release branch ${config.releaseBranch} - not a release PR! 🤷‍♀️`);
    return null;
  }
  
  console.log(`Detected push to release branch ${config.releaseBranch} - investigating if this is a merged PR... 🔍`);
  
  // Get the commit info
  try {
    const commitSha = context.sha;
    const { data: commit } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha
    });
    
    // Is it a merge commit? (has more than one parent)
    if (!commit.parents || commit.parents.length <= 1) {
      console.log(`Commit ${commitSha.substring(0, 7)} is not a merge commit (only has ${commit.parents?.length || 0} parents) 🙄`);
      return null;
    }
    
    // Get the commit message to check for PR reference
    const commitMessage = commit.message || '';
    const prNumberMatch = commitMessage.match(/Merge pull request #([0-9]+)/);
    let prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : null;
    
    if (!prNumber) {
      // Try to find this PR by looking at recent closed PRs to the release branch
      console.log(`No PR number found in commit message, trying to find it from recent PRs... 👀`);
      const { data: recentPRs } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'closed',
        base: config.releaseBranch,
        sort: 'updated',
        direction: 'desc',
        per_page: 5 // Just look at the 5 most recent
      });
      
      // Find the PR that contains this merge commit
      for (const pr of recentPRs) {
        if (pr.merge_commit_sha === commitSha) {
          prNumber = pr.number;
          console.log(`Found matching PR #${prNumber} with merge commit ${commitSha.substring(0, 7)} 💅`);
          break;
        }
      }
      
      if (!prNumber) {
        console.log(`Couldn't find a matching PR for commit ${commitSha.substring(0, 7)} - not a release PR! 😢`);
        return null;
      }
    }
    
    // Get the full PR details
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber
    });
    
    // Check if the head branch starts with our staging prefix
    const headBranch = pullRequest.head.ref;
    if (!headBranch.startsWith(`${config.stagingBranch}-`)) {
      console.log(`PR #${prNumber} head branch "${headBranch}" doesn't match staging pattern "${config.stagingBranch}-*" 🤔`);
      return null;
    }
    
    console.log(`Detected stealth release PR #${prNumber} from ${headBranch} to ${config.releaseBranch} - yasss queen! 💁‍♀️`);
    
    // Extract the version from the branch name (similar to extractVersionFromStagingBranch)
    const versionMatch = headBranch.match(new RegExp(`^${config.stagingBranch}-v?([0-9]+\\.[0-9]+\\.[0-9]+.*?)$`));
    const version = versionMatch ? versionMatch[1] : null;
    
    if (version) {
      console.log(`Extracted version ${version} from staging branch ${headBranch} 💅`);
    } else {
      console.log(`Couldn't extract version from branch ${headBranch} 😱`);
    }
    
    // Return all the PR info we need
    return {
      number: prNumber,
      title: pullRequest.title,
      body: pullRequest.body,
      headBranch: headBranch,
      version: version,
      merged: true,
      mergeCommitSha: commitSha
    };
  } catch (error) {
    console.error(`Error detecting release PR: ${error.message}`);
    return null;
  }
}

module.exports = {
  detectReleasePR
};
