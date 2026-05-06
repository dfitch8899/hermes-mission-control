/** Codex model names supported by the chatgpt.com/backend-api/codex endpoint.
 *  Kept in a separate lib file so it can be imported from both the API route
 *  and from UI components without triggering Next.js's "route exports must be
 *  HTTP verbs" constraint.
 */
export const CODEX_MODELS = [
  { value: 'gpt-5.4',            label: 'GPT-5.4',            description: 'Full model — best quality' },
  { value: 'gpt-5.4-mini',       label: 'GPT-5.4 Mini',       description: 'Faster & cheaper'          },
  { value: 'gpt-5.5',            label: 'GPT-5.5',            description: 'Latest full model'         },
  { value: 'gpt-5.5-mini',       label: 'GPT-5.5 Mini',       description: 'Latest mini model'         },
  { value: 'gpt-5.3-codex',      label: 'GPT-5.3 Codex',      description: 'Previous generation'       },
  { value: 'gpt-5.2-codex',      label: 'GPT-5.2 Codex',      description: 'Previous generation'       },
  { value: 'gpt-5.1-codex-max',  label: 'GPT-5.1 Codex Max',  description: 'Older — max context'       },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', description: 'Older — mini'              },
] as const

export type CodexModelValue = typeof CODEX_MODELS[number]['value']
