/**
 * VedaMD DHIS2 app — no build step, no framework.
 *
 * Why an app and not a program rule: DHIS2 program rule actions cannot
 * make HTTP requests (none of the action types reaches the network), and
 * program-notification webhooks are fire-and-forget, so their response
 * never reaches the form. Point-of-care decision support in DHIS2 has to
 * run as an app.
 *
 * Every piece of card text is written with textContent, never innerHTML:
 * card content arrives from a network service and must not be able to
 * inject markup into a page that holds a DHIS2 session.
 */

import { buildContext, EXAMPLE_MAPPING, validateMapping } from './mapping.js';
import { evaluate } from './vedamd.js';

const NAMESPACE = 'vedamd';
const CONFIG_KEY = 'config';

const $ = (id) => document.getElementById(id);

let apiBase = '';
let config = null;

init().catch((err) => showStatus(`Could not start: ${err.message}`, true));

async function init() {
  // DHIS2 rewrites activities.dhis.href from "*" to the server URL on install.
  const manifest = await (await fetch('manifest.webapp')).json();
  const href = manifest?.activities?.dhis?.href;
  apiBase = `${href && href !== '*' ? href.replace(/\/+$/, '') : '../../..'}/api`;

  $('check-form').addEventListener('submit', onCheck);
  $('settings-form').addEventListener('submit', onSaveSettings);
  $('toggle-settings').addEventListener('click', () => showSection('settings'));
  $('load-example').addEventListener('click', () => {
    $('mapping').value = JSON.stringify(EXAMPLE_MAPPING, null, 2);
  });

  config = await loadConfig();
  if (config) {
    fillSettingsForm(config);
    showSection('check');
  } else {
    showStatus('VedaMD is not configured on this instance yet. An administrator must save the settings below.');
    showSection('settings');
  }
}

function showSection(name) {
  $('check').hidden = name !== 'check';
  $('settings').hidden = name !== 'settings';
  $('toggle-settings').textContent = name === 'settings' ? 'Back to safety check' : 'Settings';
  $('toggle-settings').onclick = () => showSection(name === 'settings' && config ? 'check' : 'settings');
}

function showStatus(message, isError = false) {
  const el = $('status');
  el.replaceChildren();
  if (!message) return;
  const box = document.createElement('div');
  box.className = isError ? 'notice error' : 'notice';
  box.textContent = message;
  el.append(box);
}

async function dhis2(path, init = {}) {
  return fetch(`${apiBase}${path}`, {
    credentials: 'include',
    ...init,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) },
  });
}

async function loadConfig() {
  const res = await dhis2(`/dataStore/${NAMESPACE}/${CONFIG_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`dataStore returned HTTP ${res.status}`);
  return res.json();
}

function fillSettingsForm(cfg) {
  $('bridgeUrl').value = cfg.bridgeUrl ?? '';
  $('service').value = cfg.service ?? 'vedamd-patient-view';
  $('mapping').value = JSON.stringify(cfg.mapping ?? [], null, 2);
}

async function onSaveSettings(event) {
  event.preventDefault();
  const errors = $('settings-errors');
  errors.replaceChildren();

  let mapping;
  try {
    mapping = JSON.parse($('mapping').value);
  } catch {
    return listProblems(errors, ['Mapping is not valid JSON.']);
  }
  const problems = validateMapping(mapping);
  if (problems.length > 0) return listProblems(errors, problems);

  const next = {
    bridgeUrl: $('bridgeUrl').value.trim().replace(/\/+$/, ''),
    service: $('service').value.trim(),
    mapping,
  };

  const body = JSON.stringify(next);
  const headers = { 'Content-Type': 'application/json' };
  // PUT updates an existing key; POST creates it the first time.
  let res = await dhis2(`/dataStore/${NAMESPACE}/${CONFIG_KEY}`, { method: 'PUT', headers, body });
  if (res.status === 404) {
    res = await dhis2(`/dataStore/${NAMESPACE}/${CONFIG_KEY}`, { method: 'POST', headers, body });
  }
  if (!res.ok) {
    return listProblems(errors, [
      res.status === 403
        ? 'You do not have permission to change VedaMD settings on this instance.'
        : `Saving failed with HTTP ${res.status}.`,
    ]);
  }

  config = next;
  showStatus('Settings saved.');
  showSection('check');
}

function listProblems(container, problems) {
  const list = document.createElement('ul');
  list.className = 'notice error';
  for (const problem of problems) {
    const item = document.createElement('li');
    item.textContent = problem;
    list.append(item);
  }
  container.replaceChildren(list);
}

async function onCheck(event) {
  event.preventDefault();
  const results = $('results');
  results.replaceChildren();
  showStatus('');

  const problems = validateMapping(config?.mapping);
  if (problems.length > 0) {
    showStatus('The saved mapping is invalid — fix it in Settings before running a check.', true);
    return;
  }

  const uid = $('te').value.trim();
  const button = event.submitter ?? $('check-form').querySelector('button');
  button.disabled = true;
  showStatus('Checking…');

  try {
    const fields = 'attributes[attribute,value],enrollments[events[dataValues[dataElement,value]]]';
    const res = await dhis2(
      `/tracker/trackedEntities/${encodeURIComponent(uid)}?fields=${encodeURIComponent(fields)}`,
    );
    if (res.status === 404) throw new Error('No tracked entity with that uid is visible to you.');
    if (!res.ok) throw new Error(`DHIS2 returned HTTP ${res.status}.`);
    const trackedEntity = await res.json();

    const dataValues = (trackedEntity.enrollments ?? [])
      .flatMap((enrollment) => enrollment.events ?? [])
      .flatMap((ev) => ev.dataValues ?? []);

    const { context, unmapped } = buildContext({
      attributes: trackedEntity.attributes ?? [],
      dataValues,
      mapping: config.mapping,
    });

    const cards = await evaluate({ bridgeUrl: config.bridgeUrl, service: config.service, context });
    showStatus('');
    renderCards(results, cards, context, unmapped);
  } catch (err) {
    showStatus(`Could not complete the check: ${err.message}`, true);
  } finally {
    button.disabled = false;
  }
}

function renderCards(container, cards, context, unmapped) {
  if (cards.length === 0) {
    const none = document.createElement('div');
    none.className = 'notice';
    none.textContent =
      Object.keys(context).length === 0
        ? 'No mapped data was found on this record, so there was nothing to check.'
        : 'VedaMD returned no findings for the data it was given.';
    container.append(none);
  }

  const order = { critical: 0, warning: 1, info: 2 };
  for (const card of [...cards].sort((a, b) => (order[a.indicator] ?? 2) - (order[b.indicator] ?? 2))) {
    const el = document.createElement('article');
    el.className = `card ${['critical', 'warning'].includes(card.indicator) ? card.indicator : 'info'}`;

    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.textContent = card.summary ?? '';
    el.append(summary);

    if (card.detail) {
      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = card.detail;
      el.append(detail);
    }
    if (card.source?.label) {
      const source = document.createElement('div');
      source.className = 'source';
      source.textContent = card.source.label;
      el.append(source);
    }
    const review = card.extension?.['http://vedamd.io/Card/recommendation']?.reviewStatus;
    if (review && review !== 'approved') {
      const badge = document.createElement('div');
      badge.className = 'review';
      badge.textContent = `Content status: ${String(review).toUpperCase()}`;
      el.append(badge);
    }
    container.append(el);
  }

  if (unmapped.length > 0) {
    const details = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = `${unmapped.length} data element(s) on this record are not mapped`;
    const text = document.createElement('p');
    text.className = 'hint';
    text.textContent = `VedaMD never saw these values. Add them in Settings if they matter clinically: ${unmapped.join(', ')}`;
    details.append(label, text);
    container.append(details);
  }
}
