// Select2 multi-select helpers -------------------------------------------------
/*
Turns a <select multiple> into a searchable select2 multi-select (pills, × for all),
with the behaviour of the explorer's multi-selects (js/multiSelectEditor.js on develop):
- picked items leave the list, the search text is reset after each pick
- the list stays open on clicks into the field and on the × of a pill
- Backspace in the empty search field removes the last pill (select2 would put its text into the search)
- the × for all values toggles the list (stays open if it was open), the cursor is in the search field afterwards
- Esc closes the list and the field loses the focus, also when the search field has no focus;
  the focus going to another field closes the list
Styles see scss/_multiSelect.scss.

  tags:  true -> new values can be typed in (Enter or ';')
  isTag: term -> whether a typed value is valid (only with tags)
*/
function initMultiSelect(selector, { tags = false, isTag = () => true, dropdownParent } = {}) {
    const $select = $(selector);

    $select.select2({
        placeholder: "",
        allowClear: true,
        closeOnSelect: false,
        width: "100%",
        ...(dropdownParent?.length && { dropdownParent }),
        // Hide selected items in the list: they can only be removed by the × on their chip
        matcher: (params, data) =>
            data.element?.selected ? null : $.fn.select2.defaults.defaults.matcher(params, data),
        // Pills without the indentation of entries under a heading (DANTE lists)
        templateSelection: data => String(data.text ?? '').replace(/^[\s\u00a0]+/, ''),
        ...(tags && {
            tags: true,
            tokenSeparators: [';'],
            // No empty, invalid or already selected tags (selected items are hidden, select2 would offer them again)
            createTag: params => {
                const term = (params.term || '').trim();
                if (term === '' || !isTag(term) || ($select.val() || []).includes(term)) return null;
                return { id: term, text: term };
            },
        }),
    });
    const select2 = $select.data('select2');
    const container = select2.$container[0];
    container.classList.add('multi-select');
    const searchField = () => select2.$container.find('.select2-search__field');

    // After a pick or removal: reset the typed search text and refresh the list.
    // The query is triggered directly: an already empty search does not requery, so the picked item would stay in the list.
    $select.on('select2:select select2:unselect', () => setTimeout(() => {
        if (!$select.data('select2') || !select2.isOpen()) return;
        searchField().val('');
        select2.trigger('query', { term: '' });
    }));

    // A removed typed value is not offered in the list
    $select.on('select2:unselect', e => {
        if (e.params.data.element?.dataset.select2Tag === 'true') $(e.params.data.element).remove();
    });

    // The list stays open when a value is removed with the × of its pill, and on a click into the field
    // (select2 would close it: a click on its field toggles the list). Capture phase: before select2's own handler.
    let keepOpen = false;
    const keepOpenNow = () => {
        keepOpen = true;
        setTimeout(() => keepOpen = false);
    };
    $select.on('select2:unselect', keepOpenNow);
    container.addEventListener('mousedown', keepOpenNow, true);
    container.addEventListener('click', keepOpenNow, true);
    $select.on('select2:closing', e => {
        if (keepOpen) e.preventDefault();
    });

    // The × for all values: the list stays open if it was open, and closed if it was closed.
    // Afterwards the cursor is in the search field (typing searches again).
    let clearedWhileClosed = false;
    $select.on('select2:clear', () => {
        if (select2.isOpen()) {
            keepOpenNow();
        } else {
            clearedWhileClosed = true;
            setTimeout(() => clearedWhileClosed = false);
        }
        setTimeout(() => { if ($select.data('select2')) searchField().trigger('focus'); });
    });
    $select.on('select2:opening', e => {
        if (clearedWhileClosed) e.preventDefault();
    });

    // Backspace in the empty search field: the last pill is removed, without its text in the search
    // (and with closed list select2 would remove all pills). Capture phase: before select2's own handler.
    container.addEventListener('keydown', e => {
        if (e.key !== 'Backspace' || !e.target.matches('.select2-search__field') || e.target.value !== '') return;
        e.preventDefault();
        e.stopPropagation();
        const lastPill = container.querySelector('.select2-selection__choice:last-of-type');
        if (lastPill) select2.selection.trigger('unselect', { data: $.fn.select2.amd.require('select2/utils').GetData(lastPill, 'data') });
    }, true);

    // Esc closes the list, also when the search field has no focus (e.g. after a value was clicked);
    // with closed list the field loses the focus
    const closeOnEscape = e => {
        if (e.key === 'Escape' && $select.data('select2') && select2.isOpen()) {
            e.preventDefault();
            e.stopPropagation();
            $select.select2('close');
        }
    };
    container.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !select2.isOpen()) document.activeElement.blur();
    }, true);

    // The focus goes to another field (e.g. by Tab): the list closes
    const closeOnFocusElsewhere = e => {
        if (!$select.data('select2') || !select2.isOpen()) return;
        if (container.contains(e.target) || select2.dropdown.$dropdown[0].contains(e.target)) return;
        $select.select2('close');
    };

    // Only while the list is open
    $select.on('select2:open', () => {
        document.addEventListener('keydown', closeOnEscape, true);
        document.addEventListener('focusin', closeOnFocusElsewhere, true);
    });
    // Closed (Esc or a click outside): the field loses the focus (select2 would focus it again)
    $select.on('select2:close', () => {
        document.removeEventListener('keydown', closeOnEscape, true);
        document.removeEventListener('focusin', closeOnFocusElsewhere, true);
        setTimeout(() => {
            if (container.contains(document.activeElement)) document.activeElement.blur();
            container.classList.remove('select2-container--focus');
        });
    });

    return $select;
}

/*
Like initMultiSelect, but the options are reloaded every time it opens
(so items created elsewhere on the page show up), without losing the current selection.

  load:   async function returning the item list (e.g. after getUsers())
  format: item -> option text
*/
function initLazyMultiSelect(selector, { load, format, tags, isTag, dropdownParent }) {
    const $select = initMultiSelect(selector, { tags, isTag, dropdownParent });

    let isReopening = false;
    $select.on('select2:opening', async function (e) {
        if (e.isDefaultPrevented()) return; // e.g. after the × for all values with closed list

        if (isReopening) {
            isReopening = false;
            return;
        }

        e.preventDefault(); // Prevent opening

        // Remember the selection (id -> text) and disable dropdown
        const keep = new Map(
            $select.find('option:selected').toArray().map(option => [option.value, option.text])
        );
        $select.prop('disabled', true);

        let items = [];
        try {
            items = await load();
        } catch (error) {
            console.error(`Error while loading options of ${selector}:`, error);
        } finally {
            // Rebuild options, keep the selected ones
            $select.empty();

            items.forEach(item => {
                const id = String(item.id);
                $select.append(new Option(format(item), id, false, keep.has(id)));
                keep.delete(id);
            });

            // Selected items the reload did not return anymore
            keep.forEach((text, id) => {
                $select.append(new Option(text, id, false, true));
            });

            // Enable and refresh UI
            $select
                .prop('disabled', false)
                .trigger('change.select2');

            // Reopen dropdown
            isReopening = true;
            setTimeout(() => {
                $select.select2('open');
            }, 0);
        }
    });
}

// Select the given items (e.g. of a loaded record), adding missing options
function setMultiSelect(selector, items, format) {
    const $select = $(selector);
    const ids = (items || []).map(item => String(item.id));

    (items || []).forEach(item => {
        const id = String(item.id);
        if (!$select.find('option').filter((_, option) => option.value === id).length) {
            $select.append(new Option(format(item), id));
        }
    });

    $select.val(ids).trigger('change');
}

function clearMultiSelect(selector) {
    $(selector).val(null).trigger('change');
}

// Selected ids as reference objects for the API: [{ id }, ...]
function selectedRefs(selector) {
    return ($(selector).val() || []).map(id => ({ id }));
}
