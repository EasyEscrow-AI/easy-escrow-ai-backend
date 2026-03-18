# Research with Perplexity MCP

When performing research tasks, **use the Perplexity MCP tools** instead of generic web search.

## When to Use Perplexity

- **Always use for:** Deep research, API documentation lookups, library comparisons, best practices, troubleshooting complex issues, understanding new technologies
- **Use for:** Any research that isn't trivial or purely about local codebase
- **Skip only for:** Simple questions answerable from local files or basic knowledge

## Available Perplexity Tools

| Tool | Use Case |
|------|----------|
| `mcp__perplexity__perplexity_search` | Quick web search for current information |
| `mcp__perplexity__perplexity_chat` | General questions with real-time web context (sonar-pro) |
| `mcp__perplexity__perplexity_research` | Deep, comprehensive research (sonar-deep-research) |
| `mcp__perplexity__perplexity_reason` | Complex analytical tasks, problem-solving (sonar-reasoning-pro) |

## Guidelines

1. **Prefer `perplexity_research`** for investigating Solana/blockchain topics, debugging production issues, or understanding complex APIs
2. **Use `perplexity_reason`** when you need to analyze trade-offs or make architectural decisions
3. **Use `perplexity_search`** for quick lookups (error messages, library versions, etc.)
4. **Cite sources** from Perplexity results when providing recommendations

## Examples

- Investigating a Jito bundle failure → `perplexity_research`
- Finding latest Solana web3.js API changes → `perplexity_search`
- Comparing cNFT transfer approaches → `perplexity_reason`
- Understanding DAS API rate limits → `perplexity_chat`
