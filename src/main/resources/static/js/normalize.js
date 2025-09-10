document.addEventListener('DOMContentLoaded', () => {
    // UI elements and state
    const elapsedEl   = document.getElementById('elapsed');
    const attemptEl   = document.getElementById('attemptCount');
    const addTableBtn = document.getElementById('addTable');
    const decContainer= document.getElementById('decomposedTablesContainer');

    // Lossless & Dependency options
    const losslessCheckbox   = document.getElementById('losslessJoin');
    const dependencyCheckbox = document.getElementById('dependencyPreserve');
    const timeLimitInput     = document.getElementById('timeLimit');

    let timerInterval = null;
    let elapsedSecs   = 0;
    let timerStarted  = false;

    // Reset attempt counter on load
    fetch('/normalize/resetAttempt', { method: 'POST' })
        .then(() => { if (attemptEl) attemptEl.textContent = '0'; })
        .catch(err => console.error('Reset attempt failed', err));

    function startTimer() {
        if (timerStarted) return;
        timerStarted = true;
        elapsedSecs = 0;
        if (elapsedEl) elapsedEl.textContent = '0';
        timerInterval = setInterval(() => {
            elapsedSecs++;
            if (elapsedEl) elapsedEl.textContent = elapsedSecs;
        }, 1000);
    }
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerStarted = false;
        }
    }

    // Parse original table (initialCalcTable passed from server as window.originalTable)
    let raw = window.originalTable;
    if (typeof raw === 'string' && raw.trim()) {
        try { raw = JSON.parse(raw); } catch (e) { console.error("originalTable JSON parse error", e); raw = []; }
    }
    const originalRows = Array.isArray(raw) ? raw : [];

    let ricRaw = window.ricMatrixTable;
    if (typeof ricRaw === 'string' && ricRaw.trim()) {
        try { ricRaw = JSON.parse(ricRaw); } catch (e) { ricRaw = []; }
    }
    const ricMatrix = Array.isArray(ricRaw) ? ricRaw : [];

    // Render original table with RIC coloring
    const origContainer = document.getElementById('originalTableContainer');
    const origTable     = document.createElement('table');
    origTable.classList.add('data-grid');
    origTable.style.tableLayout = 'fixed';
    origTable.style.width = '100%';

    // Building header
    const colCount = originalRows[0]?.length || 0;
    const origThead = origTable.createTHead();
    const origHeadRow = origThead.insertRow();
    for (let i = 0; i < colCount; i++) {
        const th = document.createElement('th');
        th.textContent = (i + 1).toString();
        th.dataset.origIdx = i;
        th.setAttribute('data-orig-idx', String(i)); // robust attribute for parsing
        origHeadRow.appendChild(th);
    }
    const origTbody = origTable.createTBody();

    function renderOrigBody(data) {
        origTbody.innerHTML = '';
        data.forEach((row, r) => {
            const tr = origTbody.insertRow();
            row.forEach((val, c) => {
                const td = tr.insertCell();
                td.textContent = val;
                const ricVal = parseFloat(ricMatrix[r]?.[c]);
                if (!isNaN(ricVal) && ricVal < 1) {
                    td.classList.add('plaque-cell');
                    const lightness = 10 + 90 * ricVal;
                    td.style.backgroundColor = `hsl(220,100%,${lightness}%)`;
                } else {
                    td.style.backgroundColor = 'white';
                }
                td.dataset.origIdx = c;
            });
        });
    }

    renderOrigBody(originalRows);
    if (origContainer) origContainer.appendChild(origTable);

    // Show FDs
    let showFdsBtn = document.getElementById('showAllFdsBtn');
    if (!showFdsBtn) {
        showFdsBtn = document.createElement('button');
        showFdsBtn.id = 'showAllFdsBtn';
        showFdsBtn.textContent = 'Show Functional Dependencies';
        showFdsBtn.classList.add('button', 'show-fds-btn');
        if (addTableBtn && addTableBtn.parentNode) {
            addTableBtn.parentNode.insertBefore(showFdsBtn, addTableBtn.nextSibling);
        } else {
            document.body.appendChild(showFdsBtn);
        }
    }

    // Compute All (single global compute button)
    let computeAllBtn = document.getElementById('computeAllBtn');
    if (!computeAllBtn) {
        computeAllBtn = document.createElement('button');
        computeAllBtn.id = 'computeAllBtn';
        computeAllBtn.textContent = 'Compute RIC';
        computeAllBtn.classList.add('button', 'compute-all-btn');
        if (showFdsBtn && showFdsBtn.parentNode) {
            showFdsBtn.parentNode.insertBefore(computeAllBtn, showFdsBtn.nextSibling);
        } else if (addTableBtn && addTableBtn.parentNode) {
            addTableBtn.parentNode.insertBefore(computeAllBtn, addTableBtn.nextSibling);
        } else {
            document.body.appendChild(computeAllBtn);
        }
    }

    // Undo button (restore previous decomposition snapshot)
    let undoBtn = document.getElementById('undoDecompBtn');
    if (!undoBtn) {
        undoBtn = document.createElement('button');
        undoBtn.id = 'undoDecompBtn';
        undoBtn.textContent = 'Undo last decomposition';
        undoBtn.classList.add('button', 'per-add-btn');
        // place near computeAllBtn if present
        if (computeAllBtn && computeAllBtn.parentNode) {
            computeAllBtn.parentNode.insertBefore(undoBtn, computeAllBtn.nextSibling);
        } else {
            document.body.appendChild(undoBtn);
        }
    }

    // Warnings area (for missing column messages)
    let warningsArea = document.getElementById('normalizeWarnings');
    if (!warningsArea) {
        warningsArea = document.createElement('div');
        warningsArea.id = 'normalizeWarnings';
        // Basic styling (can be moved to CSS file)
        warningsArea.style.margin = '16px 0 8px 0';
        warningsArea.style.display = 'none';
        warningsArea.style.background = '#fff7ed';
        warningsArea.style.border = '1px solid #ffd8b5';
        warningsArea.style.padding = '12px';
        warningsArea.style.borderRadius = '6px';
        warningsArea.style.color = '#7a2e00';
        warningsArea.style.width = '100%';
        warningsArea.style.boxSizing = 'border-box';

        // Insert *after* decomposed tables container so message appears below the decomposed tables
        if (decContainer && decContainer.parentNode) {
            // put warningsArea immediately after decContainer
            decContainer.parentNode.insertBefore(warningsArea, decContainer.nextSibling);
        } else if (computeAllBtn && computeAllBtn.parentNode) {
            // fallback near compute button
            computeAllBtn.parentNode.insertBefore(warningsArea, computeAllBtn.nextSibling);
        } else {
            document.body.appendChild(warningsArea);
        }
    }

    function showWarning(html) {
        warningsArea.innerHTML = html;
        warningsArea.style.display = 'block';
    }
    function clearWarning() {
        warningsArea.innerHTML = '';
        warningsArea.style.display = 'none';
    }

    function showGlobalDpLj(dpFlag, ljFlag) {
        // Build HTML used in the warningsArea
        const parts = [];
        if (dpFlag === true) {
            parts.push('<p class="ok">✓ Dependency-Preserving provided!</p>');
        } else {
            parts.push('<p class="warning">⚠ Dependency-Preserving not provided!</p>');
        }
        if (ljFlag === true) {
            parts.push('<p class="ok">✓ Lossless-Join provided!</p>');
        } else {
            parts.push('<p class="error">❌ Lossless-Join not provided!</p>');
        }
        showWarning(parts.join(''));
        try { warningsArea.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }

    // parse projectedFds stored in wrapper.dataset.projectedFds
    function parseProjectedFdsValue(val) {
        if (!val) return [];
        // if already an array-encoded JSON
        if (typeof val === 'string') {
            const trimmed = val.trim();
            // try JSON.parse first
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(String).filter(s => s && s.trim()).map(s => s.trim());
                }
            } catch (e) {
                // not JSON then continue
            }
            // semicolon separated or newline separated list
            const parts = trimmed.split(/[;\r\n]+/).map(s => s.trim()).filter(Boolean);
            return parts;
        }
        if (Array.isArray(val)) {
            return val.map(String).filter(s => s && s.trim()).map(s => s.trim());
        }
        return [];
    }

    // Collect projected FDs from a wrapper (returns array of strings)
    function readProjectedFdsFromWrapper(wrapper) {
        if (!wrapper) return [];
        const raw = wrapper.dataset.projectedFds;
        return parseProjectedFdsValue(raw);
    }

    // Merge arrays and remove duplicates while keeping order
    function uniqConcat(arrays) {
        const seen = new Set();
        const out = [];
        arrays.forEach(a => {
            (a || []).forEach(x => {
                if (!x) return;
                const s = String(x).trim();
                if (!s) return;
                if (!seen.has(s)) {
                    seen.add(s);
                    out.push(s);
                }
            });
        });
        return out;
    }

    // fetchProjectedFDs, ask backend for projected FDs for given columns and store them in wrapper.dataset.projectedFds
    async function fetchProjectedFDs(wrapper, cols) {
        if (!cols || cols.length === 0) {
            try { wrapper.dataset.projectedFds = JSON.stringify([]); } catch (e) { wrapper.dataset.projectedFds = '[]'; }
            return;
        }
        const payload = { columns: cols };
        try {
            const resp = await fetch('/normalize/project-fds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(text || resp.statusText);
            }
            const json = await resp.json();
            const list = json.projectedFDs || json.fds || [];
            try { wrapper.dataset.projectedFds = JSON.stringify(list); } catch (e) { wrapper.dataset.projectedFds = '[]'; }
        } catch (err) {
            console.error('fetchProjectedFDs failed', err);
            try { wrapper.dataset.projectedFds = JSON.stringify([]); } catch (e) {}
        }
    }

    // Sortable for original table — enable cloning into decomposed tables but prevent reordering in original
    if (typeof Sortable !== 'undefined') {
        Sortable.create(origHeadRow, {
            group: { name: 'columns', pull: 'clone', put: false },
            sort: false,
            animation: 150,
            draggable: 'th',
            fallbackOnBody: true,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onStart: () => {
                // start timer when user begins dragging a column
                startTimer();
            },
            onEnd: () => {
                // increment attempt as before
                fetch('/normalize/incrementAttempt', { method: 'POST' })
                    .then(res => res.json())
                    .then(json => { if (attemptEl) attemptEl.textContent = json.attempts; })
                    .catch(console.error);
            }
        });
    } else {
        console.warn('SortableJS not loaded');
    }

    // Show FDs button process, fill each wrapper's right-side FD list from wrapper.dataset.projectedFds
    showFdsBtn.addEventListener('click', () => {
        const wrappers = Array.from(document.querySelectorAll('.decomposed-wrapper'));
        if (wrappers.length === 0) {
            alert('No decomposed tables yet.');
            return;
        }
        wrappers.forEach(w => {
            const fdContainer = w.querySelector('.fd-list-container');
            const fdUl = fdContainer ? fdContainer.querySelector('ul') : null;
            if (!fdUl) return;

            // get stored projected FDs (computed earlier with fetchProjectedFDs at onAdd/onEnd)
            let proj = [];
            try {
                proj = readProjectedFdsFromWrapper(w);
            } catch (e) {
                proj = [];
            }
            fdUl.innerHTML = '';
            proj.forEach(s => {
                const li = document.createElement('li');
                li.textContent = s;
                fdUl.appendChild(li);
            });
        });
    });

    // Helper to collect union of all selected columns across wrappers
    function getCoveredColumns() {
        const wrappers = Array.from(document.querySelectorAll('.decomposed-wrapper'));
        const covered = new Set();
        wrappers.forEach(w => {
            try {
                const cols = JSON.parse(w.dataset.columns || '[]');
                if (Array.isArray(cols)) {
                    cols.forEach(c => covered.add(Number(c)));
                }
            } catch (e) {}
        });
        return covered;
    }

    // Compute All button handler (uses /decompose-all)
    computeAllBtn.addEventListener('click', async () => {
        const wrappers = Array.from(document.querySelectorAll('.decomposed-wrapper'));
        if (wrappers.length === 0) { alert('There are no decomposed tables yet.'); return; }

        // validation, ensure union of decomposed columns covers all original columns
        clearWarning();
        const covered = getCoveredColumns();
        const missing = [];
        for (let i = 0; i < colCount; i++) {
            if (!covered.has(i)) missing.push(i);
        }
        if (missing.length > 0) {
            const missingOneBased = missing.map(x => x + 1);
            const alertMsg =
                'Calculation canceled:\n' +
                'Not all columns in the original table are covered by the decomposed tables.\n' +
                'Misssing column(s): ' + missingOneBased.join(', ') + '\n' +
                'Please add the missing columns to the decomposed tables or update the existing decomposed tables.';
            alert(alertMsg);
            return;
        }

        // Build tables payload (columns + manualData per wrapper) and collect per-wrapper fds
        const tablesPayload = [];
        const perTableFdsArrays = [];

        for (const w of wrappers) {
            let cols = [];
            try { cols = JSON.parse(w.dataset.columns || '[]'); } catch (e) { cols = []; }

            // Build projected FDs for this wrapper (if precomputed)
            const projFds = readProjectedFdsFromWrapper(w);
            perTableFdsArrays.push(projFds || []);

            if (!cols || cols.length === 0) {
                tablesPayload.push({
                    columns: [],
                    manualData: '',
                    fds: projFds.join(';'),
                    timeLimit: parseInt(timeLimitInput?.value || '30', 10),
                    monteCarlo: false,
                    samples: 0
                });
                continue;
            }

            // Build manualData for this wrapper (deduped unique tuples)
            const seen = new Set();
            const manualRows = [];
            originalRows.forEach(row => {
                const tupArr = cols.map(i => (row[i] !== undefined ? String(row[i]) : ''));
                const key = tupArr.join('|');
                if (!seen.has(key)) {
                    seen.add(key);
                    manualRows.push(tupArr.join(','));
                }
            });
            const manualData = manualRows.join(';');

            tablesPayload.push({
                columns: cols,
                manualData: manualData,
                fds: projFds.join(';'),
                timeLimit: parseInt(timeLimitInput?.value || '30', 10),
                monteCarlo: false,
                samples: 0
            });
        }

        // Build top-level FD string:
        // Priority: window.fdListWithClosure -> window.fdList -> merge per-table projected fds
        let topLevelFdsArr = [];
        try {
            if (typeof window !== 'undefined') {
                if (window.fdListWithClosure && String(window.fdListWithClosure).trim()) {
                    // fdListWithClosure could be a string with separators ; or \n
                    topLevelFdsArr = parseProjectedFdsValue(window.fdListWithClosure);
                } else if (window.fdList && String(window.fdList).trim()) {
                    topLevelFdsArr = parseProjectedFdsValue(window.fdList);
                }
            }
        } catch (e) {
            topLevelFdsArr = [];
        }

        if (topLevelFdsArr.length === 0) {
            // fallback: merge per-table projected fds
            topLevelFdsArr = uniqConcat(perTableFdsArrays);
        }

        // final top-level fd string
        const topLevelFdsString = topLevelFdsArr.join(';');

        // If there are no FDs even now, still submit,
        // but sending top-level empty string would cause ric main to report "FDs: none".
        // So we send whatever we have.
        const bodyObj = { tables: tablesPayload, fds: topLevelFdsString };

        startTimer();
        try {
            const resp = await fetch('/normalize/decompose-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyObj)
            });

            if (!resp.ok) {
                // If server enforces LJ, it may return 400 with an error message; show to user
                const txt = await resp.text();
                alert('Decomposition not accepted: ' + (txt || resp.statusText));
                stopTimer();
                return;
            }

            const json = await resp.json();
            const globalDp = Boolean(json.dpPreserved);
            const globalLj = Boolean(json.ljPreserved);
            showGlobalDpLj(globalDp, globalLj);

            // globalRic and tableResults are expected
            const globalRic = Array.isArray(json.globalRic) ? json.globalRic : [];
            const tableResults = Array.isArray(json.tableResults) ? json.tableResults : [];

            // update per-wrapper FD list using server-returned tableResults.projectedFDs (if present)
            // This ensures UI shows authoritative projected FDs from server
            const wrappersList = Array.from(document.querySelectorAll('.decomposed-wrapper'));
            for (let i = 0; i < wrappersList.length; i++) {
                const w = wrappersList[i];
                const fdContainer = w.querySelector('.fd-list-container');
                const fdUl = fdContainer ? fdContainer.querySelector('ul') : null;
                if (!fdUl) continue;
                fdUl.innerHTML = '';
                const tr = tableResults[i] || {};
                const projList = Array.isArray(tr.projectedFDs) ? tr.projectedFDs : (tr.projectedFDs === undefined ? [] : tr.projectedFDs);
                // fallback: if server didn't provide, keep wrapper.dataset.projectedFds
                const listToUse = (projList && projList.length > 0) ? projList : readProjectedFdsFromWrapper(w);
                listToUse.forEach(s => {
                    const li = document.createElement('li');
                    li.textContent = s;
                    fdUl.appendChild(li);
                });
                // Also store back to dataset for future usage
                try { w.dataset.projectedFds = JSON.stringify(listToUse); } catch (e) {}
            }

            // Use server-provided unionCols if present, else fallback
            let unionCols = Array.isArray(json.unionCols) && json.unionCols.length > 0
                ? json.unionCols.map(n => Number(n))
                : Array.from(new Set([].concat(...tablesPayload.map(t => t.columns)))).map(n => Number(n));
            unionCols.sort((a,b)=>a-b);

            // globalManualRows: each element is a comma-separated tuple in the same order as unionCols
            const globalManualRows = Array.isArray(json.globalManualRows) ? json.globalManualRows.map(s => String(s)) : [];

            // Build unionManualTuples: array of arrays of strings aligned with unionCols
            const unionManualTuples = globalManualRows.map(s => s.split(',').map(x => (x==null? '' : String(x).trim())));

            // Build per-wrapper first-occurrence maps (projected tuple -> index in unionManualTuples)
            const wrapperFirstIndexMaps = [];
            for (const t of tablesPayload) {
                const cols = Array.isArray(t.columns) ? t.columns.map(Number) : [];
                const map = new Map();
                for (let r = 0; r < unionManualTuples.length; r++) {
                    const unionRow = unionManualTuples[r];
                    const projectedParts = cols.map(c => {
                        const pos = unionCols.indexOf(Number(c)); // position of this column in unionCols
                        return (pos >= 0 && unionRow[pos] !== undefined) ? unionRow[pos] : '';
                    });
                    const key = projectedParts.join('|');
                    if (!map.has(key)) map.set(key, r);
                }
                wrapperFirstIndexMaps.push(map);
            }

            // Render per-wrapper table bodies using globalRic
            for (let i = 0; i < wrappers.length; i++) {
                const w = wrappers[i];
                const cols = tablesPayload[i].columns || [];
                const warnDiv = w.querySelector('.decompose-warnings');
                const tbody = w.querySelector('table tbody');

                // Clear previous warning & FD list
                if (warnDiv) warnDiv.innerHTML = '';

                // Build uniqueTuples for this wrapper
                const seen = new Set();
                const uniqueTuples = [];
                originalRows.forEach(row => {
                    const tupArr = cols.map(i => (row[i] !== undefined ? String(row[i]) : ''));
                    const key = tupArr.join('|');
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueTuples.push(tupArr);
                    }
                });

                // For mapping from wrapper column index -> index in unionCols (globalRic column index)
                const colIndicesInUnion = cols.map(c => unionCols.indexOf(c));

                // Render tbody using mapping to globalRic
                if (tbody) {
                    tbody.innerHTML = '';
                    for (let r = 0; r < uniqueTuples.length; r++) {
                        const tr = tbody.insertRow();
                        const tupArr = uniqueTuples[r];
                        // find global row index with first-occurrence map
                        const key = tupArr.join('|');
                        const firstMap = wrapperFirstIndexMaps[i];
                        const globalRowIdx = firstMap.has(key) ? firstMap.get(key) : -1;

                        for (let cIdx = 0; cIdx < cols.length; cIdx++) {
                            const td = tr.insertCell();
                            td.textContent = tupArr[cIdx];
                            td.dataset.origIdx = cols[cIdx];

                            let ricVal = NaN;
                            if (globalRowIdx >= 0 && globalRic[globalRowIdx] !== undefined) {
                                const gColIdx = colIndicesInUnion[cIdx];
                                if (gColIdx >= 0) {
                                    ricVal = parseFloat(globalRic[globalRowIdx]?.[gColIdx]);
                                }
                            }

                            if (!isNaN(ricVal) && ricVal < 1) {
                                td.classList.add('plaque-cell');
                                const lightness = 10 + 90 * ricVal;
                                td.style.backgroundColor = `hsl(220,100%,${lightness}%)`;
                            } else {
                                td.style.backgroundColor = 'white';
                                td.classList.remove('plaque-cell');
                            }
                        }
                    }
                }
            }

            stopTimer();
            alert('Relational information content calculation completed for all decomposed tables.');
        } catch (err) {
            console.error('decompose-all failed', err);
            alert('Server error while computing RIC: ' + (err.message || err));
            stopTimer();
        }
    });

    // Add decomposed table handler
    if (!addTableBtn) {
        console.warn('Add Table button not found (id="addTable")');
        return;
    }

    // Helper function to create a new decomposed table
    // returns the created wrapper so it can be restored by undo logic
    function createDecomposedTable() {
        // Checking the exist wrapper numbers
        let allWrappers = Array.from(document.querySelectorAll('.decomposed-wrapper'));
        let usedNumbers = new Set();
        allWrappers.forEach(w => {
            let num = parseInt(w.querySelector('h3').textContent.match(/\d+/)?.[0] || 0);
            if (!isNaN(num)) usedNumbers.add(num);
        });

        // Finding new number and taking new number starting from 1
        let newNumber = 1;
        while (usedNumbers.has(newNumber)) {
            newNumber++;
        }

        const wrapper = document.createElement('div');
        wrapper.classList.add('decomposed-wrapper');

        // Title
        const title = document.createElement('h3');
        title.textContent = `Decomposed Table ${newNumber}:`;
        wrapper.appendChild(title);

        // Content container (table + FD list side-by-side)
        const content = document.createElement('div');
        content.classList.add('decomposed-content');
        wrapper.appendChild(content);

        const leftCol = document.createElement('div');
        leftCol.style.flex = '0 0 50%';
        leftCol.style.minWidth = '180px';
        content.appendChild(leftCol);

        // Table (visual only, header rows will be built from state)
        const table = document.createElement('table');
        table.classList.add('data-grid');
        table.style.tableLayout = 'fixed';
        table.style.width = '100%';
        const thead = table.createTHead();
        const headRow = thead.insertRow();
        const tbody = table.createTBody();
        leftCol.appendChild(table);

        // FD list placeholder
        const fdContainer = document.createElement('div');
        fdContainer.classList.add('fd-list-container');
        const fdTitle = document.createElement('h4');
        fdTitle.textContent = 'Functional Dependencies';
        const fdUl = document.createElement('ul');
        fdUl.id = `fdList-${newNumber}`;
        fdContainer.appendChild(fdTitle);
        fdContainer.appendChild(fdUl);
        content.appendChild(fdContainer);

        // Warning container, just one for each wrapper
        const warnDiv = document.createElement('div');
        warnDiv.classList.add('decompose-warnings');
        wrapper.appendChild(warnDiv);

        // Add Table button per-wrapper (creating a new empty decomposed table)
        const addBtn = document.createElement('button');
        addBtn.classList.add('small');
        addBtn.textContent = '+ Add Table';
        addBtn.addEventListener('click', () => createDecomposedTable());
        wrapper.appendChild(addBtn);

        // Adding remove table button
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('small', 'remove-table-btn');
        removeBtn.textContent = 'Remove Table';
        removeBtn.style.float = 'right';
        removeBtn.style.marginLeft = '10px';
        removeBtn.addEventListener('click', () => {
            if (confirm('Do you want to delete this decomposed table?')) {
                // Remove table completely
                wrapper.remove();
            }
        });
        wrapper.appendChild(removeBtn);

        // Append wrapper to container
        decContainer.appendChild(wrapper);

        // Storing columns initially as empty array on wrapper
        wrapper.dataset.columns = JSON.stringify([]);
        // will be filled by fetchProjectedFDs
        wrapper.dataset.projectedFds = JSON.stringify([]);

        // Per-table state
        let decomposedCols = [];

        // Exposing external updater so removeColumnFromWrapper can call it
        wrapper.updateFromColumns = function(newCols) {
            decomposedCols = Array.isArray(newCols) ? newCols.slice() : [];
            renderDecomposed();
        };

        // Render function with deduplication and white rows
        function renderDecomposed() {

            // Building thead from decomposedCols
            headRow.innerHTML = '';
            decomposedCols.forEach(idx => {
                const th = document.createElement('th');
                th.textContent = idx + 1;
                th.dataset.origIdx = idx;
                th.setAttribute('data-orig-idx', String(idx));
                headRow.appendChild(th);
            });

            tbody.innerHTML = '';
            if (decomposedCols.length === 0) {
                try { wrapper.dataset.columns = JSON.stringify([]); } catch (e) { wrapper.dataset.columns = '[]'; }
                return;
            }
            const seen = new Set();
            originalRows.forEach(row => {
                const tuple = decomposedCols.map(i => (row[i] !== undefined ? String(row[i]) : '')).join('|');
                if (seen.has(tuple)) return; // skip duplicates
                seen.add(tuple);
                const tr = tbody.insertRow();
                decomposedCols.forEach(idx => {
                    const td = tr.insertCell();
                    td.textContent = row[idx];
                    td.style.backgroundColor = 'white';
                    td.dataset.origIdx = idx;
                });
            });
            try { wrapper.dataset.columns = JSON.stringify(decomposedCols); } catch (e) { wrapper.dataset.columns = '[]'; }
        }

        // Sortable on the headRow: accept clones from original and enable removal with onRemove
        if (typeof Sortable !== 'undefined') {
            Sortable.create(headRow, {
                group: { name: 'columns', pull: true, put: true },
                animation: 150,
                draggable: 'th',
                sort: true,
                fallbackOnBody: true,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',

                onMove: (evt) => {
                    return evt.from === origHeadRow || evt.from === headRow;
                },

                onStart: () => {
                },

                onAdd: (evt) => {
                    const item = evt.item;
                    let idx = NaN;
                    try {
                        if (item && item.dataset && item.dataset.origIdx !== undefined && item.dataset.origIdx !== '') {
                            idx = parseInt(item.dataset.origIdx, 10);
                        } else if (item && item.getAttribute && item.getAttribute('data-orig-idx')) {
                            idx = parseInt(item.getAttribute('data-orig-idx'), 10);
                        } else {
                            const txt = item && item.textContent ? item.textContent.trim() : '';
                            const parsed = parseInt(txt, 10);
                            if (!isNaN(parsed)) idx = parsed - 1;
                        }
                    } catch (e) { idx = NaN; }

                    if (!Number.isFinite(idx)) {
                        if (item && item.parentNode === headRow) item.remove();
                        console.warn('Could not parse dropped column index, ignoring.');
                        return;
                    }

                    if (decomposedCols.includes(idx)) {
                        if (item && item.parentNode === headRow) item.remove();
                        return;
                    }

                    // Insert at newIndex relative to current columns
                    const insertAt = Math.max(0, Math.min(evt.newIndex, decomposedCols.length));
                    decomposedCols.splice(insertAt, 0, idx);

                    // Cleanup the inserted clone then render
                    setTimeout(() => {
                        if (item && item.parentNode === headRow) item.remove();
                        renderDecomposed();
                        // Recomputing projected FDs in background
                        fetchProjectedFDs(wrapper, decomposedCols);
                    }, 0);
                },

                onRemove: (evt) => {
                    // An item was removed from this headRow
                    const item = evt.item;
                    let idx = NaN;
                    try {
                        if (item && item.dataset && item.dataset.origIdx !== undefined && item.dataset.origIdx !== '') {
                            idx = parseInt(item.dataset.origIdx, 10);
                        } else if (item && item.getAttribute && item.getAttribute('data-orig-idx')) {
                            idx = parseInt(item.getAttribute('data-orig-idx'), 10);
                        } else {
                            const txt = item && item.textContent ? item.textContent.trim() : '';
                            const parsed = parseInt(txt, 10);
                            if (!isNaN(parsed)) idx = parsed - 1;
                        }
                    } catch (e) { idx = NaN; }

                    if (Number.isFinite(idx)) {
                        decomposedCols = decomposedCols.filter(c => Number(c) !== Number(idx));
                        renderDecomposed();
                        fetchProjectedFDs(wrapper, decomposedCols);
                    }
                    if (item && item.parentNode === headRow) item.remove();
                },

                onEnd: (evt) => {
                    // Update order in case of reorder
                    decomposedCols = Array.from(headRow.children).map(th => parseInt(th.dataset.origIdx, 10));

                    // Detecting if dropped outside the header row (for removal)
                    const dropX = evt.originalEvent && evt.originalEvent.clientX != null ? evt.originalEvent.clientX : 0;
                    const dropY = evt.originalEvent && evt.originalEvent.clientY != null ? evt.originalEvent.clientY : 0;
                    if (dropX === 0 && dropY === 0) {
                        // Likely not a valid mouse drop, skip removal
                        renderDecomposed();
                        fetchProjectedFDs(wrapper, decomposedCols);
                        return;
                    }

                    const rect = headRow.getBoundingClientRect();
                    const isInside = dropX >= rect.left && dropX <= rect.right && dropY >= rect.top && dropY <= rect.bottom;

                    if (!isInside && evt.from === evt.to) {
                        // Dropped outside: remove the column
                        const idx = parseInt(evt.item.dataset.origIdx, 10);
                        if (!isNaN(idx)) {
                            evt.item.remove();
                            decomposedCols = decomposedCols.filter(c => c !== idx);
                        }
                    }

                    // Always re-render and fetch FDs
                    renderDecomposed();
                    fetchProjectedFDs(wrapper, decomposedCols);
                }
            });
        } else {
            console.warn('SortableJS not loaded (decomp headRow)');
        }

        // Initial render (empty)
        renderDecomposed();

        // Return wrapper so callers (restore) can set columns
        return wrapper;
    }

    // Attaching global Add Table button
    if (addTableBtn) {
        addTableBtn.addEventListener('click', () => createDecomposedTable());
    }

    // Undo / restore logic
    undoBtn.addEventListener('click', async () => {
        if (!confirm('Undo last decomposition? This will restore the previous decomposition state.')) return;
        try {
            const resp = await fetch('/normalization/undo', { method: 'POST' });
            if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(txt || resp.statusText);
            }
            const history = await resp.json(); // array of JSON strings (snapshots)
            if (!Array.isArray(history) || history.length === 0) {
                // nothing to restore: clear UI
                decContainer.innerHTML = '';
                alert('No earlier decomposition snapshot available to restore.');
                return;
            }
            // last snapshot (current after pop) is at history
            const lastJson = history[history.length - 1];
            let snapshot;
            try {
                snapshot = JSON.parse(lastJson);
            } catch (e) {
                console.error('Could not parse snapshot JSON from server', e);
                alert('Failed to parse history snapshot from server.');
                return;
            }
            // Restore UI from snapshot
            restoreFromSnapshot(snapshot);

        } catch (err) {
            console.error('Undo failed', err);
            alert('Undo failed: ' + (err.message || err));
        }
    });

    function restoreFromSnapshot(snapshot) {
        // clear existing wrappers
        decContainer.innerHTML = '';
        if (!Array.isArray(snapshot) || snapshot.length === 0) {
            // nothing to restore (empty)
            return;
        }
        // Each element of snapshot is expected to be an array of numbers (columns)
        snapshot.forEach(cols => {
            try {
                // create new wrapper and set columns
                const w = createDecomposedTable();
                // ensure cols is array of numbers, if JSON parsed numbers as numbers or strings, normalize
                const normalized = Array.isArray(cols) ? cols.map(c => Number(c)) : [];
                if (w && typeof w.updateFromColumns === 'function') {
                    w.updateFromColumns(normalized);
                    // fetch projected FDs for UI
                    fetchProjectedFDs(w, normalized);
                }
            } catch (e) {
                console.error('Failed to restore a wrapper from snapshot entry', e);
            }
        });
    }
});
