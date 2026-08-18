import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "",
    data: result,
  });
});
const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    console.log(req.query, "req.query");
    const {executedPaymentResult, redirectUrl} = await AppointmentService.bookAppointmentCallback(req.query);

    console.log({executedPaymentResult}," Callback controller")

    res.redirect(redirectUrl)

    // sendResponse(res, {
    //   statusCode: httpStatus.OK,
    //   success: true,
    //   message: "",
    //   data: {},
    // });
  },
);

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
};
