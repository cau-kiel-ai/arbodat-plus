
// Unique id suffix for the elements of a fraction box. It is never decremented,
// so ids stay unique even if intermediate fractions are removed.
let fraction_id_counter = 0;

// orgOrMin and sieveSize are required if a fraction analyzed value is selected.
// The inputs are only enabled here, never disabled again.
function updateRequiredAndEnableInputsForFraction(fraction_id) {
  const isRequired = document.getElementById(`fraction_analyzed_${fraction_id}`).value !== '';
  const orgOrMinRadios = document.querySelectorAll(`input[name="orgOrMin_${fraction_id}"]`);
  const sieveSizeInput = document.getElementById(`sieveSize_${fraction_id}`);
  const stdMultiplierInput = document.getElementById(`multiplier_${fraction_id}`);

  orgOrMinRadios.forEach(radio => radio.required = isRequired);
  sieveSizeInput.required = isRequired;
  if (isRequired) {
    orgOrMinRadios.forEach(radio => radio.disabled = false);
    sieveSizeInput.disabled = false;
    stdMultiplierInput.disabled = false;
  }
}

function addFraction(fraction = null) {
  fraction_id_counter += 1;
  const id = fraction_id_counter;
  const html='\
  <div id="one_fraction" class="fraction-box" data-fraction-id="'+id+'">\
    <button type="button" class="Remove" style="width: auto; height: auto; padding: 4px 10px; margin: 0;" onclick="removeFraction(this)">remove fraction</button>\
    <legend>fraction:</legend>\
    <div class="row">\
      <div class="col-25">\
        <label for="fraction_analyzed_'+id+'">fraction analyzed:</label>\
      </div>\
      <div class="col-75">\
        <select id="fraction_analyzed_'+id+'">\
          <option value="" hidden selected> </option>\
          <option value="yes">yes</option>\
          <option value="no">no</option>\
          <option value="partly">partly</option>\
        </select>\
      </div>\
    </div>\
    <div class="row">\
      <div class="col-25">\
        <label>organic / minerals:</label>\
      </div>\
      <div class="col-75">\
        <div class="form-check form-check-inline">\
          <label class="form-check-label" for="org_'+id+'">ORG</label>\
          <input class="form-check-input" type="radio" name="orgOrMin_'+id+'" id="org_'+id+'" value="org" disabled>\
        </div>\
        <div class="form-check form-check-inline">\
          <label class="form-check-label" for="min_'+id+'">MIN</label>\
          <input class="form-check-input" type="radio" name="orgOrMin_'+id+'" id="min_'+id+'" value="min" disabled>\
        </div>\
      </div>\
    </div>\
    <div class="row">\
      <div class="col-25">\
        <label for="sieveSize_'+id+'">sieve size [mm]:</label>\
      </div>\
      <div class="col-75">\
        <input type="number" step="0.01" id="sieveSize_'+id+'" disabled>\
      </div>\
    </div>\
    <div class="row">\
      <div class="col-25"> \
        <label for="multiplier_'+id+'">standard multiplier:</label>\
      </div>\
      <div class="col-75">\
        <input type="number" step="0.01" id="multiplier_'+id+'" min="1" disabled>\
      </div>\
    </div>\
  </div>'
  document.getElementById('fractions').insertAdjacentHTML('beforeend', html);
  document.getElementById(`fraction_analyzed_${id}`)
    .addEventListener('change', () => updateRequiredAndEnableInputsForFraction(id));

  if (fraction) {
    document.getElementById("fraction_analyzed_" + id).value = fraction.fractionAnalyzed ?? '';
    document.getElementById("org_" + id).checked = fraction.orgOrMin === "org";
    document.getElementById("min_" + id).checked = fraction.orgOrMin === "min";
    document.getElementById("sieveSize_" + id).value  = fraction.sieveSize ?? '';
    document.getElementById("multiplier_" + id).value = fraction.standardMultiplier ?? '';
    // programmatic changes fire no 'change' event, so update required/enabled here
    updateRequiredAndEnableInputsForFraction(id);
  }
  renumberFractions();
}

function removeFraction(button) {
  button.closest('.fraction-box').remove();
  renumberFractions();
}

function renumberFractions() {
  document.querySelectorAll('#fractions .fraction-box legend').forEach((legend, index) => {
    legend.textContent = 'fraction ' + (index + 1) + ':';
  });
}

// Remove all fractions and leave a single empty one
function resetFractions() {
  document.getElementById('fractions').innerHTML = '';
  addFraction();
}

// Replace all fractions with the given list (one empty fraction if the list is empty)
function setFractions(fraction_list) {
  resetFractions();
  if (!fraction_list || fraction_list.length === 0) return;
  document.getElementById('fractions').innerHTML = '';
  fraction_list.forEach(fraction => addFraction(fraction));
}

// Fractions for the payload (fractions without 'fraction analyzed' are skipped)
function getFractions() {
  const fraction_list = [];
  document.querySelectorAll('#fractions .fraction-box').forEach(box => {
    const id = box.dataset.fractionId;
    const fraction_analyzed = document.getElementById("fraction_analyzed_" + id);
    if (fraction_analyzed.value) {
      const org = document.getElementById("org_" + id).checked;
      const min = document.getElementById("min_" + id).checked;
      fraction_list.push({
        fractionAnalyzed: fraction_analyzed.value,
        orgOrMin: org ? "org" : min ? "min" : null,
        sieveSize: document.getElementById("sieveSize_" + id).value,
        standardMultiplier: document.getElementById("multiplier_" + id).value
      });
    }
  });
  return fraction_list;
}

document.addEventListener("DOMContentLoaded", () => addFraction());
