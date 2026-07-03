# Bean body is the agent prompt

The agent prompt is `<persona>\n\n---\n\n# Bean <id>\n\n<bean body>`. The full bean body — raw markdown, no section extraction — is inlined after the persona. The agent is expected to read and interpret it.

Rationale: earlier versions shipped only the bean _id_ and told the agent to `beans show <bean-id>` itself. That requires the bean CLI on PATH inside the agent's pane, a round-trip per spawn, and an implicit assumption the agent will actually run the command. Inlining the body removes the dependency and the round-trip; the agent has its brief in the opening prompt. Section extraction was rejected because it duplicates the bean's own structure into hordr and breaks when a bean type's shape changes. The body is authoritative; hordr passes it through verbatim.

The persona (from `config.agents.<role>.persona` or, when an Agent Companies package is active, from `agents/<role>/AGENTS.md`) is the ONLY place hordr injects domain knowledge — how to commit, whether to open a PR, what "done" means. Hordr itself stays domain-agnostic.
