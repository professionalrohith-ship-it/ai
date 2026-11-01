import type { SuggestedPromptData } from '../types/chat'

/** Generic starter questions. They are only prompts: the answers always come from the backend. */
export const SUGGESTED_PROMPTS: SuggestedPromptData[] = [
  { id: 'sp-architecture', icon: 'architecture', text: 'Explain the overall architecture of this repository.' },
  { id: 'sp-auth', icon: 'auth', text: 'How does authentication work?' },
  { id: 'sp-api', icon: 'api', text: 'Find the API endpoints defined in this project.' },
  { id: 'sp-problems', icon: 'problems', text: 'Identify potential problems in this project.' },
  { id: 'sp-database', icon: 'database', text: 'Explain how the database connection works.' },
  { id: 'sp-overview', icon: 'overview', text: 'Give me an overview of this project and its important files.' },
]

/** Error codes for which the backend stored nothing, so the question can safely go back into the composer. */
export const NOT_STORED_CODES = new Set(['ai_not_configured', 'scan_required', 'backend_unreachable', 'invalid_input', 'repository_not_found'])
