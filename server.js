import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

/* ============================
   الإعدادات الوسيطة
============================ */
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : "*",
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

/* ============================
   أدوات مساعدة
============================ */
const ALLOWED_TYPES = new Set([
  "landing",
  "website",
  "ecommerce",
  "info-app",
  "booking-app",
  "custom",
]);

function validatePayload(body) {
  const errors = [];

  const reqStr = (v) => typeof v === "string" && v.trim().length > 0;

  if (!reqStr(body.firstName)) errors.push("الاسم الأول مطلوب.");
  if (!reqStr(body.lastName)) errors.push("الاسم الأخير مطلوب.");
  if (!reqStr(body.email)) errors.push("البريد الإلكتروني مطلوب.");
  if (!reqStr(body.phone)) errors.push("رقم الهاتف مطلوب.");
  if (!reqStr(body.message)) errors.push("نص الرسالة مطلوب.");

  if (body.projectType && !ALLOWED_TYPES.has(body.projectType)) {
    errors.push("قيمة نوع المشروع غير صالحة.");
  }

  return errors;
}

async function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465; // TLS مباشر

  let transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  try {
    await transporter.verify();
    const maskedUser = (process.env.SMTP_USER || "").replace(/.(?=.{3})/g, "*");
    console.log(`✅ SMTP ready on ${host}:${port} as ${maskedUser || "(no-auth)"}`);
    return transporter;
  } catch (err) {
    console.error("❌ SMTP verify failed:", err?.message || err);
    console.warn("⚠️ Falling back to console transport (no real email sent).");
    return nodemailer.createTransport({
      streamTransport: true,
      newline: "unix",
      buffer: true,
    });
  }
}

/* ============================
   Health Check
============================ */
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/* ============================
   Contact Route
============================ */
app.post("/api/contact", async (req, res) => {
  // honeypot اختياري لصدّ البوتات
  if (typeof req.body.company === "string" && req.body.company.trim() !== "") {
    return res.status(200).json({ ok: true, message: "تم الاستلام." });
  }

  const { firstName, lastName, email, phone, projectType = "", message } = req.body || {};
  const errors = validatePayload({ firstName, lastName, email, phone, projectType, message });
  if (errors.length) {
    return res.status(400).json({ ok: false, message: errors[0], errors });
  }

  try {
    const transporter = await getTransporter();

    const subject = "رسالة جديدة من نموذج التواصل";
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cairo,sans-serif;line-height:1.6">
        <h2>رسالة جديدة</h2>
        <ul>
          <li><b>الاسم:</b> ${firstName} ${lastName}</li>
          <li><b>البريد:</b> ${email}</li>
          <li><b>الهاتف:</b> ${phone}</li>
          <li><b>نوع المشروع:</b> ${projectType || "-"}</li>
        </ul>
        <pre style="white-space:pre-wrap;background:#f7f7f7;padding:12px;border-radius:8px">${message}</pre>
      </div>
    `;
    const text =
`الاسم: ${firstName} ${lastName}
البريد: ${email}
الهاتف: ${phone}
نوع المشروع: ${projectType || "-"}
---
${message}`;

    const fromAddr = process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@example.com";
    const toAddr = process.env.MAIL_TO || process.env.SMTP_USER || email;

    const info = await transporter.sendMail({
      from: fromAddr,
      to: toAddr,
      replyTo: email, // للرد السريع على المرسل
      subject,
      text,
      html,
    });

    // إن كان Console Transport فستتوفر الرسالة هنا
    if (info?.message) {
      console.log("📧 Mail (console):\n" + info.message.toString());
    } else if (info?.messageId) {
      console.log("📧 Mail queued:", info.messageId);
    }

    res.json({ ok: true, message: "تم استلام رسالتك بنجاح" });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ ok: false, message: "خطأ في الإرسال" });
  }
});

/* ============================
   تشغيل السيرفر
============================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  if (allowedOrigins.length) {
    console.log("🔐 CORS origins:", allowedOrigins.join(", "));
  } else {
    console.log("🌍 CORS: * (أي مصدر)");
  }
});
