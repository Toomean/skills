PYTHON ?= python3
PNPM ?= pnpm
SKILL ?= all
PROVIDER ?= all

.PHONY: check check-structure check-functional check-package setup-cli install status verify uninstall

check: check-structure check-functional check-package

check-structure:
	$(PYTHON) check-repo.py

check-functional:
	PYTHONDONTWRITEBYTECODE=1 $(PYTHON) earned-done/checks/git-guardrails-check.py

setup-cli:
	$(PNPM) --dir cli install --frozen-lockfile

check-package:
	@set -eu; \
	  scratch="$$(mktemp -d /tmp/toomean-skills-check.XXXXXX)"; \
	  node cli/check.mjs prepare "$$scratch"; \
	  node "$$scratch/package/bin/toomean-skills.js" list --json >"$$scratch/list-smoke.json"; \
	  CLAUDE_SKILLS_DIR="$$scratch/dry-run-targets/claude/skills" \
	    CODEX_SKILLS_DIR="$$scratch/dry-run-targets/codex/skills" \
	    node "$$scratch/package/bin/toomean-skills.js" install all --provider all --dry-run --json \
	    >"$$scratch/dry-run-smoke.json"; \
	  node cli/check.mjs smoke "$$scratch"; \
	  $(PNPM) --dir "$$scratch/package" pack --dry-run --json --skip-manifest-obfuscation >/dev/null; \
	  $(PNPM) --dir "$$scratch/package" pack --pack-destination "$$scratch/archive" --skip-manifest-obfuscation >/dev/null; \
	  node cli/check.mjs verify "$$scratch"

install:
	$(PYTHON) manage-skills.py install $(SKILL) $(PROVIDER)

status:
	$(PYTHON) manage-skills.py status $(SKILL) $(PROVIDER)

verify:
	$(PYTHON) manage-skills.py verify $(SKILL) $(PROVIDER)

uninstall:
	$(PYTHON) manage-skills.py uninstall $(SKILL) $(PROVIDER)
