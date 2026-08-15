import { Router } from "express";

import { userController } from "./user.controller";
import { upload } from "../../lib/multer";

const router = Router();

router.patch(
  "/profile-image",
  upload.single("profileImage"),
  userController.uploadProfileImage,
);

export const UserRoutes = router;
