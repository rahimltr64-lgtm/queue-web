// طبقة الحركة: لا تغيّر منطق التطبيق، تراقب الواجهة فقط وتضيف الحركة
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const can = (el) => el && el.animate && !reduce.matches;

  // يبدأ تسلسل الافتتاح بعد اختفاء شاشة الاتصال (مع مهلة احتياطية)
  const overlay = document.getElementById('loadingOverlay');
  const ready = () => document.body.classList.add('ready');
  if (overlay) {
    if (overlay.classList.contains('hidden')) ready();
    else new MutationObserver(() => { if (overlay.classList.contains('hidden')) ready(); })
      .observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }
  setTimeout(ready, 4000);

  // مراقبة نص عنصر وتشغيل دالة عند تغيّر قيمته فعلاً
  function watch(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    let last = el.textContent;
    new MutationObserver(() => {
      const now = el.textContent;
      if (now === last) return;
      const prev = last; last = now;
      fn(el, prev, now);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  // الرقم الجديد يصعد من الأسفل بدل أن يتبدّل فجأة
  const roll = (el) => can(el) && el.animate(
    [{ transform: 'translateY(35%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: 300, easing: EASE });
  const fade = (el) => can(el) && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });

  watch('aheadCount', roll);
  watch('myNumber', roll);
  watch('waitEstimate', fade);

  // حين يصبح دورك: نبضة على الرقم + اهتزاز قصير (النص "دورك الآن" يؤدي المعنى بدون حركة)
  watch('ticketWait', (el, prev, now) => {
    fade(el);
    if (prev && now.indexOf('دورك الآن') !== -1) {
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
      const n = document.getElementById('myNumber');
      if (can(n)) n.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
        { duration: 300, iterations: 2, easing: EASE });
    }
  });

  // نافذة التسجيل: خروج مُحرَّك، وزر Esc يغلقها فوراً
  const modal = document.getElementById('joinModal');
  const origOpen = window.openJoinModal;
  const origClose = window.closeJoinModal;
  window.openJoinModal = function () {
    modal.classList.remove('closing');
    return origOpen && origOpen.apply(this, arguments);
  };
  window.closeJoinModal = function () {
    if (!modal.classList.contains('open') || modal.classList.contains('closing')) return;
    if (reduce.matches) { modal.classList.remove('open'); return; }
    modal.classList.add('closing');
    setTimeout(() => modal.classList.remove('open', 'closing'), 150);
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeJoinModal(); });

  // لمسة تفاعلية: الضغط على الشعار يقصّ المقص مرة أخرى
  const blade = document.querySelector('.blade');
  const logo = document.querySelector('.logo');
  if (logo && blade) logo.addEventListener('click', () => {
    if (!can(blade)) return;
    blade.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-16deg)' }, { transform: 'rotate(0)' },
      { transform: 'rotate(-16deg)' }, { transform: 'rotate(0)' }], { duration: 600, easing: 'ease-in-out' });
  });
})();
