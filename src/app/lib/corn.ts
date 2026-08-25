import cron from "node-cron";

export const deleteUnverifiedDoctors = () => {
  cron.schedule("*/2 * * * * *", () => {
    //
    console.log("Doctor deleted successfully");
  });
};
