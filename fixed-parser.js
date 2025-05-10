/**
 * This is the fixed implementation for parsing changelog entries
 * It uses a combination of regex patterns and the conventional-commits-parser library
 */

// Function to parse changelog entries from a formatted changelog
function parseChangelogEntries(changelog) {
  let parsedCommits = [];
  
  if (typeof changelog !== 'string') {
    console.log(`Warning: changelog is not a string! 💅 Type: ${typeof changelog}`);
    // Convert to string if it's not already
    changelog = String(changelog || '');
  }
  
  // Try to extract structured data from the changelog string
  try {
    // First check if it's a JSON string of commits
    if (changelog.trim().startsWith('[')) {
      try {
        parsedCommits = JSON.parse(changelog);
        console.log(`Successfully parsed changelog string into an array with ${parsedCommits.length} items 💁‍♀️`);
      } catch (jsonError) {
        console.log(`Not a valid JSON string: ${jsonError.message} 💅`);
        // Not JSON, continue with other parsing methods
      }
    }
    
    // If we couldn't parse as JSON, try to extract commit info from the formatted changelog
    if (parsedCommits.length === 0) {
      console.log(`Attempting to parse formatted changelog 💅`);
      
      // Split the changelog into lines and process each line
      const lines = changelog.split('\n');
      
      // Log the first few lines for debugging
      if (lines.length > 0) {
        console.log(`First line of changelog: "${lines[0]}" 💁‍♀️`);
      }
      
      lines.forEach(line => {
        // Skip empty lines or section headers (lines starting with #)
        if (!line.trim() || line.trim().startsWith('#')) {
          return;
        }
        
        try {
          // Try both conventional and non-conventional formats
          // First, try conventional format (with ** and type/scope)
          const conventionalRegex = /^\*\s+\*\*([^\(]+)(?:\(([^\)]+)\))?:\*\*\s+(.+?)\s+\(\[([a-f0-9]+)\]/;
          // For non-conventional format (without ** and type/scope)
          const nonConventionalRegex = /^\*\s+([^\[\(]+)\s+\(\[([a-f0-9]+)\]/;
          
          // Try conventional format first
          let match = line.match(conventionalRegex);
          if (match) {
            // Extract the type, scope, and message
            const type = match[1]?.trim();
            const scope = match[2]?.trim() || '';
            const message = match[3]?.trim() || '';
            const hash = match[4] || '';
            
            // Extract PR number if present
            const prMatch = line.match(/#(\d+)/);
            const prRef = prMatch ? `#${prMatch[1]}` : '';
            
            console.log(`Successfully extracted conventional commit: type=${type}, scope=${scope}, message=${message} 💁‍♀️`);
            
            parsedCommits.push({
              type: type,
              scope: scope,
              message: message,
              pr: prRef,
              hash: hash,
              author: ''
            });
          } 
          // If conventional format fails, try non-conventional format
          else {
            match = line.match(nonConventionalRegex);
            if (match) {
              const message = match[1]?.trim();
              const hash = match[2] || '';
              
              // Try to extract type and scope from message using conventional-commits-parser
              try {
                const parsed = conventionalCommitsParser.sync(message, {
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
                  console.log(`Successfully extracted non-conventional commit with parser: type=${parsed.type}, subject=${parsed.subject || ''} 💁‍♀️`);
                  
                  parsedCommits.push({
                    type: parsed.type,
                    scope: parsed.scope || '',
                    message: parsed.subject || message,
                    pr: prRef,
                    hash: hash,
                    author: ''
                  });
                } else {
                  // If parsing fails, use a default type
                  console.log(`Successfully extracted non-conventional commit: message=${message} 💁‍♀️`);
                  
                  // Try to guess the type from the message
                  let type = 'chore';
                  if (message.includes('fix') || message.includes('bug')) type = 'fix';
                  if (message.includes('feat') || message.includes('add')) type = 'feat';
                  
                  parsedCommits.push({
                    type: type,
                    scope: '',
                    message: message,
                    pr: prRef,
                    hash: hash,
                    author: ''
                  });
                }
              } catch (parseError) {
                console.log(`Error parsing non-conventional commit: ${parseError.message} 💅`);
                
                // Extract PR number if present
                const prMatch = line.match(/#(\d+)/);
                const prRef = prMatch ? `#${prMatch[1]}` : '';
                
                // Add with default type
                parsedCommits.push({
                  type: 'chore',
                  scope: '',
                  message: message,
                  pr: prRef,
                  hash: hash,
                  author: ''
                });
              }
            }
          }
        } catch (parseError) {
          console.log(`Error parsing line "${line}": ${parseError.message} 💁‍♀️`);
        }
      });
      
      if (parsedCommits.length > 0) {
        console.log(`Extracted ${parsedCommits.length} commits from markdown format 💁‍♀️`);
      } else {
        console.log(`Couldn't extract commit info from changelog string 💅`);
      }
    }
  } catch (error) {
    console.log(`Error processing changelog: ${error.message} 💁‍♀️`);
    parsedCommits = [];
  }
  
  // If we couldn't extract any valid entries, add a fallback entry
  if (parsedCommits.length === 0) {
    console.log('No valid entries extracted, adding fallback entry 💅');
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
}

// Export the function for use in changelogTable.js
module.exports = { parseChangelogEntries };
