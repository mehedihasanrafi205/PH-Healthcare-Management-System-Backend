import {
  AppointmentStatus,
  PaymentStatus,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { IBookAppointmentPayload } from "./appointment.interface";
import { addMinutes, isBefore, isSameDay } from "date-fns";
import { transporter } from "../../lib/nodemailer";

const bookAppointment = async (
  payload: IBookAppointmentPayload,
  user: RequestUser,
) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    //? Business logic

    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient) {
      throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
    }
    const schedule = await prisma.schedule.findUnique({
      where: { id: payload.scheduleId },
      include: { doctor: true },
    });
    if (!schedule || schedule.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status !== ScheduleStatus.PUBLISHED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Published Yet",
      );
    }

    const now = new Date();

    if (!isSameDay(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Available Today",
      );
    }

    if (!isBefore(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Has Already Started",
      );
    }

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        scheduleId: schedule.id,
        // status : { not : AppointmentStatus.CANCELLED }
      },
    });

    if (existingAppointment?.status === AppointmentStatus.PENDING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Pending Appointment. Please Pay For That",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Confirmed Appointment.",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.ONGOING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Ongoing Appointment",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
      );
    }

    if (schedule.availableSlots === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Fully Booked",
      );
    }

    if (!schedule.doctor.consultationFee) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Doctor Has Not Set A Consultation Fee Yet",
      );
    }
    const amount = schedule.doctor.consultationFee.toString();

    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        "No Bkash Access token found!",
      );
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
          payerReference: user.email, // User or phone number
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
          amount: amount,
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: appointment.id, // Appointment id
        }),
      },
    );

    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

    //* Payment model create

    await tx.payment.create({
      data: {
        merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
        appointmentId: appointment.id,
        amount: amount,
        gatewayResponse: bkashCreatePaymentResult,
        bkashPaymentId: bkashCreatePaymentResult.paymentID,
        payerReference: user.email,
      },
    });

    return { paymentUrl: bkashCreatePaymentResult.bkashURL };
  });

  return transactionResult;
};

const payAppointment = async (payload: any, user: RequestUser) => {
  const appointmentId = payload.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
    include: {
      schedule: {
        include: {
          doctor: true,
        },
      },
    },
  });

  if (!existingAppointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
  }

  if (existingAppointment.status !== AppointmentStatus.PENDING) {
    throw new AppError(httpStatus.BAD_REQUEST, "Appointment Is Not Pending!");
  }

  // if (existingAppointment.status === "CANCELLED" || existingAppointment.status === "ONGOING" || existingAppointment.status === "COMPLETED"){
  //     const appointmentStatus = existingAppointment.status
  //     throw new AppError(httpStatus.BAD_REQUEST, `Appointment is already ${appointmentStatus.toLowerCase}`)
  // }

  if (!existingAppointment.schedule.doctor.consultationFee) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Doctor Has Not Set A Consultation Fee Yet",
    );
  }

  const amount = existingAppointment.schedule.doctor.consultationFee.toString();

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        // payerReference: "0123456789", //user email or phone number
        payerReference: user.email, //user email or phone number
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: amount,
        currency: "BDT",
        intent: "sale",
        // merchantInvoiceNumber: "Inv4" // apppointment id
        merchantInvoiceNumber: existingAppointment.id, // apppointment id
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  if (!bkashCreatePaymentResponse.ok || !bkashCreatePaymentResult.bkashURL) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      bkashCreatePaymentResult.statusMessage ||
        "Failed to initiate bKash payment",
    );
  }

  await prisma.payment.update({
    where: {
      appointmentId: existingAppointment.id,
    },

    data: {
      merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
      gatewayResponse: bkashCreatePaymentResult,
      bkashPaymentId: bkashCreatePaymentResult.paymentID,
    },
  });

  return {
    paymentUrl: bkashCreatePaymentResult.bkashURL,
  };
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const paymentId = query.paymentID;

    if (!paymentId) {
      throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
    }

    const status = query.status;

    if (!status) {
      throw new AppError(httpStatus.BAD_REQUEST, "Payment Status Missing");
    }

    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        "No Bkash Access token found!",
      );
    }

    const executedPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authorization: bkashIdToken,
          "x-app-key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: paymentId,
        }),
      },
    );

    const executedPaymentResult = await executedPaymentResponse.json();

    if (status === "success") {
      const appointment = await prisma.appointment.findUnique({
        where: {
          id: executedPaymentResult.merchantInvoiceNumber,
        },
        include: {
          schedule: true,
          patient: true,
          doctor: true,
        },
      });

      if (!appointment) {
        throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found!");
      }

      const newAvailableSlots = appointment.schedule.availableSlots - 1;

      const alreadyBookedSlots =
        appointment.schedule.totalSlots - appointment.schedule.availableSlots;

      const serialNumber = alreadyBookedSlots + 1;

      const joiningTime = addMinutes(
        appointment.schedule.startDateTime,
        (serialNumber - 1) * 20,
      );

      await tx.appointment.update({
        where: {
          id: executedPaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
          joiningTime,
          serialNumber,
        },
      });

      await tx.schedule.update({
        where: {
          id: appointment.schedule.id,
        },
        data: {
          availableSlots: newAvailableSlots,
        },
      });

      await tx.payment.update({
        where: {
          appointmentId: executedPaymentResult.merchantInvoiceNumber,
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.PAID,
          bkashTrxId: executedPaymentResult.trxID,
          paidAt: executedPaymentResult.paymentExecuteTime,
          gatewayResponse: executedPaymentResult,
        },
      });

      await transporter.sendMail({
        from: config.email_sender,
        to: appointment.patient.email,
        subject: "Your Appointment Invoice - PH Healthcare System",
      });
      return {
        executedPaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
      };
    } else if (status === "failure") {
      await tx.payment.update({
        where: {
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: executedPaymentResult,
        },
      });

      return {
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
      };
    } else if (status === "cancel") {
      await tx.payment.update({
        where: {
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.CANCELLED,
          gatewayResponse: executedPaymentResult,
        },
      });
      return {
        executedPaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
      };
    } else {
      return {
        executedPaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
      };
    }
  });

  return transactionResult;
};

const cancelAppointment = async (payload: any) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload.applicationId;

    const existingAppointment = await tx.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        payment: true,
      },
    });

    if (!existingAppointment) {
      throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
    }

    if (
      existingAppointment.status === "ONGOING" ||
      existingAppointment.status === "COMPLETED"
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Appointment Ongoing or Completed",
      );
    }

    if (existingAppointment.status === "CANCELLED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Appointment Already canceled",
      );
    }

    const updatedAppointment = await tx.appointment.update({
      where: {
        id: existingAppointment.id,
      },
      data: {
        status: "CANCELLED",
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new AppError(
        httpStatus.BAD_GATEWAY,
        "No Bkash Access Token Found!",
      );
    }

    const bkashRefundPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: existingAppointment.payment?.bkashPaymentId,
          trxID: existingAppointment.payment?.bkashTrxId,
          amount: existingAppointment.payment?.amount.toString(),
          sku: "Appointment cancellation",
          reason: "Patient cancel the appointment",
        }),
      },
    );

    const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

    console.log(bkashRefundPaymentResult);

    const updatedPayment = await tx.payment.update({
      where: {
        appointmentId: existingAppointment.id,
      },
      data: {
        refundTrxId: bkashRefundPaymentResult.refundTrxID,
        refundedAt: bkashRefundPaymentResult.completedTime,
        refundAmount: bkashRefundPaymentResult.amount,
        refundReason: "Patient cancel the appointment",
        status: PaymentStatus.REFUNDED,
        gatewayResponse: bkashRefundPaymentResult,
      },
    });

    return {
      appointment: updatedAppointment,
      payment: updatedPayment,
    };
  });

  return transactionResult;
};

export const AppointmentService = {
  bookAppointment,
  payAppointment,
  bookAppointmentCallback,
  cancelAppointment,
};
