// Select2 multi-select helpers -------------------------------------------------
/*
Turns a <select multiple> into a select2 multi-select whose options are
reloaded every time it opens (so items created elsewhere on the page show up),
without losing the current selection.

  load:   async function returning the item list (e.g. after getUsers())
  format: item -> option text
*/
function initLazyMultiSelect(selector, { load, format, dropdownParent }) {
    const $select = $(selector);

    $select.select2({
        placeholder: "",
        allowClear: true,
        closeOnSelect: false,
        width: "100%",
        ...(dropdownParent?.length && { dropdownParent }),
    });

    let isReopening = false;
    $select.on('select2:opening', async function (e) {
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
