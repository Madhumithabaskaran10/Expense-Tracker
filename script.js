(function () {
  'use strict';

  var STORE = 'expense-tracker-v1';
  var EXPENSE_CATS = ['Food & dining', 'Groceries', 'Transport', 'Housing', 'Utilities', 'Health', 'Shopping', 'Entertainment', 'Travel', 'Education', 'Other'];
  var INCOME_CATS = ['Salary', 'Freelance', 'Investments', 'Other income'];
  var PALETTE = ['#A855F7', '#F472B6', '#FB923C', '#22D3EE', '#3B82F6', '#FB7185', '#A3E635', '#2DD4BF', '#FBBF24', '#818CF8', '#34D399', '#E879F9', '#60A5FA', '#F97316', '#4ADE80'];
  var ALL_CATS = EXPENSE_CATS.concat(INCOME_CATS);
  var KEYWORDS = {
    'Food & dining': ['restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'breakfast', 'swiggy', 'zomato', 'pizza', 'burger', 'starbucks', 'snack', 'takeaway'],
    'Groceries': ['grocery', 'groceries', 'supermarket', 'bigbasket', 'vegetable', 'milk', 'blinkit', 'zepto', 'dmart'],
    'Transport': ['uber', 'ola', 'fuel', 'petrol', 'diesel', 'metro', 'bus', 'taxi', 'cab', 'train', 'parking', 'toll'],
    'Housing': ['rent', 'mortgage', 'maintenance', 'furniture', 'repair'],
    'Utilities': ['electric', 'electricity', 'water bill', 'internet', 'wifi', 'broadband', 'phone', 'mobile', 'recharge', 'gas bill', 'airtel', 'jio'],
    'Health': ['doctor', 'pharmacy', 'medicine', 'hospital', 'clinic', 'gym', 'dental', 'insurance'],
    'Shopping': ['amazon', 'flipkart', 'clothes', 'shirt', 'shoes', 'mall', 'myntra', 'shopping'],
    'Entertainment': ['netflix', 'spotify', 'movie', 'cinema', 'game', 'concert', 'hotstar', 'subscription'],
    'Travel': ['flight', 'hotel', 'airbnb', 'booking', 'trip', 'visa'],
    'Education': ['course', 'tuition', 'book', 'udemy', 'school', 'college', 'fees'],
    'Salary': ['salary', 'payroll', 'paycheck'],
    'Freelance': ['freelance', 'client', 'invoice'],
    'Investments': ['dividend', 'interest', 'mutual fund', 'stock']
  };

  var state = {
    tx: [], budget: 0, currency: 'INR',
    limits: {},
    split: { people: '', mode: 'me', payer: '', paid: {} }
  };
  var currentView = 'dash';
  var currentTool = 'split';
  var splitCustom = [];
  var viewMonth = monthKey(new Date());
  var filters = { q: '', cat: 'all' };
  var catTouched = false;
  var lastDeleted = null;
  var toastTimer = null;

  var $ = function (id) { return document.getElementById(id); };

 
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.tx)) state.tx = s.tx;
        if (s && typeof s.budget === 'number') state.budget = s.budget;
        if (s && s.currency) state.currency = s.currency;
        if (s && s.limits && typeof s.limits === 'object') state.limits = s.limits;
        if (s && s.split) state.split = Object.assign(state.split, s.split);
      }
    } catch (e) { /* storage unavailable */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }


  function pad(n) { return String(n).padStart(2, '0'); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function todayStr() { var d = new Date(); return monthKey(d) + '-' + pad(d.getDate()); }
  function shiftMonth(key, n) {
    var p = key.split('-');
    return monthKey(new Date(Number(p[0]), Number(p[1]) - 1 + n, 1));
  }
  function monthLabel(key, short) {
    var p = key.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    return d.toLocaleDateString(undefined, short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function locale() { return state.currency === 'INR' ? 'en-IN' : 'en-US'; }
  function money(n) {
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    return new Intl.NumberFormat(locale(), {
      style: 'currency', currency: state.currency,
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2
    }).format(n);
  }
  function compact(n) {
    return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  function catColor(c) {
    var i = ALL_CATS.indexOf(c);
    return PALETTE[(i < 0 ? ALL_CATS.length : i) % PALETTE.length];
  }
  function inMonth(key) { return state.tx.filter(function (t) { return t.date.slice(0, 7) === key; }); }
  function total(list, type) {
    return list.filter(function (t) { return t.type === type; })
      .reduce(function (s, t) { return s + t.amount; }, 0);
  }
  function autoCategory(text, type) {
    var t = text.toLowerCase();
    var list = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    for (var i = 0; i < list.length; i++) {
      var words = KEYWORDS[list[i]];
      if (!words) continue;
      for (var j = 0; j < words.length; j++) {
        if (new RegExp('\\b' + words[j].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t)) return list[i];
      }
    }
    return type === 'income' ? 'Other income' : 'Other';
  }
  function daysInMonth(key) {
    var p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]), 0).getDate();
  }

 
  function render() {
    $('monthLabel').textContent = monthLabel(viewMonth);
    $('currency').value = state.currency;
    renderSummary();
    renderInsights();
    renderBreakdown();
    renderTrend();
    renderList();
    if (currentView === 'more') renderMore();
  }

  function renderSummary() {
    var list = inMonth(viewMonth);
    var spent = total(list, 'expense');
    var income = total(list, 'income');
    var net = income - spent;
    var prev = inMonth(shiftMonth(viewMonth, -1));
    var prevSpent = total(prev, 'expense');

    $('mSpent').textContent = money(spent);
    $('mIncome').textContent = money(income);
    $('mNet').textContent = (net < 0 ? '−' : '') + money(Math.abs(net));
    $('mNet').className = 'value ' + (net < 0 ? 'neg' : net > 0 ? 'pos' : '');

    var expCount = list.filter(function (t) { return t.type === 'expense'; }).length;
    var incCount = list.length - expCount;
    $('mSpentSub').textContent = expCount + (expCount === 1 ? ' expense' : ' expenses') +
      (prevSpent > 0 ? ' · last month ' + money(prevSpent) : '');
    $('mIncomeSub').textContent = incCount + (incCount === 1 ? ' deposit' : ' deposits');

    var box = $('budgetBox');
    if (state.budget > 0) {
      var pct = Math.min(100, (spent / state.budget) * 100);
      var over = spent > state.budget;
      box.innerHTML =
        '<div class="label">Monthly budget</div>' +
        '<div class="value ' + (over ? 'neg' : '') + '">' + money(Math.abs(state.budget - spent)) + '</div>' +
        '<div class="progress ' + (over ? 'over' : '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<div class="sub">' + (over ? 'over' : 'left') + ' of ' + money(state.budget) +
        ' &nbsp;<button class="link-btn" id="editBudget" type="button">Edit</button></div>';
    } else {
      box.innerHTML =
        '<div class="label">Monthly budget</div>' +
        '<div class="value muted">Not set</div>' +
        '<div class="sub">Track spending against a limit. <button class="link-btn" id="editBudget" type="button">Set budget</button></div>';
    }
    $('editBudget').addEventListener('click', openBudgetEditor);
  }

  function openBudgetEditor() {
    var box = $('budgetBox');
    box.innerHTML =
      '<div class="label">Monthly budget</div>' +
      '<form class="budget-edit" id="budgetForm">' +
      '<input class="input" id="budgetInput" type="number" min="0" step="1" inputmode="decimal" aria-label="Monthly budget" value="' + (state.budget || '') + '" placeholder="Amount">' +
      '<button class="btn-secondary" type="submit">Save</button></form>' +
      '<div class="sub">Leave empty to remove the budget.</div>';
    var input = $('budgetInput');
    input.focus();
    $('budgetForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = parseFloat(input.value);
      state.budget = isFinite(v) && v > 0 ? v : 0;
      save();
      render();
    });
  }

  function renderInsights() {
    var list = inMonth(viewMonth);
    var spent = total(list, 'expense');
    var items = [];
    var isCurrent = viewMonth === monthKey(new Date());

    if (spent > 0) {
      var prevSpent = total(inMonth(shiftMonth(viewMonth, -1)), 'expense');
      if (prevSpent > 0) {
        var diff = ((spent - prevSpent) / prevSpent) * 100;
        if (Math.abs(diff) >= 1) {
          items.push({
            warn: diff > 0,
            text: 'Spending is ' + Math.abs(diff).toFixed(0) + '% ' + (diff > 0 ? 'higher' : 'lower') +
              ' than last month (' + money(prevSpent) + ').'
          });
        }
      }
      var by = categoryTotals(list);
      if (by.length) {
        items.push({
          text: by[0].cat + ' is your largest category at ' + ((by[0].amount / spent) * 100).toFixed(0) +
            '% of spending (' + money(by[0].amount) + ').'
        });
      }
      if (state.budget > 0) {
        var used = (spent / state.budget) * 100;
        if (spent > state.budget) {
          items.push({ warn: true, text: 'You are ' + money(spent - state.budget) + ' over your monthly budget.' });
        } else if (isCurrent) {
          var dim = daysInMonth(viewMonth);
          var left = dim - new Date().getDate();
          items.push({
            warn: used >= 85,
            text: 'You have used ' + used.toFixed(0) + '% of your budget with ' + left + (left === 1 ? ' day' : ' days') + ' left. ' +
              (left > 0 ? 'That is about ' + money((state.budget - spent) / left) + ' per day.' : '')
          });
        }
      }
      if (isCurrent) {
        var day = new Date().getDate();
        if (day >= 5) {
          var proj = (spent / day) * daysInMonth(viewMonth);
          items.push({ text: 'At this pace you will spend about ' + money(proj) + ' by the end of the month.' });
        }
      }
    }

    $('insightsPanel').hidden = items.length === 0;
    $('insights').innerHTML = items.map(function (i) {
      return '<li class="' + (i.warn ? 'warn' : '') + '">' + esc(i.text) + '</li>';
    }).join('');
  }

  function categoryTotals(list) {
    var map = {};
    list.filter(function (t) { return t.type === 'expense'; }).forEach(function (t) {
      map[t.cat] = (map[t.cat] || 0) + t.amount;
    });
    return Object.keys(map).map(function (k) { return { cat: k, amount: map[k] }; })
      .sort(function (a, b) { return b.amount - a.amount; });
  }

  function renderBreakdown() {
    var list = inMonth(viewMonth);
    var spent = total(list, 'expense');
    var rows = categoryTotals(list);
    if (!rows.length) {
      $('breakdown').innerHTML = '<p class="muted" style="margin:0">Expenses you add will be grouped by category here.</p>';
      return;
    }
    $('breakdown').innerHTML = rows.map(function (r) {
      var pct = (r.amount / spent) * 100;
      return '<div class="cat-row">' +
        '<div class="cat-top"><span><i class="dot" style="background:' + catColor(r.cat) + '"></i>' + esc(r.cat) + '</span>' +
        '<span>' + money(r.amount) + ' <span class="muted small">' + pct.toFixed(0) + '%</span></span></div>' +
        '<div class="cat-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + catColor(r.cat) + '"></i></div></div>';
    }).join('');
  }

  function renderTrend() {
    var keys = [];
    for (var i = 5; i >= 0; i--) keys.push(shiftMonth(viewMonth, -i));
    var vals = keys.map(function (k) { return total(inMonth(k), 'expense'); });
    var max = Math.max.apply(null, vals);
    if (max <= 0) {
      $('trend').innerHTML = '<p class="muted" style="margin:0">Monthly totals appear once you have some spending.</p>';
      return;
    }
    var W = 360, H = 170, base = 140, maxH = 100, bw = 36;
    var step = W / keys.length;
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Spending over the last six months">';
    out += '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" stroke="var(--line)"/>';
    keys.forEach(function (k, idx) {
      var h = Math.max(vals[idx] > 0 ? 3 : 0, (vals[idx] / max) * maxH);
      var x = idx * step + (step - bw) / 2;
      out += '<rect class="bar ' + (idx === keys.length - 1 ? 'now' : '') + '" x="' + x.toFixed(1) + '" y="' + (base - h).toFixed(1) +
        '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="4"><title>' + esc(monthLabel(k) + ': ' + money(vals[idx])) + '</title></rect>';
      if (vals[idx] > 0) {
        out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (base - h - 6).toFixed(1) + '" text-anchor="middle">' + esc(compact(vals[idx])) + '</text>';
      }
      out += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (base + 18) + '" text-anchor="middle">' + esc(monthLabel(k, true)) + '</text>';
    });
    out += '</svg>';
    $('trend').innerHTML = out;
  }

  function renderFilterOptions() {
    var sel = $('filterCat');
    var cur = filters.cat;
    sel.innerHTML = '<option value="all">All categories</option>' +
      ALL_CATS.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    sel.value = cur;
  }

  function renderList() {
    var all = inMonth(viewMonth);
    var q = filters.q.trim().toLowerCase();
    var list = all.filter(function (t) {
      if (filters.cat !== 'all' && t.cat !== filters.cat) return false;
      if (q && (t.desc + ' ' + t.cat).toLowerCase().indexOf(q) === -1) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); });

    $('txCount').textContent = all.length
      ? (list.length === all.length ? all.length + ' this month' : list.length + ' of ' + all.length)
      : '';

    if (!all.length) {
      var hasAny = state.tx.length > 0;
      $('txWrap').innerHTML = '<div class="empty"><p>No transactions in ' + esc(monthLabel(viewMonth)) + '. ' +
        (hasAny ? 'Use the form to add one, or switch months.' : 'Add your first one using the form.') + '</p>' +
        (hasAny ? '' : '<button class="btn-secondary" id="loadSample" type="button">Load sample data</button>') + '</div>';
      var b = $('loadSample');
      if (b) b.addEventListener('click', loadSample);
      return;
    }
    if (!list.length) {
      $('txWrap').innerHTML = '<div class="empty"><p>Nothing matches your search or filter.</p></div>';
      return;
    }
    $('txWrap').innerHTML = '<ul class="tx-list">' + list.map(function (t) {
      var d = new Date(t.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      var sign = t.type === 'income' ? '+' : '−';
      return '<li class="tx" data-id="' + t.id + '">' +
        '<span class="date">' + esc(d) + '</span>' +
        '<div style="min-width:0"><div class="desc">' + esc(t.desc) + '</div>' +
        '<div class="cat"><i class="dot" style="background:' + catColor(t.cat) + '"></i>' + esc(t.cat) + '</div></div>' +
        '<span class="amt ' + (t.type === 'income' ? 'pos' : '') + '">' + sign + money(t.amount) + '</span>' +
        '<button class="icon-btn" data-del="' + t.id + '" aria-label="Delete ' + esc(t.desc) + '" title="Delete">&times;</button></li>';
    }).join('') + '</ul>';
  }

  
  function currentType() { return document.querySelector('input[name="type"]:checked').value; }

  function fillCategories() {
    var list = currentType() === 'income' ? INCOME_CATS : EXPENSE_CATS;
    $('cat').innerHTML = list.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    catTouched = false;
    suggestCategory();
  }
  function suggestCategory() {
    if (catTouched) return;
    var v = $('desc').value;
    if (v.trim()) $('cat').value = autoCategory(v, currentType());
  }

  function addTransaction(e) {
    e.preventDefault();
    var err = $('formError');
    var amount = parseFloat($('amount').value);
    var date = $('date').value;
    var type = currentType();
    if (!isFinite(amount) || amount <= 0) { err.textContent = 'Enter an amount greater than zero.'; $('amount').focus(); return; }
    if (!date) { err.textContent = 'Choose a date.'; $('date').focus(); return; }
    err.textContent = '';
    var cat = $('cat').value;
    var desc = $('desc').value.trim() || cat;
    state.tx.push({ id: uid(), type: type, amount: Math.round(amount * 100) / 100, desc: desc, cat: cat, date: date });
    save();
    viewMonth = date.slice(0, 7);
    $('amount').value = '';
    $('desc').value = '';
    catTouched = false;
    render();
    $('amount').focus();
    toast('Transaction added');
  }

  function deleteTx(id) {
    var idx = state.tx.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return;
    lastDeleted = state.tx.splice(idx, 1)[0];
    save();
    render();
    toast('Transaction deleted', true);
  }

  function toast(msg, undo) {
    $('toastMsg').textContent = msg;
    $('toastUndo').style.display = undo ? '' : 'none';
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 4500);
  }

  function loadSample() {
    var template = [
      ['Salary', 'income', 85000, 1], ['Rent', 'expense', 22000, 2], ['Electricity bill', 'expense', 1800, 6],
      ['Internet', 'expense', 999, 7], ['Groceries - DMart', 'expense', 3400, 9], ['Uber ride', 'expense', 420, 11],
      ['Lunch with team', 'expense', 650, 12], ['Netflix', 'expense', 649, 14], ['Pharmacy', 'expense', 780, 15],
      ['Freelance invoice', 'income', 12000, 16], ['Groceries - BigBasket', 'expense', 2900, 18],
      ['Petrol', 'expense', 1500, 20], ['Amazon order', 'expense', 2300, 22], ['Dinner at restaurant', 'expense', 1800, 24]
    ];
    var factors = [1, 0.93, 1.08];
    var now = new Date();
    for (var m = 0; m < 3; m++) {
      var key = shiftMonth(monthKey(now), -m);
      template.forEach(function (t) {
        if (m === 0 && t[3] > now.getDate()) return;
        var amt = t[1] === 'income' ? t[2] : Math.round(t[2] * factors[m] / 10) * 10;
        state.tx.push({
          id: uid(), type: t[1], amount: amt, desc: t[0],
          cat: autoCategory(t[0], t[1]), date: key + '-' + pad(t[3])
        });
      });
    }
    if (!state.budget) state.budget = 45000;
    save();
    render();
  }


  function bind() {
    $('prevMonth').addEventListener('click', function () { viewMonth = shiftMonth(viewMonth, -1); render(); });
    $('nextMonth').addEventListener('click', function () { viewMonth = shiftMonth(viewMonth, 1); render(); });
    $('currency').addEventListener('change', function (e) { state.currency = e.target.value; save(); render(); });
    $('form').addEventListener('submit', addTransaction);
    document.querySelectorAll('input[name="type"]').forEach(function (r) { r.addEventListener('change', fillCategories); });
    $('desc').addEventListener('input', suggestCategory);
    $('cat').addEventListener('change', function () { catTouched = true; });
    $('search').addEventListener('input', function (e) { filters.q = e.target.value; renderList(); });
    $('filterCat').addEventListener('change', function (e) { filters.cat = e.target.value; renderList(); });
    $('txWrap').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-del]');
      if (btn) deleteTx(btn.getAttribute('data-del'));
    });
    $('toastUndo').addEventListener('click', function () {
      if (lastDeleted) {
        state.tx.push(lastDeleted);
        lastDeleted = null;
        save();
        render();
      }
      $('toast').classList.remove('show');
    });
  }

  
  function setView(v) {
    currentView = v;
    $('viewDash').hidden = v !== 'dash';
    $('viewMore').hidden = v !== 'more';
    document.querySelectorAll('.tabs button').forEach(function (b) {
      var on = b.getAttribute('data-view') === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    if (v === 'more') renderMore();
    window.scrollTo(0, 0);
  }
  function setTool(t) {
    currentTool = t;
    $('toolSplit').hidden = t !== 'split';
    $('toolLimits').hidden = t !== 'limits';
    document.querySelectorAll('.subtabs button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-tool') === t ? 'true' : 'false');
    });
    renderMore();
  }
  function renderMore() {
    if (currentTool === 'split') renderSplit();
    else renderLimits();
  }
  function inr(n) {
    var whole = Math.abs(n - Math.round(n)) < 0.005;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR',
      minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2
    }).format(n);
  }


  function splitNames() {
    return $('splitPeople').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function isOther() { return state.split.mode === 'other'; }
  function allNames() {
    var list = ['You'];
    if (isOther()) list.push(state.split.payer || 'Payer');
    return list.concat(splitNames());
  }
  function payKey(name) { return (isOther() ? 'o:' : 'i:') + name.toLowerCase(); }

  function buildCustomInputs() {
    var box = $('splitCustom');
    if ($('splitMode').value !== 'custom') { box.hidden = true; box.innerHTML = ''; return; }
    var names = allNames();
    box.hidden = false;
    box.innerHTML = names.map(function (n, i) {
      return '<div class="field"><label for="sc' + i + '">' + esc(n) + '\u2019s share</label>' +
        '<input class="input" id="sc' + i + '" data-i="' + i + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + (splitCustom[i] || '') + '"></div>';
    }).join('');
  }

  function computeShares() {
    var totalAmt = parseFloat($('splitTotal').value) || 0;
    var names = allNames();
    var shares;
    if ($('splitMode').value === 'custom') {
      shares = names.map(function (n, i) { return parseFloat(splitCustom[i]) || 0; });
    } else {
      var each = Math.floor((totalAmt / names.length) * 100) / 100;
      shares = names.map(function () { return each; });
      shares[0] = Math.round((shares[0] + (totalAmt - each * names.length)) * 100) / 100;
    }
    return { total: totalAmt, names: names, shares: shares };
  }

  function ynButtons(i, isYes, label) {
    return '<div class="yn-wrap"><span class="small muted">' + label + '</span>' +
      '<div class="yn" role="group" aria-label="' + label + '">' +
      '<button type="button" class="yes' + (isYes ? ' on' : '') + '" data-pay="' + i + '" data-val="1">Yes</button>' +
      '<button type="button" class="no' + (!isYes ? ' on' : '') + '" data-pay="' + i + '" data-val="0">No</button>' +
      '</div></div>';
  }

  function renderSplit() {
    var d = computeShares();
    var box = $('splitResult');
    var other = isOther();
    var payer = state.split.payer || 'Payer';
    var count = d.names.length - 1;

    if (d.total <= 0 || count < 1) {
      box.innerHTML = '<div class="empty" style="border-top:0"><p>Enter the total bill and add at least one person to see who owes what.</p></div>';
      return;
    }
    var assigned = d.shares.reduce(function (s, x) { return s + x; }, 0);
    var mismatch = Math.abs(assigned - d.total) > 0.009;
    var title = $('splitDesc').value.trim() || 'Shared bill';
    var paid = state.split.paid;
    var sub;

    if (other) {
      var done = !!paid[payKey('You')];
      sub = 'You owe ' + esc(payer) + ' ' + inr(d.shares[0]) + ' \u2022 ' + (done ? 'Paid' : 'Not paid yet');
    } else {
      var owed = 0, got = 0;
      d.names.forEach(function (n, i) {
        if (i === 0) return;
        owed += d.shares[i];
        if (paid[payKey(n)]) got += d.shares[i];
      });
      sub = 'Received ' + inr(got) + ' of ' + inr(owed) + ' \u2022 ' + inr(owed - got) + ' pending';
    }

    var html = '<div class="share-head"><div class="muted small">' + esc(title) + '</div>' +
      '<div class="big">' + inr(d.total) + '</div><div class="muted small">' + sub + '</div></div>';

    if (mismatch) {
      html += '<div style="padding:0 20px 14px"><p class="notice warn">Custom shares add up to ' + inr(assigned) + ', but the bill is ' + inr(d.total) +
        (assigned < d.total ? '. ' + inr(d.total - assigned) + ' is unassigned.' : '. They are ' + inr(assigned - d.total) + ' over.') + '</p></div>';
    }

    d.names.forEach(function (n, i) {
      var amt = d.shares[i];
      var yes = !!paid[payKey(n)];
      var addBtn = '<button type="button" class="btn-secondary" id="addMyShare">Add to my expenses</button>';
      if (i === 0) {
        if (other) {
          html += '<div class="share-row self' + (yes ? ' paid' : '') + '"><div><div class="nm">You</div><div class="sub">You owe ' + esc(payer) + '</div></div>' +
            '<div class="amt">' + inr(amt) + '</div><div class="share-actions">' + ynButtons(i, yes, 'Did you pay?') + addBtn + '</div></div>';
        } else {
          html += '<div class="share-row self"><div><div class="nm">You</div><div class="sub">Paid the bill</div></div>' +
            '<div class="amt">' + inr(amt) + '</div><div class="share-actions">' + addBtn + '</div></div>';
        }
      } else if (other) {
        html += '<div class="share-row"><div><div class="nm">' + esc(n) + '</div><div class="sub">' + (i === 1 ? 'Paid the bill' : 'Owes ' + esc(payer)) + '</div></div>' +
          '<div class="amt">' + inr(amt) + '</div><div class="share-actions"></div></div>';
      } else {
        html += '<div class="share-row' + (yes ? ' paid' : '') + '"><div><div class="nm">' + esc(n) + '</div><div class="sub">Owes you</div></div>' +
          '<div class="amt">' + inr(amt) + '</div><div class="share-actions">' + ynButtons(i, yes, 'Received?') + '</div></div>';
      }
    });
    box.innerHTML = html;
  }

  function persistSplit() {
    state.split.mode = $('splitPayer').value;
    state.split.payer = $('splitPayerName').value.trim();
    state.split.people = $('splitPeople').value;
    save();
  }

  function syncPayerUi() {
    var other = isOther();
    $('payerNameBox').hidden = !other;
    $('splitPeopleLabel').textContent = other ? 'Who else is in the bill?' : 'Who is splitting with you?';
  }

  function bindSplit() {
    $('splitPayer').value = state.split.mode || 'me';
    $('splitPayerName').value = state.split.payer || '';
    $('splitPeople').value = state.split.people || '';
    syncPayerUi();
    ['splitTotal', 'splitDesc'].forEach(function (id) {
      $(id).addEventListener('input', function () { renderSplit(); });
    });
    $('splitPayerName').addEventListener('input', function () { persistSplit(); buildCustomInputs(); renderSplit(); });
    $('splitPayer').addEventListener('change', function () { persistSplit(); syncPayerUi(); buildCustomInputs(); renderSplit(); });
    $('splitPeople').addEventListener('input', function () { persistSplit(); buildCustomInputs(); renderSplit(); });
    $('splitMode').addEventListener('change', function () { buildCustomInputs(); renderSplit(); });
    $('splitCustom').addEventListener('input', function (e) {
      var i = e.target.getAttribute('data-i');
      if (i !== null) { splitCustom[Number(i)] = e.target.value; renderSplit(); }
    });
    $('splitResult').addEventListener('click', function (e) {
      var p = e.target.closest('[data-pay]');
      if (p) {
        var d = computeShares();
        state.split.paid[payKey(d.names[Number(p.getAttribute('data-pay'))])] = p.getAttribute('data-val') === '1';
        save();
        renderSplit();
        return;
      }
      if (e.target.closest('#addMyShare')) {
        var s = computeShares();
        var mine = s.shares[0];
        if (mine <= 0) { toast('Your share is zero, nothing to add.'); return; }
        var label = $('splitDesc').value.trim() || 'Shared bill';
        state.tx.push({ id: uid(), type: 'expense', amount: mine, desc: label + ' (my share)', cat: autoCategory(label, 'expense'), date: todayStr() });
        save();
        render();
        toast('Your share was added to expenses');
      }
    });
  }

  
  function renderLimits() {
    var list = inMonth(viewMonth);
    var spent = total(list, 'expense');
    var byCat = {};
    categoryTotals(list).forEach(function (r) { byCat[r.cat] = r.amount; });

    var limitSum = 0, overCount = 0;
    EXPENSE_CATS.forEach(function (c) {
      var l = Number(state.limits[c]) || 0;
      limitSum += l;
      if (l > 0 && (byCat[c] || 0) > l) overCount++;
    });

    var over = state.budget > 0 && spent > state.budget;
    var pct = state.budget > 0 ? Math.min(100, (spent / state.budget) * 100) : 0;

    var html = '<section class="panel"><div class="panel-head"><h2>Overall monthly limit</h2><span class="muted small">' + esc(monthLabel(viewMonth)) + '</span></div><div class="panel-body">' +
      '<div class="row2" style="align-items:end"><div class="field" style="margin-bottom:0"><label for="limitOverall">Limit for all spending</label>' +
      '<input class="input" id="limitOverall" type="number" min="0" step="100" inputmode="decimal" placeholder="Not set" value="' + (state.budget || '') + '"></div>' +
      '<div>' + (state.budget > 0
        ? '<div class="small muted">Spent ' + money(spent) + ' of ' + money(state.budget) + '</div>' +
          '<div class="progress ' + (over ? 'over' : '') + '" style="margin:8px 0 4px"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
          '<div class="small ' + (over ? 'neg' : 'muted') + '">' + (over ? money(spent - state.budget) + ' over limit' : money(state.budget - spent) + ' remaining') + '</div>'
        : '<div class="small muted">Set a limit to track your total spending.</div>') +
      '</div></div>';

    if (state.budget > 0 && limitSum > state.budget) {
      html += '<p class="notice warn" style="margin-top:14px">Your category limits add up to ' + money(limitSum) + ', which is more than your overall limit of ' + money(state.budget) + '.</p>';
    } else if (overCount > 0) {
      html += '<p class="notice warn" style="margin-top:14px">' + overCount + (overCount === 1 ? ' category is' : ' categories are') + ' over its limit this month.</p>';
    }
    html += '</div></section>';

    html += '<section class="panel"><div class="panel-head"><h2>Category limits</h2><span class="muted small">Leave empty for no limit</span></div><div style="margin-top:12px">';
    EXPENSE_CATS.forEach(function (c) {
      var l = Number(state.limits[c]) || 0;
      var sp = byCat[c] || 0;
      var p = l > 0 ? Math.min(100, (sp / l) * 100) : 0;
      var o = l > 0 && sp > l;
      var status = l > 0
        ? (o ? money(sp - l) + ' over' : money(l - sp) + ' left') + ' · ' + money(sp) + ' spent'
        : (sp > 0 ? money(sp) + ' spent, no limit' : 'No spending yet');
      html += '<div class="limit-row"><div class="nm"><i class="dot" style="background:' + catColor(c) + '"></i>' + esc(c) + '</div>' +
        '<div class="meter"><div class="progress ' + (o ? 'over' : '') + '"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
        '<div class="status ' + (o ? 'neg' : '') + '">' + esc(status) + '</div></div>' +
        '<input class="input" type="number" min="0" step="100" inputmode="decimal" data-limit="' + esc(c) + '" aria-label="Limit for ' + esc(c) + '" placeholder="No limit" value="' + (l || '') + '"></div>';
    });
    html += '</div></section>';
    $('limitsOut').innerHTML = html;
  }

  function bindLimits() {
    $('limitsOut').addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'limitOverall') {
        var v = parseFloat(t.value);
        state.budget = isFinite(v) && v > 0 ? v : 0;
        save(); render();
        return;
      }
      var cat = t.getAttribute('data-limit');
      if (cat) {
        var n = parseFloat(t.value);
        if (isFinite(n) && n > 0) state.limits[cat] = n; else delete state.limits[cat];
        save(); renderLimits();
      }
    });
  }

  function bindMore() {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
    });
    document.querySelectorAll('.subtabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
    });
    bindSplit();
    bindLimits();
  }


  load();
  $('date').value = todayStr();
  renderFilterOptions();
  fillCategories();
  bind();
  bindMore();
  render();
})();
