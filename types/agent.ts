export interface Agent {
  agentId:            string
  name:               string
  description:        string
  icon:               string    // emoji, e.g. "🧑‍💻"
  color:              string    // hex, e.g. "#3cd7ff"
  systemPrompt:       string
  orchestratorModel:  string    // e.g. "gpt-5"
  workerModel:        string    // e.g. "gpt-5-mini"
  orchestratorPolicy: 'auto' | 'always' | 'never'
  isBuiltin:          boolean   // true = cannot be deleted
  createdAt:          string
  updatedAt:          string
}

// Mirrors lib/codexModels.ts — kept here so type-level forms (Agent editor,
// agent defaults) and the header model picker stay in sync. Only Codex-supported
// models are valid: Hermes routes via the chatgpt.com/backend-api/codex endpoint,
// so non-Codex selections (gpt-4o, o-series, etc.) fail at the agent layer.
export const MODEL_OPTIONS = [
  { value: 'gpt-5.4',              label: 'GPT-5.4 (Codex)'        },
  { value: 'gpt-5.4-mini',         label: 'GPT-5.4 Mini (Codex)'   },
  { value: 'gpt-5.5',              label: 'GPT-5.5 (Codex)'        },
  { value: 'gpt-5.5-mini',         label: 'GPT-5.5 Mini (Codex)'   },
  { value: 'gpt-5.3-codex',        label: 'GPT-5.3 Codex'          },
  { value: 'gpt-5.2-codex',        label: 'GPT-5.2 Codex'          },
  { value: 'gpt-5.1-codex-max',    label: 'GPT-5.1 Codex Max'      },
  { value: 'gpt-5.1-codex-mini',   label: 'GPT-5.1 Codex Mini'     },
] as const

export const POLICY_OPTIONS = [
  { value: 'auto',   label: 'Auto',   description: 'Classifier decides' },
  { value: 'always', label: 'Always', description: 'Always orchestrate' },
  { value: 'never',  label: 'Never',  description: 'Direct single call' },
] as const

export const BUILTIN_AGENTS: Omit<Agent, 'createdAt' | 'updatedAt'>[] = [
  {
    agentId:            'general',
    name:               'General',
    description:        'All-purpose assistant',
    icon:               '✨',
    color:              '#3cd7ff',
    systemPrompt:       '',
    orchestratorModel:  'gpt-5.4',
    workerModel:        'gpt-5.4',   // same model — general tasks don't benefit from splitting
    orchestratorPolicy: 'never',     // skip orchestration overhead for simple chat
    isBuiltin:          true,
  },
  {
    agentId:            'coding',
    name:               'Coding',
    description:        'Senior engineer – clean diffs, test coverage',
    icon:               '💻',
    color:              '#4ade80',
    systemPrompt:       'You are a senior software engineer. Prefer minimal targeted edits over rewrites. Always consider test coverage and backward compatibility.',
    orchestratorModel:  'gpt-5.4',       // planner uses the full model
    workerModel:        'gpt-5.4-mini',  // execution steps use mini
    orchestratorPolicy: 'auto',
    isBuiltin:          true,
  },
  {
    agentId:            'marketing',
    name:               'Marketing',
    description:        'Brand strategist – audience-first copy',
    icon:               '📢',
    color:              '#f97316',
    systemPrompt:       'You are a brand strategist. Write audience-first, conversion-oriented copy. Keep it concise and punchy.',
    orchestratorModel:  'gpt-5.4',
    workerModel:        'gpt-5.4-mini',
    orchestratorPolicy: 'auto',
    isBuiltin:          true,
  },
  {
    agentId:            'research',
    name:               'Deep Research',
    description:        'Multi-source synthesis with citations',
    icon:               '🔬',
    color:              '#a78bfa',
    systemPrompt:       'You are a research analyst. Synthesize multiple sources, include inline citations, and flag uncertainty or conflicting evidence.',
    orchestratorModel:  'gpt-5.4',       // research always uses full model for plan + synthesis
    workerModel:        'gpt-5.4-mini',  // individual search/retrieve steps use mini
    orchestratorPolicy: 'always',
    isBuiltin:          true,
  },
]
