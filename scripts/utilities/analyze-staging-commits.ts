#!/usr/bin/env ts-node

/**
 * Staging Branch Commit History Analyzer
 * 
 * Analyzes the last N commits on staging branch to identify patterns,
 * issues, and lessons learned for improving deployment procedures.
 * 
 * Usage:
 *   ts-node scripts/utilities/analyze-staging-commits.ts [options]
 *   npm run analyze:staging-commits
 * 
 * Options:
 *   --count <number>     Number of commits to analyze (default: 100)
 *   --output <file>      Output file path (default: docs/deployment/STAGING_LESSONS_LEARNED.md)
 *   --format <type>      Output format: markdown or json (default: markdown)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  stats: {
    additions: number;
    deletions: number;
    files: number;
  };
}

interface CommitPattern {
  type: string;
  count: number;
  examples: string[];
}

interface AnalysisReport {
  timestamp: string;
  branch: string;
  totalCommits: number;
  dateRange: {
    from: string;
    to: string;
  };
  patterns: CommitPattern[];
  hotfixes: CommitInfo[];
  rollbacks: CommitInfo[];
  deployments: CommitInfo[];
  frequentlyChangedFiles: Array<{ file: string; changeCount: number }>;
  authors: Array<{ name: string; commitCount: number }>;
  lessonsLearned: string[];
  recommendations: string[];
}

class StagingCommitAnalyzer {
  private commitCount: number;
  private outputPath: string;
  private format: 'markdown' | 'json';

  constructor(commitCount: number = 100, outputPath?: string, format: 'markdown' | 'json' = 'markdown') {
    this.commitCount = commitCount;
    this.outputPath = outputPath || path.join(
      process.cwd(),
      'docs',
      'deployment',
      'STAGING_LESSONS_LEARNED.md'
    );
    this.format = format;
  }

  /**
   * Main analysis method
   */
  async analyze(): Promise<AnalysisReport> {
    console.log(chalk.blue('\n' + '='.repeat(70)));
    console.log(chalk.blue('STAGING BRANCH COMMIT HISTORY ANALYSIS'));
    console.log(chalk.blue('='.repeat(70) + '\n'));

    // Verify we're in a git repository
    this.verifyGitRepo();

    // Verify staging branch exists
    this.verifyStagingBranch();

    console.log(chalk.cyan(`Analyzing last ${this.commitCount} commits on staging branch...\n`));

    // Fetch latest commits
    const commits = this.fetchCommits();
    console.log(chalk.green(`✓ Retrieved ${commits.length} commits\n`));

    // Analyze patterns
    console.log(chalk.cyan('Analyzing commit patterns...\n'));
    const patterns = this.analyzePatterns(commits);
    const hotfixes = this.identifyHotfixes(commits);
    const rollbacks = this.identifyRollbacks(commits);
    const deployments = this.identifyDeployments(commits);
    const frequentFiles = this.analyzeFrequentlyChangedFiles(commits);
    const authors = this.analyzeAuthors(commits);

    console.log(chalk.green(`✓ Found ${patterns.length} commit patterns`));
    console.log(chalk.green(`✓ Identified ${hotfixes.length} hotfixes`));
    console.log(chalk.green(`✓ Identified ${rollbacks.length} rollbacks`));
    console.log(chalk.green(`✓ Identified ${deployments.length} deployment commits`));
    console.log(chalk.green(`✓ Analyzed ${frequentFiles.length} frequently changed files\n`));

    // Generate lessons learned
    console.log(chalk.cyan('Generating lessons learned and recommendations...\n'));
    const lessonsLearned = this.generateLessonsLearned(commits, hotfixes, rollbacks, patterns);
    const recommendations = this.generateRecommendations(lessonsLearned, patterns, frequentFiles);

    const report: AnalysisReport = {
      timestamp: new Date().toISOString(),
      branch: 'staging',
      totalCommits: commits.length,
      dateRange: {
        from: commits[commits.length - 1]?.date || '',
        to: commits[0]?.date || ''
      },
      patterns,
      hotfixes,
      rollbacks,
      deployments,
      frequentlyChangedFiles: frequentFiles,
      authors,
      lessonsLearned,
      recommendations
    };

    // Save report
    this.saveReport(report);

    console.log(chalk.green(`✓ Analysis complete!\n`));
    console.log(chalk.cyan(`Report saved to: ${this.outputPath}\n`));

    return report;
  }

  /**
   * Verify git repository exists
   */
  private verifyGitRepo(): void {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('Not a git repository. Please run from project root.');
    }
  }

  /**
   * Verify staging branch exists
   */
  private verifyStagingBranch(): void {
    try {
      execSync('git rev-parse --verify staging', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('Staging branch does not exist. Please create it first.');
    }
  }

  /**
   * Fetch commit information
   */
  private fetchCommits(): CommitInfo[] {
    const format = '%H%n%h%n%an%n%ai%n%s%n---END---';
    const output = execSync(`git log staging -n ${this.commitCount} --format="${format}"`, {
      encoding: 'utf-8'
    });

    const commitBlocks = output.split('---END---\n').filter(Boolean);
    const commits: CommitInfo[] = [];

    for (const block of commitBlocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 5) continue;

      const hash = lines[0];
      const shortHash = lines[1];
      const author = lines[2];
      const date = lines[3];
      const message = lines.slice(4).join('\n');

      // Get file stats for this commit
      const stats = this.getCommitStats(hash);
      const files = this.getCommitFiles(hash);

      commits.push({
        hash,
        shortHash,
        author,
        date,
        message,
        files,
        stats
      });
    }

    return commits;
  }

  /**
   * Get commit statistics
   */
  private getCommitStats(hash: string): { additions: number; deletions: number; files: number } {
    try {
      const output = execSync(`git show --stat --format="" ${hash}`, {
        encoding: 'utf-8'
      });

      const match = output.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
      
      return {
        files: match ? parseInt(match[1]) : 0,
        additions: match && match[2] ? parseInt(match[2]) : 0,
        deletions: match && match[3] ? parseInt(match[3]) : 0
      };
    } catch (error) {
      return { additions: 0, deletions: 0, files: 0 };
    }
  }

  /**
   * Get files changed in commit
   */
  private getCommitFiles(hash: string): string[] {
    try {
      const output = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`, {
        encoding: 'utf-8'
      });

      return output.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  /**
   * Analyze commit patterns
   */
  private analyzePatterns(commits: CommitInfo[]): CommitPattern[] {
    const patterns = new Map<string, { count: number; examples: string[] }>();

    const patternMatchers = [
      { type: 'Feature', regex: /^feat|feature/i },
      { type: 'Bug Fix', regex: /^fix|bug/i },
      { type: 'Hotfix', regex: /hotfix/i },
      { type: 'Refactor', regex: /^refactor/i },
      { type: 'Documentation', regex: /^docs?/i },
      { type: 'Test', regex: /^test/i },
      { type: 'Deployment', regex: /deploy|release/i },
      { type: 'Configuration', regex: /^config|^env/i },
      { type: 'Database Migration', regex: /migration|migrate/i },
      { type: 'Security', regex: /security|vulnerability|CVE/i },
      { type: 'Performance', regex: /performance|optimize/i },
      { type: 'Dependencies', regex: /^deps|dependency|upgrade/i },
      { type: 'Rollback', regex: /revert|rollback/i }
    ];

    for (const commit of commits) {
      let matched = false;

      for (const matcher of patternMatchers) {
        if (matcher.regex.test(commit.message)) {
          const existing = patterns.get(matcher.type) || { count: 0, examples: [] };
          existing.count++;
          
          if (existing.examples.length < 3) {
            existing.examples.push(`${commit.shortHash}: ${commit.message.split('\n')[0]}`);
          }
          
          patterns.set(matcher.type, existing);
          matched = true;
          break;
        }
      }

      // Catch-all for unmatched commits
      if (!matched) {
        const existing = patterns.get('Other') || { count: 0, examples: [] };
        existing.count++;
        
        if (existing.examples.length < 3) {
          existing.examples.push(`${commit.shortHash}: ${commit.message.split('\n')[0]}`);
        }
        
        patterns.set('Other', existing);
      }
    }

    return Array.from(patterns.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        examples: data.examples
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Identify hotfix commits
   */
  private identifyHotfixes(commits: CommitInfo[]): CommitInfo[] {
    return commits.filter(c => /hotfix/i.test(c.message));
  }

  /**
   * Identify rollback commits
   */
  private identifyRollbacks(commits: CommitInfo[]): CommitInfo[] {
    return commits.filter(c => /revert|rollback/i.test(c.message));
  }

  /**
   * Identify deployment commits
   */
  private identifyDeployments(commits: CommitInfo[]): CommitInfo[] {
    return commits.filter(c => /deploy|release|version bump/i.test(c.message));
  }

  /**
   * Analyze frequently changed files
   */
  private analyzeFrequentlyChangedFiles(commits: CommitInfo[]): Array<{ file: string; changeCount: number }> {
    const fileCounts = new Map<string, number>();

    for (const commit of commits) {
      for (const file of commit.files) {
        fileCounts.set(file, (fileCounts.get(file) || 0) + 1);
      }
    }

    return Array.from(fileCounts.entries())
      .map(([file, changeCount]) => ({ file, changeCount }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 20); // Top 20 files
  }

  /**
   * Analyze commit authors
   */
  private analyzeAuthors(commits: CommitInfo[]): Array<{ name: string; commitCount: number }> {
    const authorCounts = new Map<string, number>();

    for (const commit of commits) {
      authorCounts.set(commit.author, (authorCounts.get(commit.author) || 0) + 1);
    }

    return Array.from(authorCounts.entries())
      .map(([name, commitCount]) => ({ name, commitCount }))
      .sort((a, b) => b.commitCount - a.commitCount);
  }

  /**
   * Generate lessons learned
   */
  private generateLessonsLearned(
    commits: CommitInfo[],
    hotfixes: CommitInfo[],
    rollbacks: CommitInfo[],
    patterns: CommitPattern[]
  ): string[] {
    const lessons: string[] = [];

    // Analyze hotfix frequency
    const hotfixRate = (hotfixes.length / commits.length) * 100;
    if (hotfixRate > 5) {
      lessons.push(
        `High hotfix rate (${hotfixRate.toFixed(1)}%) indicates issues are escaping to staging. ` +
        `Improve testing and code review processes before deploying to staging.`
      );
    } else if (hotfixRate > 0) {
      lessons.push(
        `Moderate hotfix rate (${hotfixRate.toFixed(1)}%). Continue monitoring and improve pre-deployment validation.`
      );
    }

    // Analyze rollback frequency
    const rollbackRate = (rollbacks.length / commits.length) * 100;
    if (rollbackRate > 2) {
      lessons.push(
        `Elevated rollback rate (${rollbackRate.toFixed(1)}%) suggests deployment stability issues. ` +
        `Implement pre-deployment validation and improve staging environment testing.`
      );
    }

    // Analyze commit patterns
    const bugFixPattern = patterns.find(p => p.type === 'Bug Fix');
    if (bugFixPattern && bugFixPattern.count > commits.length * 0.3) {
      lessons.push(
        `High proportion of bug fixes (${bugFixPattern.count} out of ${commits.length} commits). ` +
        `Consider improving QA processes and adding automated tests to catch issues earlier.`
      );
    }

    // Database migrations
    const migrationPattern = patterns.find(p => p.type === 'Database Migration');
    if (migrationPattern && migrationPattern.count > 5) {
      lessons.push(
        `Frequent database migrations (${migrationPattern.count} migrations). ` +
        `Ensure migrations are tested thoroughly and have rollback strategies. ` +
        `Consider batching related schema changes to reduce deployment complexity.`
      );
    }

    // Security updates
    const securityPattern = patterns.find(p => p.type === 'Security');
    if (securityPattern && securityPattern.count > 0) {
      lessons.push(
        `Security updates detected (${securityPattern.count} commits). ` +
        `Continue prioritizing security. Implement automated security scanning in CI/CD pipeline.`
      );
    }

    // Dependency updates
    const depsPattern = patterns.find(p => p.type === 'Dependencies');
    if (depsPattern && depsPattern.count > 10) {
      lessons.push(
        `Frequent dependency updates (${depsPattern.count} commits). ` +
        `Consider using automated dependency management tools like Dependabot or Renovate.`
      );
    }

    return lessons;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    lessons: string[],
    patterns: CommitPattern[],
    frequentFiles: Array<{ file: string; changeCount: number }>
  ): string[] {
    const recommendations: string[] = [];

    // General recommendation
    recommendations.push(
      '**Implement Pre-Deployment Validation**: Run comprehensive smoke tests and E2E tests ' +
      'before merging staging to master. This validation system is now in place.'
    );

    // Based on lessons learned
    if (lessons.some(l => l.includes('hotfix'))) {
      recommendations.push(
        '**Strengthen Pre-Deployment Testing**: Increase test coverage for areas generating hotfixes. ' +
        'Add automated tests for common failure scenarios.'
      );
    }

    if (lessons.some(l => l.includes('rollback'))) {
      recommendations.push(
        '**Improve Rollback Procedures**: Document rollback steps for common scenarios. ' +
        'Implement automated rollback capability for critical services.'
      );
    }

    // Frequent file changes
    const configFiles = frequentFiles.filter(f => 
      f.file.includes('.env') || 
      f.file.includes('config') || 
      f.file.includes('.yaml') ||
      f.file.includes('.json')
    );
    
    if (configFiles.length > 0) {
      recommendations.push(
        '**Configuration Management**: Frequently changed configuration files detected. ' +
        'Consider using environment-specific configuration management and validation.'
      );
    }

    // Testing recommendations
    const testPattern = patterns.find(p => p.type === 'Test');
    const totalCommits = patterns.reduce((sum, p) => sum + p.count, 0);
    const testRate = testPattern ? (testPattern.count / totalCommits) * 100 : 0;
    
    if (testRate < 10) {
      recommendations.push(
        '**Increase Test Coverage**: Low proportion of test-related commits detected. ' +
        'Aim for at least 10-15% of commits to include test updates or additions.'
      );
    }

    // Documentation
    const docsPattern = patterns.find(p => p.type === 'Documentation');
    const docsRate = docsPattern ? (docsPattern.count / totalCommits) * 100 : 0;
    
    if (docsRate < 5) {
      recommendations.push(
        '**Improve Documentation**: Ensure significant changes are accompanied by documentation updates. ' +
        'Keep deployment guides, API docs, and README files current.'
      );
    }

    // Code quality
    recommendations.push(
      '**Code Review Standards**: Maintain consistent code review standards. ' +
      'All staging merges should have at least one approval and pass all automated checks.'
    );

    recommendations.push(
      '**Automated Quality Gates**: Implement automated quality gates: linting, type checking, ' +
      'security scanning, and test coverage thresholds before allowing deployment.'
    );

    return recommendations;
  }

  /**
   * Save report to file
   */
  private saveReport(report: AnalysisReport): void {
    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (this.format === 'json') {
      const jsonPath = this.outputPath.replace(/\.md$/, '.json');
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
      console.log(chalk.gray(`JSON report saved: ${jsonPath}`));
    } else {
      const markdown = this.generateMarkdownReport(report);
      fs.writeFileSync(this.outputPath, markdown);
    }
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(report: AnalysisReport): string {
    return `# Staging Branch Commit History Analysis

**Generated:** ${new Date(report.timestamp).toLocaleString()}  
**Branch:** ${report.branch}  
**Commits Analyzed:** ${report.totalCommits}  
**Date Range:** ${new Date(report.dateRange.from).toLocaleDateString()} to ${new Date(report.dateRange.to).toLocaleDateString()}

---

## Executive Summary

This analysis reviews the last ${report.totalCommits} commits on the staging branch to identify patterns, issues, and opportunities for improvement in our deployment processes.

---

## Commit Patterns

${report.patterns.map(pattern => `### ${pattern.type} (${pattern.count} commits)

${pattern.count > 0 ? `**Examples:**
${pattern.examples.map(ex => `- ${ex}`).join('\n')}` : '*No examples*'}
`).join('\n')}

---

## Critical Events

### Hotfixes (${report.hotfixes.length})
${report.hotfixes.length > 0 ? report.hotfixes.slice(0, 10).map(commit => 
  `- **${commit.shortHash}** (${new Date(commit.date).toLocaleDateString()}): ${commit.message.split('\n')[0]}`
).join('\n') : '*No hotfixes detected*'}

### Rollbacks (${report.rollbacks.length})
${report.rollbacks.length > 0 ? report.rollbacks.slice(0, 10).map(commit => 
  `- **${commit.shortHash}** (${new Date(commit.date).toLocaleDateString()}): ${commit.message.split('\n')[0]}`
).join('\n') : '*No rollbacks detected*'}

### Deployments (${report.deployments.length})
${report.deployments.length > 0 ? report.deployments.slice(0, 10).map(commit => 
  `- **${commit.shortHash}** (${new Date(commit.date).toLocaleDateString()}): ${commit.message.split('\n')[0]}`
).join('\n') : '*No explicit deployment commits detected*'}

---

## Frequently Changed Files

${report.frequentlyChangedFiles.slice(0, 15).map((file, index) => 
  `${index + 1}. **${file.file}** (${file.changeCount} changes)`
).join('\n')}

${report.frequentlyChangedFiles.length > 15 ? `\n*...and ${report.frequentlyChangedFiles.length - 15} more files*` : ''}

---

## Contributors

${report.authors.map((author, index) => 
  `${index + 1}. **${author.name}** (${author.commitCount} commits, ${((author.commitCount / report.totalCommits) * 100).toFixed(1)}%)`
).join('\n')}

---

## Lessons Learned

${report.lessonsLearned.length > 0 ? report.lessonsLearned.map((lesson, index) => 
  `${index + 1}. ${lesson}`
).join('\n\n') : '*No specific lessons identified*'}

---

## Recommendations

${report.recommendations.map((rec, index) => 
  `${index + 1}. ${rec}`
).join('\n\n')}

---

## Action Items

Based on this analysis, the following action items are recommended:

1. **Immediate**:
   - Review and address any outstanding hotfixes or rollbacks
   - Implement pre-deployment validation (now complete)
   - Update deployment documentation based on lessons learned

2. **Short-term (1-2 weeks)**:
   - Add tests for areas with frequent hotfixes
   - Improve code review process for frequently changed files
   - Set up automated dependency updates

3. **Long-term (1-3 months)**:
   - Increase test coverage to 80%+
   - Implement automated quality gates
   - Establish deployment success metrics and track trends

---

## Related Documentation

- [Pre-Deployment Validation Guide](./PRE_DEPLOYMENT_VALIDATION.md)
- [STAGING Deployment Guide](./STAGING_DEPLOYMENT_GUIDE.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)

---

**Next Review:** ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}  
**Review Frequency:** Monthly or after every 100 commits
`;
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let commitCount = 100;
  let outputPath: string | undefined;
  let format: 'markdown' | 'json' = 'markdown';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      commitCount = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1] as 'markdown' | 'json';
      i++;
    }
  }

  const analyzer = new StagingCommitAnalyzer(commitCount, outputPath, format);

  try {
    await analyzer.analyze();
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('\n❌ Error during analysis:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { StagingCommitAnalyzer, AnalysisReport, CommitInfo, CommitPattern };

