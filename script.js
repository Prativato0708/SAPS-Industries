/* ==========================================================================
   SAPS Industries — Application Logic (vanilla JS, no dependencies)
   Handles: login, sidebar, quotation list filters/views, multi-step wizard,
            product modal, pricing, and review synchronisation.
   ========================================================================== */

/* ---------- Helpers ---------------------------------------------------- */
const GST_RATE = 0.18;

/** Format a number as Indian-grouped rupees, e.g. 245000 -> ₹2,45,000 */
function formatINR(value, withPaise = false) {
  const n = Number(value) || 0;
  const opts = withPaise
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return '₹' + n.toLocaleString('en-IN', opts);
}

function $(id) { return document.getElementById(id); }

/* ---------- 1. LOGIN --------------------------------------------------- */
function handleLogin(event) {
  event.preventDefault();
  const btn = event.target.querySelector('button[type="submit"]');
  if (btn) {
    btn.textContent = 'Signing in…';
    btn.disabled = true;
  }
  // Prototype: simulate auth then route to dashboard.
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);
}

/* ---------- 2. SIDEBAR ------------------------------------------------- */
function toggleSidebar() {
  const app = document.querySelector('.app-container');
  if (!app) return;
  app.classList.toggle('collapsed');
  try {
    localStorage.setItem(
      'sidebarCollapsed',
      app.classList.contains('collapsed') ? '1' : '0'
    );
  } catch (e) { /* storage unavailable — ignore */ }
}

/** Restore the persisted collapsed/expanded state on page load. */
function initSidebarState() {
  const app = document.querySelector('.app-container');
  if (!app) return;
  let collapsed = false;
  try { collapsed = localStorage.getItem('sidebarCollapsed') === '1'; } catch (e) {}
  app.classList.toggle('collapsed', collapsed);
}

/* ---------- 2b. THEME (light / dark) ----------------------------------- */
/** Apply a theme ('light' | 'dark') and sync any toggle button icons. */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  // Swap the icon on every theme-toggle button (moon = go dark, sun = go light)
  document.querySelectorAll('.theme-toggle i').forEach((icon) => {
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  });
  // Re-render canvas charts so they pick up the new palette.
  if (typeof window.renderCharts === 'function') window.renderCharts();
}

/** Toggle between light and dark, persisting the choice. */
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch (e) {}
  applyTheme(next);
}

/** Load the saved theme on page load (defaults to light). */
function initTheme() {
  let theme = 'light';
  try { theme = localStorage.getItem('theme') || 'light'; } catch (e) {}
  applyTheme(theme);
}

/* ---------- 3. QUOTATIONS: SEARCH + FILTER ----------------------------- */
function filterQuotations() {
  const term = ($('searchInput')?.value || '').toLowerCase().trim();
  const status = $('statusFilter')?.value || '';

  const matches = (el) => {
    const okStatus = !status || el.dataset.status === status;
    const okTerm = !term || el.textContent.toLowerCase().includes(term);
    return okStatus && okTerm;
  };

  document.querySelectorAll('.quotation-card').forEach((card) => {
    card.style.display = matches(card) ? '' : 'none';
  });
  document.querySelectorAll('#tableView tbody tr').forEach((row) => {
    row.style.display = matches(row) ? '' : 'none';
  });
}

/* ---------- 4. QUOTATIONS: VIEW TOGGLE --------------------------------- */
function switchView(view) {
  const grid = $('gridView');
  const table = $('tableView');
  if (grid) grid.style.display = view === 'grid' ? '' : 'none';
  if (table) table.style.display = view === 'table' ? '' : 'none';

  document.querySelectorAll('.view-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

/* ======================================================================
   5. MULTI-STEP QUOTATION WIZARD
   ====================================================================== */
let currentStep = 1;
const TOTAL_STEPS = 5;

function renderStep() {
  // Form panels
  document.querySelectorAll('.form-step').forEach((panel, i) => {
    panel.classList.toggle('active', i + 1 === currentStep);
  });

  // Stepper indicators
  document.querySelectorAll('.step').forEach((step) => {
    const n = Number(step.dataset.step);
    step.classList.toggle('active', n === currentStep);
    step.classList.toggle('completed', n < currentStep);
  });

  // Connector fill
  document.querySelectorAll('.step-line').forEach((line, i) => {
    line.classList.toggle('filled', i + 1 < currentStep);
  });

  // Navigation buttons
  const prev = $('prevBtn');
  const next = $('nextBtn');
  const submit = $('submitBtn');
  if (prev) prev.style.display = currentStep === 1 ? 'none' : '';
  if (next) next.style.display = currentStep === TOTAL_STEPS ? 'none' : '';
  if (submit) submit.style.display = currentStep === TOTAL_STEPS ? '' : 'none';

  if (currentStep === 3) renderPhases();
  if (currentStep === TOTAL_STEPS) syncReview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Lightweight required-field validation for the current step only. */
function validateStep(step) {
  const panel = $('step' + step);
  if (!panel) return true;
  let firstInvalid = null;
  panel.querySelectorAll('[required]').forEach((field) => {
    // Skip fields that are currently hidden (e.g. full-delivery fields when
    // phase-wise delivery is selected) so they don't block navigation.
    if (field.offsetParent === null) {
      field.style.borderColor = '';
      field.style.boxShadow = '';
      return;
    }
    if (!field.value || !field.value.trim()) {
      field.style.borderColor = 'var(--error-500)';
      field.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.18)';
      if (!firstInvalid) firstInvalid = field;
    } else {
      field.style.borderColor = '';
      field.style.boxShadow = '';
    }
  });
  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  return true;
}

function changeStep(direction) {
  if (direction > 0 && !validateStep(currentStep)) return;
  const target = currentStep + direction;
  if (target < 1 || target > TOTAL_STEPS) return;
  currentStep = target;
  renderStep();
}

/* ======================================================================
   6. PRODUCT MODAL + TABLE
   ====================================================================== */
let products = [];

function openProductModal() {
  const modal = $('productModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('productName')?.focus(), 50);
  }
}

function closeProductModal() {
  const modal = $('productModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
    $('productForm')?.reset();
    const pt = $('productTotal');
    if (pt) pt.textContent = formatINR(0, true);
  }
}

function calculateProductTotal() {
  const qty = parseFloat($('quantity')?.value) || 0;
  const price = parseFloat($('unitPrice')?.value) || 0;
  const pt = $('productTotal');
  if (pt) pt.textContent = formatINR(qty * price, true);
}

function addProduct(event) {
  event.preventDefault();
  const product = {
    id: Date.now(),
    name: $('productName').value.trim(),
    material: $('material').value,
    specs: $('specifications').value.trim(),
    qty: parseFloat($('quantity').value) || 0,
    price: parseFloat($('unitPrice').value) || 0,
  };
  product.total = product.qty * product.price;
  products.push(product);
  renderProducts();
  closeProductModal();
}

function removeProduct(id) {
  products = products.filter((p) => p.id !== id);
  renderProducts();
}

function renderProducts() {
  const body = $('productsTableBody');
  if (!body) return;

  if (products.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="none">
            <path fill-rule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" fill="currentColor" opacity="0.3"/>
          </svg>
          <p>No products added yet</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openProductModal()">Add First Product</button>
        </td>
      </tr>`;
    const ps = $('pricingSummary');
    if (ps) ps.style.display = 'none';
    return;
  }

  body.innerHTML = products.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.material)}</td>
      <td>${escapeHtml(p.specs) || '<span style="color:var(--text-faint)">—</span>'}</td>
      <td>${p.qty}</td>
      <td>${formatINR(p.price, true)}</td>
      <td><strong>${formatINR(p.total, true)}</strong></td>
      <td>
        <button type="button" class="btn-icon" title="Remove" onclick="removeProduct(${p.id})">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" fill="currentColor"/>
          </svg>
        </button>
      </td>
    </tr>`).join('');

  updatePricing();
}

function calcTotals() {
  const subtotal = products.reduce((s, p) => s + p.total, 0);
  const gst = subtotal * GST_RATE;
  return { subtotal, gst, total: subtotal + gst };
}

function updatePricing() {
  const { subtotal, gst, total } = calcTotals();
  const ps = $('pricingSummary');
  if (ps) ps.style.display = '';
  if ($('subtotal')) $('subtotal').textContent = formatINR(subtotal);
  if ($('gst')) $('gst').textContent = formatINR(gst);
  if ($('total')) $('total').textContent = formatINR(total);
}

/* ======================================================================
   6b. DELIVERY MODE + PHASE-WISE DELIVERY (step 3)
   ====================================================================== */
let phases = [];
let phaseSeq = 0;

/** Switch between 'full' and 'phase' delivery schedules. */
function setDeliveryMode(mode) {
  const hidden = $('deliveryMode');
  if (hidden) hidden.value = mode;

  document.querySelectorAll('.delivery-mode-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });

  const fullFields = $('fullDeliveryFields');
  if (fullFields) fullFields.style.display = mode === 'phase' ? 'none' : '';

  const section = $('phaseSection');
  if (section) section.style.display = mode === 'phase' ? '' : 'none';

  if (mode === 'phase') {
    renderPhases();
    if (phases.length === 0) addPhase(); // start with one phase row
  }
}

/** Build <option>s for a phase's product picker from the products added in step 2. */
function phaseProductOptions(selectedId) {
  if (products.length === 0) {
    return '<option value="">No products — add them in Step 2</option>';
  }
  return '<option value="">Select product</option>' + products.map((p) =>
    `<option value="${p.id}"${String(p.id) === String(selectedId) ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');
}

function addPhase() {
  phases.push({ id: ++phaseSeq, productId: '', qty: '', time: '', unit: 'days' });
  renderPhases();
}

function removePhase(id) {
  phases = phases.filter((p) => p.id !== id);
  renderPhases();
}

/** Persist a single field edit so values survive re-renders. */
function updatePhase(id, field, value) {
  const ph = phases.find((p) => p.id === id);
  if (ph) ph[field] = value;
}

function renderPhases() {
  const body = $('phasesTableBody');
  if (!body) return;

  if (phases.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <p>No phases added yet</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addPhase()">Add First Phase</button>
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = phases.map((ph, i) => `
    <tr>
      <td><strong>Phase ${i + 1}</strong></td>
      <td>
        <select onchange="updatePhase(${ph.id},'productId',this.value)">${phaseProductOptions(ph.productId)}</select>
      </td>
      <td>
        <input type="number" min="1" placeholder="0" value="${ph.qty}" oninput="updatePhase(${ph.id},'qty',this.value)">
      </td>
      <td>
        <div class="phase-time">
          <input type="number" min="0" placeholder="0" value="${ph.time}" oninput="updatePhase(${ph.id},'time',this.value)">
          <select onchange="updatePhase(${ph.id},'unit',this.value)">
            <option value="days"${ph.unit === 'days' ? ' selected' : ''}>Days</option>
            <option value="weeks"${ph.unit === 'weeks' ? ' selected' : ''}>Weeks</option>
            <option value="months"${ph.unit === 'months' ? ' selected' : ''}>Months</option>
          </select>
        </div>
      </td>
      <td>
        <button type="button" class="btn-icon" title="Remove" onclick="removePhase(${ph.id})">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" fill="currentColor"/>
          </svg>
        </button>
      </td>
    </tr>`).join('');
}

/* ======================================================================
   7. REVIEW STEP SYNC
   ====================================================================== */
const PAYMENT_LABELS = {
  advance: '100% Advance',
  '50-50': '50% Advance, 50% on Delivery',
  '30-70': '30% Advance, 70% on Delivery',
  net30: 'Net 30 Days',
  net60: 'Net 60 Days',
};

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value || '—';
}

function syncReview() {
  setText('reviewOrgName', $('orgName')?.value);
  setText('reviewOrgType', $('orgType')?.value);
  setText('reviewOrgEmail', $('orgEmail')?.value);
  setText('reviewOrgPhone', $('orgPhone')?.value);
  setText('reviewPocName', $('pocName')?.value);
  setText('reviewPocDesignation', $('pocDesignation')?.value);
  setText('reviewPocEmail', $('pocEmail')?.value);
  setText('reviewPocPhone', $('pocPhone')?.value);
  setText('reviewQuotationDate', $('quotationDate')?.value);
  setText('reviewValidUntil', $('validUntil')?.value);
  setText('reviewPaymentTerms', PAYMENT_LABELS[$('paymentTerms')?.value] || $('paymentTerms')?.value);
  setText('reviewDeliveryDate', $('deliveryDate')?.value);

  // Delivery schedule (full vs phase-wise)
  const mode = $('deliveryMode')?.value || 'full';
  setText('reviewDeliverySchedule',
    mode === 'phase' ? 'Phase-wise delivery' : 'Full delivery on completion');

  const phWrap = $('reviewPhasesWrap');
  const phList = $('reviewPhasesList');
  if (phWrap && phList) {
    if (mode === 'phase' && phases.length) {
      phWrap.style.display = '';
      phList.innerHTML = phases.map((ph, i) => {
        const prod = products.find((p) => String(p.id) === String(ph.productId));
        const name = prod ? prod.name : '—';
        const t = ph.time ? `${ph.time} ${ph.unit || 'days'}` : '—';
        return `
        <div class="review-product-row">
          <div>
            <div class="rp-name">Phase ${i + 1}: ${escapeHtml(name)}</div>
            <div class="rp-sub">Qty ${ph.qty || 0} · Est. ${escapeHtml(t)}</div>
          </div>
        </div>`;
      }).join('');
    } else {
      phWrap.style.display = 'none';
      phList.innerHTML = '';
    }
  }

  const list = $('reviewProductsList');
  if (list) {
    list.innerHTML = products.length
      ? products.map((p) => `
        <div class="review-product-row">
          <div>
            <div class="rp-name">${escapeHtml(p.name)}</div>
            <div class="rp-sub">${escapeHtml(p.material)} · Qty ${p.qty} × ${formatINR(p.price, true)}</div>
          </div>
          <div class="rp-amt">${formatINR(p.total, true)}</div>
        </div>`).join('')
      : '<p style="color:var(--text-muted);font-size:13px;">No products added.</p>';
  }

  const { subtotal, gst, total } = calcTotals();
  setText('reviewSubtotal', formatINR(subtotal));
  setText('reviewGst', formatINR(gst));
  setText('reviewTotal', formatINR(total));
}

/* ---------- security helper ------------------------------------------- */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/* ======================================================================
   7b. QUOTATION PERSISTENCE + LIST RENDERING
   ====================================================================== */
const QUOTES_KEY = 'saps_quotations';

function getStoredQuotations() {
  try { return JSON.parse(localStorage.getItem(QUOTES_KEY)) || []; }
  catch (e) { return []; }
}

/** Next id like Q-<year>-NNN, continuing past the demo data (…-043). */
function nextQuotationId(list) {
  const year = ($('quotationDate')?.value || '').slice(0, 4) || String(new Date().getFullYear());
  let max = 43; // demo data tops out at Q-2024-043
  list.forEach((q) => {
    const m = /(\d+)\s*$/.exec(q.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `Q-${year}-${String(max + 1).padStart(3, '0')}`;
}

/** Format an ISO date (yyyy-mm-dd) as e.g. "Jun 23, 2026". */
function fmtListDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build and store a quotation from the current wizard state (newest first). */
function saveNewQuotation() {
  const list = getStoredQuotations();
  const { total } = calcTotals();
  const totalUnits = products.reduce((s, p) => s + (Number(p.qty) || 0), 0);
  const desc = products.length
    ? `${products[0].name}${products.length > 1 ? ` + ${products.length - 1} more` : ''} — ${totalUnits} units`
    : (($('notes')?.value || '').trim() || 'New quotation');

  const q = {
    id: nextQuotationId(list),
    client: ($('orgName')?.value || '').trim() || 'Unnamed Organisation',
    amount: total,
    date: $('quotationDate')?.value || '',
    validUntil: $('validUntil')?.value || '',
    status: 'active',
    desc,
  };
  list.unshift(q);
  try { localStorage.setItem(QUOTES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  return q;
}

function showSuccessModal() {
  const m = $('successModal');
  if (!m) { goToQuotations(); return; }
  m.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function goToQuotations() {
  window.location.href = 'quotations.html';
}

/* ---- Rendering stored quotations on the list page -------------------- */
const STATUS_BADGE = { active: 'badge-success', expired: 'badge-error', converted: 'badge-info' };

function statusLabel(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Active'; }

function storedQuotationCardHtml(q) {
  const badge = STATUS_BADGE[q.status] || 'badge-success';
  return `
    <div class="card quotation-card" data-status="${escapeHtml(q.status)}">
      <div class="quotation-header">
        <div>
          <div class="quotation-id">${escapeHtml(q.id)}</div>
          <div class="quotation-client">${escapeHtml(q.client)}</div>
        </div>
        <span class="badge ${badge}">${escapeHtml(statusLabel(q.status))}</span>
      </div>
      <div class="quotation-body">
        <div class="quotation-meta">
          <div class="meta-item">
            <span class="meta-label">Amount</span>
            <span class="meta-value">${formatINR(q.amount)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Valid Until</span>
            <span class="meta-value">${escapeHtml(fmtListDate(q.validUntil))}</span>
          </div>
        </div>
        <div class="quotation-desc">${escapeHtml(q.desc)}</div>
      </div>
      <div class="quotation-footer">
        <button class="btn btn-secondary btn-sm">View Details</button>
        <button class="btn btn-primary btn-sm">Convert to Order</button>
      </div>
    </div>`;
}

function storedQuotationRowHtml(q) {
  const badge = STATUS_BADGE[q.status] || 'badge-success';
  return `
    <tr data-status="${escapeHtml(q.status)}">
      <td><strong>${escapeHtml(q.id)}</strong></td>
      <td>${escapeHtml(q.client)}</td>
      <td>${formatINR(q.amount)}</td>
      <td>${escapeHtml(fmtListDate(q.date))}</td>
      <td>${escapeHtml(fmtListDate(q.validUntil))}</td>
      <td><span class="badge ${badge}">${escapeHtml(statusLabel(q.status))}</span></td>
      <td>
        <button class="btn-icon" title="View">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" fill="currentColor"/>
            <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" fill="currentColor"/>
          </svg>
        </button>
      </td>
    </tr>`;
}

/** Prepend any stored quotations to the grid + table so newest shows first. */
function renderStoredQuotations() {
  const grid = $('gridView');
  if (!grid) return; // not on the quotations list page
  const list = getStoredQuotations();
  if (!list.length) return;
  grid.insertAdjacentHTML('afterbegin', list.map(storedQuotationCardHtml).join(''));
  const tableBody = document.querySelector('#tableView tbody');
  if (tableBody) tableBody.insertAdjacentHTML('afterbegin', list.map(storedQuotationRowHtml).join(''));
}

/* ======================================================================
   8. INIT
   ====================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Restore sidebar collapsed/expanded state (shared across all pages)
  initSidebarState();
  // Sync theme toggle icon with the theme already applied by the inline head script
  initTheme();

  // On the quotations list page, surface any quotations created in this browser.
  renderStoredQuotations();

  // Wizard form submit
  const qForm = $('quotationForm');
  if (qForm) {
    renderStep();
    qForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = $('submitBtn');
      if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }
      // Persist the new quotation so it shows at the top of the list, then
      // confirm with a success dialog.
      saveNewQuotation();
      setTimeout(() => {
        if (btn) { btn.textContent = 'Create Quotation'; btn.disabled = false; }
        showSuccessModal();
      }, 400);
    });

    // Sensible default dates
    const today = new Date().toISOString().split('T')[0];
    if ($('quotationDate') && !$('quotationDate').value) $('quotationDate').value = today;
  }

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProductModal();
  });
});
