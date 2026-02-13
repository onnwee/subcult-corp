// Projects — CRUD for collaborative multi-agent workspaces
// Each project maps to /workspace/projects/{slug}/ in the toolbox container.

import { sql, jsonb } from '@/lib/db';
import { execInToolbox } from '@/lib/tools/executor';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'projects' });

export type ProjectStatus = 'proposed' | 'active' | 'paused' | 'completed' | 'abandoned';

export interface Project {
    id: string;
    slug: string;
    title: string;
    description?: string;
    status: ProjectStatus;
    lead_agent: string;
    participants: string[];
    prime_directive?: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface CreateProjectInput {
    slug: string;
    title: string;
    description?: string;
    lead_agent: string;
    participants?: string[];
    prime_directive?: string;
}

/**
 * Create a new project.
 * Also initializes the workspace directory structure in the toolbox.
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
    const [row] = await sql<[Project]>`
        INSERT INTO ops_projects (slug, title, description, lead_agent, participants, prime_directive)
        VALUES (
            ${input.slug},
            ${input.title},
            ${input.description ?? null},
            ${input.lead_agent},
            ${input.participants ?? []},
            ${input.prime_directive ?? null}
        )
        RETURNING *
    `;

    // Initialize workspace directory
    try {
        await execInToolbox(
            `mkdir -p /workspace/projects/${input.slug}/{src,docs} && ` +
            `echo '# ${input.title}\\n\\n${input.description ?? ""}' > /workspace/projects/${input.slug}/README.md && ` +
            `echo '${JSON.stringify({ project_id: row.id, slug: input.slug, status: 'active', lead: input.lead_agent, created_at: row.created_at })}' > /workspace/projects/${input.slug}/.status.json`,
            10_000,
        );
    } catch (err) {
        log.error('Failed to init project workspace', { error: err, slug: input.slug });
    }

    // Update project registry
    try {
        await updateProjectRegistry();
    } catch (err) {
        log.error('Failed to update project registry', { error: err });
    }

    return row;
}

/**
 * Get a project by slug.
 */
export async function getProject(slug: string): Promise<Project | null> {
    const [row] = await sql<[Project?]>`
        SELECT * FROM ops_projects WHERE slug = ${slug}
    `;
    return row ?? null;
}

/**
 * Get a project by ID.
 */
export async function getProjectById(id: string): Promise<Project | null> {
    const [row] = await sql<[Project?]>`
        SELECT * FROM ops_projects WHERE id = ${id}
    `;
    return row ?? null;
}

/**
 * List all projects, optionally filtered by status.
 */
export async function listProjects(status?: ProjectStatus): Promise<Project[]> {
    if (status) {
        return sql<Project[]>`
            SELECT * FROM ops_projects WHERE status = ${status}
            ORDER BY updated_at DESC
        `;
    }
    return sql<Project[]>`
        SELECT * FROM ops_projects
        ORDER BY updated_at DESC
    `;
}

/**
 * Update a project's status or details.
 */
export async function updateProject(
    slug: string,
    updates: Partial<Pick<Project, 'title' | 'description' | 'status' | 'lead_agent' | 'participants' | 'prime_directive' | 'metadata'>>,
): Promise<Project | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) { fields.push('title'); values.push(updates.title); }
    if (updates.description !== undefined) { fields.push('description'); values.push(updates.description); }
    if (updates.status !== undefined) { fields.push('status'); values.push(updates.status); }
    if (updates.lead_agent !== undefined) { fields.push('lead_agent'); values.push(updates.lead_agent); }
    if (updates.participants !== undefined) { fields.push('participants'); values.push(updates.participants); }
    if (updates.prime_directive !== undefined) { fields.push('prime_directive'); values.push(updates.prime_directive); }

    if (fields.length === 0) return getProject(slug);

    // Build dynamic update using tagged template — simpler approach for few fields
    const [row] = await sql<[Project?]>`
        UPDATE ops_projects
        SET title = COALESCE(${updates.title ?? null}, title),
            description = COALESCE(${updates.description ?? null}, description),
            status = COALESCE(${updates.status ?? null}, status),
            lead_agent = COALESCE(${updates.lead_agent ?? null}, lead_agent),
            updated_at = NOW()
        WHERE slug = ${slug}
        RETURNING *
    `;

    if (row) {
        try { await updateProjectRegistry(); } catch { /* best-effort */ }
    }

    return row ?? null;
}

/**
 * Sync the project registry JSON file in the workspace.
 */
async function updateProjectRegistry(): Promise<void> {
    const projects = await sql<{ slug: string; title: string; status: string; lead_agent: string }[]>`
        SELECT slug, title, status, lead_agent FROM ops_projects
        WHERE status NOT IN ('abandoned')
        ORDER BY updated_at DESC
    `;

    const registry = JSON.stringify(projects, null, 2);
    const b64 = Buffer.from(registry).toString('base64');

    await execInToolbox(
        `echo '${b64}' | base64 -d > /workspace/shared/project-registry.json`,
        5_000,
    );
}
