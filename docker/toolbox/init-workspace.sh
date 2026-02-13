#!/bin/bash
# Initialize workspace directory structure for the multi-agent system.
# Runs on toolbox container start — creates dirs if they don't exist.

set -euo pipefail

# Per-agent personal spaces
for agent in chora subrosa thaum praxis mux primus; do
    mkdir -p /workspace/agents/$agent/{drafts,notes,inbox}
done
mkdir -p /workspace/agents/primus/directives

# Published artifact directories
mkdir -p /workspace/output/{briefings,reports,reviews,digests}

# Collaborative project spaces
mkdir -p /workspace/projects

# Shared reference material
mkdir -p /workspace/shared/templates/{reports,workflows}
mkdir -p /workspace/shared/manifests

# Droid work areas
mkdir -p /workspace/droids

# Seed prime directive if it doesn't exist
if [ ! -f /workspace/shared/prime-directive.md ]; then
    cat > /workspace/shared/prime-directive.md << 'DIRECTIVE'
# Prime Directive

**Ship a product by end of Q1 2026.**

Focus areas:
- Build something useful with the multi-agent system
- Produce tangible artifacts (not just conversations)
- Iterate in weekly sprints
- Code goes in /workspace/projects/
- Every meeting should produce a deliverable
DIRECTIVE
fi

# Seed project registry if it doesn't exist
if [ ! -f /workspace/shared/project-registry.json ]; then
    echo '[]' > /workspace/shared/project-registry.json
fi

# Seed manifest index if it doesn't exist
if [ ! -f /workspace/shared/manifests/index.jsonl ]; then
    touch /workspace/shared/manifests/index.jsonl
fi

# Seed report template if it doesn't exist
if [ ! -f /workspace/shared/templates/reports/report.md ]; then
    cat > /workspace/shared/templates/reports/report.md << 'TEMPLATE'
---
artifact_id: "<ARTIFACT_ID>"
created_at: "<CREATED_AT>"
agent_id: "<AGENT_ID>"
workflow_stage: "<WORKFLOW_STAGE>"
status: "draft"
retention_class: "standard"
source_refs: []
---

# <TITLE>

## Summary

<Brief summary of findings or content>

## Details

<Main content>

## Sources

<References and citations>

## Next Steps

<Recommended follow-up actions>
TEMPLATE
fi

echo "Workspace initialized at $(date -Iseconds)"
