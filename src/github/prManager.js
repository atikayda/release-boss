const fs = require('fs').promises;
const path = require('path');

/**
 * Create or update a pull request for a new release
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} newVersion - New version to be released
 * @param {String} changelog - Generated changelog content
 * @param {Object} config - Release Boss configuration
 * @param {Array} [updatedFiles] - List of files that were updated with version info
 */
async function createOrUpdatePR(octokit, context, newVersion, changelog, config, updatedFiles = []) {
  const { owner, repo } = context.repo;
  console.log(`Creating/updating PR for version ${newVersion}...`);
  
  // Check if we're in a PR context and need to update an existing PR
  if (context.payload.pull_request) {
    return await updateExistingPR(octokit, context, newVersion, changelog, config, updatedFiles);
  }
  
  // Create a new staging branch and PR
  // Format: stagingBranch-vX.Y.Z
  const stagingBranch = `${config.stagingBranch}-v${newVersion}`;
  let stagingBranchExists = false;
  
  // Step 1: Check if staging branch exists
  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${stagingBranch}`
    });
    console.log(`Staging branch ${stagingBranch} already exists`); 
    stagingBranchExists = true;
  } catch (error) {
    if (error.status === 404) {
      console.log(`Staging branch ${stagingBranch} does not exist - will create it`);
      stagingBranchExists = false;
    } else {
      throw error; // Re-throw unexpected errors
    }
  }
  
  // Step 2: Get current commit SHA of the merge branch to use as base
  console.log(`Getting current state of ${config.mergeBranch} branch...`);
  const { data: mergeBranchData } = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: config.mergeBranch
  });
  
  const mergeBranchSha = mergeBranchData.commit.sha;
  console.log(`Current HEAD of ${config.mergeBranch} is ${mergeBranchSha.substring(0, 7)}`);
  
  // Get current commit SHA of the release branch
  console.log(`Getting current state of ${config.releaseBranch} branch...`);
  const { data: releaseBranchData } = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: config.releaseBranch
  });
  
  const releaseBranchSha = releaseBranchData.commit.sha;
  console.log(`Current HEAD of ${config.releaseBranch} is ${releaseBranchSha.substring(0, 7)}`);
  
  // Step 3: Create or reset staging branch
  if (!stagingBranchExists) {
    // For new branches, create from release branch (not merge branch)
    // This follows the traditional release branch workflow
    console.log(`Creating staging branch ${stagingBranch} from ${config.releaseBranch}...`);
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${stagingBranch}`,
      sha: releaseBranchSha  // Use release branch SHA as base
    });
    
    console.log(`Created staging branch: ${stagingBranch} from ${config.releaseBranch} 💅`);
    
    // Now merge the main branch into the staging branch
    console.log(`Merging ${config.mergeBranch} into new staging branch...`);
    try {
      const { data: mergeCommit } = await octokit.rest.repos.merge({
        owner,
        repo,
        base: stagingBranch,           // The staging branch we just created
        head: mergeBranchSha,         // The SHA of the main branch to include changes from
        commit_message: `Merge ${config.mergeBranch} into ${stagingBranch} for release ${newVersion}`
      });
      
      console.log(`Successfully merged ${config.mergeBranch} into ${stagingBranch} with commit ${mergeCommit.sha.substring(0, 7)} 💃`);
    } catch (error) {
      // If there's a merge conflict, let's handle it gracefully
      if (error.message.includes('Merge conflict')) {
        console.log(`Merge conflict detected when merging ${config.mergeBranch} into ${stagingBranch}. Let's resolve it! 💪`);
        
        // We'll handle this by cherry-picking changes from main that don't conflict with version/changelog files
        // First, get the list of files that have changed in main since the release branch diverged
        console.log(`Getting list of files changed in ${config.mergeBranch} since ${config.releaseBranch} diverged...`);
        
        try {
          // First, let's get the list of version and changelog files that we want to preserve from release branch
          const preserveFiles = [];
          
          // Add changelog file if configured
          if (config.changelogPath) {
            preserveFiles.push(config.changelogPath);
          }
          
          // Add version files if configured
          if (config.versionFiles && Array.isArray(config.versionFiles)) {
            preserveFiles.push(...config.versionFiles);
          }
          
          console.log(`Files to preserve from ${config.releaseBranch}: ${preserveFiles.join(', ')}`);
          
          // Reset the staging branch to match release branch exactly
          await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `heads/${stagingBranch}`,
            sha: releaseBranchSha,
            force: true
          });
          
          console.log(`Reset ${stagingBranch} to match ${config.releaseBranch} exactly`);
          
          // For each file in preserveFiles, ensure we have the content from release branch
          for (const filePath of preserveFiles) {
            try {
              // Get file content from release branch
              const { data: fileContent } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: config.releaseBranch
              });
              
              // If file exists, ensure it's preserved in staging branch
              if (fileContent) {
                const content = Buffer.from(fileContent.content, 'base64').toString();
                await commitFileToStaging(
                  octokit, 
                  context, 
                  filePath, 
                  content, 
                  `chore: preserve ${filePath} from ${config.releaseBranch} for release ${newVersion}`,
                  stagingBranch
                );
                console.log(`Preserved ${filePath} from ${config.releaseBranch} in ${stagingBranch}`);
              }
            } catch (fileError) {
              // If file doesn't exist in release branch, that's fine
              if (fileError.status !== 404) {
                console.warn(`Warning: Could not preserve ${filePath} from ${config.releaseBranch}: ${fileError.message}`);
              }
            }
          }
          
          // Now, try to cherry-pick changes from main branch for files that aren't in preserveFiles
          // We'll do this by getting the content of each file in main and committing it to staging
          // if it's not in the preserveFiles list
          
          // Get the list of files in main branch
          const { data: mainFiles } = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: mergeBranchSha,
            recursive: 1
          });
          
          // For each file in main, if it's not in preserveFiles, copy it to staging
          for (const file of mainFiles.tree) {
            if (file.type === 'blob' && !preserveFiles.includes(file.path)) {
              try {
                // Get file content from main branch
                const { data: fileContent } = await octokit.rest.repos.getContent({
                  owner,
                  repo,
                  path: file.path,
                  ref: config.mergeBranch
                });
                
                // If file exists, copy it to staging branch
                if (fileContent && fileContent.content) {
                  const content = Buffer.from(fileContent.content, 'base64').toString();
                  await commitFileToStaging(
                    octokit, 
                    context, 
                    file.path, 
                    content, 
                    `chore: update ${file.path} from ${config.mergeBranch} for release ${newVersion}`,
                    stagingBranch
                  );
                  console.log(`Updated ${file.path} from ${config.mergeBranch} in ${stagingBranch}`);
                }
              } catch (fileError) {
                // If we can't get the file content, that's okay - just skip it
                console.warn(`Warning: Could not update ${file.path} from ${config.mergeBranch}: ${fileError.message}`);
              }
            }
          }
          
          console.log(`Successfully resolved merge conflicts between ${config.releaseBranch} and ${config.mergeBranch} 🎉`);
        } catch (resolveError) {
          console.error(`Error resolving merge conflicts: ${resolveError.message}`);
          throw new Error(`Failed to resolve merge conflicts: ${resolveError.message}`);
        }
      } else {
        // If it's not a merge conflict, rethrow the error
        console.error(`Error merging ${config.mergeBranch} into ${stagingBranch}: ${error.message}`);
        throw error;
      }
    }
  } else {
    // For existing branches, we want to recreate the PR changes based on the latest release branch
    // to avoid conflicts, especially with the changelog
    console.log(`Updating staging branch ${stagingBranch} using merge commit approach...`);
    
    try {
      // Create a merge commit between the release branch and the main branch
      console.log(`Creating merge commit between ${config.releaseBranch} and ${config.mergeBranch}...`);
      
      // Create a merge commit with release branch as base and main branch as head
      
      // Create a merge commit with release branch as base and main branch as head
      const { data: mergeCommit } = await octokit.rest.repos.merge({
        owner,
        repo,
        base: stagingBranch,           // The branch we want to update
        head: mergeBranchSha,         // The SHA of the main branch to include changes from
        commit_message: `Merge ${config.mergeBranch} into ${stagingBranch} for release ${newVersion}`
      }).catch(async error => {
        // If merge fails (conflict or other reason), reset and create new branch
        if (error.status === 409) { // Conflict
          console.log(`Merge conflict detected, resetting branch to ${config.releaseBranch} base`);
          
          // Force update the staging branch ref to match release branch
          await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `heads/${stagingBranch}`,
            sha: releaseBranchSha,
            force: true
          });
          
          // Now create a merge commit
          const { data } = await octokit.rest.repos.merge({
            owner,
            repo,
            base: stagingBranch,           // Now reset to release branch
            head: mergeBranchSha,         // The SHA of the main branch
            commit_message: `Merge ${config.mergeBranch} into ${stagingBranch} for release ${newVersion} (after resolving conflicts)`
          });
          
          return data;
        } else {
          throw error; // Re-throw unexpected errors
        }
      });
      
      if (mergeCommit) {
        console.log(`Successfully updated staging branch with merge commit ${mergeCommit.sha.substring(0, 7)}`);
      } else {
        // If no merge commit was created (branches might be identical)
        console.log(`No changes to merge from ${config.mergeBranch} to ${stagingBranch}, branches may be identical`);
        console.log(`Staging branch SHA: ${releaseBranchSha.substring(0, 7)}`);
        // Force some difference by adding a dummy commit if needed
        // This prevents GitHub from closing the PR due to no differences
        console.log(`Creating empty commit to prevent PR from being auto-closed...`);
        
        // Create a dummy file or modification to prevent PR from being closed
        // Get current timestamp to ensure uniqueness
        const timestamp = new Date().toISOString();
        const dummyContent = `# Release Boss Timestamp\n\nThis file ensures that the staging branch differs from the release branch.\nTimestamp: ${timestamp}\n`;
        
        await commitFileToStaging(octokit, context, '.release-timestamp', dummyContent, 
          `chore: maintain PR state for release ${newVersion}`, stagingBranch);
      }
    } catch (error) {
      console.error(`Error updating staging branch: ${error.message}`);
      throw error;
    }
  }
  
  // Step 4: Update CHANGELOG.md in staging branch
  if (config.changelogPath) {
    await updateChangelog(octokit, context, config.changelogPath, changelog, newVersion, stagingBranch, config.releaseBranch);
  }
  
  // Step 5: Commit updated version files to staging branch
  console.log(`\nChecking updatedFiles array for committing to staging branch...`);
  console.log(`Current working directory: ${process.cwd()}`);
  
  if (!updatedFiles) {
    console.warn(`WARNING: updatedFiles is undefined or null! This is probably a bug.`);
  } else if (updatedFiles.length === 0) {
    console.warn(`WARNING: updatedFiles array is empty! No files to commit.`);
  } else {
    console.log(`Found ${updatedFiles.length} updated files to commit to ${stagingBranch}:`);
    updatedFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file} (${path.isAbsolute(file) ? 'absolute' : 'relative'} path)`);
      
      // Check if file actually exists
      try {
        const stats = fs.statSync(file);
        console.log(`     File exists! Size: ${stats.size} bytes, Modified: ${stats.mtime}`);
      } catch (err) {
        console.error(`     File does not exist or cannot be accessed: ${err.message}`);
      }
    });
    
    console.log(`Starting to commit files to ${stagingBranch}...`);
    
    for (const file of updatedFiles) {
      try {
        console.log(`\nProcessing file for commit: ${file}`);
        
        // Read the file content
        console.log(`  Reading file content...`);
        const fileContent = await fs.readFile(file, 'utf8');
        console.log(`  File read successfully (${fileContent.length} bytes)`);
        console.log(`  File content preview (first 100 chars):\n    "${fileContent.substring(0, 100)}..."`);
        
        // Calculate relative path
        const filePathInRepo = path.relative(process.cwd(), file);
        console.log(`  Converted to repo-relative path: ${filePathInRepo}`);
        
        if (filePathInRepo === '') {
          console.error(`  ERROR: Relative path is empty! This file would overwrite the repo root.`);
          continue;
        }
        
        if (filePathInRepo.startsWith('..')) {
          console.error(`  ERROR: File is outside the repo directory: ${filePathInRepo}`);
          continue;
        }
        
        // Commit the file
        console.log(`  Committing to staging branch with message: chore: update version in ${path.basename(file)} for ${newVersion}`);
        try {
          await commitFileToStaging(octokit, context, filePathInRepo, fileContent, 
            `chore: update version in ${path.basename(file)} for ${newVersion}`, stagingBranch);
          console.log(`  Successfully committed ${filePathInRepo} to ${stagingBranch}!`);
        } catch (commitError) {
          console.error(`  Error during commit operation: ${commitError.message}`);
          if (commitError.response) {
            console.error(`  API Response: ${JSON.stringify(commitError.response.data)}`);
          }
          throw commitError;
        }
      } catch (error) {
        console.error(`  Failed to commit file ${file} to ${stagingBranch}: ${error.message}`);
        console.error(`  Error stack: ${error.stack}`);
      }
    }
  }
  
  // Step 6: Check if PR already exists
  console.log(`Checking for existing PRs from ${stagingBranch} to ${config.releaseBranch}...`);
  let existingPR = null;
  
  const { data: openPRs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${owner}:${stagingBranch}`,
    base: config.releaseBranch
  });
  
  if (openPRs.length > 0) {
    existingPR = openPRs[0];
    console.log(`Found existing PR #${existingPR.number}`);
  }
  
  // Step 7: Build PR title and body
  const title = config.pullRequestTitle.replace('{version}', newVersion);
  let body = `${config.pullRequestHeader || 'Release PR'}\n\n`;
  
  // Add a cute intro line
  body += `Time to freshen up our codebase with a fabulous new release! 💅✨\n\n`;
  
  // Add changelog to PR body with sparkly formatting
  body += `## ✨ Changelog ✨\n\n${changelog}\n\n`;
  
  // Add list of updated files with cute styling
  if (updatedFiles && updatedFiles.length > 0) {
    body += `## 📦 Updated Files 📦\n\n`;
    body += `These files got a gorgeous makeover:\n\n`;
    for (const file of updatedFiles) {
      body += `- \`${path.relative(process.cwd(), file)}\` 💖\n`;
    }
    body += '\n';
  }
  
  // Get our current version dynamically
  let versionInfo;
  try {
    versionInfo = require('../version');
  } catch (e) {
    console.log(`Oops! Couldn't find version info, using default version instead 💁‍♀️`);
    versionInfo = { VERSION_WITH_V: 'v1.0.0' };
  }
  
  // Add a fabulous footer with dynamic version
  body += `---\n\n*This PR was auto-generated by the fabulous Release Boss ${versionInfo.VERSION_WITH_V}* 👑`;
  
  
  // Step 8: Create or update PR
  if (existingPR) {
    console.log(`Updating existing PR #${existingPR.number}...`);
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: existingPR.number,
      title,
      body
    });
    
    console.log(`Updated PR #${existingPR.number}: ${title}`);
    return {
      prNumber: existingPR.number,
      prUrl: existingPR.html_url,
      prStatus: existingPR.state
    };
  } else {
    console.log(`Creating new PR from ${stagingBranch} to ${config.releaseBranch}...`);
    const { data: newPR } = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      body,
      head: stagingBranch,
      base: config.releaseBranch
    });
    
    // Add release label if it exists
    try {
      console.log(`Adding 'release' label to PR #${newPR.number}...`);
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: newPR.number,
        labels: ['release']
      });
    } catch (error) {
      // Label may not exist, just continue
      console.log('Could not add release label to PR (label may not exist)');
    }
    
    console.log(`Created PR #${newPR.number}: ${title}`);
    return {
      prNumber: newPR.number,
      prUrl: newPR.html_url,
      prStatus: newPR.state
    };
  }
}

/**
 * Update an existing PR with new version and changelog information
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context 
 * @param {String} newVersion - New version to be released
 * @param {String} changelog - Generated changelog content
 * @param {Object} config - Release Boss configuration
 * @param {Array} updatedFiles - List of files that were updated with version info
 */
async function updateExistingPR(octokit, context, newVersion, changelog, config, updatedFiles = []) {
  const { owner, repo } = context.repo;
  const prNumber = context.payload.pull_request.number;
  
  console.log(`Updating existing PR #${prNumber} with new version ${newVersion}...`);
  
  // Get the PR branch
  const prBranch = context.payload.pull_request.head.ref;
  
  // Update the changelog on the PR branch
  if (config.changelogPath) {
    await updateChangelog(octokit, context, config.changelogPath, changelog, newVersion, prBranch, config.releaseBranch);
  }
  
  // Update version files in the PR branch
  if (updatedFiles && updatedFiles.length > 0) {
    console.log(`Committing ${updatedFiles.length} updated version files to ${prBranch}...`);
    
    for (const file of updatedFiles) {
      try {
        const fileContent = await fs.readFile(file, 'utf8');
        const filePathInRepo = path.relative(process.cwd(), file);
        
        await commitFileToStaging(octokit, context, filePathInRepo, fileContent, 
          `chore: update version in ${path.basename(file)} for ${newVersion}`, prBranch);
      } catch (error) {
        console.error(`Error committing file ${file} to ${prBranch}:`, error);
      }
    }
  }
  
  // Update the PR title and body
  const title = config.pullRequestTitle.replace('{version}', newVersion);
  
  // Get existing PR body
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  });
  
  // Update or replace the changelog section in the PR body
  let body = pr.body || '';
  const changelogStart = body.indexOf('## Changelog');
  const updatedFilesStart = body.indexOf('## Updated Files');
  
  // Remove existing changelog and updated files sections if they exist
  if (changelogStart !== -1) {
    const sectionEnd = updatedFilesStart !== -1 ? updatedFilesStart : body.length;
    body = body.substring(0, changelogStart) + body.substring(sectionEnd);
  }
  
  // Add the updated changelog
  body += `\n\n## Changelog\n\n${changelog}\n\n`;
  
  // Add updated list of files
  if (updatedFiles && updatedFiles.length > 0) {
    body += `## Updated Files\n\n`;
    for (const file of updatedFiles) {
      body += `- ${path.relative(process.cwd(), file)}\n`;
    }
    body += '\n';
  }
  
  // Update the PR
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    title,
    body
  });
  
  console.log(`Updated PR #${prNumber} with new version ${newVersion}`);
  return {
    prNumber,
    prUrl: pr.data.html_url,
    prStatus: pr.data.state
  };
}

/**
 * Update the changelog in the staging branch
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context 
 * @param {String} changelogPath - Path to the changelog file 
 * @param {String} newChanges - New changelog content to add
 * @param {String} version - Version being released
 * @param {String} branch - Branch to update
 * @param {String} releaseBranch - Release branch name to ensure consistency
 */
async function updateChangelog(octokit, context, changelogPath, newChanges, version, branch, releaseBranch = null) {
  const { owner, repo } = context.repo;
  
  console.log(`Updating changelog for ${version} in ${branch}...`);
  
  // ALWAYS try to get content from the release branch first to avoid conflicts
  // This ensures we're building on top of what's already in the release branch
  const sourceBranches = [];
  
  // First priority: specified release branch
  if (releaseBranch) {
    sourceBranches.push(releaseBranch);
  }
  
  // Second priority: default release branch (usually 'release')
  if (!releaseBranch || releaseBranch !== 'release') {
    sourceBranches.push('release');
  }
  
  // Last resort: the branch we're updating
  if (branch !== 'release' && !sourceBranches.includes(branch)) {
    sourceBranches.push(branch);
  }
  
  console.log(`Will try to fetch changelog content from branches in this order: ${sourceBranches.join(', ')}`);
  
  // Get current content of the changelog from the first available source
  let baseContent = '';
  let sourceUsed = null;
  
  for (const sourceRef of sourceBranches) {
    try {
      console.log(`Attempting to get changelog from ${sourceRef} branch...`);
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: changelogPath,
        ref: sourceRef
      });
      
      // Decode content from base64
      baseContent = Buffer.from(data.content, 'base64').toString('utf8');
      sourceUsed = sourceRef;
      console.log(`✨ Successfully retrieved base changelog from ${sourceRef} branch!`);
      break; // We found content, no need to check other branches
    } catch (error) {
      if (error.status === 404) {
        console.log(`Changelog file doesn't exist in ${sourceRef} branch, trying next source...`);
      } else {
        console.log(`Error getting changelog from ${sourceRef}, trying next source: ${error.message}`);
      }
    }
  }
  
  if (!sourceUsed) {
    console.log(`Couldn't find changelog in any branch, will start fresh 💁‍♀️`);
  } else {
    console.log(`Using changelog content from ${sourceUsed} as base to avoid conflicts 💅`);
  }
  
  // Add new content at the top of the changelog
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  let updatedContent;
  
  if (baseContent && baseContent.includes('# Changelog')) {
    // Replace the header and add new content
    const changelogStart = baseContent.indexOf('# Changelog');
    const afterHeader = baseContent.indexOf('\n\n', changelogStart) + 2;
    
    updatedContent = baseContent.substring(0, afterHeader) +
      `## ${version} (${today})\n\n${newChanges}\n\n` +
      baseContent.substring(afterHeader);
  } else {
    // Create a new changelog
    updatedContent = `# Changelog\n\n## ${version} (${today})\n\n${newChanges}\n`;
  }
  
  // Commit the updated changelog to the branch
  await commitFileToStaging(octokit, context, changelogPath, updatedContent, 
    `chore: update changelog for ${version}`, branch);
  
  console.log(`Updated changelog in ${branch} 📝`);
}

/**
 * Commit a file to a branch
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} filePath - Path to the file in the repository
 * @param {String} fileContent - Content to write to the file
 * @param {String} message - Commit message
 * @param {String} branch - Branch to commit to
 */
async function commitFileToStaging(octokit, context, filePath, fileContent, message, branch) {
  const { owner, repo } = context.repo;
  console.log(`Committing file ${filePath} to branch ${branch}...`);
  
  let currentSha = null;
  
  // Check if file already exists to get its SHA
  try {
    const { data: existingFile } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch
    });
    
    if (existingFile) {
      currentSha = existingFile.sha;
      console.log(`File ${filePath} already exists in branch ${branch}, will update it`);
    }
  } catch (error) {
    if (error.status === 404) {
      console.log(`File ${filePath} doesn't exist in branch ${branch} yet, will create it`);
    } else {
      console.error(`Error checking file existence:`, error);
      throw error;
    }
  }
  
  // Create or update the file
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message,
      content: Buffer.from(fileContent).toString('base64'),
      branch,
      sha: currentSha
    });
    
    console.log(`Successfully committed ${filePath} to ${branch}`);
  } catch (error) {
    console.error(`Error committing file:`, error);
    throw error;
  }
}

/**
 * Tag a release after the PR is merged
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} version - Version to tag
 * @param {Object} config - Release Boss configuration
 * @returns {Object} - Object containing the commit SHA and a list of all tags created
 */
async function tagRelease(octokit, context, version, config) {
  const { owner, repo } = context.repo;
  
  // Determine if version tags should be prefixed with 'v'
  const useVPrefix = config.versionTagPrefix !== false; // Default to true if not specified
  const prefix = useVPrefix ? 'v' : '';
  
  // Primary version tag
  const tagName = `${prefix}${version}`;
  
  // Parse version components for additional tags
  const versionParts = version.split('.');
  const major = versionParts[0];
  const minor = versionParts.length > 1 ? versionParts[1] : '0';
  
  // Setup additional tags if configured
  const additionalTags = [];
  const createdTags = [];
  
  // Add the primary tag to our created tags list
  createdTags.push(tagName);
  
  // Setup additional tag configurations
  if (config.tagLatest !== false) { // Default to true if not specified
    additionalTags.push('latest');
  }
  
  if (config.tagMajor === true) {
    additionalTags.push(`${prefix}${major}`);
  }
  
  if (config.tagMinor === true) {
    additionalTags.push(`${prefix}${major}.${minor}`);
  }
  
  console.log(`Creating tag ${tagName} for release...`);
  if (additionalTags.length > 0) {
    console.log(`Will also create/update additional tags: ${additionalTags.join(', ')}`);
  }
  
  // Check if primary tag already exists
  let commitSha = null;
  try {
    const { data: existingTag } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tagName}`
    });
    
    console.log(`Tag ${tagName} already exists at commit ${existingTag.object.sha.substring(0, 7)}, skipping tag creation`);
    commitSha = existingTag.object.sha;
  } catch (error) {
    if (error.status !== 404) {
      console.error(`Error checking for existing tag:`, error);
      throw error;
    }
    // Tag doesn't exist, proceed with creation
    console.log(`Tag ${tagName} does not exist yet, will create it`);
    
    // Get SHA of the current commit on the release branch
    try {
      const { data: releaseRef } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${config.releaseBranch}`
      });
      
      commitSha = releaseRef.object.sha;
      console.log(`Creating tag ${tagName} at commit ${commitSha.substring(0, 7)}...`);
      
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/tags/${tagName}`,
        sha: commitSha
      });
      
      console.log(`Successfully created tag: ${tagName} at ${commitSha.substring(0, 7)}`);
    } catch (error) {
      console.error(`Error creating primary tag:`, error);
      throw error;
    }
  }
  
  // Create or update additional tags if requested
  if (additionalTags.length > 0 && commitSha) {
    for (const tag of additionalTags) {
      try {
        // Check if tag already exists
        try {
          await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `tags/${tag}`
          });
          
          console.log(`Tag ${tag} already exists, updating it to point to the new commit 💅`);
          
          // Update existing tag to point to the new commit
          await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `tags/${tag}`,
            sha: commitSha,
            force: true // Force update if it points to a different commit
          });
          
          console.log(`Updated existing tag ${tag} to point to commit ${commitSha.substring(0, 7)}`);
          createdTags.push(tag);
        } catch (error) {
          if (error.status === 404) {
            // Tag doesn't exist, create it
            await octokit.rest.git.createRef({
              owner,
              repo,
              ref: `refs/tags/${tag}`,
              sha: commitSha
            });
            
            console.log(`Created additional tag ${tag} pointing to commit ${commitSha.substring(0, 7)}`);
            createdTags.push(tag);
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error(`Error managing additional tag ${tag}:`, error);
        // Continue with other tags instead of failing completely
      }
    }
  }
  
  return {
    sha: commitSha,
    tags: createdTags
  };
}

module.exports = {
  createOrUpdatePR,
  updateExistingPR,
  tagRelease,
  updateChangelog,
  commitFileToStaging
};
