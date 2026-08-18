import { Router } from "express";
import { AppointmentController } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", AppointmentController.bookAppointment);

// Book appointment call back URL
router.get(
  "/book-appointment/payment/callback",
  AppointmentController.bookAppointmentCallback,
);

export const AppointmentRoutes = router;
