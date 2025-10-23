import { getUncachableGitHubClient } from '../server/github-client';
import { execSync } from 'child_process';

async function setupGitHubPush() {
  try {
    const octokit = await getUncachableGitHubClient();
    const { data: user } = await octokit.users.getAuthenticated();
    
    // Get the access token from the environment
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      throw new Error('Replit connection settings not found');
    }

    const connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
    
    if (!accessToken) {
      throw new Error('GitHub access token not found');
    }

    const repoName = 'fact-forge';
    const remoteUrl = `https://${accessToken}@github.com/${user.login}/${repoName}.git`;
    
    console.log('Setting up authenticated git remote...');
    
    // Remove existing origin if it exists
    try {
      execSync('git remote remove origin', { stdio: 'ignore' });
    } catch {
      // Doesn't exist, that's fine
    }
    
    // Add new origin with token
    execSync(`git remote add origin ${remoteUrl}`, { stdio: 'pipe' });
    
    console.log('✅ Git remote configured with authentication');
    console.log('\nNow run:');
    console.log('  git branch -M main');
    console.log('  git push -u origin main');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupGitHubPush();
