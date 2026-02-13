// Docker exec wrapper — runs commands inside the toolbox container
import { execFile } from 'node:child_process';
import { logger } from '@/lib/logger';
import type { ExecResult } from './types';

const log = logger.child({ module: 'executor' });

const TOOLBOX_CONTAINER = 'subcult-toolbox';
const MAX_STDOUT = 50 * 1024; // 50KB cap
const MAX_STDERR = 10 * 1024; // 10KB cap
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Execute a command inside the toolbox container via `docker exec`.
 * Output is capped to avoid flooding LLM context.
 */
export async function execInToolbox(
    command: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ExecResult> {
    return new Promise(resolve => {
        const args = [
            'exec',
            TOOLBOX_CONTAINER,
            'bash',
            '-c',
            command,
        ];

        const child = execFile('docker', args, {
            timeout: timeoutMs,
            maxBuffer: MAX_STDOUT + MAX_STDERR,
            encoding: 'utf8',
        }, (error, stdout, stderr) => {
            let timedOut = false;
            let exitCode = 0;

            if (error) {
                // node child_process sets killed=true on timeout
                if (error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_FINAL_CLOSE') {
                    timedOut = true;
                }
                exitCode = (error as NodeJS.ErrnoException & { code?: number | string }).code
                    ? typeof (error as unknown as { code: number }).code === 'number'
                        ? (error as unknown as { code: number }).code
                        : 1
                    : 1;
                // execFile provides exit code in error.code for non-signal exits
                if ('status' in error && typeof (error as unknown as { status: number }).status === 'number') {
                    exitCode = (error as unknown as { status: number }).status;
                }
            }

            // Cap output
            const cappedStdout = stdout.length > MAX_STDOUT
                ? stdout.slice(0, MAX_STDOUT) + '\n... [output truncated at 50KB]'
                : stdout;
            const cappedStderr = stderr.length > MAX_STDERR
                ? stderr.slice(0, MAX_STDERR) + '\n... [stderr truncated at 10KB]'
                : stderr;

            if (timedOut) {
                log.warn('Toolbox exec timed out', { command: command.slice(0, 200), timeoutMs });
            }

            resolve({
                stdout: cappedStdout,
                stderr: cappedStderr,
                exitCode,
                timedOut,
            });
        });

        // Additional safety: kill if process handle exists
        child.on('error', err => {
            log.error('Toolbox exec error', { error: err, command: command.slice(0, 200) });
            resolve({
                stdout: '',
                stderr: `exec error: ${err.message}`,
                exitCode: 1,
                timedOut: false,
            });
        });
    });
}
