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
        commit_message: `chore: merge ${config.mergeBranch} into ${stagingBranch} for release ${newVersion}`
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
          
          // Collect all files from release branch that need to be preserved
          console.log(`Collecting files from ${config.releaseBranch} to preserve in ${stagingBranch}...`);
          const filesToPreserve = [];
          
          for (const filePath of preserveFiles) {
            try {
              // Get file content from release branch
              const { data: fileContent } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: config.releaseBranch
              });
              
              // If file exists, add it to our batch
              if (fileContent && fileContent.content) {
                const content = Buffer.from(fileContent.content, 'base64').toString();
                filesToPreserve.push({
                  path: filePath,
                  content: content
                });
                console.log(`Added ${filePath} from ${config.releaseBranch} to preservation batch`);
              } else {
                console.log(`File ${filePath} exists but has no content in ${config.releaseBranch}, skipping...`);
              }
            } catch (fileError) {
              // Handle various error cases gracefully
              if (fileError.status === 404) {
                console.log(`File ${filePath} doesn't exist in ${config.releaseBranch}, skipping...`);
              } else if (fileError.message.includes('Not Found')) {
                console.log(`File ${filePath} not found in ${config.releaseBranch}, skipping... 💁‍♀️`);
                // Continue with the process even if we can't get this file
              } else {
                console.warn(`Warning: Could not preserve ${filePath} from ${config.releaseBranch}: ${fileError.message}`);
              }
            }
          }
          
          // Commit all preserved files in a single batch
          if (filesToPreserve.length > 0) {
            try {
              await commitMultipleFilesToStaging(
                octokit,
                context,
                filesToPreserve,
                `chore: preserve files from ${config.releaseBranch} for release ${newVersion} 💅`,
                stagingBranch
              );
              console.log(`Preserved ${filesToPreserve.length} files from ${config.releaseBranch} in a single fabulous commit! 💁‍♀️`);
            } catch (commitError) {
              console.warn(`Warning: Could not commit preserved files from ${config.releaseBranch}: ${commitError.message}`);
              console.log(`But don't worry, we'll continue with the process anyway! 💁‍♀️`);
              // Continue with the process even if we can't commit the preserved files
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
          
          // Collect all files from merge branch that need to be copied
          console.log(`Collecting files from ${config.mergeBranch} to update in ${stagingBranch}...`);
          const filesToUpdate = [];
          const batchSize = 50; // Process files in batches to avoid overwhelming the API
          let currentBatch = [];
          let batchCount = 0;
          
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
                
                // If file exists, add it to our batch
                if (fileContent && fileContent.content) {
                  const content = Buffer.from(fileContent.content, 'base64').toString();
                  currentBatch.push({
                    path: file.path,
                    content: content
                  });
                  console.log(`Added ${file.path} from ${config.mergeBranch} to update batch`);
                  
                  // If we've reached our batch size, commit this batch
                  if (currentBatch.length >= batchSize) {
                    batchCount++;
                    await commitMultipleFilesToStaging(
                      octokit,
                      context,
                      currentBatch,
                      `chore: update files from ${config.mergeBranch} (batch ${batchCount}) for release ${newVersion} 💅`,
                      stagingBranch
                    );
                    console.log(`Updated ${currentBatch.length} files from ${config.mergeBranch} in batch ${batchCount} 💁‍♀️`);
                    filesToUpdate.push(...currentBatch);
                    currentBatch = [];
                  }
                }
              } catch (fileError) {
                // If we can't get the file content, that's okay - just skip it
                console.warn(`Warning: Could not update ${file.path} from ${config.mergeBranch}: ${fileError.message}`);
              }
            }
          }
          
          // Commit any remaining files in the final batch
          if (currentBatch.length > 0) {
            batchCount++;
            await commitMultipleFilesToStaging(
              octokit,
              context,
              currentBatch,
              `chore: update files from ${config.mergeBranch} (batch ${batchCount}) for release ${newVersion} 💅`,
              stagingBranch
            );
            console.log(`Updated ${currentBatch.length} files from ${config.mergeBranch} in final batch ${batchCount} 💁‍♀️`);
            filesToUpdate.push(...currentBatch);
          }
          
          console.log(`Total files updated from ${config.mergeBranch}: ${filesToUpdate.length}`);
          
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
    // For existing branches, we'll reset them to the release branch and start fresh
    // This is simpler and more consistent than trying to update them in place
    console.log(`Existing staging branch ${stagingBranch} found - resetting to ${config.releaseBranch} and starting fresh 💅`);
    
    try {
      // Force update the staging branch ref to match release branch
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${stagingBranch}`,
        sha: releaseBranchSha,
        force: true
      });
      
      console.log(`Reset ${stagingBranch} to match ${config.releaseBranch} exactly`);
      
      // Now merge the main branch into the staging branch
      console.log(`Merging ${config.mergeBranch} into reset staging branch...`);
      try {
        const { data: mergeCommit } = await octokit.rest.repos.merge({
          owner,
          repo,
          base: stagingBranch,           // The staging branch we just reset
          head: mergeBranchSha,         // The SHA of the main branch to include changes from
          commit_message: `chore: merge ${config.mergeBranch} into ${stagingBranch} for release ${newVersion}`
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
            
            // Add update files if configured (just the file paths)
            if (config.updateFiles && Array.isArray(config.updateFiles)) {
              for (const updateFile of config.updateFiles) {
                if (updateFile.file && !preserveFiles.includes(updateFile.file)) {
                  preserveFiles.push(updateFile.file);
                }
              }
            }
            
            console.log(`Files to preserve from ${config.releaseBranch}: ${preserveFiles.join(', ')}`);
            
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
            
            // Collect all files to update from main branch
            const filesToUpdate = [];
            
            // For each file in main, if it's not in preserveFiles, collect it for a batch update
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
                  
                  // If file exists, add it to our collection
                  if (fileContent && fileContent.content) {
                    const content = Buffer.from(fileContent.content, 'base64').toString();
                    filesToUpdate.push({
                      path: file.path,
                      content: content
                    });
                  }
                } catch (fileError) {
                  // If we can't get the file content, that's okay - just skip it
                  console.warn(`Warning: Could not update ${file.path} from ${config.mergeBranch}: ${fileError.message}`);
                }
              }
            }
            
            // Commit all files from main branch in a single commit
            if (filesToUpdate.length > 0) {
              await commitMultipleFilesToStaging(
                octokit,
                context,
                filesToUpdate,
                `chore: update files from ${config.mergeBranch} for release ${newVersion}`,
                stagingBranch
              );
              console.log(`Updated ${filesToUpdate.length} files from ${config.mergeBranch} in a single commit 💅`);
            }
            
            console.log(`Successfully resolved merge conflicts between ${config.releaseBranch} and ${config.mergeBranch} 🎉`);
          } catch (resolveError) {
            // Don't fail the entire process if we can't resolve merge conflicts
            console.warn(`Warning: Error resolving merge conflicts: ${resolveError.message}`);
            console.log(`But don't worry, we'll still try to create a PR with what we have! 💁‍♀️`);
            
            // If we have at least updated the version file, we can still proceed
            if (updatedFiles && updatedFiles.length > 0) {
              console.log(`We have ${updatedFiles.length} updated files, so we can still create a PR!`);
            } else {
              // If we don't have any updated files, we need to at least update the version file
              try {
                // Try to get the version file from the release branch
                if (config.versionFiles && config.versionFiles.length > 0) {
                  const versionFile = config.versionFiles[0];
                  console.log(`Attempting to get version file ${versionFile} from ${config.releaseBranch}...`);
                  
                  try {
                    const { data: fileContent } = await octokit.rest.repos.getContent({
                      owner,
                      repo,
                      path: versionFile,
                      ref: config.releaseBranch
                    });
                    
                    if (fileContent && fileContent.content) {
                      const content = Buffer.from(fileContent.content, 'base64').toString();
                      // Update the version string in the file
                      const updatedContent = content.replace(/[0-9]+\.[0-9]+\.[0-9]+/g, newVersion);
                      
                      // Add the updated file to the list
                      updatedFiles.push({
                        path: versionFile,
                        content: updatedContent
                      });
                      
                      console.log(`Added updated version file ${versionFile} to the PR`);
                    }
                  } catch (versionError) {
                    console.warn(`Could not get version file: ${versionError.message}`);
                  }
                }
              } catch (fallbackError) {
                console.warn(`Failed to create fallback version update: ${fallbackError.message}`);
                // At this point, we've tried everything we can
                throw new Error(`Failed to resolve merge conflicts and couldn't create a fallback: ${resolveError.message}`);
              }
            }
          }
        } else {
          // If it's not a merge conflict, rethrow the error
          console.error(`Error merging ${config.mergeBranch} into ${stagingBranch}: ${error.message}`);
          throw error;
        }
      }
      
      // Check if we need to add a dummy commit to prevent GitHub from closing the PR
      try {
        // Compare the staging branch with the release branch to see if they're identical
        const { data: comparison } = await octokit.rest.repos.compareCommits({
          owner,
          repo,
          base: config.releaseBranch,
          head: stagingBranch
        });
        
        if (comparison.files.length === 0 || comparison.total_commits === 0) {
          console.log(`No differences detected between ${stagingBranch} and ${config.releaseBranch}, adding dummy commit...`);
          
          // Create a dummy file or modification to prevent PR from being closed
          // Get current timestamp to ensure uniqueness
          const timestamp = new Date().toISOString();
          const dummyContent = `# Release Boss Timestamp\n\nThis file ensures that the staging branch differs from the release branch.\nTimestamp: ${timestamp}\n`;
          
          await commitMultipleFilesToStaging(
            octokit,
            context,
            [{ path: '.release-timestamp', content: dummyContent }],
            `chore: maintain PR state for release ${newVersion} 💅`,
            stagingBranch
          );
            
          console.log(`Added dummy commit to ${stagingBranch} to prevent PR from being auto-closed 💅`);
        }
      } catch (compareError) {
        console.warn(`Warning: Could not compare branches: ${compareError.message}`);
      }
    } catch (error) {
      console.error(`Error updating staging branch: ${error.message}`);
      throw error;
    }
  }
  
  // Step 4: Prepare changelog content (but don't commit it yet - we'll do a single commit with all files)
  let changelogContent = null;
  let changelogPath = null;
  
  if (config.changelogPath) {
    changelogPath = config.changelogPath;
    console.log(`Preparing changelog for ${newVersion} (will be committed with other files)...`);
    
    // Get current content of the changelog from the first available source
    let baseContent = '';
    // Track which branch we got the changelog from
    let sourceUsed = null;
    
    // ALWAYS try to get content from the release branch first to avoid conflicts
    // This ensures we're building on top of what's already in the release branch
    const sourceBranches = [];
    
    // First priority: specified release branch
    if (config.releaseBranch) {
      sourceBranches.push(config.releaseBranch);
    }
    
    // Second priority: default release branch (usually 'release')
    if (!config.releaseBranch || config.releaseBranch !== 'release') {
      sourceBranches.push('release');
    }
    
    // Last resort: the branch we're updating
    if (stagingBranch !== 'release' && !sourceBranches.includes(stagingBranch)) {
      sourceBranches.push(stagingBranch);
    }
    
    console.log(`Will try to fetch changelog content from branches in this order: ${sourceBranches.join(', ')}`);
    
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
    
    if (baseContent && baseContent.includes('# Changelog')) {
      // Replace the header and add new content
      const changelogStart = baseContent.indexOf('# Changelog');
      const afterHeader = baseContent.indexOf('\n\n', changelogStart) + 2;
      
      changelogContent = baseContent.substring(0, afterHeader) +
        `## ${newVersion} (${today})\n\n${changelog}\n\n` +
        baseContent.substring(afterHeader);
    } else {
      // Create a new changelog
      changelogContent = `# Changelog\n\n## ${newVersion} (${today})\n\n${changelog}\n`;
    }
    
    console.log(`Prepared changelog content for ${newVersion} 📝`);
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
    
    // Collect all files to commit in a single batch
    const filesToCommit = [];
    
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
        
        // Add the file to our collection
        filesToCommit.push({
          path: filePathInRepo,
          content: fileContent
        });
        console.log(`  Added ${filePathInRepo} to batch commit`);
      } catch (error) {
        console.error(`  Failed to process file ${file} for commit: ${error.message}`);
        console.error(`  Error stack: ${error.stack}`);
      }
    }
    
    // Add the changelog to the files to commit if we have it
    if (changelogPath && changelogContent) {
      filesToCommit.push({
        path: changelogPath,
        content: changelogContent
      });
      console.log(`Added changelog to batch commit: ${changelogPath}`);
    }
    
    // Commit all files in a single batch
    if (filesToCommit.length > 0) {
      try {
        await commitMultipleFilesToStaging(
          octokit,
          context,
          filesToCommit,
          `chore: update files for release ${newVersion}`,
          stagingBranch
        );
        console.log(`Successfully committed ${filesToCommit.length} files in a single fabulous commit! 💁‍♀️`);
      } catch (commitError) {
        console.error(`Error during batch commit operation: ${commitError.message}`);
        if (commitError.response) {
          console.error(`API Response: ${JSON.stringify(commitError.response.data)}`);
        }
        throw commitError;
      }
    } else {
      console.log(`No files to commit`);
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
  
  // Collect all files to commit in a single batch
  const filesToCommit = [];
  
  // Prepare changelog content if needed
  if (config.changelogPath) {
    console.log(`Preparing changelog for ${newVersion} in existing PR...`);
    
    // Get current content of the changelog from the first available source
    let baseContent = '';
    // Track which branch we got the changelog from
    let sourceUsed = null;
    
    // ALWAYS try to get content from the release branch first to avoid conflicts
    const sourceBranches = [config.releaseBranch, 'release', prBranch];
    
    console.log(`Will try to fetch changelog content from branches in this order: ${sourceBranches.join(', ')}`);
    
    for (const sourceRef of sourceBranches) {
      try {
        console.log(`Attempting to get changelog from ${sourceRef} branch...`);
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: config.changelogPath,
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
    
    // Add new content at the top of the changelog
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    let changelogContent;
    
    if (baseContent && baseContent.includes('# Changelog')) {
      // Replace the header and add new content
      const changelogStart = baseContent.indexOf('# Changelog');
      const afterHeader = baseContent.indexOf('\n\n', changelogStart) + 2;
      
      changelogContent = baseContent.substring(0, afterHeader) +
        `## ${newVersion} (${today})\n\n${changelog}\n\n` +
        baseContent.substring(afterHeader);
    } else {
      // Create a new changelog
      changelogContent = `# Changelog\n\n## ${newVersion} (${today})\n\n${changelog}\n`;
    }
    
    // Add changelog to files to commit
    filesToCommit.push({
      path: config.changelogPath,
      content: changelogContent
    });
    console.log(`Added changelog to batch commit: ${config.changelogPath}`);
  }
  
  // Add version files to the batch
  if (updatedFiles && updatedFiles.length > 0) {
    console.log(`Processing ${updatedFiles.length} updated version files for batch commit...`);
    
    for (const file of updatedFiles) {
      try {
        const fileContent = await fs.readFile(file, 'utf8');
        const filePathInRepo = path.relative(process.cwd(), file);
        
        if (filePathInRepo === '' || filePathInRepo.startsWith('..')) {
          console.error(`Invalid file path: ${filePathInRepo}`);
          continue;
        }
        
        filesToCommit.push({
          path: filePathInRepo,
          content: fileContent
        });
        console.log(`Added ${filePathInRepo} to batch commit`);
      } catch (error) {
        console.error(`Error processing file ${file} for commit: ${error.message}`);
      }
    }
  }
  
  // Commit all files in a single batch
  if (filesToCommit.length > 0) {
    try {
      await commitMultipleFilesToStaging(
        octokit,
        context,
        filesToCommit,
        `chore: update files for release ${newVersion}`,
        prBranch
      );
      console.log(`Successfully committed ${filesToCommit.length} files in a single fabulous commit! 💁‍♀️`);
    } catch (commitError) {
      console.error(`Error during batch commit operation: ${commitError.message}`);
      throw commitError;
    }
  } else {
    console.log(`No files to commit in the PR`);
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

// The updateChangelog function has been integrated directly into createOrUpdatePR and updateExistingPR
// for a more efficient single-commit approach

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

/**
 * Commit multiple files to a branch in a single commit
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Array} files - Array of {path, content} objects
 * @param {String} message - Commit message
 * @param {String} branch - Branch to commit to
 */
async function commitMultipleFilesToStaging(octokit, context, files, message, branch) {
  if (!files || !Array.isArray(files) || files.length === 0) {
    console.log('No files to commit');
    return;
  }

  const { owner, repo } = context.repo;
  console.log(`Committing ${files.length} files to branch ${branch} in a single commit...`);
  
  // Get the current commit SHA to use as the base
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`
  });
  
  const baseTreeSha = refData.object.sha;
  
  // Get the base tree
  const { data: commitData } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseTreeSha
  });
  
  const baseTree = commitData.tree.sha;
  
  // Create blobs for each file
  const fileBlobs = await Promise.all(files.map(async (file) => {
    const { data: blobData } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(file.content).toString('base64'),
      encoding: 'base64'
    });
    
    return {
      path: file.path,
      mode: '100644', // Regular file
      type: 'blob',
      sha: blobData.sha
    };
  }));
  
  // Create a new tree with the new blobs
  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTree,
    tree: fileBlobs
  });
  
  // Create a commit with the new tree
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [baseTreeSha]
  });
  
  // Try to update the branch reference to point to the new commit
  try {
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha
    });
    
    console.log(`Successfully committed ${files.length} files to ${branch} in a single commit! 💅`);
    console.log(`Files: ${files.map(f => f.path).join(', ')}`);
  } catch (error) {
    // Check if this is a "not a fast forward" error
    if (error.message.includes('Update is not a fast forward') || 
        (error.response && error.response.data && 
         error.response.data.message && 
         error.response.data.message.includes('Update is not a fast forward'))) {
      
      console.log(`💁‍♀️ Oh honey, we got a "not a fast forward" error! Let me fix that for you...`);
      
      // Get the latest state of the branch
      try {
        // First, let's fetch the latest state of the branch
        const { data: latestRefData } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${branch}`
        });
        
        const latestSha = latestRefData.object.sha;
        console.log(`Current branch HEAD is at ${latestSha.substring(0, 7)}`);
        
        // Create a new commit with the latest branch as parent
        const { data: mergeCommit } = await octokit.rest.git.createCommit({
          owner,
          repo,
          message: `${message} (resolved fast-forward issue)`,
          tree: newTree.sha,
          parents: [latestSha] // Use the latest SHA as parent
        });
        
        // Force update the branch reference
        await octokit.rest.git.updateRef({
          owner,
          repo,
          ref: `heads/${branch}`,
          sha: mergeCommit.sha,
          force: true // Force the update to resolve the fast-forward issue
        });
        
        console.log(`Successfully committed ${files.length} files to ${branch} with force update! 💅`);
        console.log(`Files: ${files.map(f => f.path).join(', ')}`);
      } catch (retryError) {
        console.error(`Failed to resolve fast-forward issue: ${retryError.message}`);
        throw new Error(`Failed to commit changes after resolving fast-forward issue: ${retryError.message}`);
      }
    } else {
      // If it's not a fast-forward error, rethrow
      console.error(`Error updating branch reference: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Delete a branch after a PR is merged or closed
 * @param {Object} octokit - GitHub API client
 * @param {Object} context - GitHub context
 * @param {String} branch - Branch to delete
 * @returns {Boolean} - Whether the branch was successfully deleted
 */
async function deleteBranch(octokit, context, branch) {
  const { owner, repo } = context.repo;
  console.log(`Attempting to delete branch ${branch} - cleaning up after ourselves like the fabulous queen we are! 💁‍♀️`);
  
  try {
    // First check if the branch exists
    try {
      await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch
      });
    } catch (error) {
      // If branch doesn't exist, that's fine - just return
      if (error.status === 404) {
        console.log(`Branch ${branch} doesn't exist, no need to delete it 💅`);
        return false;
      }
      throw error; // Re-throw other errors
    }
    
    // Delete the branch
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`
    });
    
    console.log(`Successfully deleted branch ${branch} - keeping things tidy! ✨`);
    return true;
  } catch (error) {
    console.error(`Error deleting branch ${branch}: ${error.message}`);
    return false;
  }
}

module.exports = {
  createOrUpdatePR,
  updateExistingPR,
  tagRelease,
  commitFileToStaging,
  commitMultipleFilesToStaging,
  deleteBranch
};
