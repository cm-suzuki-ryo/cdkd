import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { getEmbedConfig, resetEmbedConfig } from 'cdk-local';
import { createLocalCommand } from '../../../src/cli/commands/local-invoke.js';
import { getLogger } from '../../../src/utils/logger.js';

// Verifies that building the `cdkd local` command tree installs cdkd's
// branding into cdk-local's process-wide embed-config, so the re-export
// shims (runtime-image / websocket-* / layer-arn-materializer / ...) render
// `cdkd local` / `cdkd-local-*` instead of cdk-local's `cdkl` defaults.
describe('cdkd local embed-config branding', () => {
  afterEach(() => {
    // The config is process-wide module state in cdk-local's bundle; restore
    // the defaults so this file does not leak cdkd branding into other tests.
    resetEmbedConfig();
  });

  it('falls back to cdk-local defaults before the local command tree is built', () => {
    resetEmbedConfig();
    const cfg = getEmbedConfig();
    expect(cfg.cliName).toBe('cdkl');
    expect(cfg.resourceNamePrefix).toBe('cdkl');
  });

  it('installs cdkd branding when createLocalCommand runs', () => {
    resetEmbedConfig();
    createLocalCommand();
    expect(getEmbedConfig()).toEqual({
      logger: expect.any(Object),
      cliName: 'cdkd local',
      binaryName: 'cdkd',
      productName: 'cdkd',
      resourceNamePrefix: 'cdkd-local',
      awsBindMountPath: '/cdkd-aws',
      envPrefix: 'CDKD',
      // cdkd follows cdk-local's SigV4 default: warn-and-pass on unverifiable
      // AWS_IAM SigV4, opt IN to fail-closed via `--strict-sigv4`. These two
      // fields tell the shimmed sigv4-verify warn messages to keep cdkd's
      // cliName / binaryName branding while referencing the upstream flag.
      sigV4StrictByDefault: false,
      sigV4OptFlag: '--strict-sigv4',
    });
  });

  it("routes cdk-local's own log lines through cdkd's logger (go-to-k/cdkd#2429)", () => {
    resetEmbedConfig();
    createLocalCommand();
    const host = getEmbedConfig().logger;
    expect(host).toBeDefined();
    const info = vi.spyOn(getLogger(), 'info').mockImplementation(() => undefined);
    const setLevel = vi.spyOn(getLogger(), 'setLevel');
    const before = getLogger().getLevel();
    try {
      host!.info('Building container image (platform=linux/amd64)...');
      expect(info).toHaveBeenCalledWith('Building container image (platform=linux/amd64)...');
      // cdk-local's `--verbose` level raise reaches cdkd's logger, and its level
      // reads come back from it.
      host!.setLevel('debug');
      expect(setLevel).toHaveBeenCalledWith('debug');
      expect(host!.getLevel()).toBe('debug');
    } finally {
      getLogger().setLevel(before);
      vi.restoreAllMocks();
    }
  });
});
