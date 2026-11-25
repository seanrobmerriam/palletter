/** Every way generating a palette can fail, with a message written for the user. */
export type AgentErrorCode =
  | 'not_configured'
  | 'not_installed'
  | 'auth_required'
  | 'agent_error'
  | 'crashed'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response'
  | 'model_unavailable'
  | 'format';

export class AgentError extends Error {
  override name = 'AgentError';
  constructor(
    readonly code: AgentErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}
