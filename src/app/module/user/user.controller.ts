import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

import httpStatus from "http-status";
import { userService } from "./user.service";
import { AppError } from "../../utils/AppError";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST,"No file provided");
  }
  const UserId = req.user?.userId;

  const result = await userService.uploadProfileImage(req.file?.buffer,UserId!);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Profile photo updated successfully",
    data: result,
  });
});

export const userController = {
  uploadProfileImage,
};
