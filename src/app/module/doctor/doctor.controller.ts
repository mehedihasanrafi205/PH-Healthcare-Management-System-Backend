import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { DoctorServices } from "./doctor.service";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const resume = files?.["resume"] ? files["resume"][0] : null;
  const additionalFiles = files?.["additionalFiles"] || [];

  const data = JSON.parse(req.body.data);

  console.log({ resume, additionalFiles, data });

  const result = await DoctorServices.applyAsDoctor();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Applied As Doctor Successfully",
    data: {},
  });
});

export const DoctorController = {
  applyAsDoctor,
};
