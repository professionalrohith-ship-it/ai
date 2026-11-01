/** What the backend does during an investigation (informational: it reports no live progress). */
export const INVESTIGATION_STEPS = [
  'Reading the error message and stack trace',
  'Mapping stack frames to files in the repository index',
  'Searching symbols and source code for related locations',
  'Asking the configured AI model to analyse the evidence (when a provider is set up)',
]

export const NO_CODE_CHANGED_NOTE = 'No code was modified. Findings are leads to verify, not confirmed bugs or applied fixes.'
