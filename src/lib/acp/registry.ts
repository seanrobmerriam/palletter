/**
 * One agent process per profile for the server's lifetime. Each palette request opens its own
 * session on it. A process that exits is started again on the next request.
 */
import { agentProfiles, defaultAgentId, type AgentId, type AgentProfile, type Env } from './agents';
import { AgentProcess } from './process';

const processes = new Map<AgentId, AgentProcess>();
let envLoaded = false;

/** The server's environment, with `.env` loaded when the runtime hasn't done it already. */
export function serverEnv(): Env {
  if (!envLoaded) {
    envLoaded = true;
    try {
      // Bun loads .env itself; Node (e.g. `astro dev`) needs this. Existing variables win.
      (process as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.('.env');
    } catch {
      // No .env file.
    }
  }
  return process.env;
}

export function listProfiles(env: Env = serverEnv()): { profiles: AgentProfile[]; defaultId: AgentId } {
  return { profiles: agentProfiles(env), defaultId: defaultAgentId(env) };
}

export function getProfile(id: AgentId | undefined, env: Env = serverEnv()): AgentProfile {
  const { profiles, defaultId } = listProfiles(env);
  return profiles.find((p) => p.id === (id ?? defaultId))!;
}

/** The running process for a profile, starting a new one if the configuration changed. */
export function getAgentProcess(profile: AgentProfile): AgentProcess {
  const existing = processes.get(profile.id);
  if (existing && JSON.stringify(existing.profile) === JSON.stringify(profile)) return existing;
  existing?.stop();
  const created = new AgentProcess(profile);
  processes.set(profile.id, created);
  return created;
}

export function stopAllAgents(): void {
  for (const p of processes.values()) p.stop();
  processes.clear();
}
