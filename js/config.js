// رمز المحل: الافتراضي BARBER01، ويمكن تغييره عبر الرابط ?shop=CODE (لكل محل رمز QR خاص)
const SHOP_CODE = (function () {
  try {
    const q = new URLSearchParams(location.search).get('shop');
    if (q && /^[A-Za-z0-9_-]{2,32}$/.test(q)) return q;
  } catch (e) {}
  return "BARBER01";
})();

const firebaseConfig = {
  apiKey: "AIzaSyASIvX7nuY79c-85AsfxSV8b3DNVyz2Q4c",
  authDomain: "barber-queue-e17ca.firebaseapp.com",
  databaseURL: "https://barber-queue-e17ca-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "barber-queue-e17ca",
  storageBucket: "barber-queue-e17ca.firebasestorage.app",
  messagingSenderId: "784958318576",
  appId: "1:784958318576:web:a12af2ff2e77d70a0edf35",
  measurementId: "G-8DXL0H6M9W"
};

// موضوع ntfy (اشترك فيه من تطبيق ntfy على هاتف الأدمن)
const NTFY_TOPIC = "barber-mawidi-setif-01";

// تيليجرام (اختياري لكن أوثق) - اتركه فارغ إذا تستخدم ntfy فقط
// كيف تحصل عليه في الرسالة التالية
const TELEGRAM_BOT_TOKEN = "";
const TELEGRAM_CHAT_ID = "";
