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
  try {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved === '1') collapsed = true;
    else if (saved === '0') collapsed = false;
    else collapsed = window.matchMedia('(max-width: 820px)').matches; // default: mini rail on mobile
  } catch (e) { /* storage unavailable — ignore */ }
  app.classList.toggle('collapsed', collapsed);
  ensureSidebarArrow(app);
}

/** Create the floating, vertically-centered arrow collapse button once. */
function ensureSidebarArrow(app) {
  if (!app || app.querySelector('.sidebar-collapse-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-collapse-btn';
  btn.setAttribute('aria-label', 'Toggle sidebar');
  btn.title = 'Collapse / expand sidebar';
  btn.addEventListener('click', toggleSidebar);
  btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  app.appendChild(btn);
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
let editingProductId = null;

function setProductModalMode(mode) {
  const title = $('productModalTitle');
  const btn = $('productSubmitBtn');
  if (title) title.textContent = mode === 'edit' ? 'Edit Product' : 'Add Product';
  if (btn) btn.textContent = mode === 'edit' ? 'Save Changes' : 'Add Product';
}

function openProductModal() {
  editingProductId = null;
  setProductModalMode('add');
  const modal = $('productModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('productName')?.focus(), 50);
  }
}

/** Open the modal pre-filled to edit an existing product (specs + price). */
function editProduct(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  editingProductId = id;
  if ($('productName')) $('productName').value = p.name;
  if ($('material')) $('material').value = p.material;
  if ($('specifications')) $('specifications').value = p.specs;
  if ($('quantity')) $('quantity').value = p.qty;
  if ($('unitPrice')) $('unitPrice').value = p.price;
  calculateProductTotal();
  setProductModalMode('edit');
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
  editingProductId = null;
  setProductModalMode('add');
}

function calculateProductTotal() {
  const qty = parseFloat($('quantity')?.value) || 0;
  const price = parseFloat($('unitPrice')?.value) || 0;
  const pt = $('productTotal');
  if (pt) pt.textContent = formatINR(qty * price, true);
}

function addProduct(event) {
  event.preventDefault();
  const data = {
    name: $('productName').value.trim(),
    material: $('material').value,
    specs: $('specifications').value.trim(),
    qty: parseFloat($('quantity').value) || 0,
    price: parseFloat($('unitPrice').value) || 0,
  };
  data.total = data.qty * data.price;

  if (editingProductId) {
    const p = products.find((x) => x.id === editingProductId);
    if (p) Object.assign(p, data);
  } else {
    products.push({ id: Date.now(), ...data });
  }
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
        <button type="button" class="btn-icon" title="Edit" onclick="editProduct(${p.id})">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.95 8.95a1 1 0 01-.44.256l-3.5 1a.5.5 0 01-.618-.617l1-3.5a1 1 0 01.256-.44l8.95-8.95z" fill="currentColor"/>
          </svg>
        </button>
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
  saveQuotationDetail(q.id, collectQuotationDetail());
  return q;
}

/* ---- Full quotation details (for editing / partial conversion) ------- */
const QUOTE_DETAILS_KEY = 'saps_quotation_details';

function getQuotationDetails() {
  try { return JSON.parse(localStorage.getItem(QUOTE_DETAILS_KEY)) || {}; }
  catch (e) { return {}; }
}

function saveQuotationDetail(id, detail) {
  if (!id) return;
  const all = getQuotationDetails();
  all[id] = detail;
  try { localStorage.setItem(QUOTE_DETAILS_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
}

/** Snapshot every wizard field + product so the quotation can be re-opened. */
function collectQuotationDetail() {
  return {
    org: {
      name: $('orgName')?.value || '', type: $('orgType')?.value || '',
      email: $('orgEmail')?.value || '', phone: $('orgPhone')?.value || '',
      address: $('orgAddress')?.value || '',
    },
    poc: {
      name: $('pocName')?.value || '', designation: $('pocDesignation')?.value || '',
      email: $('pocEmail')?.value || '', phone: $('pocPhone')?.value || '',
    },
    quotationDate: $('quotationDate')?.value || '',
    validUntil: $('validUntil')?.value || '',
    enquiryNumber: $('enquiryNumber')?.value || '',
    notes: $('notes')?.value || '',
    paymentTerms: $('paymentTerms')?.value || '',
    paymentMode: $('paymentMode')?.value || '',
    paymentNotes: $('paymentNotes')?.value || '',
    delivery: {
      date: $('deliveryDate')?.value || '', method: $('deliveryMethod')?.value || '',
      address: $('deliveryAddress')?.value || '', mode: $('deliveryMode')?.value || 'full',
    },
    phases: phases.map((ph) => {
      const prod = products.find((p) => String(p.id) === String(ph.productId));
      return { product: prod ? prod.name : '', qty: ph.qty, time: ph.time, unit: ph.unit };
    }),
    products: products.map((p) => ({
      name: p.name, material: p.material, specs: p.specs, qty: p.qty, price: p.price,
    })),
  };
}

/** Seed full details for the static demo quotations (once) so they're editable. */
function seedDemoQuotationDetails() {
  const all = getQuotationDetails();
  const seeds = {
    'Q-2024-043': {
      org: { name: 'Acme Manufacturing Co.', type: 'Manufacturing', email: 'info@acme.com', phone: '+91 22 1234 5678', address: 'Plot 14, MIDC, Pune' },
      poc: { name: 'R. Sharma', designation: 'Procurement Manager', email: 'r.sharma@acme.com', phone: '+91 98765 43210' },
      quotationDate: '2024-12-15', validUntil: '2024-12-28', enquiryNumber: 'ENQ-2024-043', notes: '',
      paymentTerms: '50-50', paymentMode: 'bank', paymentNotes: '',
      delivery: { date: '2025-01-20', method: 'courier', address: 'Acme Plant, Pune', mode: 'full' },
      products: [
        { name: 'Machined Component', material: 'Stainless Steel 304', specs: 'CNC machined, tolerance ±0.05mm', qty: 300, price: 520 },
        { name: 'CNC Turned Part', material: 'Stainless Steel 316', specs: 'Polished finish', qty: 200, price: 430 },
      ],
    },
    'Q-2024-042': {
      org: { name: 'Tech Industries Ltd.', type: 'Engineering', email: 'info@techind.com', phone: '+91 80 4567 8900', address: 'Whitefield, Bengaluru' },
      poc: { name: 'A. Verma', designation: 'Purchase Lead', email: 'a.verma@techind.com', phone: '+91 99001 22334' },
      quotationDate: '2024-12-12', validUntil: '2024-12-25', enquiryNumber: 'ENQ-2024-042', notes: '',
      paymentTerms: '30-70', paymentMode: 'bank', paymentNotes: '',
      delivery: { date: '2025-01-15', method: 'freight', address: 'Tech Industries, Bengaluru', mode: 'phase' },
      phases: [
        { product: 'Custom Component', qty: 150, time: 3, unit: 'weeks' },
        { product: 'Custom Component', qty: 150, time: 5, unit: 'weeks' },
      ],
      products: [
        { name: 'Custom Component', material: 'Aluminum 6061', specs: 'Anodized extrusion profile', qty: 300, price: 610 },
      ],
    },
    'Q-2024-041': {
      org: { name: 'Global Parts Inc.', type: 'Automotive', email: 'info@globalparts.com', phone: '+91 44 2233 4455', address: 'Ambattur, Chennai' },
      poc: { name: 'S. Iyer', designation: 'Sourcing Manager', email: 's.iyer@globalparts.com', phone: '+91 98400 11223' },
      quotationDate: '2024-11-28', validUntil: '2024-12-10', enquiryNumber: 'ENQ-2024-041', notes: '',
      paymentTerms: 'advance', paymentMode: 'bank', paymentNotes: '',
      delivery: { date: '2024-12-30', method: 'own', address: 'Global Parts, Chennai', mode: 'full' },
      products: [
        { name: 'Machined Component', material: 'Mild Steel', specs: 'Precision ground', qty: 200, price: 780 },
      ],
    },
    'Q-2024-040': {
      org: { name: 'Supreme Engineering', type: 'Construction', email: 'info@supremeengg.com', phone: '+91 79 5566 7788', address: 'Vatva, Ahmedabad' },
      poc: { name: 'M. Patel', designation: 'Project Engineer', email: 'm.patel@supremeengg.com', phone: '+91 97250 44556' },
      quotationDate: '2024-11-25', validUntil: '2024-12-08', enquiryNumber: 'ENQ-2024-040', notes: '',
      paymentTerms: 'net30', paymentMode: 'cheque', paymentNotes: '',
      delivery: { date: '2024-12-22', method: 'freight', address: 'Supreme Engineering, Ahmedabad', mode: 'full' },
      products: [
        { name: 'Welded Assembly', material: 'Mild Steel', specs: 'MIG welded frame', qty: 750, price: 480 },
      ],
    },
  };
  let changed = false;
  let ver = '';
  try { ver = localStorage.getItem('saps_seed_version') || ''; } catch (e) { /* ignore */ }
  const force = ver !== '2';
  Object.keys(seeds).forEach((id) => {
    if (!all[id] || force) { all[id] = seeds[id]; changed = true; }
  });
  if (changed) { try { localStorage.setItem(QUOTE_DETAILS_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } }
  if (force) { try { localStorage.setItem('saps_seed_version', '2'); } catch (e) { /* ignore */ } }
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
        <button class="btn btn-primary btn-sm" onclick="openConvertModal(this)">Convert to Order</button>
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
        <button class="btn-icon" title="Convert" onclick="openConvertModal(this)">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="currentColor"/>
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

/* ---- Convert to Order (full vs partial) ------------------------------ */
let convertTargetId = '';

/** Open the convert dialog, reading the quotation id from the clicked row/card. */
function openConvertModal(triggerEl) {
  let id = '';
  if (triggerEl) {
    const card = triggerEl.closest('.quotation-card');
    const row = triggerEl.closest('tr');
    if (card) id = card.querySelector('.quotation-id')?.textContent.trim() || '';
    else if (row) id = row.querySelector('td strong')?.textContent.trim() || '';
  }
  convertTargetId = id;

  const label = $('convertQuotationId');
  if (label) label.textContent = id ? `quotation ${id}` : 'this quotation';

  // Default selection back to "full" each time the dialog opens.
  const full = document.querySelector('input[name="convertType"][value="full"]');
  if (full) full.checked = true;

  const modal = $('convertModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeConvertModal() {
  const modal = $('convertModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/** Proceed with the chosen conversion type. */
function confirmConvert() {
  const type = document.querySelector('input[name="convertType"]:checked')?.value || 'full';
  try {
    localStorage.setItem('saps_lastConvert', JSON.stringify({ id: convertTargetId, type }));
  } catch (e) { /* ignore */ }
  closeConvertModal();
  if (type === 'partial' && convertTargetId) {
    // Partial order: open the quotation for editing on the product step.
    window.location.href = 'quotation-create.html?edit=' + encodeURIComponent(convertTargetId);
  } else {
    // Full order: a converted quotation becomes an order.
    window.location.href = 'orders.html';
  }
}

/* ---- Edit / partial-conversion prefill ------------------------------- */
let editMode = false;
let editQuotationId = '';

/** If the page was opened as ?edit=<id>, prefill the wizard from saved data. */
function loadEditQuotation() {
  const id = new URLSearchParams(window.location.search).get('edit');
  if (!id) return false;
  const detail = getQuotationDetails()[id];
  if (!detail) return false;

  editMode = true;
  editQuotationId = id;

  const set = (elId, val) => { const el = $(elId); if (el) el.value = val || ''; };
  set('orgName', detail.org?.name); set('orgType', detail.org?.type);
  set('orgEmail', detail.org?.email); set('orgPhone', detail.org?.phone);
  set('orgAddress', detail.org?.address);
  set('pocName', detail.poc?.name); set('pocDesignation', detail.poc?.designation);
  set('pocEmail', detail.poc?.email); set('pocPhone', detail.poc?.phone);
  set('quotationDate', detail.quotationDate); set('validUntil', detail.validUntil);
  set('enquiryNumber', detail.enquiryNumber); set('notes', detail.notes);
  set('paymentTerms', detail.paymentTerms); set('paymentMode', detail.paymentMode);
  set('paymentNotes', detail.paymentNotes);
  set('deliveryDate', detail.delivery?.date); set('deliveryMethod', detail.delivery?.method);
  set('deliveryAddress', detail.delivery?.address);

  products = (detail.products || []).map((p, i) => ({
    id: Date.now() + i,
    name: p.name, material: p.material, specs: p.specs,
    qty: p.qty, price: p.price, total: (Number(p.qty) || 0) * (Number(p.price) || 0),
  }));
  renderProducts();
  if (detail.delivery?.mode) setDeliveryMode(detail.delivery.mode);

  // Reframe the page for partial-order editing.
  if ($('pageTitle')) $('pageTitle').textContent = 'Modify Order — ' + id;
  if ($('pageSubtitle')) $('pageSubtitle').textContent =
    'Partial order: adjust product specifications, prices or remove products, then create the order.';
  const submitBtn = $('submitBtn');
  if (submitBtn) submitBtn.innerHTML = submitBtn.innerHTML.replace('Create Quotation', 'Modify Quote and Create Order');
  return true;
}

/* ======================================================================
   7c. ORDERS STORE + ORDER DETAILS PAGE
   ====================================================================== */
const ORDER_STATUS = {
  ongoing: ['badge-warning', 'In Progress'],
  completed: ['badge-success', 'Completed'],
  upcoming: ['badge-info', 'Scheduled'],
};

const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" fill="currentColor"/></svg>';
const PENCIL_SVG = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5L4 16l1.086-3.914 8.5-8.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Current on-hand stock per raw material, keyed by material name. In a full
   build this would come from the Inventory module; here it is seeded with
   demo values so the "Quantity in Stock" column reflects realistic figures. */
const MATERIAL_STOCK = {
  'Stainless Steel 304 sheet': '0.8 T',
  'M8 fasteners': '1,200 pcs',
  'Cutting fluid': '60 L',
  'Aluminum 6061 billet': '1.5 T',
  'Anodizing chemicals': '40 L',
  'Protective packaging': '200 units',
  'Mild steel plate': '5.0 T',
  'MIG welding wire': '90 kg',
  'Primer paint': '120 L',
  'Stainless Steel 316 ingots': '3.2 T',
  'Mold sand': '2.0 T',
  'Foundry flux': '50 kg',
  'Mild steel billet': '4.0 T',
  'Die lubricant': '70 L',
  'Heat-treatment salts': '40 kg',
};

/** Look up the on-hand stock for a raw material name (defaults to em dash).
   Prefers the managed raw-material catalogue from Settings, then the seed map. */
function getMaterialStock(name) {
  const key = String(name || '').trim();
  if (!key) return '—';
  try {
    const list = JSON.parse(localStorage.getItem('saps_set_raw'));
    if (Array.isArray(list)) {
      const m = list.find((r) => String(r.name).trim().toLowerCase() === key.toLowerCase());
      if (m) return `${m.stock} ${m.unit}`.trim();
    }
  } catch (e) { /* ignore */ }
  return MATERIAL_STOCK[key] || '—';
}

const ORDERS_KEY = 'saps_orders';
const ORDER_DETAILS_KEY = 'saps_order_details';

function getOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY)) || {}; } catch (e) { return {}; }
}
function saveOrders(all) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
}
function getOrderDetails() {
  try { return JSON.parse(localStorage.getItem(ORDER_DETAILS_KEY)) || {}; } catch (e) { return {}; }
}
function saveOrderDetailRecord(orderNo, rec) {
  if (!orderNo) return;
  const all = getOrderDetails();
  all[orderNo] = rec;
  try { localStorage.setItem(ORDER_DETAILS_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
}

function orderFromCard(card) {
  const d = card.dataset;
  return {
    order: d.order, client: d.client, product: d.product, quotation: d.quotation,
    qty: d.qty, progress: d.progress, status: d.status,
    complete: d.complete || '', start: d.start || '', raw: d.raw || '',
  };
}

/** On the orders list page, persist each card to the store (only if missing). */
function seedOrdersFromCards() {
  const cards = document.querySelectorAll('.order-card[data-order]');
  if (!cards.length) return;
  const all = getOrders();
  let changed = false;
  cards.forEach((card) => {
    if (!all[card.dataset.order]) { all[card.dataset.order] = orderFromCard(card); changed = true; }
  });
  if (changed) saveOrders(all);
}

/** Reflect persisted status/progress (e.g. an order that was started) onto cards. */
function applyOrderOverrides() {
  const cards = document.querySelectorAll('.order-card[data-order]');
  if (!cards.length) return;
  const orders = getOrders();
  cards.forEach((card) => {
    const rec = orders[card.dataset.order];
    if (rec && rec.status && rec.status !== card.dataset.status) {
      setCardStatus(card, rec.status, rec.progress || card.dataset.progress);
    }
  });
  updateOrderCounts();
}

function setCardStatus(card, status, progress) {
  card.dataset.status = status;
  if (progress != null) card.dataset.progress = progress;
  const pct = progress != null ? progress : (card.dataset.progress || 0);
  const [cls, label] = ORDER_STATUS[status] || ['badge-info', status];
  const badge = card.querySelector('.badge');
  if (badge) { badge.className = 'badge ' + cls; badge.textContent = label; }
  const pctEl = card.querySelector('.order-progress-pct');
  if (pctEl) pctEl.textContent = (pct || 0) + '%';
  const fill = card.querySelector('.progress-fill');
  if (fill) {
    fill.className = 'progress-fill' + (status === 'completed' ? ' done' : status === 'upcoming' ? ' idle' : '');
    fill.style.width = (pct || 0) + '%';
  }
  const gridId = status === 'completed' ? 'completedGrid' : status === 'upcoming' ? 'upcomingGrid' : 'ongoingGrid';
  const grid = $(gridId);
  if (grid && card.parentElement !== grid) grid.appendChild(card);
}

function updateOrderCounts() {
  [['ongoingGrid', 'ongoingCount'], ['completedGrid', 'completedCount'], ['upcomingGrid', 'upcomingCount']]
    .forEach(([gridId, countId]) => {
      const grid = $(gridId);
      const count = $(countId);
      if (grid && count) count.textContent = grid.querySelectorAll('.order-card').length;
    });
}

/** Card click -> persist base info and open the full order details page. */
function openOrderDetails(card) {
  if (!card) return;
  const all = getOrders();
  all[card.dataset.order] = Object.assign({}, all[card.dataset.order], orderFromCard(card));
  saveOrders(all);
  window.location.href = 'order-details.html?order=' + encodeURIComponent(card.dataset.order);
}

/* ---- Order details page ---------------------------------------------- */
let currentOrderNo = '';
let orderProducts = [];
let orderRaw = [];
let orderIsPhase = false;
let orderStatus = '';        // 'ongoing' | 'upcoming' | 'completed'
let rawReviseMode = false;   // ongoing orders: toggled by the Revise Quantity button
let rawSnapshot = null;      // backup of orderRaw taken when entering revise mode

function parseRawItem(text) {
  const parts = String(text).split('—');
  if (parts.length >= 2) return { name: parts[0].trim(), qty: parts.slice(1).join('—').trim() };
  return { name: String(text).trim(), qty: '' };
}

function toISODate(display) {
  if (!display) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(display)) return display;
  const d = new Date(display);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
}

function loadOrderDetailPage() {
  if (!$('orderDetailRoot')) return;

  currentOrderNo = new URLSearchParams(window.location.search).get('order') || '';
  const order = getOrders()[currentOrderNo];

  if (!currentOrderNo || !order) {
    setText('odp_order', 'Order not found');
    const body = $('odp_body');
    if (body) body.style.display = 'none';
    return;
  }

  setText('odp_order', order.order);
  setText('odp_client', order.client);
  setText('odp_quotation', order.quotation || '—');
  orderStatus = order.status || '';
  rawReviseMode = false;
  rawSnapshot = null;
  const badge = $('odp_status');
  if (badge) {
    const [cls, label] = ORDER_STATUS[order.status] || ['badge-info', order.status];
    badge.className = 'badge ' + cls; badge.textContent = label;
  }

  const qDetail = getQuotationDetails()[order.quotation] || null;
  const mode = qDetail && qDetail.delivery ? qDetail.delivery.mode : 'full';
  orderIsPhase = mode === 'phase' && Array.isArray(qDetail && qDetail.phases) && qDetail.phases.length > 0;

  const banner = $('odp_delivery');
  if (banner) {
    banner.className = 'odp-banner ' + (orderIsPhase ? 'odp-banner-phase' : 'odp-banner-full');
    banner.innerHTML = orderIsPhase
      ? `<i class="fas fa-layer-group"></i> <span>Delivery instruction: <strong>Phase-wise</strong>. The products, quantities and estimated times below were selected on quotation ${escapeHtml(order.quotation)}. You still need to enter the tentative completion date and the required raw materials.</span>`
      : `<i class="fas fa-box"></i> <span>Delivery instruction: <strong>Full delivery on completion</strong>. Confirm the products and quantities, then enter the tentative completion date and required raw materials.</span>`;
  }

  const saved = getOrderDetails()[currentOrderNo];

  // Products: saved edits > phase selection > quotation products > card fallback
  if (saved && Array.isArray(saved.products)) {
    orderProducts = saved.products.map((p) => ({ name: p.name || '', qty: p.qty || '', time: p.time || '', unit: p.unit || 'days', fromPhase: !!p.fromPhase }));
  } else if (orderIsPhase) {
    orderProducts = qDetail.phases.map((ph) => ({ name: ph.product || '', qty: ph.qty || '', time: ph.time || '', unit: ph.unit || 'weeks', fromPhase: true }));
  } else if (qDetail && Array.isArray(qDetail.products) && qDetail.products.length) {
    orderProducts = qDetail.products.map((p) => ({ name: p.name || '', qty: p.qty || '', time: '', unit: 'days', fromPhase: false }));
  } else {
    orderProducts = [{ name: order.product || '', qty: parseInt(String(order.qty).replace(/[^\d]/g, ''), 10) || '', time: '', unit: 'days', fromPhase: false }];
  }
  renderOrderProducts();

  // Raw materials: saved edits > parsed from card
  if (saved && Array.isArray(saved.raw)) {
    orderRaw = saved.raw.map((r) => ({ name: r.name || '', qty: r.qty || '' }));
  } else {
    orderRaw = (order.raw || '').split(';').map((s) => s.trim()).filter(Boolean).map(parseRawItem);
  }
  if (!orderRaw.length) orderRaw = [{ name: '', qty: '' }];
  renderOrderRaw();

  if ($('odp_complete')) $('odp_complete').value = (saved && saved.complete) || toISODate(order.complete);

  const startBtn = $('odp_startBtn');
  if (startBtn) startBtn.style.display = order.status === 'upcoming' ? '' : 'none';

  const shipBtn = $('odp_shipBtn');
  if (shipBtn) {
    if (order.status === 'completed') {
      shipBtn.style.display = '';
      const released = !!getShipments()[currentOrderNo];
      shipBtn.innerHTML = released
        ? '<i class="fas fa-truck"></i> View in Shipments'
        : '<i class="fas fa-truck"></i> Release for Shipping';
    } else {
      shipBtn.style.display = 'none';
    }
  }
}

function syncOrderProductsFromDOM() { /* products are read-only; nothing to sync */ }

function renderOrderProducts() {
  const body = document.querySelector('#odp_products tbody');
  if (!body) return;
  const timeHead = $('odp_timeHead');
  if (timeHead) timeHead.style.display = orderIsPhase ? '' : 'none';

  // Products are locked from the linked quotation — render as read-only.
  body.innerHTML = orderProducts.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.name) || '—'}</strong></td>
      <td>${escapeHtml(String(p.qty)) || '—'}</td>
      ${orderIsPhase ? `<td>${p.time ? escapeHtml(String(p.time)) + ' ' + escapeHtml(p.unit || 'weeks') : '—'}</td>` : ''}
    </tr>`).join('');
}

function syncOrderRawFromDOM() {
  document.querySelectorAll('#odp_raw tbody tr[data-idx]').forEach((row) => {
    const i = +row.dataset.idx;
    if (!orderRaw[i]) return;
    const n = row.querySelector('.odp-raw-name');
    const q = row.querySelector('.odp-raw-qty');
    if (n) orderRaw[i].name = n.value;
    if (q) orderRaw[i].qty = q.value;
  });
}

function renderOrderRaw() {
  const body = document.querySelector('#odp_raw tbody');
  if (!body) return;

  // Stock column shows for orders that are active or scheduled (not completed).
  const showStock = orderStatus === 'ongoing' || orderStatus === 'upcoming';
  // Scheduled orders are still being planned -> full edit (name + qty, add/remove).
  const isPlanning = orderStatus === 'upcoming';
  // Ongoing orders edit quantities only, and only while in revise mode.
  const isRevising = orderStatus === 'ongoing' && rawReviseMode;
  const nameEditable = isPlanning;
  const qtyEditable = isPlanning || isRevising;
  const showActions = isPlanning;

  // Toggle header columns to match the rendered cells.
  const stockHead = $('odp_stockHead');
  if (stockHead) stockHead.style.display = showStock ? '' : 'none';
  const actionsHead = $('odp_rawActionsHead');
  if (actionsHead) actionsHead.style.display = showActions ? '' : 'none';

  // Toolbar buttons: Add Material (planning only), Revise/Save + Cancel (ongoing).
  const addBtn = $('odp_addRawBtn');
  if (addBtn) addBtn.style.display = isPlanning ? '' : 'none';
  const reviseBtn = $('odp_reviseBtn');
  if (reviseBtn) {
    reviseBtn.style.display = orderStatus === 'ongoing' ? '' : 'none';
    reviseBtn.innerHTML = rawReviseMode
      ? `${CHECK_SVG} Save Quantities`
      : `${PENCIL_SVG} Revise Quantity`;
    reviseBtn.classList.toggle('btn-primary', rawReviseMode);
    reviseBtn.classList.toggle('btn-secondary', !rawReviseMode);
  }
  const cancelBtn = $('odp_reviseCancelBtn');
  if (cancelBtn) cancelBtn.style.display = isRevising ? '' : 'none';

  body.innerHTML = orderRaw.map((r, i) => {
    const nameCell = nameEditable
      ? `<input type="text" class="odp-raw-name" value="${escapeHtml(r.name)}" placeholder="Material name">`
      : `<strong>${escapeHtml(r.name) || '—'}</strong>`;
    const qtyCell = qtyEditable
      ? `<input type="text" class="odp-raw-qty" value="${escapeHtml(r.qty)}" placeholder="e.g. 1.2 T / 500 kg">`
      : `${escapeHtml(r.qty) || '—'}`;
    const stockCell = showStock
      ? `<td class="odp-raw-stock">${escapeHtml(getMaterialStock(r.name))}</td>`
      : '';
    const actionCell = showActions
      ? `<td><button type="button" class="btn-icon" title="Remove" onclick="removeOrderRaw(${i})">${TRASH_SVG}</button></td>`
      : '';
    return `<tr data-idx="${i}"><td>${nameCell}</td><td>${qtyCell}</td>${stockCell}${actionCell}</tr>`;
  }).join('');
}

/** Ongoing orders: toggle the quantity-revision mode (and persist on save). */
function toggleReviseRaw() {
  if (orderStatus !== 'ongoing') return;
  if (rawReviseMode) {
    syncOrderRawFromDOM();
    rawReviseMode = false;
    rawSnapshot = null;
    persistOrderRaw();
    renderOrderRaw();
    showOrderMsg('Raw material quantities updated.');
  } else {
    rawSnapshot = orderRaw.map((r) => ({ name: r.name, qty: r.qty }));
    rawReviseMode = true;
    showOrderMsg('');
    renderOrderRaw();
  }
}

/** Ongoing orders: discard in-progress quantity edits and exit revise mode. */
function cancelReviseRaw() {
  if (!rawReviseMode) return;
  if (rawSnapshot) orderRaw = rawSnapshot.map((r) => ({ name: r.name, qty: r.qty }));
  rawReviseMode = false;
  rawSnapshot = null;
  showOrderMsg('');
  renderOrderRaw();
}

/** Persist the current products + raw materials onto the saved order detail. */
function persistOrderRaw() {
  const existing = getOrderDetails()[currentOrderNo] || {};
  const rec = Object.assign({}, existing, {
    complete: $('odp_complete')?.value || existing.complete || '',
    products: orderProducts.map((p) => ({ name: p.name, qty: p.qty, time: p.time, unit: p.unit, fromPhase: p.fromPhase })),
    raw: orderRaw.map((r) => ({ name: r.name, qty: r.qty })),
    savedAt: Date.now(),
  });
  saveOrderDetailRecord(currentOrderNo, rec);
}

function addOrderRaw() {
  syncOrderRawFromDOM();
  orderRaw.push({ name: '', qty: '' });
  renderOrderRaw();
}
function removeOrderRaw(i) {
  syncOrderRawFromDOM();
  orderRaw.splice(i, 1);
  if (!orderRaw.length) orderRaw.push({ name: '', qty: '' });
  renderOrderRaw();
}

function collectOrderRecord() {
  syncOrderProductsFromDOM();
  syncOrderRawFromDOM();
  return {
    complete: $('odp_complete')?.value || '',
    products: orderProducts.map((p) => ({ name: p.name, qty: p.qty, time: p.time, unit: p.unit, fromPhase: p.fromPhase })),
    raw: orderRaw.map((r) => ({ name: r.name, qty: r.qty })),
    savedAt: Date.now(),
  };
}

function showOrderMsg(text) {
  const m = $('odp_msg');
  if (m) { m.textContent = text; m.style.display = text ? '' : 'none'; }
}

function saveOrderDetailsPage() {
  const rec = collectOrderRecord();
  let ok = true;

  const cInput = $('odp_complete');
  if (!rec.complete) { ok = false; if (cInput) cInput.style.borderColor = 'var(--error-500)'; }
  else if (cInput) cInput.style.borderColor = '';

  document.querySelectorAll('#odp_raw tbody tr[data-idx]').forEach((row) => {
    [row.querySelector('.odp-raw-name'), row.querySelector('.odp-raw-qty')].forEach((el) => {
      if (el && !el.value.trim()) { el.style.borderColor = 'var(--error-500)'; ok = false; }
      else if (el) el.style.borderColor = '';
    });
  });

  if (!ok) {
    showOrderMsg('Please enter the tentative completion date and fill in every raw material row (name and quantity).');
    return;
  }
  showOrderMsg('');

  saveOrderDetailRecord(currentOrderNo, rec);
  const all = getOrders();
  if (all[currentOrderNo]) { all[currentOrderNo].complete = fmtListDate(rec.complete); saveOrders(all); }
  window.location.href = 'orders.html';
}

/** Scheduled order -> start production (persist edits best-effort) and return. */
function startOrderFromDetail() {
  const rec = collectOrderRecord();
  if (rec.complete || rec.raw.some((r) => r.name)) saveOrderDetailRecord(currentOrderNo, rec);
  const all = getOrders();
  if (all[currentOrderNo]) {
    all[currentOrderNo].status = 'ongoing';
    all[currentOrderNo].progress = '5';
    if (rec.complete) all[currentOrderNo].complete = fmtListDate(rec.complete);
    saveOrders(all);
  }
  window.location.href = 'orders.html';
}

/* ======================================================================
   8. INIT
   ====================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Restore sidebar collapsed/expanded state (shared across all pages)
  initSidebarState();
  // Sync theme toggle icon with the theme already applied by the inline head script
  initTheme();

  // Ensure demo quotations have editable details, then surface stored ones.
  seedDemoQuotationDetails();
  // On the quotations list page, surface any quotations created in this browser.
  renderStoredQuotations();

  // Orders list page: persist cards, then reflect any started/updated orders.
  seedOrdersFromCards();
  applyOrderOverrides();
  // Order details page: load and populate the form.
  loadOrderDetailPage();

  // Settings page: seed defaults and render all sections.
  loadSettingsPage();

  // Inventory pages: render product/raw inventory.
  loadInventoryPage();

  // Shipments page: render ready/dispatched shipments.
  loadShipmentsPage();

  // Material Management page: render material cards.
  loadMaterialsPage();

  // Wizard form submit
  const qForm = $('quotationForm');
  if (qForm) {
    // If opened for a partial conversion (?edit=<id>), prefill and jump to the
    // Product Specifications step so the user can adjust products and prices.
    const isEdit = loadEditQuotation();
    if (isEdit) currentStep = 2;
    renderStep();

    qForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = $('submitBtn');
      if (btn) btn.disabled = true;

      if (editMode) {
        // Partial conversion -> persist the edited products and create the order.
        saveQuotationDetail(editQuotationId, collectQuotationDetail());
        setTimeout(() => { window.location.href = 'orders.html'; }, 400);
        return;
      }

      if (btn) btn.textContent = 'Creating…';
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
    if (e.key === 'Escape') { closeProductModal(); closeConvertModal(); }
  });
});


/* ======================================================================
   9. SETTINGS PAGE
   ====================================================================== */
const SET_ORDERS_KEY = 'saps_set_orders';
const SET_PRODUCTS_KEY = 'saps_set_products';
const SET_RAW_KEY = 'saps_set_raw';
const SET_RAWCFG_KEY = 'saps_set_rawcfg';
const SET_INVOICE_KEY = 'saps_set_invoice';
const SET_VEHICLES_KEY = 'saps_set_vehicles';

/* ---- storage helpers ---- */
function settingsRead(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}
function settingsWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}
function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function parseStockValue(v) {
  const m = String(v || '').trim().match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return { stock: 0, unit: '' };
  return { stock: parseFloat(m[1].replace(/,/g, '')) || 0, unit: (m[2] || '').trim() };
}

/* ---- default seeds ---- */
const ORDERS_DEFAULTS = {
  prefix: 'ORD-2026-', next: 21, lead: 21, startProgress: 5,
  requireDate: true, warnStock: true, lockProducts: true,
};
const INVOICE_DEFAULTS = {
  prefix: 'INV-2026-', next: 1, pad: 4, reset: 'yearly',
  gstin: '', gst: 18, template: 'modern',
  accent: '#6d28d9', showLogo: true, footer: 'Thank you for your business.',
};
const RAWCFG_DEFAULTS = { threshold: 20, autoflag: true };

function seedSettingsProducts() {
  return [
    { id: uid('pr_'), name: 'Machined Component — SS 304', price: 850, unit: 'piece', time: '3', timeUnit: 'days', listed: true,
      raw: [{ name: 'Stainless Steel 304 sheet', qty: '2.4 kg' }, { name: 'M8 fasteners', qty: '2 pcs' }, { name: 'Cutting fluid', qty: '0.08 L' }] },
    { id: uid('pr_'), name: 'Aluminum Extrusion — 6061', price: 1200, unit: 'piece', time: '4', timeUnit: 'days', listed: true,
      raw: [{ name: 'Aluminum 6061 billet', qty: '3 kg' }, { name: 'Anodizing chemicals', qty: '0.2 L' }] },
    { id: uid('pr_'), name: 'Welded Assembly — Mild Steel', price: 1500, unit: 'set', time: '1', timeUnit: 'weeks', listed: true,
      raw: [{ name: 'Mild steel plate', qty: '4.6 kg' }, { name: 'MIG welding wire', qty: '0.16 kg' }, { name: 'Primer paint', qty: '0.1 L' }] },
    { id: uid('pr_'), name: 'CNC Turned Part — Brass', price: 600, unit: 'piece', time: '2', timeUnit: 'days', listed: true,
      raw: [{ name: 'Brass rod (CZ121)', qty: '0.9 kg' }, { name: 'Cutting coolant', qty: '0.05 L' }] },
    { id: uid('pr_'), name: 'Casting — SS 316', price: 2200, unit: 'piece', time: '5', timeUnit: 'days', listed: false,
      raw: [{ name: 'Stainless Steel 316 ingots', qty: '8 kg' }, { name: 'Mold sand', qty: '6 kg' }] },
  ];
}
function seedSettingsRaw() {
  return Object.keys(MATERIAL_STOCK).map((name) => {
    const { stock, unit } = parseStockValue(MATERIAL_STOCK[name]);
    return { id: uid('rm_'), name, unit, stock, reorder: Math.round(stock * 0.3 * 100) / 100 };
  });
}
function seedSettingsVehicles() {
  return [
    { id: uid('vh_'), name: 'Tata LPT 1109', reg: 'MH-12-AB-1234', type: 'Truck', capacity: '9 T', status: 'available',
      caps: [{ product: 'Machined Component — SS 304', cap: 1200 }, { product: 'Welded Assembly — Mild Steel', cap: 300 }] },
    { id: uid('vh_'), name: 'Ashok Leyland Dost', reg: 'MH-14-CD-5678', type: 'Mini Truck', capacity: '1.5 T', status: 'in-use',
      caps: [{ product: 'CNC Turned Part — Brass', cap: 800 }] },
  ];
}

/* ---- accessors (seed on first read) ---- */
function getSettingsProducts() {
  let list = settingsRead(SET_PRODUCTS_KEY, null);
  if (!Array.isArray(list)) { list = seedSettingsProducts(); settingsWrite(SET_PRODUCTS_KEY, list); }
  return list;
}
function getSettingsRaw() {
  let list = settingsRead(SET_RAW_KEY, null);
  if (!Array.isArray(list)) { list = seedSettingsRaw(); settingsWrite(SET_RAW_KEY, list); }
  return list;
}
function getSettingsVehicles() {
  let list = settingsRead(SET_VEHICLES_KEY, null);
  if (!Array.isArray(list)) { list = seedSettingsVehicles(); settingsWrite(SET_VEHICLES_KEY, list); }
  return list;
}

/* ---- per-card "saved" message ---- */
function flashSetMsg(id, text, isError) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', !!isError);
  if (!isError && text) {
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.textContent = ''; }, 2500);
  }
}

/* ====================== ORDERS ====================== */
function loadOrdersSettings() {
  const s = Object.assign({}, ORDERS_DEFAULTS, settingsRead(SET_ORDERS_KEY, {}));
  if ($('set_ord_prefix')) $('set_ord_prefix').value = s.prefix;
  if ($('set_ord_next')) $('set_ord_next').value = s.next;
  if ($('set_ord_lead')) $('set_ord_lead').value = s.lead;
  if ($('set_ord_startprog')) $('set_ord_startprog').value = s.startProgress;
  if ($('set_ord_reqdate')) $('set_ord_reqdate').checked = !!s.requireDate;
  if ($('set_ord_warnstock')) $('set_ord_warnstock').checked = !!s.warnStock;
  if ($('set_ord_lockproducts')) $('set_ord_lockproducts').checked = !!s.lockProducts;
}
function saveOrdersSettings() {
  const s = {
    prefix: $('set_ord_prefix').value.trim(),
    next: parseInt($('set_ord_next').value, 10) || 1,
    lead: parseInt($('set_ord_lead').value, 10) || 0,
    startProgress: Math.max(0, Math.min(100, parseInt($('set_ord_startprog').value, 10) || 0)),
    requireDate: $('set_ord_reqdate').checked,
    warnStock: $('set_ord_warnstock').checked,
    lockProducts: $('set_ord_lockproducts').checked,
  };
  settingsWrite(SET_ORDERS_KEY, s);
  openSettingsModal('orderSavedModal');
}

/* ====================== PRODUCTS ====================== */
let editingProductSettingId = null;
let psmRaw = [];

function renderSetProducts() {
  const body = document.querySelector('#set_products_table tbody');
  if (!body) return;
  const list = getSettingsProducts();
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No products yet</p></td></tr>';
    return;
  }
  body.innerHTML = list.map((p) => {
    const rawSummary = (p.raw || []).length
      ? (p.raw || []).map((r) => `${escapeHtml(r.name)}${r.qty ? ' — ' + escapeHtml(String(r.qty)) : ''}`).join('; ')
      : '<span class="set-raw-summary">No materials defined</span>';
    return `
      <tr>
        <td><button type="button" class="set-product-link" onclick="openProductView('${p.id}')">${escapeHtml(p.name)}</button></td>
        <td>${formatINR(p.price)} / ${escapeHtml(p.unit || 'unit')}</td>
        <td><span class="set-raw-summary">${rawSummary}</span></td>
        <td>
          <label class="switch" title="List / unlist">
            <input type="checkbox" ${p.listed ? 'checked' : ''} onchange="toggleProductListed('${p.id}', this.checked)">
            <span class="switch-slider"></span>
          </label>
          <span class="badge ${p.listed ? 'badge-success' : 'badge-info'}" style="margin-left:8px;">${p.listed ? 'Listed' : 'Unlisted'}</span>
        </td>
        <td>
          <button type="button" class="btn-icon" title="Edit" onclick="openProductSettingModal('${p.id}')">${PENCIL_SVG}</button>
          <button type="button" class="btn-icon" title="Delete" onclick="deleteSettingsProduct('${p.id}')">${TRASH_SVG}</button>
        </td>
      </tr>`;
  }).join('');
}
function toggleProductListed(id, listed) {
  const list = getSettingsProducts();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  p.listed = !!listed;
  settingsWrite(SET_PRODUCTS_KEY, list);
  renderSetProducts();
}
function deleteSettingsProduct(id) {
  if (!confirm('Delete this product?')) return;
  settingsWrite(SET_PRODUCTS_KEY, getSettingsProducts().filter((x) => x.id !== id));
  renderSetProducts();
}
function renderPsmRaw() {
  const body = $('psm_raw_body');
  if (!body) return;
  body.innerHTML = psmRaw.map((r, i) => `
    <tr data-idx="${i}">
      <td><input type="text" class="psm-raw-name" value="${escapeHtml(r.name)}" placeholder="Material name"></td>
      <td><input type="text" class="psm-raw-qty" value="${escapeHtml(String(r.qty || ''))}" placeholder="e.g. 2 kg"></td>
      <td><button type="button" class="btn-icon" title="Remove" onclick="removePsmRaw(${i})">${TRASH_SVG}</button></td>
    </tr>`).join('');
}
function syncPsmRawFromDOM() {
  document.querySelectorAll('#psm_raw_body tr[data-idx]').forEach((row) => {
    const i = +row.dataset.idx;
    if (!psmRaw[i]) return;
    psmRaw[i].name = row.querySelector('.psm-raw-name').value;
    psmRaw[i].qty = row.querySelector('.psm-raw-qty').value;
  });
}
function addPsmRaw() {
  syncPsmRawFromDOM();
  psmRaw.push({ name: '', qty: '' });
  renderPsmRaw();
}
function removePsmRaw(i) {
  syncPsmRawFromDOM();
  psmRaw.splice(i, 1);
  renderPsmRaw();
}
function openProductSettingModal(id) {
  editingProductSettingId = id || null;
  const p = id ? getSettingsProducts().find((x) => x.id === id) : null;
  setText('psm_title', p ? 'Edit Product' : 'Add Product');
  if ($('psm_name')) $('psm_name').value = p ? p.name : '';
  if ($('psm_unit')) $('psm_unit').value = p ? (p.unit || '') : '';
  if ($('psm_price')) $('psm_price').value = p ? p.price : '';
  if ($('psm_time')) $('psm_time').value = p ? (p.time || '') : '';
  if ($('psm_timeunit')) $('psm_timeunit').value = p ? (p.timeUnit || 'days') : 'days';
  if ($('psm_listed')) $('psm_listed').checked = p ? !!p.listed : true;
  psmRaw = p && Array.isArray(p.raw) ? p.raw.map((r) => ({ name: r.name, qty: r.qty })) : [{ name: '', qty: '' }];
  renderPsmRaw();
  flashSetMsg('psm_msg', '');
  openSettingsModal('productSettingModal', 'psm_name');
}
function closeProductSettingModal() { closeSettingsModal('productSettingModal'); }

/* ---- product details (view) modal ---- */
let viewingProductId = null;
function openProductView(id) {
  const p = getSettingsProducts().find((x) => x.id === id);
  if (!p) return;
  viewingProductId = id;
  setText('pv_name', p.name);
  setText('pv_unit', p.unit || '—');
  setText('pv_price', `${formatINR(p.price)} / ${p.unit || 'unit'}`);
  setText('pv_time', p.time ? `${p.time} ${p.timeUnit || 'days'}` : '—');
  const badge = $('pv_status');
  if (badge) {
    badge.className = 'badge ' + (p.listed ? 'badge-success' : 'badge-info');
    badge.textContent = p.listed ? 'Listed' : 'Unlisted';
  }
  const rawWrap = $('pv_raw');
  if (rawWrap) {
    rawWrap.innerHTML = (p.raw || []).length
      ? p.raw.map((r) => `<li><span>${escapeHtml(r.name)}</span><strong>${escapeHtml(String(r.qty || '—'))}</strong></li>`).join('')
      : '<li class="set-raw-summary">No materials defined</li>';
  }
  openSettingsModal('productViewModal');
}
function closeProductView() { closeSettingsModal('productViewModal'); }
function editFromView() {
  const id = viewingProductId;
  closeProductView();
  if (id) openProductSettingModal(id);
}
function saveProductSetting() {
  syncPsmRawFromDOM();
  const name = $('psm_name').value.trim();
  const unit = $('psm_unit').value.trim();
  const price = parseFloat($('psm_price').value);
  const time = $('psm_time').value.trim();
  const timeUnit = $('psm_timeunit').value;
  if (!name) { flashSetMsg('psm_msg', 'Product name is required.', true); return; }
  if (!unit) { flashSetMsg('psm_msg', 'Unit is required (e.g. piece, kg, set).', true); return; }
  if (isNaN(price) || price < 0) { flashSetMsg('psm_msg', 'Enter a valid price per unit.', true); return; }
  const raw = psmRaw.map((r) => ({ name: r.name.trim(), qty: String(r.qty).trim() })).filter((r) => r.name);
  const list = getSettingsProducts();
  if (editingProductSettingId) {
    const p = list.find((x) => x.id === editingProductSettingId);
    if (p) { p.name = name; p.unit = unit; p.price = price; p.time = time; p.timeUnit = timeUnit; p.listed = $('psm_listed').checked; p.raw = raw; }
  } else {
    list.push({ id: uid('pr_'), name, unit, price, time, timeUnit, listed: $('psm_listed').checked, raw });
  }
  settingsWrite(SET_PRODUCTS_KEY, list);
  renderSetProducts();
  closeProductSettingModal();
}

/* ====================== RAW MATERIALS ====================== */
let editingRawId = null;

function loadRawSettings() {
  const cfg = Object.assign({}, RAWCFG_DEFAULTS, settingsRead(SET_RAWCFG_KEY, {}));
  if ($('set_raw_threshold')) $('set_raw_threshold').value = cfg.threshold;
  if ($('set_raw_autoflag')) $('set_raw_autoflag').checked = !!cfg.autoflag;
}
function saveRawSettings() {
  const cfg = {
    threshold: Math.max(0, Math.min(100, parseInt($('set_raw_threshold').value, 10) || 0)),
    autoflag: $('set_raw_autoflag').checked,
  };
  settingsWrite(SET_RAWCFG_KEY, cfg);
  flashSetMsg('set_raw_msg', 'Raw material settings saved.');
}
function rawStatusBadge(r) {
  const stock = Number(r.stock) || 0;
  const reorder = Number(r.reorder) || 0;
  if (stock <= 0) return ['badge-error', 'Out of Stock'];
  if (reorder > 0 && stock <= reorder) return ['badge-warning', 'Low'];
  return ['badge-success', 'In Stock'];
}
function renderSetRaw() {
  const body = document.querySelector('#set_raw_table tbody');
  if (!body) return;
  const list = getSettingsRaw();
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No raw materials yet</p></td></tr>';
    return;
  }
  body.innerHTML = list.map((r) => {
    const [cls, label] = rawStatusBadge(r);
    return `
      <tr>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${escapeHtml(r.unit) || '—'}</td>
        <td>${escapeHtml(String(r.stock))} ${escapeHtml(r.unit)}</td>
        <td>${r.reorder ? escapeHtml(String(r.reorder)) + ' ' + escapeHtml(r.unit) : '—'}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>
          <button type="button" class="btn-icon" title="Edit" onclick="openRawModal('${r.id}')">${PENCIL_SVG}</button>
          <button type="button" class="btn-icon" title="Delete" onclick="deleteRawMaterial('${r.id}')">${TRASH_SVG}</button>
        </td>
      </tr>`;
  }).join('');
}
function openRawModal(id) {
  editingRawId = id || null;
  const r = id ? getSettingsRaw().find((x) => x.id === id) : null;
  setText('raw_title', r ? 'Edit Raw Material' : 'Add Raw Material');
  if ($('raw_name')) $('raw_name').value = r ? r.name : '';
  if ($('raw_unit')) $('raw_unit').value = r ? r.unit : '';
  if ($('raw_stock')) $('raw_stock').value = r ? r.stock : '';
  if ($('raw_reorder')) $('raw_reorder').value = r ? r.reorder : '';
  flashSetMsg('raw_msg', '');
  openSettingsModal('rawModal', 'raw_name');
}
function closeRawModal() { closeSettingsModal('rawModal'); }
function deleteRawMaterial(id) {
  if (!confirm('Delete this raw material?')) return;
  settingsWrite(SET_RAW_KEY, getSettingsRaw().filter((x) => x.id !== id));
  renderSetRaw();
}
function saveRawMaterial() {
  const name = $('raw_name').value.trim();
  const unit = $('raw_unit').value.trim();
  const stock = parseFloat($('raw_stock').value);
  if (!name) { flashSetMsg('raw_msg', 'Material name is required.', true); return; }
  if (!unit) { flashSetMsg('raw_msg', 'Unit is required.', true); return; }
  if (isNaN(stock) || stock < 0) { flashSetMsg('raw_msg', 'Enter a valid stock quantity.', true); return; }
  const reorder = parseFloat($('raw_reorder').value) || 0;
  const list = getSettingsRaw();
  if (editingRawId) {
    const r = list.find((x) => x.id === editingRawId);
    if (r) { r.name = name; r.unit = unit; r.stock = stock; r.reorder = reorder; }
  } else {
    list.push({ id: uid('rm_'), name, unit, stock, reorder });
  }
  settingsWrite(SET_RAW_KEY, list);
  renderSetRaw();
  closeRawModal();
}

/* ====================== INVOICE ====================== */
function padNumber(n, width) {
  const s = String(Math.max(0, parseInt(n, 10) || 0));
  const w = Math.max(0, parseInt(width, 10) || 0);
  return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}
function loadInvoiceSettings() {
  const s = Object.assign({}, INVOICE_DEFAULTS, settingsRead(SET_INVOICE_KEY, {}));
  if ($('set_inv_prefix')) $('set_inv_prefix').value = s.prefix;
  if ($('set_inv_next')) $('set_inv_next').value = s.next;
  if ($('set_inv_pad')) $('set_inv_pad').value = s.pad;
  if ($('set_inv_reset')) $('set_inv_reset').value = s.reset;
  if ($('set_inv_gstin')) $('set_inv_gstin').value = s.gstin;
  if ($('set_inv_gst')) $('set_inv_gst').value = s.gst;
  if ($('set_inv_accent')) $('set_inv_accent').value = s.accent;
  if ($('set_inv_logo')) $('set_inv_logo').checked = !!s.showLogo;
  if ($('set_inv_footer')) $('set_inv_footer').value = s.footer;
  const radio = document.querySelector(`input[name="invTemplate"][value="${s.template}"]`);
  if (radio) radio.checked = true;
}
function updateInvoicePreview() {
  const prefix = $('set_inv_prefix') ? $('set_inv_prefix').value : '';
  const next = $('set_inv_next') ? $('set_inv_next').value : '';
  const pad = $('set_inv_pad') ? $('set_inv_pad').value : '';
  setText('set_inv_preview', prefix + padNumber(next, pad));
}
function saveInvoiceSettings() {
  const tpl = document.querySelector('input[name="invTemplate"]:checked');
  const s = {
    prefix: $('set_inv_prefix').value.trim(),
    next: parseInt($('set_inv_next').value, 10) || 1,
    pad: Math.max(0, Math.min(10, parseInt($('set_inv_pad').value, 10) || 0)),
    reset: $('set_inv_reset').value,
    gstin: $('set_inv_gstin').value.trim(),
    gst: parseFloat($('set_inv_gst').value) || 0,
    template: tpl ? tpl.value : 'modern',
    accent: $('set_inv_accent').value,
    showLogo: $('set_inv_logo').checked,
    footer: $('set_inv_footer').value.trim(),
  };
  settingsWrite(SET_INVOICE_KEY, s);
  flashSetMsg('set_inv_msg', 'Invoice settings saved.');
}

/* ====================== SHIPMENT / VEHICLES ====================== */
let editingVehicleId = null;
let vehCaps = [];

const VEHICLE_STATUS = {
  available: ['badge-success', 'Available'],
  'in-use': ['badge-warning', 'In Use'],
  maintenance: ['badge-info', 'Maintenance'],
};
function renderSetVehicles() {
  const body = document.querySelector('#set_vehicles_table tbody');
  if (!body) return;
  const list = getSettingsVehicles();
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No vehicles yet</p></td></tr>';
    return;
  }
  body.innerHTML = list.map((v) => {
    const [cls, label] = VEHICLE_STATUS[v.status] || ['badge-info', v.status];
    const caps = (v.caps || []).length
      ? `<span class="set-cap-summary">${(v.caps || []).map((c) => `<span>${escapeHtml(c.product)}: <strong>${escapeHtml(String(c.cap))}</strong></span>`).join('')}</span>`
      : '<span class="set-cap-summary">—</span>';
    return `
      <tr>
        <td><strong>${escapeHtml(v.name)}</strong></td>
        <td>${escapeHtml(v.reg)}</td>
        <td>${escapeHtml(v.type)}</td>
        <td>${escapeHtml(v.capacity) || '—'}</td>
        <td>${caps}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>
          <button type="button" class="btn-icon" title="Edit" onclick="openVehicleModal('${v.id}')">${PENCIL_SVG}</button>
          <button type="button" class="btn-icon" title="Delete" onclick="deleteVehicle('${v.id}')">${TRASH_SVG}</button>
        </td>
      </tr>`;
  }).join('');
}
function renderVehCaps() {
  const body = $('veh_caps_body');
  if (!body) return;
  body.innerHTML = vehCaps.map((c, i) => `
    <tr data-idx="${i}">
      <td><input type="text" class="veh-cap-product" value="${escapeHtml(c.product)}" placeholder="Product name"></td>
      <td><input type="number" class="veh-cap-qty" min="0" value="${escapeHtml(String(c.cap || ''))}" placeholder="0"></td>
      <td><button type="button" class="btn-icon" title="Remove" onclick="removeVehCap(${i})">${TRASH_SVG}</button></td>
    </tr>`).join('');
}
function syncVehCapsFromDOM() {
  document.querySelectorAll('#veh_caps_body tr[data-idx]').forEach((row) => {
    const i = +row.dataset.idx;
    if (!vehCaps[i]) return;
    vehCaps[i].product = row.querySelector('.veh-cap-product').value;
    vehCaps[i].cap = row.querySelector('.veh-cap-qty').value;
  });
}
function addVehCap() {
  syncVehCapsFromDOM();
  vehCaps.push({ product: '', cap: '' });
  renderVehCaps();
}
function removeVehCap(i) {
  syncVehCapsFromDOM();
  vehCaps.splice(i, 1);
  renderVehCaps();
}
function openVehicleModal(id) {
  editingVehicleId = id || null;
  const v = id ? getSettingsVehicles().find((x) => x.id === id) : null;
  setText('veh_title', v ? 'Edit Vehicle' : 'Add Vehicle');
  if ($('veh_name')) $('veh_name').value = v ? v.name : '';
  if ($('veh_reg')) $('veh_reg').value = v ? v.reg : '';
  if ($('veh_type')) $('veh_type').value = v ? v.type : 'Truck';
  if ($('veh_capacity')) $('veh_capacity').value = v ? v.capacity : '';
  if ($('veh_status')) $('veh_status').value = v ? v.status : 'available';
  vehCaps = v && Array.isArray(v.caps) ? v.caps.map((c) => ({ product: c.product, cap: c.cap })) : [];
  renderVehCaps();
  flashSetMsg('veh_msg', '');
  openSettingsModal('vehicleModal', 'veh_name');
}
function closeVehicleModal() { closeSettingsModal('vehicleModal'); }
function deleteVehicle(id) {
  if (!confirm('Delete this vehicle?')) return;
  settingsWrite(SET_VEHICLES_KEY, getSettingsVehicles().filter((x) => x.id !== id));
  renderSetVehicles();
}
function saveVehicle() {
  syncVehCapsFromDOM();
  const name = $('veh_name').value.trim();
  const reg = $('veh_reg').value.trim();
  if (!name) { flashSetMsg('veh_msg', 'Vehicle name is required.', true); return; }
  if (!reg) { flashSetMsg('veh_msg', 'Registration number is required.', true); return; }
  const caps = vehCaps
    .map((c) => ({ product: c.product.trim(), cap: parseInt(c.cap, 10) || 0 }))
    .filter((c) => c.product);
  const v = {
    name, reg,
    type: $('veh_type').value,
    capacity: $('veh_capacity').value.trim(),
    status: $('veh_status').value,
    caps,
  };
  const list = getSettingsVehicles();
  if (editingVehicleId) {
    const ex = list.find((x) => x.id === editingVehicleId);
    if (ex) Object.assign(ex, v);
  } else {
    list.push(Object.assign({ id: uid('vh_') }, v));
  }
  settingsWrite(SET_VEHICLES_KEY, list);
  renderSetVehicles();
  closeVehicleModal();
}

/* ---- shared modal open/close for settings ---- */
function openSettingsModal(modalId, focusId) {
  const modal = $(modalId);
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (focusId) setTimeout(() => $(focusId)?.focus(), 50);
}
function closeSettingsModal(modalId) {
  const modal = $(modalId);
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

/* ---- page bootstrap ---- */
function loadSettingsPage() {
  if (!$('settingsRoot')) return;
  loadOrdersSettings();
  renderSetProducts();
  loadRawSettings();
  renderSetRaw();
  loadInvoiceSettings();
  updateInvoicePreview();
  renderSetVehicles();
  loadAdminPage();

  // Close any settings modal on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProductSettingModal();
      closeProductView();
      closeRawModal();
      closeVehicleModal();
      closeUserModal();
    }
  });
}


/* ======================================================================
   10. SETTINGS — ADMINISTRATION
   ====================================================================== */
const SET_COMPANY_KEY = 'saps_set_company';
const SET_USERS_KEY = 'saps_set_users';
const SET_SECURITY_KEY = 'saps_set_security';

const COMPANY_DEFAULTS = {
  name: 'SAPS Industries', gstin: '', email: 'info@saps.co', phone: '', address: '',
};
const SECURITY_DEFAULTS = { session: 30, pwlen: 8, twofa: false, multi: true };

function seedAdminUsers() {
  return [
    { id: uid('us_'), name: 'Mr. Suvendu M', email: 'suvendu@saps.co', role: 'Administrator', active: true },
    { id: uid('us_'), name: 'Priya Sharma', email: 'priya@saps.co', role: 'Manager', active: true },
    { id: uid('us_'), name: 'Ravi Kumar', email: 'ravi@saps.co', role: 'Operator', active: true },
    { id: uid('us_'), name: 'Anita Desai', email: 'anita@saps.co', role: 'Viewer', active: false },
  ];
}
function getAdminUsers() {
  let list = settingsRead(SET_USERS_KEY, null);
  if (!Array.isArray(list)) { list = seedAdminUsers(); settingsWrite(SET_USERS_KEY, list); }
  return list;
}

/* ---- Company profile ---- */
function loadAdminCompany() {
  if (!$('adm_company')) return;
  const c = Object.assign({}, COMPANY_DEFAULTS, settingsRead(SET_COMPANY_KEY, {}));
  $('adm_company').value = c.name;
  if ($('adm_gstin')) $('adm_gstin').value = c.gstin;
  if ($('adm_email')) $('adm_email').value = c.email;
  if ($('adm_phone')) $('adm_phone').value = c.phone;
  if ($('adm_address')) $('adm_address').value = c.address;
}
function saveAdminCompany() {
  const c = {
    name: $('adm_company').value.trim(),
    gstin: $('adm_gstin').value.trim(),
    email: $('adm_email').value.trim(),
    phone: $('adm_phone').value.trim(),
    address: $('adm_address').value.trim(),
  };
  if (!c.name) { flashSetMsg('adm_company_msg', 'Company name is required.', true); return; }
  settingsWrite(SET_COMPANY_KEY, c);
  flashSetMsg('adm_company_msg', 'Company profile saved.');
}

/* ---- Users & roles ---- */
let editingUserId = null;

function renderAdminUsers() {
  const body = document.querySelector('#set_users_table tbody');
  if (!body) return;
  const list = getAdminUsers();
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No users yet</p></td></tr>';
    return;
  }
  body.innerHTML = list.map((u) => {
    const [cls, label] = u.active ? ['badge-success', 'Active'] : ['badge-info', 'Inactive'];
    return `
      <tr>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="role-pill">${escapeHtml(u.role)}</span></td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>
          <button type="button" class="btn-icon" title="Edit" onclick="openUserModal('${u.id}')">${PENCIL_SVG}</button>
          <button type="button" class="btn-icon" title="Delete" onclick="deleteUser('${u.id}')">${TRASH_SVG}</button>
        </td>
      </tr>`;
  }).join('');
}
function openUserModal(id) {
  editingUserId = id || null;
  const u = id ? getAdminUsers().find((x) => x.id === id) : null;
  setText('usr_title', u ? 'Edit User' : 'Add User');
  if ($('usr_name')) $('usr_name').value = u ? u.name : '';
  if ($('usr_email')) $('usr_email').value = u ? u.email : '';
  if ($('usr_role')) $('usr_role').value = u ? u.role : 'Operator';
  if ($('usr_active')) $('usr_active').checked = u ? !!u.active : true;
  flashSetMsg('usr_msg', '');
  openSettingsModal('userModal', 'usr_name');
}
function closeUserModal() { closeSettingsModal('userModal'); }
function deleteUser(id) {
  if (!confirm('Remove this user?')) return;
  settingsWrite(SET_USERS_KEY, getAdminUsers().filter((x) => x.id !== id));
  renderAdminUsers();
}
function saveUser() {
  const name = $('usr_name').value.trim();
  const email = $('usr_email').value.trim();
  if (!name) { flashSetMsg('usr_msg', 'Name is required.', true); return; }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { flashSetMsg('usr_msg', 'Enter a valid email.', true); return; }
  const list = getAdminUsers();
  if (editingUserId) {
    const u = list.find((x) => x.id === editingUserId);
    if (u) { u.name = name; u.email = email; u.role = $('usr_role').value; u.active = $('usr_active').checked; }
  } else {
    list.push({ id: uid('us_'), name, email, role: $('usr_role').value, active: $('usr_active').checked });
  }
  settingsWrite(SET_USERS_KEY, list);
  renderAdminUsers();
  closeUserModal();
}

/* ---- Security ---- */
function loadAdminSecurity() {
  if (!$('adm_session')) return;
  const s = Object.assign({}, SECURITY_DEFAULTS, settingsRead(SET_SECURITY_KEY, {}));
  $('adm_session').value = s.session;
  if ($('adm_pwlen')) $('adm_pwlen').value = s.pwlen;
  if ($('adm_2fa')) $('adm_2fa').checked = !!s.twofa;
  if ($('adm_multi')) $('adm_multi').checked = !!s.multi;
}
function saveAdminSecurity() {
  const s = {
    session: Math.max(1, parseInt($('adm_session').value, 10) || 30),
    pwlen: Math.max(4, Math.min(64, parseInt($('adm_pwlen').value, 10) || 8)),
    twofa: $('adm_2fa').checked,
    multi: $('adm_multi').checked,
  };
  settingsWrite(SET_SECURITY_KEY, s);
  flashSetMsg('adm_security_msg', 'Security settings saved.');
}

function loadAdminPage() {
  loadAdminCompany();
  renderAdminUsers();
  loadAdminSecurity();
}

/* ======================================================================
   11. INVENTORY (Product + Raw Material)
   ====================================================================== */
const INV_PRODUCTS_KEY = 'saps_inv_products_v4';

/* Demo dataset — self-contained, NOT linked to the Orders section.
   • "Machined Component — SS 304" is required by two active orders.
   • "Casting — SS 316" is required by one active order.
   • The rest are idle godown stock (one is out of stock) to demonstrate the
     Idle Products group and search results. `allocations` is the dynamic part. */
function seedInventory() {
  return {
    'Machined Component — SS 304': {
      unit: 'piece', manufactured: 320, allocations: [],
      orders: [
        { order: 'ORD-2026-018', client: 'Acme Manufacturing Co.', reqQty: 200 },
        { order: 'ORD-2026-031', client: 'Vertex Engineering Pvt Ltd', reqQty: 150 },
      ],
    },
    'Casting — SS 316': {
      unit: 'piece', manufactured: 90, allocations: [],
      orders: [
        { order: 'ORD-2026-026', client: 'Nova Energy Systems', reqQty: 120 },
      ],
    },
    'Aluminum Extrusion — 6061': { unit: 'piece', manufactured: 110, allocations: [], orders: [] },
    'Welded Assembly — Mild Steel': { unit: 'set', manufactured: 60, allocations: [], orders: [] },
    'CNC Turned Part — Brass': { unit: 'piece', manufactured: 0, allocations: [], orders: [] },
  };
}
function getInvStore() {
  let s = settingsRead(INV_PRODUCTS_KEY, null);
  if (!s || typeof s !== 'object' || Array.isArray(s)) { s = seedInventory(); settingsWrite(INV_PRODUCTS_KEY, s); }
  return s;
}
function saveInvStore(store) { settingsWrite(INV_PRODUCTS_KEY, store); }
function normalizeEntry(e) {
  if (!Array.isArray(e.allocations)) e.allocations = [];
  if (!Array.isArray(e.orders)) e.orders = [];
  if (typeof e.manufactured !== 'number') e.manufactured = 0;
  if (!e.unit) e.unit = 'units';
  return e;
}
function allocatedQty(entry) {
  return (entry.allocations || []).reduce((s, a) => s + (Number(a.qty) || 0), 0);
}
function totalRequirement(entry) {
  return (entry.orders || []).reduce((s, o) => s + (Number(o.reqQty) || 0), 0);
}

let invProductList = [];
function buildInvCard(name, idx, entry) {
  const unit = entry.unit;
  const mapped = allocatedQty(entry);
  const idle = Math.max(0, entry.manufactured - mapped);
  const totalReq = totalRequirement(entry);
  const hasOrders = entry.orders.length > 0;

  let badge;
  if (entry.manufactured <= 0 && !hasOrders) badge = '<span class="badge badge-error">Out of Stock</span>';
  else if (!hasOrders) badge = '<span class="badge badge-info">Idle in Godown</span>';
  else if (totalReq > 0 && mapped >= totalReq) badge = '<span class="badge badge-success">Requirement Met</span>';
  else badge = '<span class="badge badge-warning">Pending Allocation</span>';

  const ordersHtml = hasOrders
    ? entry.orders.map((o) => {
        const alloc = entry.allocations.find((a) => a.order === o.order);
        const am = alloc ? alloc.qty : 0;
        const unmapBtn = am > 0
          ? `<button type="button" class="inv-unmap" onclick="unmapAllocation(${idx}, '${o.order}')">Unmap</button>`
          : '';
        return `
          <li>
            <div class="inv-order-line">
              <span class="inv-order-no">${escapeHtml(o.order)}</span>
              <span class="inv-order-client">${escapeHtml(o.client)}</span>
            </div>
            <div class="inv-order-meta">
              <span>Needs <strong>${o.reqQty}</strong></span>
              <span class="inv-order-mapped">Mapped <strong>${am}</strong></span>
              ${unmapBtn}
            </div>
          </li>`;
      }).join('')
    : '<li class="inv-noreq">Not required by any active order — full stock is idle in the godown.</li>';

  return `
    <div class="card inv-card" data-name="${escapeHtml(name)}">
      <div class="card-section inv-card-main">
        <div class="inv-card-info">
          <div class="inv-card-head">
            <div class="inv-card-title">${escapeHtml(name)}</div>
            ${badge}
          </div>
          <div class="inv-stat-grid">
            <div class="inv-stat"><span class="inv-stat-label">Total Requirement</span><span class="inv-stat-value">${totalReq} <small>${escapeHtml(unit)}</small></span></div>
            <div class="inv-stat"><span class="inv-stat-label">Manufactured</span><span class="inv-stat-value">${entry.manufactured}</span></div>
            <div class="inv-stat"><span class="inv-stat-label">Idle</span><span class="inv-stat-value inv-idle">${idle}</span></div>
            <div class="inv-stat"><span class="inv-stat-label">Mapped to Orders</span><span class="inv-stat-value inv-mapped">${mapped}</span></div>
          </div>
        </div>
        <div class="inv-card-orders">
          <div class="inv-orders-head">${hasOrders ? 'Required by ' + entry.orders.length + ' order' + (entry.orders.length === 1 ? '' : 's') : 'Stock status'}</div>
          <ul class="inv-orders">${ordersHtml}</ul>
          <div class="inv-card-foot">
            <button type="button" class="btn btn-primary btn-sm" ${(idle > 0 && hasOrders) ? '' : 'disabled'} onclick="openMapModal(${idx})">Map to Order</button>
          </div>
        </div>
      </div>
    </div>`;
}

function invGroupSection(title, key, cards) {
  if (!cards.length) return '';
  return `
    <section class="inv-group" data-group="${key}">
      <div class="inv-group-head">
        <h3 class="inv-group-title">${title}</h3>
        <span class="inv-group-count">${cards.length}</span>
      </div>
      <div class="inv-group-cards">${cards.join('')}</div>
    </section>`;
}

function renderProductInventory() {
  const grid = document.querySelector('#inv_products_grid');
  if (!grid) return;
  const store = getInvStore();
  const names = Object.keys(store);
  invProductList = names;
  if (!names.length) {
    grid.innerHTML = '<div class="card"><div class="card-section"><p class="set-card-sub">No products in inventory.</p></div></div>';
    return;
  }
  const required = [];
  const idle = [];
  names.forEach((name, idx) => {
    const entry = normalizeEntry(store[name]);
    const html = buildInvCard(name, idx, entry);
    if (entry.orders.length > 0) required.push(html);
    else idle.push(html);
  });
  grid.innerHTML =
    invGroupSection('Required Products as per Ongoing Orders', 'required', required) +
    invGroupSection('Idle Products', 'idle', idle);
  filterProductInventory();
}

/** Filter product cards by name; hide empty groups; show a note when nothing matches. */
function filterProductInventory() {
  const input = $('inv_search');
  const q = (input ? input.value : '').trim().toLowerCase();
  let totalVisible = 0;
  document.querySelectorAll('#inv_products_grid .inv-group').forEach((group) => {
    let gVisible = 0;
    group.querySelectorAll('.inv-card').forEach((card) => {
      const name = (card.dataset.name || '').toLowerCase();
      const match = !q || name.includes(q);
      card.style.display = match ? '' : 'none';
      if (match) { gVisible += 1; totalVisible += 1; }
    });
    group.style.display = gVisible ? '' : 'none';
  });
  const empty = $('inv_empty');
  if (empty) {
    if (q && totalVisible === 0) {
      empty.style.display = '';
      empty.textContent = `No product matching “${input.value.trim()}” is in inventory — it’s out of stock or not manufactured yet.`;
    } else {
      empty.style.display = 'none';
    }
  }
}

let currentMapIndex = null;
function flashMapNote(msg) {
  const n = $('map_note');
  if (n) { n.textContent = msg; n.classList.add('error'); }
}
function openMapModal(idx) {
  const name = invProductList[idx];
  if (!name) return;
  currentMapIndex = idx;
  const entry = normalizeEntry(getInvStore()[name]);
  const idle = Math.max(0, entry.manufactured - allocatedQty(entry));
  setText('map_product', name);
  setText('map_idle', idle + ' ' + entry.unit);
  const orders = entry.orders || [];
  const sel = $('map_order_select');
  const qtyInput = $('map_qty');
  const confirmBtn = $('map_confirm');
  const note = $('map_note');
  if (note) { note.textContent = ''; note.classList.remove('error'); }
  if (qtyInput) { qtyInput.value = ''; qtyInput.max = idle; }
  if (sel) {
    if (orders.length && idle > 0) {
      sel.innerHTML = orders.map((o) => {
        const alloc = entry.allocations.find((a) => a.order === o.order);
        const am = alloc ? alloc.qty : 0;
        return `<option value="${escapeHtml(o.order)}">${escapeHtml(o.order)} — needs ${o.reqQty}, mapped ${am}</option>`;
      }).join('');
      sel.disabled = false;
      if (confirmBtn) confirmBtn.disabled = false;
    } else {
      sel.innerHTML = `<option value="">${idle <= 0 ? 'No idle stock available' : 'No active orders require this'}</option>`;
      sel.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      if (note) {
        note.textContent = idle <= 0 ? 'All manufactured stock is already mapped.' : 'No active orders require this product.';
        note.classList.add('error');
      }
    }
  }
  openSettingsModal('mapOrderModal', 'map_qty');
}
function closeMapModal() { closeSettingsModal('mapOrderModal'); }
function mapProductToOrder() {
  const name = invProductList[currentMapIndex];
  if (!name) return;
  const sel = $('map_order_select');
  const qtyInput = $('map_qty');
  if (!sel || !sel.value) { flashMapNote('Select an order to map to.'); return; }
  const store = getInvStore();
  const entry = normalizeEntry(store[name]);
  const idle = Math.max(0, entry.manufactured - allocatedQty(entry));
  const qty = parseInt(qtyInput ? qtyInput.value : '', 10);
  if (!qty || qty <= 0) { flashMapNote('Enter a quantity greater than 0.'); return; }
  if (qty > idle) { flashMapNote('Quantity exceeds idle stock (' + idle + ').'); return; }
  const existing = entry.allocations.find((a) => a.order === sel.value);
  if (existing) existing.qty += qty;
  else entry.allocations.push({ order: sel.value, qty });
  saveInvStore(store);
  renderProductInventory();
  closeMapModal();
}
function unmapAllocation(idx, orderNo) {
  const name = invProductList[idx];
  if (!name) return;
  const store = getInvStore();
  const entry = normalizeEntry(store[name]);
  entry.allocations = entry.allocations.filter((a) => a.order !== orderNo);
  saveInvStore(store);
  renderProductInventory();
}

function renderRawInventory() {
  const body = document.querySelector('#inv_raw_table tbody');
  if (!body) return;
  const list = getSettingsRaw();
  if (!list.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No raw materials</p></td></tr>';
    return;
  }
  body.innerHTML = list.map((r) => {
    const [cls, label] = rawStatusBadge(r);
    return `
      <tr>
        <td><strong>${escapeHtml(r.name)}</strong></td>
        <td>${escapeHtml(r.unit) || '—'}</td>
        <td>${escapeHtml(String(r.stock))} ${escapeHtml(r.unit)}</td>
        <td>${r.reorder ? escapeHtml(String(r.reorder)) + ' ' + escapeHtml(r.unit) : '—'}</td>
        <td><span class="badge ${cls}">${label}</span></td>
      </tr>`;
  }).join('');
}

function loadInventoryPage() {
  if (!$('inventoryRoot')) return;
  renderProductInventory();
  renderRawInventory();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMapModal();
  });
}

/* ======================================================================
   12. SHIPMENTS
   ====================================================================== */
const SHIPMENTS_KEY = 'saps_shipments';

function getShipments() {
  try { return JSON.parse(localStorage.getItem(SHIPMENTS_KEY)) || {}; } catch (e) { return {}; }
}
function saveShipments(all) {
  try { localStorage.setItem(SHIPMENTS_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
}

/** Called from the order-details page once an order is completed. */
function releaseForShipping() {
  const orderNo = currentOrderNo;
  const order = getOrders()[orderNo];
  if (!order) return;
  const all = getShipments();
  if (!all[orderNo]) {
    all[orderNo] = {
      order: order.order,
      client: order.client || '',
      product: order.product || '',
      qty: order.qty || '',
      complete: order.complete || '',
      status: 'ready',
      vehicle: '',
      releasedAt: Date.now(),
      dispatchedAt: 0,
    };
    saveShipments(all);
  }
  window.location.href = 'shipments.html';
}

function shipCard(s) {
  const dispatched = s.status === 'dispatched';
  const badge = dispatched
    ? '<span class="badge badge-success">Dispatched</span>'
    : '<span class="badge badge-warning">Ready</span>';
  const vehicleRow = `<div class="order-spec"><span>Vehicle</span><strong>${s.vehicle ? escapeHtml(s.vehicle) : '—'}</strong></div>`;
  const footer = dispatched
    ? `<div class="quotation-footer"><span class="ship-dispatched-note"><i class="fas fa-circle-check"></i> Dispatched${s.dispatchedAt ? ' · ' + escapeHtml(fmtListDate(new Date(s.dispatchedAt).toISOString().split('T')[0])) : ''}</span></div>`
    : `<div class="quotation-footer">
         <button type="button" class="btn btn-secondary" onclick="openAssignVehicle('${s.order}')">${s.vehicle ? 'Change Vehicle' : 'Assign Vehicle'}</button>
         <button type="button" class="btn btn-primary" onclick="markDispatched('${s.order}')">Mark Dispatched</button>
       </div>`;
  return `
    <div class="card order-card">
      <div class="quotation-header">
        <div>
          <div class="quotation-id">${escapeHtml(s.order)}</div>
          <div class="quotation-client">${escapeHtml(s.client)}</div>
        </div>
        ${badge}
      </div>
      <div class="quotation-body">
        <div class="order-specs">
          <div class="order-spec"><span>Product</span><strong>${escapeHtml(s.product) || '—'}</strong></div>
          <div class="order-spec"><span>Quantity</span><strong>${escapeHtml(String(s.qty)) || '—'}</strong></div>
          <div class="order-spec"><span>Completed</span><strong>${escapeHtml(s.complete) || '—'}</strong></div>
          ${vehicleRow}
        </div>
      </div>
      ${footer}
    </div>`;
}

function renderShipments() {
  const readyGrid = $('ship_ready_grid');
  const dispatchedGrid = $('ship_dispatched_grid');
  if (!readyGrid || !dispatchedGrid) return;
  const list = Object.values(getShipments());
  const ready = list.filter((s) => s.status !== 'dispatched');
  const dispatched = list.filter((s) => s.status === 'dispatched');

  readyGrid.innerHTML = ready.length
    ? ready.map(shipCard).join('')
    : '<div class="card"><div class="card-section"><p class="set-card-sub">No orders are waiting for dispatch. Release a completed order from its order details page.</p></div></div>';
  dispatchedGrid.innerHTML = dispatched.length
    ? dispatched.map(shipCard).join('')
    : '<div class="card"><div class="card-section"><p class="set-card-sub">Nothing dispatched yet.</p></div></div>';

  setText('shipReadyCount', ready.length);
  setText('shipDispatchedCount', dispatched.length);
}

let currentAssignOrder = null;
function openAssignVehicle(orderNo) {
  currentAssignOrder = orderNo;
  const s = getShipments()[orderNo];
  setText('assign_order', orderNo);
  const sel = $('assign_vehicle_select');
  const confirmBtn = $('assign_confirm');
  const note = $('assign_note');
  if (note) { note.textContent = ''; note.classList.remove('error'); }
  const vehicles = getSettingsVehicles().filter((v) => v.status !== 'maintenance');
  if (sel) {
    if (vehicles.length) {
      sel.innerHTML = vehicles.map((v) =>
        `<option value="${escapeHtml(v.name + ' (' + v.reg + ')')}" ${s && s.vehicle === (v.name + ' (' + v.reg + ')') ? 'selected' : ''}>${escapeHtml(v.name)} — ${escapeHtml(v.reg)} · ${escapeHtml(v.type)}</option>`).join('');
      sel.disabled = false;
      if (confirmBtn) confirmBtn.disabled = false;
    } else {
      sel.innerHTML = '<option value="">No vehicles available</option>';
      sel.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      if (note) { note.textContent = 'Add vehicles in Settings → Shipment first.'; note.classList.add('error'); }
    }
  }
  openSettingsModal('assignVehicleModal');
}
function closeAssignModal() { closeSettingsModal('assignVehicleModal'); }
function assignVehicle() {
  const sel = $('assign_vehicle_select');
  if (!sel || !sel.value) return;
  const all = getShipments();
  const s = all[currentAssignOrder];
  if (s) { s.vehicle = sel.value; saveShipments(all); }
  renderShipments();
  closeAssignModal();
}
function markDispatched(orderNo) {
  const all = getShipments();
  const s = all[orderNo];
  if (!s) return;
  if (!s.vehicle) { openAssignVehicle(orderNo); return; }
  s.status = 'dispatched';
  s.dispatchedAt = Date.now();
  saveShipments(all);
  renderShipments();
}

function loadShipmentsPage() {
  if (!$('shipmentsRoot')) return;
  renderShipments();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAssignModal();
  });
}

/* ======================================================================
   13. MATERIAL MANAGEMENT
   ====================================================================== */
const MM_KEY = 'saps_mm';   /* per-material: { products:[{product,qty}], vendors:[{name,contact,price,lead,notes}] } */

function getMM() { return settingsRead(MM_KEY, {}) || {}; }
function saveMM(m) { settingsWrite(MM_KEY, m); }

/** Products whose bill-of-materials lists this material (used as a default). */
function productsUsingMaterial(name) {
  const key = String(name).toLowerCase();
  return getSettingsProducts()
    .filter((p) => (p.raw || []).some((r) => String(r.name).toLowerCase() === key))
    .map((p) => {
      const r = p.raw.find((x) => String(x.name).toLowerCase() === key);
      return { product: p.name, qty: r ? r.qty : '' };
    });
}
/** Material extra data; falls back to BOM-derived products + no vendors. */
function getMaterialExtra(name) {
  const mm = getMM();
  const e = mm[name];
  return {
    products: e && Array.isArray(e.products) ? e.products.map((x) => ({ product: x.product, qty: x.qty }))
                                             : productsUsingMaterial(name),
    vendors: e && Array.isArray(e.vendors) ? e.vendors.map((v) => ({ ...v })) : [],
  };
}

let mmList = [];
function renderMaterials() {
  const grid = $('mm_grid');
  if (!grid) return;
  mmList = getSettingsRaw();
  if (!mmList.length) {
    grid.innerHTML = '<div class="card"><div class="card-section"><p class="set-card-sub">No raw materials yet. Add them in Settings → Raw Material Management.</p></div></div>';
    return;
  }
  grid.innerHTML = mmList.map((r, idx) => {
    const [cls, label] = rawStatusBadge(r);
    const extra = getMaterialExtra(r.name);
    return `
      <div class="card mm-row" data-name="${escapeHtml(r.name)}" onclick="openMaterialModal(${idx})">
        <div class="mm-row-main">
          <div class="mm-row-id">
            <div class="mm-row-title">${escapeHtml(r.name)}</div>
            <span class="badge ${cls}">${label}</span>
          </div>
          <div class="mm-row-stats">
            <div class="mm-stat"><span>In Stock</span><strong>${escapeHtml(String(r.stock))} ${escapeHtml(r.unit)}</strong></div>
            <div class="mm-stat"><span>Reorder</span><strong>${r.reorder ? escapeHtml(String(r.reorder)) + ' ' + escapeHtml(r.unit) : '—'}</strong></div>
            <div class="mm-stat"><span>Products</span><strong>${extra.products.length}</strong></div>
            <div class="mm-stat"><span>Vendors</span><strong>${extra.vendors.length}</strong></div>
          </div>
          <i class="fas fa-chevron-right mm-row-arrow"></i>
        </div>
      </div>`;
  }).join('');
  filterMaterials();
}

function filterMaterials() {
  const input = $('mm_search');
  const q = (input ? input.value : '').trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('#mm_grid .mm-row').forEach((card) => {
    const match = !q || (card.dataset.name || '').toLowerCase().includes(q);
    card.style.display = match ? '' : 'none';
    if (match) visible += 1;
  });
  const empty = $('mm_empty');
  if (empty) {
    if (q && visible === 0) { empty.style.display = ''; empty.textContent = `No material matching “${input.value.trim()}”.`; }
    else empty.style.display = 'none';
  }
}

/* ---- detail modal ---- */
let currentMaterialIdx = null;
let mmProducts = [];
let mmVendors = [];

function productOptions(selected) {
  const opts = ['<option value="">Select product</option>'].concat(
    getSettingsProducts().map((p) =>
      `<option value="${escapeHtml(p.name)}" ${p.name === selected ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
  );
  return opts.join('');
}
function renderMmProducts() {
  const body = $('mm_products_body');
  if (!body) return;
  body.innerHTML = mmProducts.map((row, i) => `
    <tr data-idx="${i}">
      <td><select class="mm-prod-name">${productOptions(row.product)}</select></td>
      <td><input type="text" class="mm-prod-qty" value="${escapeHtml(String(row.qty || ''))}" placeholder="e.g. 2.4 kg"></td>
      <td><button type="button" class="btn-icon" title="Remove" onclick="removeMmProduct(${i})">${TRASH_SVG}</button></td>
    </tr>`).join('');
}
function syncMmProductsFromDOM() {
  document.querySelectorAll('#mm_products_body tr[data-idx]').forEach((tr) => {
    const i = +tr.dataset.idx;
    if (!mmProducts[i]) return;
    mmProducts[i].product = tr.querySelector('.mm-prod-name').value;
    mmProducts[i].qty = tr.querySelector('.mm-prod-qty').value;
  });
}
function addMmProduct() { syncMmProductsFromDOM(); mmProducts.push({ product: '', qty: '' }); renderMmProducts(); }
function removeMmProduct(i) { syncMmProductsFromDOM(); mmProducts.splice(i, 1); renderMmProducts(); }

function renderMmVendors() {
  const body = $('mm_vendors_body');
  if (!body) return;
  if (!mmVendors.length) {
    body.innerHTML = '<p class="mm-hint">No vendors added yet.</p>';
    return;
  }
  body.innerHTML = mmVendors.map((v, i) => `
    <div class="mm-vendor" data-idx="${i}">
      <div class="mm-vendor-head">
        <span class="mm-vendor-no">Vendor ${i + 1}</span>
        <button type="button" class="inv-unmap" onclick="removeMmVendor(${i})">Remove</button>
      </div>
      <div class="mm-vendor-grid">
        <div class="form-group"><label>Vendor Name</label><input type="text" class="mm-v-name" value="${escapeHtml(v.name || '')}" placeholder="Supplier name"></div>
        <div class="form-group"><label>Contact Number</label><input type="tel" class="mm-v-contact" value="${escapeHtml(v.contact || '')}" placeholder="+91 98765 43210"></div>
        <div class="form-group"><label>Price / Unit (₹)</label><input type="number" class="mm-v-price" min="0" step="0.01" value="${escapeHtml(String(v.price || ''))}" placeholder="0.00"></div>
        <div class="form-group"><label>Lead Time (days)</label><input type="number" class="mm-v-lead" min="0" value="${escapeHtml(String(v.lead || ''))}" placeholder="0"></div>
        <div class="form-group mm-v-notes-wrap"><label>Purchase Notes</label><input type="text" class="mm-v-notes" value="${escapeHtml(v.notes || '')}" placeholder="MOQ, payment terms, GST, etc."></div>
      </div>
    </div>`).join('');
}
function syncMmVendorsFromDOM() {
  document.querySelectorAll('#mm_vendors_body .mm-vendor[data-idx]').forEach((el) => {
    const i = +el.dataset.idx;
    if (!mmVendors[i]) return;
    mmVendors[i].name = el.querySelector('.mm-v-name').value;
    mmVendors[i].contact = el.querySelector('.mm-v-contact').value;
    mmVendors[i].price = el.querySelector('.mm-v-price').value;
    mmVendors[i].lead = el.querySelector('.mm-v-lead').value;
    mmVendors[i].notes = el.querySelector('.mm-v-notes').value;
  });
}
function addMmVendor() { syncMmVendorsFromDOM(); mmVendors.push({ name: '', contact: '', price: '', lead: '', notes: '' }); renderMmVendors(); }
function removeMmVendor(i) { syncMmVendorsFromDOM(); mmVendors.splice(i, 1); renderMmVendors(); }

function openMaterialModal(idx) {
  const mat = mmList[idx];
  if (!mat) return;
  currentMaterialIdx = idx;
  setText('mm_title', mat.name);
  if ($('mm_unit')) $('mm_unit').value = mat.unit || '';
  if ($('mm_stock')) $('mm_stock').value = mat.stock;
  if ($('mm_reorder')) $('mm_reorder').value = mat.reorder;
  const extra = getMaterialExtra(mat.name);
  mmProducts = extra.products;
  mmVendors = extra.vendors;
  renderMmProducts();
  renderMmVendors();
  const msg = $('mm_msg'); if (msg) { msg.textContent = ''; msg.classList.remove('error'); }
  openSettingsModal('materialModal');
}
function closeMaterialModal() { closeSettingsModal('materialModal'); }

function saveMaterial() {
  const mat = mmList[currentMaterialIdx];
  if (!mat) return;
  syncMmProductsFromDOM();
  syncMmVendorsFromDOM();

  // Basic details -> raw catalogue (saps_set_raw)
  const rawList = getSettingsRaw();
  const entry = rawList.find((r) => r.id === mat.id) || rawList.find((r) => r.name === mat.name);
  if (entry) {
    entry.unit = $('mm_unit').value.trim() || entry.unit;
    entry.stock = parseFloat($('mm_stock').value) || 0;
    entry.reorder = parseFloat($('mm_reorder').value) || 0;
    settingsWrite(SET_RAW_KEY, rawList);
  }

  // Products + vendors -> material-management store
  const mm = getMM();
  mm[mat.name] = {
    products: mmProducts.map((p) => ({ product: String(p.product).trim(), qty: String(p.qty).trim() })).filter((p) => p.product),
    vendors: mmVendors.map((v) => ({
      name: String(v.name).trim(),
      contact: String(v.contact).trim(),
      price: v.price === '' ? '' : (parseFloat(v.price) || 0),
      lead: v.lead === '' ? '' : (parseInt(v.lead, 10) || 0),
      notes: String(v.notes).trim(),
    })).filter((v) => v.name),
  };
  saveMM(mm);
  renderMaterials();
  closeMaterialModal();
}

function loadMaterialsPage() {
  if (!$('materialsRoot')) return;
  renderMaterials();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMaterialModal();
  });
}
