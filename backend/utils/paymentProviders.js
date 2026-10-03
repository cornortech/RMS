// =====================================================================
// PAYMENT PROVIDERS — the "plug socket" for online payment gateways.
// Today "Online" means: customer pays by QR / transfer and staff press
// "Mark as paid". To add eSewa / Khalti / Stripe later:
//   1. add a provider below with start() and verify()
//   2. call start() when the order is created (routes/deliveryOnline.js)
//   3. call verify() from the gateway's webhook, then set
//      order.paymentStatus = "Paid", order.paymentProvider, order.paymentRef
// Nothing else in the system has to change.
// =====================================================================
const providers = {
  manual: {
    // start() returns what the customer should see after ordering
    async start(order) {
      return { type: "manual", message: "Pay using the restaurant's QR or the instructions shown." };
    },
    // verify() is called by a webhook; manual payments are verified by staff instead
    async verify() {
      return { paid: false };
    },
  },
};

const getProvider = (name = "manual") => providers[name] || providers.manual;
module.exports = { getProvider, providers };