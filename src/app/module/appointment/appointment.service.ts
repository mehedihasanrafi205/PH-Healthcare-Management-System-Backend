import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
  // Business logic

  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error("No Bkash Access token found!");
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        authorization: bkashIdToken,
        "x-app-key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: "01723888888", // User or phone number
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: "1200",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: "Inv0124", // Appointment id
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  return bkashCreatePaymentResult;
};

const bookAppointmentCallback = () => {
  return {
    success: true,
  };
};
export const AppointmentService = {
  bookAppointment,
  bookAppointmentCallback
};
