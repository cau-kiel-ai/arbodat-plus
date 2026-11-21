// Data import -----------------------------------------------------------------
/*
Merges an export file into this database in two steps (see ImportController):
  1. Preview: what would happen. The user resolves ambiguous matches (each change runs the preview
     again) and decides conflicts (keep the existing value or take the imported one).
  2. Import: sends the file again with the decisions and the fingerprint of the reviewed preview.
     If the data changed in between, nothing is imported and the new preview comes back (409).
*/

const importState = {
    file: null,
    plan: null,         // the last preview (PlanView)
    busy: false,
    previewRequest: 0,  // only the latest preview request may render
    decisions: emptyDecisions()
};

function emptyDecisions() {
    return {
        matches: {},
        conflicts: { defaultChoice: null, byType: {}, byTypeField: {}, byRecord: {}, byField: {} }
    };
}

// Names in the preview -----------------------------------------------------------

const IMPORT_TYPE_LABELS = {
    RESEARCH_PROJECT: ['research project', 'research projects'],
    SITE: ['site', 'sites'],
    FEATURE: ['feature', 'features'],
    SAMPLE: ['sample', 'samples'],
    FRACTION_ANALYZED: ['fraction analyzed', 'fractions analyzed'],
    ABSOLUTE_DATING: ['absolute dating', 'absolute datings'],
    C14_DATING: ['C14 dating', 'C14 datings'],
    DENDROCHRONOLOGICAL_DATING: ['dendro dating', 'dendro datings'],
    OTHER_DATING: ['other dating', 'other datings'],
    RESULT: ['result', 'results'],
    USER: ['person', 'people'],
    INSTITUTION: ['institution', 'institutions'],
    LITERATURE: ['literature', 'literature'],
    AUTHOR: ['author', 'authors'],
    LABORATORY: ['laboratory', 'laboratories'],
};

function typeLabel(type, plural = false) {
    const labels = IMPORT_TYPE_LABELS[type];
    if (labels) return labels[plural ? 1 : 0];
    return type.toLowerCase().replaceAll('_', ' '); // vocabulary
}

// "address.streetOrPlace" -> "address › street or place"
function fieldLabel(field) {
    return field.split('.')
        .map(part => part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase())
        .join(' › ');
}

function displayValue(value) {
    if (value === null || value === undefined) return '<span class="text-body-secondary">(empty)</span>';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    return escapeHtml(value);
}

// File and preview ---------------------------------------------------------------

document.getElementById('importFileInput').addEventListener('change', event => {
    importState.file = event.target.files[0] || null;
    importState.plan = null;
    importState.decisions = emptyDecisions();
    document.getElementById('importPreview').hidden = true;
    document.getElementById('importResult').hidden = true;
    document.getElementById('importPreviewButton').disabled = !importState.file;
});

function importForm(withFingerprint) {
    const decisions = withFingerprint
        ? { ...importState.decisions, planFingerprint: importState.plan.planFingerprint }
        : importState.decisions;
    const form = new FormData();
    form.append('file', importState.file);
    form.append('decisions', JSON.stringify(decisions));
    return form;
}

async function previewImport() {
    if (!importState.file || importState.busy) return;
    const request = ++importState.previewRequest;
    setImportBusy(true, importState.plan ? 'Updating the preview …' : 'Reading the file …');
    try {
        const response = await axios.post('api/data_import/preview', importForm(false));
        if (request !== importState.previewRequest) return;
        importState.plan = response.data;
        renderImportPreview();
    } catch (error) {
        if (request !== importState.previewRequest) return;
        handleImportError(error, 'Preview failed.');
    } finally {
        if (request === importState.previewRequest) setImportBusy(false);
    }
}

// A change of a match decision changes the plan: preview again (after a short pause, so that
// several quick clicks cause one request).
let previewTimer = null;
function previewAgainSoon() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(previewImport, 300);
}

function setImportBusy(busy, message = '') {
    importState.busy = busy;
    document.getElementById('importPreviewButton').disabled = busy || !importState.file;
    document.getElementById('importFileInput').disabled = busy;
    const commitButton = document.getElementById('importCommitButton');
    if (commitButton) commitButton.disabled = busy || !importState.plan?.canCommit;
    const status = document.getElementById('importStatus');
    if (status) status.textContent = busy ? message : importStatusText();
}

// Why "Import" is disabled, if it is.
function importStatusText() {
    const plan = importState.plan;
    if (!plan || plan.canCommit) return '';
    return plan.errors.length
        ? 'Problems block the import (see above).'
        : `${plan.unresolved} records still need a choice (see above).`;
}

function handleImportError(error, fallback) {
    console.error(fallback, error);
    const data = error.response?.data;
    const message = (data && typeof data === 'object' && data.message) ? data.message : getErrorMessage(error) || fallback;
    toast.error(message);
}

// Rendering -----------------------------------------------------------------------

function renderImportPreview() {
    const plan = importState.plan;
    const container = document.getElementById('importPreview');
    const file = plan.file;
    const exportedAt = file.exportedAt ? new Date(file.exportedAt).toLocaleString() : null;

    container.innerHTML = `
        <br>
        <legend>Preview</legend>
        <p class="text-body-secondary">
            ${file.formatVersion === 0
                ? 'An export in the older format (without version information).'
                : `Exported by ArboDat+ ${escapeHtml(file.appVersion ?? '?')}${exportedAt ? ` on ${escapeHtml(exportedAt)}` : ''}.`}
            ${file.records} records. Nothing has been imported yet.
        </p>
        ${renderSummary(plan)}
        ${renderIssues(plan)}
        ${renderAmbiguities(plan)}
        ${renderConflicts(plan)}
        ${renderKeyMatches(plan)}
        ${renderDetails(plan)}
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 20px;">
            <button
                type="button"
                id="importCommitButton"
                onclick="commitImport()"
                ${plan.canCommit ? '' : 'disabled'}
                style="padding-left: 10px; padding-right: 10px; padding-top: 2px; padding-bottom: 2px; border: 2px solid; border-radius: 4px;"
            >
                Import
            </button>
            <span id="importStatus" class="text-body-secondary">${escapeHtml(importStatusText())}</span>
        </div>`;
    container.hidden = false;
}

function renderSummary(plan) {
    const rows = [];
    const vocabulary = { total: 0, create: 0 };
    for (const s of plan.summary) {
        if (!IMPORT_TYPE_LABELS[s.type]) { // vocabulary values: one row
            vocabulary.total += s.total;
            vocabulary.create += s.create;
            continue;
        }
        rows.push(`
            <tr>
                <th scope="row">${escapeHtml(typeLabel(s.type, true))}</th>
                <td>${s.total}</td>
                <td>${s.create || ''}</td>
                <td>${s.matchById || ''}</td>
                <td>${s.matchByKey || ''}</td>
                <td>${s.ambiguous ? `<strong class="text-danger">${s.ambiguous}</strong>` : ''}</td>
                <td>${s.pending || ''}</td>
                <td>${s.conflicts || ''}</td>
                <td>${s.fills || ''}</td>
                <td>${s.links || ''}</td>
            </tr>`);
    }
    if (vocabulary.total) {
        rows.push(`
            <tr>
                <th scope="row">vocabulary values</th>
                <td>${vocabulary.total}</td><td>${vocabulary.create || ''}</td><td>${(vocabulary.total - vocabulary.create) || ''}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`);
    }
    return `
        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead>
                    <tr>
                        <th scope="col"></th>
                        <th scope="col">in the file</th>
                        <th scope="col" title="not here yet: added">new</th>
                        <th scope="col" title="already here (same id)">same id</th>
                        <th scope="col" title="already here under another id: same label within the same parent">same label</th>
                        <th scope="col" title="several records here could be the one: choose below">choose</th>
                        <th scope="col" title="decided once the record above them is">waiting</th>
                        <th scope="col" title="fields with a different value here and in the file">conflicts</th>
                        <th scope="col" title="fields empty here, filled from the file">filled in</th>
                        <th scope="col" title="links (people, literature, site types, …) added to records already here">new links</th>
                    </tr>
                </thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>`;
}

function renderIssues(plan) {
    let html = '';
    if (plan.errors.length) {
        html += `<div class="alert alert-danger"><ul class="mb-0">${plan.errors.map(e => `<li>${escapeHtml(e.message)}</li>`).join('')}</ul></div>`;
    }
    if (plan.warnings.length) {
        const items = plan.warnings.map(w => `<li>${escapeHtml(w.message)}</li>`).join('');
        html += plan.warnings.length <= 5
            ? `<div class="alert alert-warning"><ul class="mb-0">${items}</ul></div>`
            : `<details class="alert alert-warning"><summary>${plan.warnings.length} warnings</summary><ul class="mb-0 mt-2">${items}</ul></details>`;
    }
    return html;
}

const AMBIGUITY_REASONS = {
    MULTIPLE_MATCHES: 'Several records here have this label.',
    TARGET_CLAIMED_TWICE: 'Another record in the file matches the same record here.',
};

function renderAmbiguities(plan) {
    if (!plan.ambiguities.length) return '';
    const items = plan.ambiguities.map((a, i) => {
        const name = `importChoice${i}`;
        const option = (value, label) => `
            <div class="form-check">
                <input class="form-check-input" type="radio" name="${name}" id="${name}-${escapeHtml(value)}"
                       value="${escapeHtml(value)}" ${a.chosen === value ? 'checked' : ''}
                       onchange="chooseMatch('${escapeHtml(a.key)}', this.value)">
                <label class="form-check-label" for="${name}-${escapeHtml(value)}">${label}</label>
            </div>`;
        return `
            <div class="border rounded p-2 mb-2">
                <div><strong>${escapeHtml(typeLabel(a.type))}</strong> ${escapeHtml(a.path ?? a.label ?? '')}</div>
                ${a.reason ? `<div class="text-body-secondary small mb-1">${escapeHtml(AMBIGUITY_REASONS[a.reason] ?? '')}</div>` : ''}
                ${a.candidates.map(c => option(c.targetId, `merge into: ${escapeHtml(c.label ?? c.targetId)}`
                    + (c.details ? ` <span class="text-body-secondary">(${escapeHtml(c.details)})</span>` : ''))).join('')}
                ${option('NEW', 'import as a new record')}
            </div>`;
    }).join('');
    return `
        <h5 class="mt-3">Choose (${plan.ambiguities.length})</h5>
        <p class="text-body-secondary">
            These records could be one of several records here. Choose the one to merge into, or import them as new.
            The records below them are decided once you have.
        </p>
        ${items}`;
}

function chooseMatch(key, value) {
    importState.decisions.matches[key] = value;
    previewAgainSoon();
}

function renderKeyMatches(plan) {
    if (!plan.keyMatchTotal) return '';
    const rows = plan.keyMatches.map(m => `
        <tr>
            <td>${escapeHtml(typeLabel(m.type))}</td>
            <td>${escapeHtml(m.path ?? m.label ?? '')}</td>
            <td>${escapeHtml(m.target ?? '')}</td>
            <td><button type="button" class="btn btn-link btn-sm p-0" onclick="chooseMatch('${escapeHtml(m.key)}', 'NEW')">import as new</button></td>
        </tr>`).join('');
    return `
        <details class="mt-3">
            <summary>Recognised by label (${plan.keyMatchTotal})</summary>
            <p class="text-body-secondary mt-2">
                These records have another id here, but the same label within the same parent (people: the same ORCID,
                institutions the same ROR id, literature the same DOI, or the same name), so they are merged into the record here.
            </p>
            ${truncatedNote(plan.keyMatches.length, plan.keyMatchTotal)}
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead><tr><th></th><th>in the file</th><th>merged into</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </details>`;
}

// Conflicts ---------------------------------------------------------------------

// The same precedence as Decisions.take() in the backend: field > record > type + field > type > default.
function takesImported(conflict) {
    const c = importState.decisions.conflicts;
    const choice = c.byField[conflict.key]
        ?? c.byRecord[conflict.recordKey]
        ?? c.byTypeField[`${conflict.type}:${conflict.field}`]
        ?? c.byType[conflict.type]
        ?? c.defaultChoice;
    return choice === 'TAKE';
}

function renderConflicts(plan) {
    if (!plan.conflictTotal) return '';
    const groups = plan.conflictFields.map(g => {
        const key = `${g.type}:${g.field}`;
        return `
            <tr>
                <td>${escapeHtml(typeLabel(g.type))} › ${escapeHtml(fieldLabel(g.field))}</td>
                <td>${g.count}</td>
                <td>
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="chooseConflictGroup('${escapeHtml(key)}', 'KEEP')">keep all</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="chooseConflictGroup('${escapeHtml(key)}', 'TAKE')">take all</button>
                </td>
            </tr>`;
    }).join('');
    const rows = plan.conflicts.map((c, i) => {
        const take = takesImported(c);
        const name = `importConflict${i}`;
        return `
            <tr>
                <td>${escapeHtml(typeLabel(c.type))} ${escapeHtml(c.path ?? c.label ?? '')}
                    ${c.target && c.target !== c.path ? `<div class="small text-body-secondary">here: ${escapeHtml(c.target)}</div>` : ''}</td>
                <td>${escapeHtml(fieldLabel(c.field))}</td>
                <td class="${take ? 'text-body-secondary text-decoration-line-through' : ''}">${displayValue(c.existing)}</td>
                <td class="${take ? '' : 'text-body-secondary text-decoration-line-through'}">${displayValue(c.imported)}</td>
                <td style="white-space: nowrap;">
                    <label><input type="radio" name="${name}" ${take ? '' : 'checked'} onchange="chooseConflict('${escapeHtml(c.key)}', 'KEEP')"> keep</label>
                    <label class="ms-2"><input type="radio" name="${name}" ${take ? 'checked' : ''} onchange="chooseConflict('${escapeHtml(c.key)}', 'TAKE')"> take</label>
                </td>
            </tr>`;
    }).join('');
    return `
        <h5 class="mt-3">Conflicts (${plan.conflictTotal})</h5>
        <p class="text-body-secondary">
            These fields have a value here and a different one in the file. The value here is kept unless you take the imported one.
        </p>
        <div class="mb-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="chooseAllConflicts('KEEP')">keep all values here</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="chooseAllConflicts('TAKE')">take all imported values</button>
        </div>
        <details>
            <summary>by field</summary>
            <div class="table-responsive mt-2">
                <table class="table table-sm"><tbody>${groups}</tbody></table>
            </div>
        </details>
        ${truncatedNote(plan.conflicts.length, plan.conflictTotal)}
        <div class="table-responsive">
            <table class="table table-sm">
                <thead><tr><th>record</th><th>field</th><th>here</th><th>in the file</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function chooseConflict(key, choice) {
    importState.decisions.conflicts.byField[key] = choice;
    renderImportPreview();
}

function chooseConflictGroup(typeField, choice) {
    const c = importState.decisions.conflicts;
    c.byTypeField[typeField] = choice;
    for (const conflict of importState.plan.conflicts) {
        if (`${conflict.type}:${conflict.field}` === typeField) delete c.byField[conflict.key];
    }
    renderImportPreview();
}

function chooseAllConflicts(choice) {
    importState.decisions.conflicts = { defaultChoice: choice, byType: {}, byTypeField: {}, byRecord: {}, byField: {} };
    renderImportPreview();
}

// Further details ---------------------------------------------------------------

function renderDetails(plan) {
    let html = '';
    if (plan.fillTotal) {
        html += detailsTable(`Filled in (${plan.fillTotal})`,
            'Fields that are empty here get the value from the file.',
            ['record', 'field', 'value'],
            plan.fills.map(f => [`${escapeHtml(typeLabel(f.type))} ${escapeHtml(f.path ?? '')}`, escapeHtml(fieldLabel(f.field)), displayValue(f.imported)]),
            plan.fillTotal);
    }
    if (plan.linkTotal) {
        html += detailsTable(`New links (${plan.linkTotal})`,
            'Records here get these links in addition to the ones they have.',
            ['record', 'field', 'added'],
            plan.links.map(l => [`${escapeHtml(typeLabel(l.type))} ${escapeHtml(l.path ?? '')}`, escapeHtml(fieldLabel(l.field)), l.added.map(escapeHtml).join(', ')]),
            plan.linkTotal);
    }
    if (plan.newLookups.length) {
        html += detailsTable(`New vocabulary values (${plan.newLookups.length})`,
            'Values of the DANTE vocabularies that aren\'t here yet are added.',
            ['vocabulary', 'value'],
            plan.newLookups.map(l => [escapeHtml(typeLabel(l.type)), `${escapeHtml(l.label ?? '')} <span class="small text-body-secondary">${escapeHtml(l.id)}</span>`]),
            plan.newLookups.length);
    }
    if (plan.lookupLabelDiffs.length) {
        html += detailsTable(`Vocabulary labels that differ (${plan.lookupLabelDiffs.length})`,
            'The same vocabulary value has other labels here; the labels here stay.',
            ['vocabulary', 'field', 'here', 'in the file'],
            plan.lookupLabelDiffs.map(d => [escapeHtml(typeLabel(d.type)), escapeHtml(fieldLabel(d.field)), displayValue(d.existing), displayValue(d.imported)]),
            plan.lookupLabelDiffs.length);
    }
    return html;
}

function detailsTable(title, text, headers, rows, total) {
    return `
        <details class="mt-3">
            <summary>${escapeHtml(title)}</summary>
            <p class="text-body-secondary mt-2">${escapeHtml(text)}</p>
            ${truncatedNote(rows.length, total)}
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
            </div>
        </details>`;
}

function truncatedNote(shown, total) {
    return shown < total ? `<p class="small text-body-secondary">The first ${shown} of ${total} are listed.</p>` : '';
}

// Import ------------------------------------------------------------------------

async function commitImport() {
    const plan = importState.plan;
    if (!plan?.canCommit || importState.busy) return;

    const desktop = typeof window.__arbodatBackupBeforeImport === 'function';
    const confirmed = await confirmDialog({
        title: 'Import into this database?',
        text: 'The file is merged into the data here as the preview shows. Nothing is deleted. '
            + (desktop
                ? 'A backup of the data here is made first.'
                : 'Make a backup first if you want to be able to go back.'),
        confirmLabel: 'Import'
    });
    if (!confirmed) return;

    if (desktop) {
        setImportBusy(true, 'Making a backup …');
        const answer = await window.__arbodatBackupBeforeImport();
        if (answer.status === 'failed') {
            setImportBusy(false);
            toast.error(`The backup failed, so nothing was imported: ${answer.message}`);
            return;
        }
        if (answer.status === 'unavailable') {
            setImportBusy(false);
            const anyway = await confirmDialog({
                title: 'Import without a backup?',
                text: 'This ArboDat+ runs on a server, which the app can\'t back up. Ask whoever runs it for a backup first, or import anyway.',
                confirmLabel: 'Import anyway',
                focusCancel: true
            });
            if (!anyway) return;
        }
    }

    setImportBusy(true, 'Importing …');
    try {
        const response = await axios.post('api/data_import/commit', importForm(true));
        importState.plan = null;
        importState.decisions = emptyDecisions();
        document.getElementById('importPreview').hidden = true;
        renderImportResult(response.data);
        toast.success('The import is done.');
    } catch (error) {
        const data = error.response?.data;
        if (data?.plan) { // 409: the data changed; 422: choices missing. Either way: review again.
            importState.plan = data.plan;
            renderImportPreview();
            toast.info(data.message);
        } else {
            handleImportError(error, 'Import failed. Nothing was imported.');
        }
    } finally {
        setImportBusy(false);
    }
}

function renderImportResult(result) {
    const rows = result.outcomes
        .filter(o => IMPORT_TYPE_LABELS[o.type])
        .map(o => `<tr><th scope="row">${escapeHtml(typeLabel(o.type, true))}</th><td>${o.created || ''}</td><td>${o.updated || ''}</td></tr>`)
        .join('');
    const vocabulary = result.outcomes.filter(o => !IMPORT_TYPE_LABELS[o.type]).reduce((n, o) => n + o.created, 0);
    const container = document.getElementById('importResult');
    container.innerHTML = `
        <br>
        <legend>Imported</legend>
        ${rows ? `
            <div class="table-responsive">
                <table class="table table-sm table-striped">
                    <thead><tr><th></th><th>added</th><th>updated</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>` : '<p>Everything in the file was already here: nothing changed.</p>'}
        <p class="text-body-secondary">
            ${vocabulary ? `${vocabulary} vocabulary values added. ` : ''}${result.links ? `${result.links} links added.` : ''}
        </p>`;
    container.hidden = false;
    document.getElementById('importFileInput').value = '';
    importState.file = null;
    document.getElementById('importPreviewButton').disabled = true;
}

// Leaving the page loses the reviewed preview and the choices made in it.
window.__arbodatUnsavedWork = () => importState.plan ? 'the import preview and the choices made in it' : null;
window.addEventListener('beforeunload', event => {
    if (importState.plan) event.preventDefault();
});
