const MY_TICKET_KEY = 'barber_my_ticket_' + (typeof SHOP_CODE !== 'undefined' ? SHOP_CODE : 'default');

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function openJoinModal() {
  document.getElementById('joinModal').classList.add('open');
  document.getElementById('firstName').focus();
}

function closeJoinModal() {
  document.getElementById('joinModal').classList.remove('open');
}

function updateAheadCount() {
  const ticket = getMyTicket();
  let ahead;
  if (ticket) {
    ahead = QueueDB.aheadOf(ticket.number);
    document.getElementById('aheadCount').textContent = ahead;
  } else {
    ahead = QueueDB.count();
    document.getElementById('aheadCount').textContent = ahead;
  }
  renderAheadList(ticket);
  const waitEl = document.getElementById('waitEstimate');
  if (waitEl) {
    waitEl.textContent = QueueDB.formatWait(QueueDB.waitMinutes(ahead));
  }
  const ticketWait = document.getElementById('ticketWait');
  if (ticketWait && ticket) {
    ticketWait.textContent = 'الانتظار المتوقع: ' + QueueDB.formatWait(QueueDB.waitMinutes(QueueDB.aheadOf(ticket.number)));
  }
}

const aheadLis = new Map();
let aheadFirstRender = true;

function renderAheadList(ticket) {
  const box = document.getElementById('aheadList');
  if (!box) return;
  box.hidden = false;
  // مسجّل: من قبله فقط. غير مسجّل: كل قائمة الانتظار
  const names = QueueDB.namesAhead(ticket ? ticket.number : Infinity);
  const ul = document.getElementById('aheadNames');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const label = ticket ? 'قبلك في الطابور' : 'قائمة الانتظار';
  document.getElementById('aheadTitle').textContent = names.length ? label + ' (' + names.length + ')' : label;
  const empty = document.getElementById('aheadEmpty');
  empty.textContent = ticket ? 'لا أحد قبلك، دورك الآن' : 'لا أحد في الطابور حالياً، كن الأول';
  empty.hidden = names.length > 0;

  const keep = new Set(names.map(n => n.id));
  aheadLis.forEach((li, id) => {
    if (keep.has(id)) return;
    aheadLis.delete(id);
    if (reduce) { li.remove(); return; }
    li.classList.add('out');
    setTimeout(() => li.remove(), 150);
  });

  names.forEach((n, i) => {
    let li = aheadLis.get(n.id);
    if (!li) {
      li = document.createElement('li');
      li.textContent = n.name;
      if (aheadFirstRender) li.style.animationDelay = Math.min(i, 6) * 30 + 'ms';
      li.classList.add('in');
      aheadLis.set(n.id, li);
    } else if (li.textContent !== n.name) {
      li.textContent = n.name;
    }
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null);
  });
  aheadFirstRender = false;
}

function getMyTicket() {
  try {
    const raw = localStorage.getItem(MY_TICKET_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveMyTicket(ticket) {
  localStorage.setItem(MY_TICKET_KEY, JSON.stringify(ticket));
}

function clearMyTicket() {
  localStorage.removeItem(MY_TICKET_KEY);
}

function showTicket(ticket) {
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('ticketView').classList.add('show');
  document.getElementById('leaveBtn').style.display = 'block';
  document.getElementById('myNumber').textContent = ticket.number;
  document.getElementById('myName').textContent = ticket.firstName + ' ' + ticket.lastName;
  document.getElementById('myPhone').textContent = ticket.phone;
  updateAheadCount();
}

function showMain() {
  document.getElementById('mainView').style.display = 'block';
  document.getElementById('ticketView').classList.remove('show');
  document.getElementById('leaveBtn').style.display = 'none';
  updateAheadCount();
}

async function submitJoin() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const btn = document.getElementById('submitBtn');

  if (!firstName) { showError('أدخل الاسم من فضلك'); return; }
  if (!lastName) { showError('أدخل اللقب من فضلك'); return; }
  if (!phone || phone.length < 8) { showError('أدخل رقم هاتف صحيح'); return; }

  const existingLocal = getMyTicket();
  if (existingLocal) {
    const stillThere = QueueDB.findById(existingLocal.id);
    if (stillThere) {
      showError('أنت مسجّل بالفعل في الطابور');
      closeJoinModal();
      showTicket(stillThere);
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = 'جاري التسجيل...';

  try {
    const entry = await QueueDB.add({ firstName, lastName, phone });
    saveMyTicket(entry);
    closeJoinModal();
    document.getElementById('firstName').value = '';
    document.getElementById('lastName').value = '';
    document.getElementById('phone').value = '';
    showTicket(entry);
  } catch (err) {
    console.error(err);
    if (err && err.message === 'PHONE_EXISTS') {
      showError('هذا الرقم مسجّل مسبقاً في الطابور');
      if (err.existing) {
        saveMyTicket(err.existing);
        closeJoinModal();
        showTicket(err.existing);
      }
    } else {
      showError('فشل التسجيل. تحقق من الإنترنت وحاول مجدداً');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'تأكيد';
  }
}

async function leaveQueue() {
  const ticket = getMyTicket();
  if (ticket) {
    try {
      await QueueDB.remove(ticket.id, { completed: false });
    } catch (e) {
      console.error(e);
    }
    clearMyTicket();
  }
  showMain();
}

function refresh() {
  // لا نحكم بغياب التذكرة قبل وصول أول بيانات من Firebase (وإلا تُمحى تذكرة المستخدم عند كل تحديث للصفحة)
  if (!QueueDB._ready) return;
  const ticket = getMyTicket();
  if (ticket) {
    const still = QueueDB.findById(ticket.id);
    if (still) {
      if (still.number !== ticket.number) saveMyTicket(still);
      showTicket(still);
    } else {
      clearMyTicket();
      showMain();
    }
  } else {
    showMain();
  }
  updateAheadCount();
}

document.getElementById('shopCodeDisplay').textContent = typeof SHOP_CODE !== 'undefined' ? SHOP_CODE : '—';

document.getElementById('joinModal').addEventListener('click', (e) => {
  if (e.target.id === 'joinModal') closeJoinModal();
});

QueueDB.init()
  .then(() => {
    const overlay = document.getElementById('loadingOverlay');
    let shown = false;
    document.getElementById('statusText').textContent = 'متصل بالطابور';
    QueueDB.onUpdate(() => {
      refresh();
      if (!shown) { shown = true; overlay.classList.add('hidden'); }
    });
    // لو تأخّر الاتصال: نُظهر الصفحة ونعرض التذكرة المحفوظة دون حذفها
    setTimeout(() => {
      if (shown) return;
      shown = true;
      overlay.classList.add('hidden');
      document.getElementById('statusDot').classList.add('offline');
      document.getElementById('statusText').textContent = 'جاري الاتصال بالطابور...';
      const t = getMyTicket();
      if (t) showTicket(t);
    }, 8000);
  })
  .catch((err) => {
    console.error(err);
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('statusDot').classList.add('offline');
    document.getElementById('statusText').textContent = 'غير متصل - تحقق من الإنترنت';
    showError('تعذر الاتصال بقاعدة البيانات');
  });
