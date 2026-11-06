const QueueDB = {
  _db: null,
  _ref: null,
  _counterRef: null,
  _statsRef: null,
  _listeners: [],
  _cache: [],
  _ready: false,

  init() {
    if (typeof firebase === 'undefined') {
      return Promise.reject(new Error('Firebase not loaded'));
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    this._db = firebase.database();
    const base = 'shops/' + (typeof SHOP_CODE !== 'undefined' ? SHOP_CODE : 'default');
    this._ref = this._db.ref(base + '/queue');
    this._counterRef = this._db.ref(base + '/counter');
    this._statsRef = this._db.ref(base + '/stats');

    this._ref.on('value', (snap) => {
      const val = snap.val();
      if (!val) this._cache = [];
      else {
        this._cache = Object.keys(val).map(id => ({ id, ...val[id] }))
          .sort((a, b) => a.number - b.number);
      }
      this._ready = true;
      this._listeners.forEach(fn => fn(this._cache));
      window.dispatchEvent(new CustomEvent('queueUpdated'));
    });

    return Promise.resolve();
  },

  onUpdate(fn) {
    this._listeners.push(fn);
    if (this._ready) fn(this._cache);
  },

  getAll() { return this._cache.slice(); },
  count() { return this._cache.length; },
  aheadOf(myNumber) { return this._cache.filter(c => c.number < myNumber).length; },
  /** الأسماء الأولى فقط لمن قبل هذا الرقم، مرتّبة حسب الدور */
  namesAhead(myNumber) {
    return this._cache.filter(c => c.number < myNumber)
      .map(c => ({ id: c.id, name: String(c.firstName || '').trim() || 'زبون' }));
  },

  findById(id) { return this._cache.find(c => c.id === id) || null; },

  findByPhone(phone) {
    const p = String(phone || '').replace(/\s+/g, '');
    return this._cache.find(c => String(c.phone || '').replace(/\s+/g, '') === p) || null;
  },

  /** دقائق الانتظار: كل شخص = 40 دقيقة */
  waitMinutes(aheadCount) {
    return Math.max(0, aheadCount) * 40;
  },

  formatWait(mins) {
    if (mins <= 0) return 'دورك الآن أو قريب جداً';
    if (mins < 60) return 'حوالي ' + mins + ' دقيقة';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) return 'حوالي ' + h + ' ساعة';
    return 'حوالي ' + h + ' ساعة و ' + m + ' دقيقة';
  },

  async getNextNumber() {
    const next = this._cache.length + 1;
    await this._counterRef.set(next);
    return next;
  },

  async add(customer) {
    const phone = customer.phone.trim();
    const existing = this.findByPhone(phone);
    if (existing) {
      const err = new Error('PHONE_EXISTS');
      err.existing = existing;
      throw err;
    }

    const number = await this.getNextNumber();
    const newRef = this._ref.push();
    const entry = {
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      phone: phone,
      number,
      createdAt: Date.now()
    };
    await newRef.set(entry);
    const full = { id: newRef.key, ...entry };
    this.notifyAdmin(full);
    return full;
  },

  notifyAdmin(customer) {
    const name = ((customer.firstName || '') + ' ' + (customer.lastName || '')).trim() || 'زبون';
    const body = name + ' — الرقم ' + customer.number;
    const title = 'زبون جديد في الطابور';
    const topic = typeof NTFY_TOPIC !== 'undefined' ? NTFY_TOPIC : 'barber-queue';

    try {
      if (window.NotifyBridge && window.NotifyBridge.sendNtfy) {
        window.NotifyBridge.sendNtfy(topic, title, body);
      }
    } catch (e) {}

    try {
      // JSON publish: العنوان العربي لا يصح وضعه في هيدر HTTP (Latin-1 فقط) فيفشل fetch بصمت
      fetch('https://ntfy.sh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic,
          title: title,
          message: body,
          priority: 4,
          tags: ['scissors', 'bell']
        })
      }).then(function (r) {
        if (!r.ok) console.warn('ntfy failed', r.status);
      }).catch(function (e) { console.warn('ntfy error', e); });
    } catch (e) {}

    try {
      const token = typeof TELEGRAM_BOT_TOKEN !== 'undefined' ? TELEGRAM_BOT_TOKEN : '';
      const chatId = typeof TELEGRAM_CHAT_ID !== 'undefined' ? TELEGRAM_CHAT_ID : '';
      if (token && chatId && window.NotifyBridge && window.NotifyBridge.sendTelegram) {
        window.NotifyBridge.sendTelegram(token, chatId, '✂ <b>' + title + '</b>\n' + body);
      }
    } catch (e) {}
  },

  async remove(id, options) {
    await this._ref.child(id).remove();
    if (options && options.completed) {
      await this.recordCompletion();
    }
    await this.renumber();
  },

  dateKey(d) {
    const x = d || new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  },

  async recordCompletion() {
    const key = this.dateKey();
    const ref = this._statsRef.child('daily').child(key);
    await ref.transaction(cur => (cur || 0) + 1);
  },

  async getStats() {
    const snap = await this._statsRef.child('daily').once('value');
    const daily = snap.val() || {};
    const today = this.dateKey();
    const todayCount = daily[today] || 0;

    // last 7 days
    let weekCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weekCount += daily[this.dateKey(d)] || 0;
    }
    return { today: todayCount, week: weekCount, daily };
  },

  async renumber() {
    const snap = await this._ref.once('value');
    const val = snap.val();
    if (!val) {
      await this._counterRef.set(0);
      return;
    }
    const list = Object.keys(val).map(id => ({ id, ...val[id] }))
      .sort((a, b) => {
        if (a.createdAt !== b.createdAt) return (a.createdAt || 0) - (b.createdAt || 0);
        return (a.number || 0) - (b.number || 0);
      });
    const updates = {};
    list.forEach((c, i) => { updates[c.id + '/number'] = i + 1; });
    await this._ref.update(updates);
    await this._counterRef.set(list.length);
  },

  async clear() {
    await this._ref.remove();
    await this._counterRef.set(0);
  },

  /** يوم جديد: مسح الطابور + تصفير العداد + تصفير مكتملون اليوم */
  async newDay() {
    await this.clear();
    const key = this.dateKey();
    await this._statsRef.child('daily').child(key).set(0);
  }
};
