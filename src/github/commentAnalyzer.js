/**
 * This cute little module checks PR comments for bump commands
 * Because sometimes we need to tell our release manager to be more EXTRA! 💁‍♀️
 */

/**
 * Checks PR comments for bump commands like "/bump minor" or "/bump major"
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context with PR info
 * @returns {Promise<Object>} Object with bumpType (if found) and other details
 */
async function checkForBumpCommands(octokit, context) {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request?.number;
  
  if (!prNumber) {
    console.log('No PR number found in context, skipping bump command check 💅');
    return { hasBumpCommand: false };
  }
  
  console.log(`Checking comments on PR #${prNumber} for bump commands... 👀`);
  
  try {
    // Get all comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });
    
    console.log(`Found ${comments.length} comments on PR #${prNumber}`);
    
    // Look for bump commands
    for (const comment of comments) {
      const commentBody = comment.body || '';
      
      // Check for bump commands using regex to match "/bump major" or "/bump minor"
      const bumpCommandMatch = commentBody.match(/\/bump\s+(major|minor)/i);
      
      if (bumpCommandMatch) {
        const bumpType = bumpCommandMatch[1].toLowerCase();
        console.log(`💃 Found bump command in comment by ${comment.user.login}: /bump ${bumpType}`);
        
        return {
          hasBumpCommand: true,
          bumpType: bumpType,
          commenter: comment.user.login,
          commentUrl: comment.html_url,
          commentId: comment.id
        };
      }
    }
    
    console.log('No bump commands found in PR comments 🤷‍♀️');
    return { hasBumpCommand: false };
  } catch (error) {
    console.error(`Error checking PR comments for bump commands: ${error.message}`);
    return { hasBumpCommand: false, error: error.message };
  }
}

/**
 * Applies a version bump based on command and current version
 * @param {String} currentVersion - The current version (e.g., "1.0.22")
 * @param {String} bumpType - Type of bump ("major" or "minor")
 * @returns {String} The new version after applying the bump
 */
function applyBumpCommand(currentVersion, bumpType) {
  // Parse version components
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  // If it's already at the requested bump level, don't change anything
  if (bumpType === 'minor' && patch === 0) {
    console.log(`Version ${currentVersion} is already at a minor version bump (patch is 0), no change needed 💅`);
    return currentVersion;
  }
  
  if (bumpType === 'major' && minor === 0 && patch === 0) {
    console.log(`Version ${currentVersion} is already at a major version bump (minor and patch are 0), no change needed 💅`);
    return currentVersion;
  }
  
  // Apply the requested bump
  if (bumpType === 'minor') {
    // Bump to next minor version with patch reset to 0
    return `${major}.${minor + 1}.0`;
  } else if (bumpType === 'major') {
    // Bump to next major version with minor and patch reset to 0
    return `${major + 1}.0.0`;
  }
  
  // Fallback - shouldn't reach here
  return currentVersion;
}

module.exports = {
  checkForBumpCommands,
  applyBumpCommand
};
