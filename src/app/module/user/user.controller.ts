import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

import httpStatus from "http-status";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {

    console.log(req.file, "file")
//   const result = await userService.uploadProfileImage();

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Email Verified Successfully",
    data: {},
  });
});

export const userController = {
  uploadProfileImage,
};
