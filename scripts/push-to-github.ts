import { getUncachableGitHubClient } from '../server/github-client';
import { execSync } from 'child_process';

async function pushToGitHub() {
  try {
    console.log('🔗 Connecting to GitHub...');
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user info
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    // Get repository name from user or use default
    const repoName = process.argv[2] || 'knowledge-agent-fact-checker';
    const isPrivate = process.argv[3] === 'private';
    
    console.log(`\n📦 Creating repository: ${repoName}...`);
    
    try {
      // Create a new repository
      const { data: repo } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'AI fact-checking application that verifies numeric claims using multi-source verification with trust-weighted consensus',
        private: isPrivate,
        auto_init: false,
      });
      
      console.log(`✅ Repository created: ${repo.html_url}`);
      console.log(`\n🔄 Pushing code to GitHub...`);
      
      // Initialize git if needed
      try {
        execSync('git rev-parse --git-dir', { stdio: 'ignore' });
        console.log('Git repository already initialized');
      } catch {
        console.log('Initializing git repository...');
        execSync('git init', { stdio: 'inherit' });
      }
      
      // Configure git user if needed
      try {
        execSync('git config user.email', { stdio: 'pipe' });
      } catch {
        execSync(`git config user.email "${user.email || user.login + '@users.noreply.github.com'}"`, { stdio: 'inherit' });
        execSync(`git config user.name "${user.name || user.login}"`, { stdio: 'inherit' });
      }
      
      // Add all files
      execSync('git add .', { stdio: 'inherit' });
      
      // Commit
      try {
        execSync('git commit -m "Initial commit from Replit"', { stdio: 'inherit' });
      } catch (error) {
        console.log('Note: No changes to commit (may already be committed)');
      }
      
      // Add remote
      try {
        execSync('git remote remove origin', { stdio: 'ignore' });
      } catch {
        // Remote doesn't exist, that's fine
      }
      execSync(`git remote add origin ${repo.clone_url.replace('https://', `https://${user.login}:TOKEN@`)}`, { stdio: 'inherit' });
      
      // Push to GitHub
      execSync('git branch -M main', { stdio: 'inherit' });
      execSync('git push -u origin main', { stdio: 'inherit' });
      
      console.log(`\n✅ Successfully pushed to GitHub!`);
      console.log(`🔗 Repository URL: ${repo.html_url}`);
      
    } catch (error: any) {
      if (error.status === 422) {
        console.log(`\n⚠️  Repository '${repoName}' already exists.`);
        console.log(`\nTo push to an existing repository:`);
        console.log(`1. Run: git remote add origin https://github.com/${user.login}/${repoName}.git`);
        console.log(`2. Run: git branch -M main`);
        console.log(`3. Run: git push -u origin main`);
      } else {
        throw error;
      }
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

pushToGitHub();
