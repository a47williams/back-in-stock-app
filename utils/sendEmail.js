// utils/sendEmail.js
const sgMail = require("@sendgrid/mail");

const FROM_EMAIL = process.env.ALERT_EMAIL_FROM || "alerts@yourapp.com";
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendLimitReachedEmail(shop) {
  if (!shop || !shop.shop || !shop.email) return;

  const msg = {
    to: shop.email,
    from: FROM_EMAIL,
    subject: "You've reached your Back in Stock alert limit",
    html: `
      <p>Hi there,</p>
      <p>Your store <strong>${shop.shop}</strong> has reached the monthly alert limit for your current plan (<strong>${shop.plan}</strong>).</p>
      <p>To continue sending WhatsApp alerts, please <a href="https://yourapp.com/upgrade">upgrade your plan</a>.</p>
      <p>Thanks,<br/>Back in Stock Alerts Team</p>
    `,
  };

  try {
    await sgMail.send(msg);
    console.log(`📧 Alert limit email sent to ${shop.email}`);
  } catch (err) {
    console.error("❌ Email send failed:", err?.response?.body || err);
  }
}

module.exports = { sendLimitReachedEmail };
