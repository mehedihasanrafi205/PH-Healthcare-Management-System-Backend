import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, UserId: string) => {
  cloudinary.uploader
    .upload_stream(
      {
        resource_type: "auto",
      },
      async (error, result) => {
        if (error) {
          console.log(error);
          throw new Error(error.message);
        }

        console.log(result, "result");

        const updatedUser = await prisma.user.update({
          where: {
            id: UserId,
          },
          data:{
            ima
          }
        });

        // return result;
      },
    )
    .end(buffer);
};

export const userService = {
  uploadProfileImage,
};
