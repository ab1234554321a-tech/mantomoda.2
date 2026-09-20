#!/usr/bin/env bash
# =============================================================================
#  Manto Moda — Claude Skills installer
#  Installs the curated subset of https://someclaudeskills.com skills
#  that map to the Manto Moda roadmap (see SKILLS.md for the full mapping).
#
#  Usage:
#    bash scripts/install-claude-skills.sh                  # all groups -> ~/.claude/skills
#    bash scripts/install-claude-skills.sh --group qa       # one group (repeatable)
#    bash scripts/install-claude-skills.sh --group qa --group ux
#    bash scripts/install-claude-skills.sh --into-repo      # -> <repo>/.claude/skills (shared with team)
#    bash scripts/install-claude-skills.sh --list           # show groups
#    bash scripts/install-claude-skills.sh --uninstall      # remove the selection
#    bash scripts/install-claude-skills.sh --force          # overwrite existing
# =============================================================================
set -euo pipefail

UPSTREAM="https://github.com/erichowens/some_claude_skills.git"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- Groups (skill directory names in the upstream repo) ---------------------
G_meta="skill-creator skill-architect skill-coach skill-grader agent-creator orchestrator task-decomposer skillful-subagent-creator liaison human-gate-designer output-contract-enforcer checklist-discipline systems-thinking research-analyst"
G_backend="api-architect rest-api-design openapi-spec-writer database-design-patterns postgresql-optimization caching-strategies background-job-orchestrator error-handling-patterns code-architecture refactoring-surgeon code-review-checklist git-workflow-expert performance-profiling logging-observability security-auditor dependency-management document-generation-pdf"
G_devops="docker-containerization devops-automator github-actions-pipeline-builder launch-readiness-auditor"
G_qa="test-automation-expert vitest-testing-patterns playwright-e2e-tester playwright-screenshot-inspector webapp-testing"
G_frontend="nextjs-app-router-expert react-performance-optimizer form-validation-architect data-viz-2025 mobile-ux-optimizer pwa-expert"
G_ux="web-design-expert design-critic design-system-creator design-system-generator design-system-documenter typography-expert color-contrast-auditor design-accessibility-auditor ux-friction-analyzer product-appeal-analyzer"
G_seo="seo-visibility-expert ultimate-seo-geo-skill competitive-cartographer"
G_docs="technical-writer diagramming-expert mermaid-graph-writer mermaid-graph-renderer email-composer"
G_ai="ai-engineer prompt-engineer mcp-creator llm-router very-long-text-summarization"
ALL_GROUPS="meta backend devops qa frontend ux seo docs ai"

# --- Args --------------------------------------------------------------------
SELECT=()
TARGET=""
MODE="install"
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --group)      g="${2:?--group needs a name}"; v="G_$g"; SELECT+=("${!v:-}"); shift 2 ;;
    --group=*)    g="${1#*=}";                    v="G_$g"; SELECT+=("${!v:-}"); shift ;;
    --into-repo)  TARGET="$REPO_ROOT/.claude/skills"; shift ;;
    --path)       TARGET="$2"; shift 2 ;;
    --uninstall)  MODE="uninstall"; shift ;;
    --force|-f)   FORCE=1; shift ;;
    --list)
      echo "Available groups:"; for g in $ALL_GROUPS; do v="G_$g"; n=$(echo ${!v} | wc -w); printf "  %-9s %2d skills\n" "$g" "$n"; done
      echo "  all       $(echo $G_meta $G_backend $G_devops $G_qa $G_frontend $G_ux $G_seo $G_docs $G_ai | wc -w) skills"
      exit 0 ;;
    -h|--help)    sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ${#SELECT[@]} -eq 0 ]]; then
  for g in $ALL_GROUPS; do v="G_$g"; SELECT+=("${!v}"); done
fi
# shellcheck disable=SC2206
SKILLS=( $(printf '%s\n' "${SELECT[@]}" | tr ' ' '\n' | sed '/^$/d' | sort -u) )

if [[ -z "$TARGET" ]]; then TARGET="$HOME/.claude/skills"; fi

echo "Manto Moda — Claude Skills"
echo "  target : $TARGET"
echo "  skills : ${#SKILLS[@]}"
echo "  mode   : $MODE"
echo

# --- Resolve a source tree ---------------------------------------------------
SRC=""
if [[ -d "$HOME/claude-skills/library" ]]; then
  SRC="$HOME/claude-skills/library"
  echo "→ using local library: $SRC"
else
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "→ cloning upstream (shallow)…"
  git clone --depth 1 --quiet "$UPSTREAM" "$TMP/upstream"
  SRC="$TMP/upstream/.claude/skills"
fi

# --- Uninstall ---------------------------------------------------------------
if [[ "$MODE" == "uninstall" ]]; then
  for s in "${SKILLS[@]}"; do
    if [[ -d "$TARGET/$s" ]]; then rm -rf "$TARGET/$s"; echo "  ✗ removed $s"; fi
  done
  echo; echo "Done. Removed from $TARGET"
  exit 0
fi

# --- Install -----------------------------------------------------------------
mkdir -p "$TARGET"
ok=0; skip=0; fail=0
for s in "${SKILLS[@]}"; do
  if [[ ! -d "$SRC/$s" ]]; then echo "  ? not found upstream: $s"; fail=$((fail+1)); continue; fi
  if [[ -d "$TARGET/$s" && $FORCE -eq 0 ]]; then skip=$((skip+1)); continue; fi
  rm -rf "$TARGET/$s"
  cp -a "$SRC/$s" "$TARGET/$s"
  ok=$((ok+1))
done

echo
echo "✓ installed : $ok"
[[ $skip -gt 0 ]] && echo "= already present (use --force) : $skip"
[[ $fail -gt 0 ]] && echo "✗ missing upstream : $fail"
echo

# --- Validate ----------------------------------------------------------------
bad=0
for s in "${SKILLS[@]}"; do
  [[ -f "$TARGET/$s/SKILL.md" ]] || { echo "  ⚠ $s has no SKILL.md"; bad=$((bad+1)); }
done
[[ $bad -eq 0 ]] && echo "All ${#SKILLS[@]} skills validated (SKILL.md present)."

if [[ "$TARGET" == "$HOME/.claude/skills" ]]; then
  cat <<'EOF'

Next steps:
  • Claude Code picks these up automatically — restart your session.
  • Docs: SKILLS.md maps every skill to a roadmap phase and agent role.
  • Trim the set any time:  bash scripts/install-claude-skills.sh --group qa --group ux
EOF
else
  echo
  echo "Skills committed inside the repo at: $TARGET"
  echo "Team members get them on clone — no extra setup needed."
fi
