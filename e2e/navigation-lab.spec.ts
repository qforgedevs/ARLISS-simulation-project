import { expect, test } from '@playwright/test';

const workerStub = `
class ArlissWorkerStub {
  constructor() { this.onmessage = null; this.onerror = null; this.terminated = false; }
  postMessage(request) {
    setTimeout(() => {
      if (this.terminated) return;
      const base = { protocol: 1, requestId: request.requestId };
      if (request.type === 'initialize') return this.emit({ ...base, type: 'ready' });
      if (request.type === 'loadController') {
        if (request.source.includes('syntax-error')) return this.emit({ ...base, type: 'error', phase: 'load', error: { name: 'SyntaxError', message: 'invalid syntax' } });
        this.runtimeError = request.source.includes('runtime-error');
        this.timeout = request.source.includes('timeout-controller');
        this.reportEstimate = request.source.includes('estimate-controller');
        return this.emit({ ...base, type: 'controllerLoaded' });
      }
      if (request.type === 'getCommand') {
        if (this.timeout) return;
        if (this.runtimeError) return this.emit({ ...base, type: 'error', phase: 'execute', error: { name: 'ValueError', message: 'controller exploded' } });
        const steering = Math.max(-0.8, Math.min(0.8, -request.readings.compass.headingRad + 0.66));
        const estimates = this.reportEstimate ? [{ latitudeDeg: request.readings.gps.latitudeDeg, longitudeDeg: request.readings.gps.longitudeDeg, headingRad: request.readings.compass.headingRad, label: 'dead reckoning' }] : [];
        return this.emit({ ...base, type: 'command', command: { left: 0.55 - steering * 0.5, right: 0.55 + steering * 0.5 }, estimates });
      }
    }, 0);
  }
  terminate() { this.terminated = true; }
  emit(data) { if (this.onmessage) this.onmessage({ data }); }
}
Object.defineProperty(window, 'Worker', { configurable: true, value: ArlissWorkerStub });
`;

test.describe('UI lifecycle with a controlled worker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(workerStub);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Rover Navigation Lab' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  });

  test('steps, pauses, resumes, stops, and resets a simulation', async ({ page }) => {
    await page.getByRole('button', { name: 'Step' }).click();
    await expect(page.getByLabel('Telemetry').getByText('0.02 s')).toBeVisible();
    await expect(page.getByLabel('Replay tick')).toHaveValue('1');
    await expect(page.getByLabel('Run summary').getByText('Recorded samples')).toBeVisible();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByLabel('Run result').getByText(/stopped by user/i)).toBeVisible();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(
      page.getByLabel('Run result').getByText('Ready to run your navigation algorithm.'),
    ).toBeVisible();
  });

  test('runs a controlled worker command stream to the target', async ({ page }) => {
    await page.getByLabel('Simulation speed').selectOption('4');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByLabel('Run result').getByText(/target reached/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('switches between the 2D and basic 3D visualization', async ({ page }) => {
    await page.getByRole('button', { name: '3D' }).click();
    await expect(
      page.getByRole('img', { name: 'Three-dimensional rover navigation view' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '2D' }).click();
    await expect(page.getByRole('img', { name: 'Rover navigation map' })).toBeVisible();
  });

  test('opens the sensor API reference and returns to the lab', async ({ page }) => {
    await page.getByRole('button', { name: 'Sensor API' }).click();
    await expect(page.getByRole('heading', { name: 'Robot sensor and mission API' })).toBeVisible();
    await expect(page.getByText('readings.gps.latitude_deg')).toBeVisible();
    await expect(page.getByText('MotorCommand(left, right)', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Return to lab' }).click();
    await expect(page.getByRole('heading', { name: 'Python navigation algorithm' })).toBeVisible();
  });

  test('selects and tunes a deterministic sensor scenario', async ({ page }) => {
    await page.getByLabel('Sensor scenario profile').selectOption('noisy-gps');
    await expect(
      page.getByText('Slower GPS with bias/noise plus modest compass and encoder imperfections.'),
    ).toBeVisible();
    await page.getByText('Tune raw sensor model').click();
    await page.getByLabel('Replay seed').fill('77');
    await expect(page.getByLabel('Sensor scenario profile')).toHaveValue('custom');
  });

  test('runs, replays, and cancels sequential Monte Carlo trials', async ({ page }) => {
    await page.getByLabel('Batch trial count').fill('1');
    await page.getByRole('button', { name: 'Run batch' }).click();
    await expect(page.getByLabel('Batch progress').getByText('1 / 1 trials')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Batch summary').getByText('Success rate')).toBeVisible();
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByLabel('Replay tick')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Batch trial count').fill('20');
    await page.getByRole('button', { name: 'Run batch' }).click();
    await expect(page.getByRole('button', { name: 'Cancel batch' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel batch' }).click();
    await expect(page.getByText('cancelled', { exact: true })).toBeVisible();
  });

  test('loads a fixed mission benchmark and compares its completed batch', async ({ page }) => {
    await page.getByLabel('Mission benchmark', { exact: true }).selectOption('open-desert');
    await expect(page.locator('.benchmark-config strong')).toHaveText('Open desert qualification');
    await expect(page.getByText(/Fixed route.*5 trials.*4100/i)).toBeVisible();

    await replaceEditorSource(page, '# syntax-error');
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    await expect(page.getByLabel('Batch progress').getByText('5 / 5 trials')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Benchmark results')).toContainText('Open desert qualification');
    await expect(page.getByLabel('Benchmark results')).toContainText('0.0');
    await expect(page.getByLabel('Benchmark results')).toContainText('5');
  });

  test('retains labelled benchmark rows, compares them, and replays a selected row', async ({
    page,
  }) => {
    await replaceEditorSource(page, '# syntax-error');
    const dashboard = page.locator('.dashboard');
    await page.getByLabel('Algorithm label').fill('Open desert controller');
    await page.getByLabel('Mission benchmark', { exact: true }).selectOption('open-desert');
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    await expect(dashboard.getByRole('cell', { name: 'Open desert controller' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel('Algorithm label').fill('Noisy GPS controller');
    await page.getByLabel('Mission benchmark', { exact: true }).selectOption('noisy-gps-crossing');
    await page.getByRole('button', { name: 'Run benchmark' }).click();
    await expect(dashboard.getByRole('cell', { name: 'Noisy GPS controller' })).toBeVisible({
      timeout: 15_000,
    });

    const options = dashboard.locator('select[aria-label="First comparison run"] option');
    await page
      .getByLabel('First comparison run')
      .selectOption(await options.nth(1).getAttribute('value'));
    await page
      .getByLabel('Second comparison run')
      .selectOption(await options.nth(2).getAttribute('value'));
    await expect(page.getByLabel('Run comparison')).toContainText('Open desert controller');
    await expect(page.getByLabel('Result trend')).toBeVisible();

    await dashboard.getByRole('button', { name: 'Replay first trial' }).first().click();
    await expect(page.locator('.benchmark-config strong')).toHaveText('Open desert qualification');
    await expect(page.getByLabel('Batch progress').getByText('5 / 5 trials')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('runs a complete deterministic benchmark suite and shows its report card', async ({
    page,
  }) => {
    await replaceEditorSource(page, '# syntax-error');
    await page.getByRole('button', { name: 'Run full suite' }).click();
    const report = page.getByLabel('Benchmark suite report');
    await expect(report).toBeVisible({ timeout: 15_000 });
    await expect(report).toContainText('Overall score');
    await expect(report).toContainText('Open desert qualification');
    await expect(report).toContainText('Noisy GPS crossing');
    await expect(report).toContainText('Field sensor recovery');
    await expect(report).toContainText('Scheduled fault recovery');
    await expect(report).toContainText('0.0');
  });

  test('cancels an active benchmark suite', async ({ page }) => {
    await replaceEditorSource(page, '# timeout-controller');
    await page.getByRole('button', { name: 'Run full suite' }).click();
    await expect(page.getByRole('button', { name: 'Cancel suite' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel suite' }).click();
    await expect(page.getByRole('region', { name: 'Benchmark suite' })).toContainText('cancelled');
  });

  test('records student pose estimates without exposing truth to the controller', async ({
    page,
  }) => {
    await replaceEditorSource(page, '# estimate-controller');
    await page.getByRole('button', { name: 'Step' }).click();
    await expect(page.getByLabel('Run summary').getByText('Estimate reports')).toBeVisible();
    await expect(page.getByLabel('Run summary')).toContainText('1');
    await expect(page.getByText(/0\.0 m.*0\.0° error/)).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Estimated position error (fault-aware) chart' }),
    ).toBeVisible();
  });

  test('shows syntax, runtime, and timeout controller outcomes', async ({ page }) => {
    await replaceEditorSource(page, '# syntax-error');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(
      page.getByLabel('Run result').getByText(/student code error.*invalid syntax/i),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();
    await replaceEditorSource(page, '# runtime-error');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(
      page.getByLabel('Run result').getByText(/student code error.*controller exploded/i),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Reset' }).click();
    await replaceEditorSource(page, '# timeout-controller');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByLabel('Run result').getByText(/student code timeout/i)).toBeVisible();
  });
});

async function replaceEditorSource(page: import('@playwright/test').Page, source: string) {
  await page.getByRole('textbox', { name: 'Editor content' }).focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(source);
}

test('loads Pyodide in a dedicated worker and executes the student scaffold', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  await replaceEditorSource(
    page,
    'def update(readings): report_estimate(readings.gps.latitude_deg, readings.gps.longitude_deg, readings.compass.heading_rad, "raw-sensor estimate"); return MotorCommand(0.0, 0.0)',
  );
  await page.getByRole('button', { name: 'Step' }).click();
  await expect(page.getByLabel('Raw sensor readings').getByText('0.02 s')).toBeVisible();
  await expect(page.getByLabel('Run summary')).toContainText('Estimate reports');
  await expect(page.getByLabel('Run summary')).toContainText('1');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  await replaceEditorSource(
    page,
    'def update(readings): report_estimate(91, readings.gps.longitude_deg, readings.compass.heading_rad); return MotorCommand(0.0, 0.0)',
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByLabel('Run result')).toContainText('student code error');
  await expect(page.getByLabel('Run result')).toContainText('outside their valid ranges');
});
