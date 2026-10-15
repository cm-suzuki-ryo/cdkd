import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetEmbedConfig } from 'cdk-local';
import { buildContainerImage } from 'cdk-local/internal';
import { createLocalCommand } from '../../../src/cli/commands/local-invoke.js';
import {
  releaseStdoutForPayload,
  reserveStdoutForPayload,
} from '../../../src/utils/logger.js';

// go-to-k/cdkd#2429: a line cdk-local logs from INSIDE its own bundle (here
// `buildContainerImage`'s `--no-build` progress line, the same `logger.info`
// path as `Building container image ...`) must honor cdkd's stdout
// reservation once `createLocalCommand` has installed cdkd's logger into the
// embed config. Nothing at the shim boundary is mocked: the line is produced
// by cdk-local's own logger module.
describe("cdk-local's own log lines under cdkd's stdout reservation", () => {
  afterEach(() => {
    releaseStdoutForPayload();
    resetEmbedConfig();
    vi.restoreAllMocks();
  });

  it('never writes a cdk-local progress line to stdout while the payload owns it', async () => {
    createLocalCommand();
    reserveStdoutForPayload();
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const cdkOut = mkdtempSync(join(tmpdir(), 'cdkd-2429-'));
    // `--no-build` logs its progress line and then looks the tag up; the
    // lookup's outcome (no Docker on the host, or no such image) is not under
    // test.
    await buildContainerImage({ source: { directory: 'asset.x' } } as never, cdkOut, {
      architecture: 'x86_64',
      noBuild: true,
    }).catch(() => undefined);

    const stderrLines = err.mock.calls.map((c) => String(c[0]));
    expect(stderrLines.some((l) => l.includes('Skipping docker build (--no-build)'))).toBe(true);
    expect(info).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(out.mock.calls.map((c) => String(c[0])).join('')).not.toContain('Skipping docker build');
  });
});
