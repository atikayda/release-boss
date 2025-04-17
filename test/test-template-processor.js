const fs = require('fs').promises;
const path = require('path');
const { processVersionFiles, processTemplateFiles } = require('../src/core/templateProcessor');

// Test configuration
const config = {
  // Add any config properties needed for testing
};

// Test version - we'll simulate a 1.2.3 version bump
const version = '1.2.3';

// File paths
const fixturesDir = path.join(__dirname, 'fixtures');
const versionFilesDir = path.join(fixturesDir, 'version-files');
const templateFilesDir = path.join(fixturesDir, 'template-files');
const outputDir = path.join(fixturesDir, 'output');

async function runTests() {
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });
    
    console.log('=== Testing Template Processor ===');
    
    // ====== Test version files (inline templates) ======
    console.log('\n== Testing Version Files (Inline Templates) ==');
    
    // Copy the original files to output for testing
    const versionGoSrc = path.join(versionFilesDir, 'version.go');
    const versionGoDest = path.join(outputDir, 'version.go');
    
    await fs.copyFile(versionGoSrc, versionGoDest);
    console.log(`Copied ${versionGoSrc} to ${versionGoDest}`);
    
    // Process the version files
    console.log('\nProcessing version files:');
    await processVersionFiles([versionGoDest], version, config);
    
    // Read the processed file and display
    console.log('\nProcessed version.go:');
    const processedVersionGo = await fs.readFile(versionGoDest, 'utf8');
    console.log(processedVersionGo);
    
    // Validate if templates were properly replaced
    const hasCorrectVersion = processedVersionGo.includes(`const Version = "v${version}"`);
    const hasCorrectMajor = processedVersionGo.includes(`const Major = "1"`);
    const hasCorrectMinor = processedVersionGo.includes(`const Minor = "2"`);
    const hasCorrectPatch = processedVersionGo.includes(`const Patch = "3"`);
    
    console.log('\nValidation results:');
    console.log(`- Version updated correctly: ${hasCorrectVersion ? '✅' : '❌'}`);
    console.log(`- Major updated correctly: ${hasCorrectMajor ? '✅' : '❌'}`);
    console.log(`- Minor updated correctly: ${hasCorrectMinor ? '✅' : '❌'}`);
    console.log(`- Patch updated correctly: ${hasCorrectPatch ? '✅' : '❌'}`);
    
    // Check if template markers are still present
    const hasSingleLineTemplate = processedVersionGo.includes('%%release-manager: const Version = "v{{version}}"%%');
    const hasMultiLineTemplate = processedVersionGo.includes('/* %%release-manager:') && 
                                 processedVersionGo.includes('const Major = "{{major}}"') &&
                                 processedVersionGo.includes('const Minor = "{{minor}}"') &&
                                 processedVersionGo.includes('const Patch = "{{patch}}"') &&
                                 processedVersionGo.includes('%% */');
    
    console.log(`- Single-line template preserved: ${hasSingleLineTemplate ? '✅' : '❌'}`);
    console.log(`- Multi-line template preserved: ${hasMultiLineTemplate ? '✅' : '❌'}`);
    console.log(`- All template markers preserved: ${(hasSingleLineTemplate && hasMultiLineTemplate) ? '✅' : '❌'}`);
    
    // ====== Test template files (whole-file templates) ======
    console.log('\n== Testing Template Files (Whole-File Templates) ==');
    
    // Process template files
    const packageTplSrc = path.join(templateFilesDir, 'package.tpl.json');
    
    console.log('\nProcessing template files:');
    await processTemplateFiles([packageTplSrc], version, config);
    
    // Read the generated file
    const packageJsonPath = path.join(templateFilesDir, 'package.json');
    const processedPackageJson = await fs.readFile(packageJsonPath, 'utf8');
    
    console.log('\nGenerated package.json:');
    console.log(processedPackageJson);
    
    // Validate template replacement
    const packageJson = JSON.parse(processedPackageJson);
    const hasCorrectPackageVersion = packageJson.version === version;
    const hasCorrectPackageMajor = packageJson.versionInfo.major === '1';
    const hasCorrectPackageMinor = packageJson.versionInfo.minor === '2';
    const hasCorrectPackagePatch = packageJson.versionInfo.patch === '3';
    
    console.log('\nValidation results:');
    console.log(`- Package version updated correctly: ${hasCorrectPackageVersion ? '✅' : '❌'}`);
    console.log(`- Package major updated correctly: ${hasCorrectPackageMajor ? '✅' : '❌'}`);
    console.log(`- Package minor updated correctly: ${hasCorrectPackageMinor ? '✅' : '❌'}`);
    console.log(`- Package patch updated correctly: ${hasCorrectPackagePatch ? '✅' : '❌'}`);
    
    console.log('\n=== All tests completed ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
runTests();
